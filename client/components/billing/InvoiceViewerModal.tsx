import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  TextInput} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Print from "expo-print";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { sharePdf } from "@/lib/sharePdf";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ViewableInvoice {
  id: string;
  invoiceNumber: string;
  amount: number | string;
  currency: string;
  status: string;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  isOverdue?: boolean;
  paymentMethod?: string | null;
  lineItems?: InvoiceLineItem[] | string | null;
  reminderSentAt?: string | null;
}

interface AcademySettings {
  defaultLateFeeAmount?: number | string | null;
  defaultLateFeeType?: string | null;
  currency?: string | null;
}

interface Props {
  invoice: ViewableInvoice | null;
  visible: boolean;
  onClose: () => void;
  onPaid?: () => void;
  onDelete?: (invoice: ViewableInvoice) => Promise<void> | void;
  onInvoiceUpdated?: (updated: Partial<ViewableInvoice>) => void;
}

const STATUS_COLOR: Record<string, string> = {
  paid: Colors.dark.successNeon,
  pending: "#FBBF24",
  overdue: Colors.dark.error,
  void: Colors.dark.textMuted,
  uncollectible: Colors.dark.textMuted,
  draft: Colors.dark.textMuted,
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysOverdue(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const now = new Date();
  const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function hoursSinceReminder(reminderSentAt: string | null | undefined): number {
  if (!reminderSentAt) return Infinity;
  return (Date.now() - new Date(reminderSentAt).getTime()) / (1000 * 60 * 60);
}

export function InvoiceViewerModal({ invoice, visible, onClose, onPaid, onDelete, onInvoiceUpdated }: Props) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [hiddenForShare, setHiddenForShare] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLateFeeInput, setShowLateFeeInput] = useState(false);
  const [lateFeeInput, setLateFeeInput] = useState("");

  const { data: academySettings } = useQuery<AcademySettings>({
    queryKey: ["/api/academy/settings"],
    enabled: visible,
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!invoice?.id) throw new Error("No invoice");
      const res = await apiRequest("PATCH", `/api/billing/invoices/${invoice.id}`, {
        status: "paid",
        paidAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      onPaid?.();
      Alert.alert("Marked paid", `Invoice ${invoice?.invoiceNumber} is now paid.`);
    },
    onError: (err: Error) => {
      Alert.alert("Couldn't mark paid", err.message || "Try again.");
    },
  });

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      if (!invoice?.id) throw new Error("No invoice");
      const res = await apiRequest("POST", `/api/billing/invoices/${invoice.id}/send-reminder`);
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error || "Failed to send reminder");
      }
      return res.json();
    },
    onSuccess: (updated: any) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      Alert.alert("Reminder sent", "A payment reminder email has been sent to the client.");
      if (updated?.reminderSentAt) {
        onInvoiceUpdated?.({ reminderSentAt: updated.reminderSentAt });
      }
    },
    onError: (err: Error) => {
      Alert.alert("Could not send reminder", err.message || "Try again.");
    },
  });

  const addLateFeeMutation = useMutation({
    mutationFn: async (feeAmount: number) => {
      if (!invoice?.id) throw new Error("No invoice");
      const currentAmount = Number(invoice.amount ?? 0);
      const newTotal = currentAmount + feeAmount;

      // Parse existing line items — handle both shapes:
      //   - Array shape:  [ { description, quantity, unitPrice, total }, ... ]
      //   - Object shape: { items: [...], taxRate?, subtotal?, discount?, taxAmount? }
      //     (used by server-created invoices via enrichedLineItems)
      type LineItemsObject = {
        items: InvoiceLineItem[];
        taxRate?: number;
        subtotal?: number;
        discount?: number;
        taxAmount?: number;
      };

      const parsed: unknown = (() => {
        const raw = invoice.lineItems;
        if (!raw) return null;
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return null;
        }
      })();

      const isObjectShape =
        parsed !== null &&
        !Array.isArray(parsed) &&
        typeof parsed === "object" &&
        "items" in (parsed as object);

      const existingItems: InvoiceLineItem[] = isObjectShape
        ? (((parsed as LineItemsObject).items) || [])
        : Array.isArray(parsed)
          ? (parsed as InvoiceLineItem[])
          : [];

      const lateFeeItem: InvoiceLineItem = {
        description: "Late Fee",
        quantity: 1,
        unitPrice: feeAmount,
        total: feeAmount,
      };

      const newItems =
        existingItems.length > 0
          ? [...existingItems, lateFeeItem]
          : [
              {
                description: invoice.notes || "Services",
                quantity: 1,
                unitPrice: currentAmount,
                total: currentAmount,
              },
              lateFeeItem,
            ];

      // Rebuild lineItems preserving the original shape and non-derived metadata.
      // Drop `subtotal` and `taxAmount` from object-shaped metadata so the PDF
      // HTML route re-derives them from the updated items array (preventing stale totals).
      const updatedLineItems: unknown = isObjectShape
        ? (() => {
            const { subtotal: _s, taxAmount: _t, ...restMeta } = parsed as LineItemsObject;
            return { ...restMeta, items: newItems };
          })()
        : newItems;

      const res = await apiRequest("PATCH", `/api/billing/invoices/${invoice.id}`, {
        amount: newTotal,
        lineItems: updatedLineItems,
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error || "Failed to add late fee");
      }
      const updated = await res.json() as Partial<ViewableInvoice> & { amount?: number | string; lineItems?: unknown };
      return { newTotal, updatedLineItems, serverData: updated };
    },
    onSuccess: (result) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      // Immediately refresh the open modal so the coach sees the updated total/items.
      onInvoiceUpdated?.({
        amount: result.newTotal,
        lineItems: result.updatedLineItems as ViewableInvoice["lineItems"],
      });
      setShowLateFeeInput(false);
      setLateFeeInput("");
      Alert.alert("Late fee added", "The invoice has been updated with the late fee.");
    },
    onError: (err: Error) => {
      Alert.alert("Could not add late fee", err.message || "Try again.");
    },
  });

  const downloadPDF = async () => {
    if (!invoice?.id) return;
    try {
      setDownloading(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const response = await apiRequest("GET", `/api/billing/invoices/${invoice.id}/html`);
      if (!response.ok) throw new Error("Failed to fetch invoice");
      const html = await response.text();

      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const safeNumber = String(invoice.invoiceNumber || invoice.id)
          .replace("#", "")
          .replace(/\//g, "-");
        await sharePdf({
          html,
          filename: `Invoice_${safeNumber}`,
          beforeShare: () => setHiddenForShare(true),
          afterShare: () => setHiddenForShare(false),
        });
      }
    } catch (_e) {
      if (Platform.OS === "web") {
        Alert.alert("Download failed", "Could not generate the invoice PDF.");
      }
    } finally {
      setDownloading(false);
      setHiddenForShare(false);
    }
  };

  const handleAddLateFee = () => {
    const defaultAmount = academySettings?.defaultLateFeeAmount
      ? parseFloat(String(academySettings.defaultLateFeeAmount))
      : null;
    const defaultType = academySettings?.defaultLateFeeType || "flat";
    const currentAmount = Number(invoice?.amount ?? 0);

    const prefill =
      defaultAmount !== null
        ? defaultType === "percent"
          ? ((currentAmount * defaultAmount) / 100).toFixed(2)
          : defaultAmount.toFixed(2)
        : "";

    setLateFeeInput(prefill);
    setShowLateFeeInput(true);
  };

  const handleConfirmLateFee = () => {
    const fee = parseFloat(lateFeeInput);
    if (isNaN(fee) || fee <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid late fee amount.");
      return;
    }
    addLateFeeMutation.mutate(fee);
  };

  const merged: ViewableInvoice = invoice || ({} as ViewableInvoice);
  const status = String(merged.status || "").toLowerCase();
  const overduedays = daysOverdue(merged.dueDate);
  const isOverdue =
    merged.isOverdue ||
    status === "overdue" ||
    (status === "pending" && overduedays > 0);
  const displayStatus = isOverdue ? "overdue" : status;
  const statusColor = STATUS_COLOR[displayStatus] || Colors.dark.textMuted;
  const amountNum = Number(merged.amount ?? 0);
  const currency = merged.currency || "AED";

  const lineItems: InvoiceLineItem[] = (() => {
    const raw = merged.lineItems;
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed as InvoiceLineItem[];
      // Object shape: { items: [...], taxRate?, subtotal?, ... }
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).items)) {
        return (parsed as any).items as InvoiceLineItem[];
      }
      return [];
    } catch {
      return [];
    }
  })();

  const reminderCooldownHours = hoursSinceReminder(merged.reminderSentAt);
  const canSendReminder = status !== "paid" && reminderCooldownHours >= 24;
  const showReminderButton = status !== "paid" && status !== "void";

  return (
    <Modal
      visible={visible && !hiddenForShare}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot, paddingTop: insets.top }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: Spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: `${Colors.dark.text}10`,
          }}
        >
          <Text style={{ ...Typography.h2, color: Colors.dark.text }}>Invoice</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        {!invoice ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: Colors.dark.textMuted }}>No invoice</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xl * 2 }}>
            {/* Header card */}
            <View
              style={{
                padding: Spacing.lg,
                borderRadius: BorderRadius.lg,
                backgroundColor: `${Colors.dark.primary}10`,
                borderWidth: 1,
                borderColor: `${Colors.dark.primary}30`,
                marginBottom: Spacing.md,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: Colors.dark.textMuted, letterSpacing: 1.2, fontWeight: "700" }}>
                  INVOICE
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {isOverdue && overduedays > 0 ? (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        backgroundColor: `${Colors.dark.error}20`,
                        borderWidth: 1,
                        borderColor: `${Colors.dark.error}40`,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "800", color: Colors.dark.error }}>
                        {overduedays} DAY{overduedays !== 1 ? "S" : ""} OVERDUE
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: `${statusColor}20` }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: statusColor }}>
                      {displayStatus.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.dark.text, marginTop: 6 }}>
                {merged.invoiceNumber}
              </Text>
              <Text style={{ fontSize: 28, fontWeight: "800", color: Colors.dark.primary, marginTop: 6 }}>
                {currency} {amountNum.toFixed(2)}
              </Text>
            </View>

            {/* Detail rows */}
            <View
              style={{
                padding: Spacing.lg,
                borderRadius: BorderRadius.lg,
                backgroundColor: `${Colors.dark.text}06`,
                marginBottom: Spacing.md,
              }}
            >
              {(() => {
                const rows: { label: string; value: string; color?: string }[] = [
                  { label: "Issued", value: fmtDate(merged.createdAt) },
                  { label: "Due", value: fmtDate(merged.dueDate) },
                ];
                if (merged.paidAt) {
                  rows.push({ label: "Paid on", value: fmtDate(merged.paidAt), color: Colors.dark.successNeon });
                }
                if (merged.paymentMethod) {
                  rows.push({ label: "Method", value: String(merged.paymentMethod).replace(/_/g, " ") });
                }
                if (merged.reminderSentAt) {
                  rows.push({ label: "Reminder sent", value: fmtDate(merged.reminderSentAt), color: Colors.dark.textMuted });
                }
                return rows.map((r) => (
                  <View
                    key={r.label}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: `${Colors.dark.text}08`,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: Colors.dark.textMuted }}>{r.label}</Text>
                    <Text style={{ fontSize: 13, color: r.color || Colors.dark.text, fontWeight: "600" }}>
                      {r.value}
                    </Text>
                  </View>
                ));
              })()}
            </View>

            {/* Line items */}
            {lineItems.length > 0 ? (
              <View
                style={{
                  padding: Spacing.lg,
                  borderRadius: BorderRadius.lg,
                  backgroundColor: `${Colors.dark.text}06`,
                  marginBottom: Spacing.md,
                }}
              >
                <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontWeight: "700", letterSpacing: 1, marginBottom: Spacing.sm }}>
                  ITEMS
                </Text>
                {lineItems.map((it, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                    <View style={{ flex: 1, marginRight: Spacing.sm }}>
                      <Text style={{
                        fontSize: 13,
                        color: it.description === "Late Fee" ? Colors.dark.error : Colors.dark.text,
                        fontWeight: it.description === "Late Fee" ? "700" : "400",
                      }}>{it.description}</Text>
                      <Text style={{ fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 }}>
                        {it.quantity} × {currency} {Number(it.unitPrice).toFixed(2)}
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 13,
                      color: it.description === "Late Fee" ? Colors.dark.error : Colors.dark.text,
                      fontWeight: "700",
                    }}>
                      {currency} {Number(it.total).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {merged.notes ? (
              <View
                style={{
                  padding: Spacing.md,
                  borderRadius: BorderRadius.lg,
                  backgroundColor: `${Colors.dark.text}06`,
                  marginBottom: Spacing.md,
                }}
              >
                <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontWeight: "700", letterSpacing: 1, marginBottom: 4 }}>
                  NOTES
                </Text>
                <Text style={{ fontSize: 13, color: Colors.dark.text }}>{merged.notes}</Text>
              </View>
            ) : null}

            {/* Add Late Fee input */}
            {showLateFeeInput ? (
              <View
                style={{
                  padding: Spacing.md,
                  borderRadius: BorderRadius.lg,
                  backgroundColor: `${Colors.dark.error}10`,
                  borderWidth: 1,
                  borderColor: `${Colors.dark.error}30`,
                  marginBottom: Spacing.md,
                }}
              >
                <Text style={{ fontSize: 13, color: Colors.dark.error, fontWeight: "700", marginBottom: Spacing.sm }}>
                  Late Fee Amount ({currency})
                </Text>
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: `${Colors.dark.error}50`,
                      borderRadius: BorderRadius.sm,
                      padding: Spacing.sm,
                      color: Colors.dark.text,
                      backgroundColor: `${Colors.dark.text}06`,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                    value={lateFeeInput}
                    onChangeText={setLateFeeInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.dark.textMuted}
                    autoFocus
                  />
                  <Pressable
                    onPress={handleConfirmLateFee}
                    disabled={addLateFeeMutation.isPending}
                    style={{
                      paddingHorizontal: Spacing.md,
                      justifyContent: "center",
                      borderRadius: BorderRadius.sm,
                      backgroundColor: Colors.dark.error,
                      opacity: addLateFeeMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    {addLateFeeMutation.isPending ? (
                      <TennisBallSpinner color="#fff" />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Add</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => { setShowLateFeeInput(false); setLateFeeInput(""); }}
                    style={{
                      paddingHorizontal: Spacing.sm,
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Primary actions */}
            <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm }}>
              <Pressable
                onPress={downloadPDF}
                disabled={downloading}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 14,
                  borderRadius: BorderRadius.md,
                  backgroundColor: Colors.dark.primary,
                  opacity: downloading ? 0.6 : 1,
                }}
              >
                {downloading ? (
                  <TennisBallSpinner color="#000" />
                ) : (
                  <>
                    <Ionicons name={Platform.OS === "web" ? "print-outline" : "share-outline"} size={16} color="#000" />
                    <Text style={{ color: "#000", fontWeight: "800", fontSize: 13 }}>
                      {Platform.OS === "web" ? "Print / save PDF" : "Share PDF"}
                    </Text>
                  </>
                )}
              </Pressable>

              {status !== "paid" ? (
                <Pressable
                  onPress={() => markPaidMutation.mutate()}
                  disabled={markPaidMutation.isPending}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 14,
                    borderRadius: BorderRadius.md,
                    backgroundColor: `${Colors.dark.successNeon}20`,
                    borderWidth: 1,
                    borderColor: `${Colors.dark.successNeon}50`,
                    opacity: markPaidMutation.isPending ? 0.6 : 1,
                  }}
                >
                  {markPaidMutation.isPending ? (
                    <TennisBallSpinner color={Colors.dark.successNeon} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.dark.successNeon} />
                      <Text style={{ color: Colors.dark.successNeon, fontWeight: "800", fontSize: 13 }}>
                        Mark paid
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : null}

              {onDelete && invoice ? (
                <Pressable
                  onPress={async () => {
                    if (deleting) return;
                    try {
                      setDeleting(true);
                      await onDelete(invoice);
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete invoice ${invoice.invoiceNumber}`}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 14,
                    borderRadius: BorderRadius.md,
                    backgroundColor: `${Colors.dark.error}20`,
                    borderWidth: 1,
                    borderColor: `${Colors.dark.error}50`,
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {deleting ? (
                    <TennisBallSpinner color={Colors.dark.error} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                      <Text style={{ color: Colors.dark.error, fontWeight: "800", fontSize: 13 }}>
                        Delete
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>

            {/* Secondary actions: Send Reminder + Add Late Fee */}
            {showReminderButton && !showLateFeeInput && (isOverdue || status === "pending") ? (
              <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm }}>
                <Pressable
                  onPress={() => {
                    if (!canSendReminder) {
                      const hoursLeft = Math.ceil(24 - reminderCooldownHours);
                      Alert.alert(
                        "Reminder already sent",
                        `You can send another reminder in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.`,
                      );
                      return;
                    }
                    sendReminderMutation.mutate();
                  }}
                  disabled={!canSendReminder || sendReminderMutation.isPending}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: BorderRadius.md,
                    backgroundColor: `${Colors.dark.gold}15`,
                    borderWidth: 1,
                    borderColor: canSendReminder ? `${Colors.dark.gold}50` : `${Colors.dark.textMuted}30`,
                    opacity: (!canSendReminder || sendReminderMutation.isPending) ? 0.5 : 1,
                  }}
                >
                  {sendReminderMutation.isPending ? (
                    <TennisBallSpinner color={Colors.dark.gold} />
                  ) : (
                    <>
                      <Ionicons
                        name="mail-outline"
                        size={15}
                        color={canSendReminder ? Colors.dark.gold : Colors.dark.textMuted}
                      />
                      <Text style={{
                        color: canSendReminder ? Colors.dark.gold : Colors.dark.textMuted,
                        fontWeight: "700",
                        fontSize: 13,
                      }}>
                        {merged.reminderSentAt && !canSendReminder ? "Reminder sent" : "Send Reminder"}
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleAddLateFee}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: BorderRadius.md,
                    backgroundColor: `${Colors.dark.error}15`,
                    borderWidth: 1,
                    borderColor: `${Colors.dark.error}40`,
                  }}
                >
                  <Ionicons name="add-circle-outline" size={15} color={Colors.dark.error} />
                  <Text style={{ color: Colors.dark.error, fontWeight: "700", fontSize: 13 }}>
                    Add Late Fee
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default InvoiceViewerModal;
