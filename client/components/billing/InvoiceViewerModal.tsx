import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

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
}

interface Props {
  invoice: ViewableInvoice | null;
  visible: boolean;
  onClose: () => void;
  // Called after Mark as Paid succeeds; lets caller invalidate parent queries.
  onPaid?: () => void;
  // Optional: when provided, renders a destructive Delete button. Caller is
  // responsible for confirming, performing the delete, refreshing data, and
  // closing this modal.
  onDelete?: (invoice: ViewableInvoice) => Promise<void> | void;
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

export function InvoiceViewerModal({ invoice, visible, onClose, onPaid, onDelete }: Props) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
      }
    } catch (e) {
      Alert.alert("Download failed", "Could not generate the invoice PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const merged: ViewableInvoice = invoice || ({} as ViewableInvoice);
  const status = String(merged.status || "").toLowerCase();
  const isOverdue =
    merged.isOverdue ||
    (status === "pending" && !!merged.dueDate && new Date(merged.dueDate) < new Date());
  const displayStatus = isOverdue ? "overdue" : status;
  const statusColor = STATUS_COLOR[displayStatus] || Colors.dark.textMuted;
  const amountNum = Number(merged.amount ?? 0);

  const lineItems: InvoiceLineItem[] = (() => {
    const raw = merged.lineItems;
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? (parsed as InvoiceLineItem[]) : [];
    } catch {
      return [];
    }
  })();

  return (
    <Modal
      visible={visible}
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
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: `${statusColor}20` }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: statusColor }}>
                    {displayStatus.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.dark.text, marginTop: 6 }}>
                {merged.invoiceNumber}
              </Text>
              <Text style={{ fontSize: 28, fontWeight: "800", color: Colors.dark.primary, marginTop: 6 }}>
                {merged.currency} {amountNum.toFixed(2)}
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
                const rows: Array<{ label: string; value: string; color?: string }> = [
                  { label: "Issued", value: fmtDate(merged.createdAt) },
                  { label: "Due", value: fmtDate(merged.dueDate) },
                ];
                if (merged.paidAt) {
                  rows.push({ label: "Paid on", value: fmtDate(merged.paidAt), color: Colors.dark.successNeon });
                }
                if (merged.paymentMethod) {
                  rows.push({ label: "Method", value: String(merged.paymentMethod).replace(/_/g, " ") });
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

            {/* Line items if present */}
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
                      <Text style={{ fontSize: 13, color: Colors.dark.text }}>{it.description}</Text>
                      <Text style={{ fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 }}>
                        {it.quantity} × {merged.currency} {Number(it.unitPrice).toFixed(2)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "700" }}>
                      {merged.currency} {Number(it.total).toFixed(2)}
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
                  <ActivityIndicator color="#000" />
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
                    <ActivityIndicator color={Colors.dark.successNeon} />
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
                    <ActivityIndicator color={Colors.dark.error} />
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
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default InvoiceViewerModal;
