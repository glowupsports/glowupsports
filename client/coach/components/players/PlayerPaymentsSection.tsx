import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Alert, Platform, TextInput } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { invalidatePlayersList } from "@/lib/credit-cache";
import { formatCredits } from "@/lib/dateUtils";
import CreateInvoiceModal from "@/admin/components/CreateInvoiceModal";
import { InvoiceViewerModal, type ViewableInvoice } from "@/components/billing/InvoiceViewerModal";
import { styles } from "./playersStyles";

interface PaymentsInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  dueDate?: string;
  paidAt?: string;
  createdAt?: string;
  notes?: string;
  isOverdue: boolean;
}

interface CoachRecordedPayment {
  id: string;
  amount: number;
  currency: string;
  paymentMethod?: string | null;
  paymentDate?: string | null;
  source?: string | null;
  packageId?: string | null;
  notes?: string | null;
  status?: string | null;
  createdAt?: string | null;
  recordedByName?: string | null;
}

interface PaymentsData {
  totalOwed: number;
  totalPaid: number;
  lastPaymentDate?: string;
  status: "paid" | "partial" | "overdue";
  currency: string;
  invoices?: PaymentsInvoice[];
  coachRecordedPayments?: CoachRecordedPayment[];
}

interface PackageData {
  id: string;
  creditType: string;
  totalCredits: number;
  remainingCredits: number;
  status: string;
  isPaid?: boolean;
  price?: number;
  packageName?: string;
}

interface PlayerStatsData {
  player: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    parentName?: string;
    parentPhone?: string;
  };
  payments: PaymentsData;
  packages?: PackageData[];
}

interface Props {
  playerStats: PlayerStatsData | undefined;
  playerId: string;
  playerName: string;
}

const getPaymentStatusColor = (status?: string) => {
  switch (status) {
    case "paid": return Colors.dark.successNeon;
    case "partial": return Colors.dark.orange;
    case "overdue": return Colors.dark.error;
    default: return Colors.dark.textMuted;
  }
};

type CoachPaymentMethod = "cash" | "bank_transfer" | "card";

export function PlayerPaymentsSection({ playerStats, playerId, playerName }: Props) {
  const queryClient = useQueryClient();
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  // Task #975 — let coach pick the method that the player actually used so
  // the payments row carries something meaningful instead of always "cash".
  const [markPaidMethod, setMarkPaidMethod] = useState<CoachPaymentMethod>("cash");
  // Task #700: tap-to-open viewer for an existing invoice (PDF download / mark paid).
  const [viewerInvoice, setViewerInvoice] = useState<ViewableInvoice | null>(null);

  // Task #980 — edit/void state for a coach-recorded payment row.
  const [editingPayment, setEditingPayment] = useState<CoachRecordedPayment | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState<CoachPaymentMethod>("cash");
  const [editDate, setEditDate] = useState(""); // YYYY-MM-DD
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  if (!playerStats?.payments) return null;

  const { payments } = playerStats;
  const coachRecorded = payments.coachRecordedPayments || [];

  const openEditPayment = (p: CoachRecordedPayment) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setEditingPayment(p);
    setEditAmount(String(p.amount ?? ""));
    const allowed: CoachPaymentMethod[] = ["cash", "bank_transfer", "card"];
    setEditMethod((allowed as string[]).includes(p.paymentMethod || "")
      ? (p.paymentMethod as CoachPaymentMethod)
      : "cash");
    setEditDate(p.paymentDate ? new Date(p.paymentDate).toISOString().slice(0, 10) : "");
    setEditNotes(p.notes || "");
  };

  const closeEditPayment = () => {
    setEditingPayment(null);
    setEditSaving(false);
  };

  const invalidatePaymentCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
    queryClient.invalidateQueries({ queryKey: [`/api/parent/payments/${playerId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
    invalidatePlayersList(queryClient);
  };

  const submitEditPayment = async () => {
    if (!editingPayment) return;
    const amountNum = Number(editAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid amount", "Please enter a positive amount.");
      return;
    }
    if (editDate) {
      const d = new Date(editDate);
      if (Number.isNaN(d.getTime())) {
        Alert.alert("Invalid date", "Please use YYYY-MM-DD format.");
        return;
      }
    }
    setEditSaving(true);
    try {
      await apiRequest("PATCH", `/api/coach/payments/${editingPayment.id}`, {
        amount: amountNum,
        paymentMethod: editMethod,
        paymentDate: editDate ? new Date(editDate).toISOString() : undefined,
        notes: editNotes,
      });
      invalidatePaymentCaches();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeEditPayment();
      Alert.alert("Payment updated", "The payment record has been updated.");
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to update payment. Please try again.");
      setEditSaving(false);
    }
  };

  const voidPayment = async (p: CoachRecordedPayment) => {
    const doVoid = async () => {
      try {
        await apiRequest("POST", `/api/coach/payments/${p.id}/void`, {});
        invalidatePaymentCaches();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        closeEditPayment();
        Alert.alert("Payment voided", "The payment record has been removed.");
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", "Failed to void payment. Please try again.");
      }
    };
    if (Platform.OS === "web") {
      const ok = (globalThis as any).confirm?.(
        `Void this ${p.currency} ${p.amount} payment? This cannot be undone.`,
      );
      if (ok) await doVoid();
      return;
    }
    Alert.alert(
      "Void payment?",
      `Remove this ${p.currency} ${p.amount} payment record? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Void", style: "destructive", onPress: doVoid },
      ],
    );
  };

  const methodLabel = (m?: string | null) =>
    m === "bank_transfer" ? "Bank transfer" : m === "card" ? "Card" : m === "cash" ? "Cash" : (m || "—");

  const sourceLabel = (s?: string | null) =>
    s === "coach_mark_paid" ? "Mark Paid" : s === "coach_manual_cash" ? "Manual cash" : "Coach";

  return (
    <>
      <View style={styles.paymentsSection}>
        <Text style={styles.paymentsSectionTitle}>Payments</Text>
        <View style={styles.paymentsSummary}>
          <View style={[
            styles.paymentsStatusBadge,
            { backgroundColor: `${getPaymentStatusColor(payments.status)}20` }
          ]}>
            <Text style={[styles.paymentsStatusText, { color: getPaymentStatusColor(payments.status) }]}>
              {payments.status?.toUpperCase() || "N/A"}
            </Text>
          </View>
        </View>
        <View style={styles.paymentsFinanceRow}>
          <Text style={styles.paymentsFinanceLabel}>Total Owed</Text>
          <Text style={[styles.paymentsFinanceValue, { color: Colors.dark.error }]}>
            {payments.currency} {payments.totalOwed}
          </Text>
        </View>
        <View style={styles.paymentsFinanceRow}>
          <Text style={styles.paymentsFinanceLabel}>Total Paid</Text>
          <Text style={[styles.paymentsFinanceValue, { color: Colors.dark.successNeon }]}>
            {payments.currency} {payments.totalPaid}
          </Text>
        </View>
        {payments.lastPaymentDate ? (
          <View style={styles.paymentsFinanceRow}>
            <Text style={styles.paymentsFinanceLabel}>Last Payment</Text>
            <Text style={styles.paymentsFinanceValue}>{payments.lastPaymentDate}</Text>
          </View>
        ) : null}
        <View style={styles.paymentsActions}>
          <Pressable
            style={styles.paymentsRecordButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowRecordPaymentModal(true);
            }}
          >
            <Ionicons name="card-outline" size={16} color={Colors.dark.buttonText} />
            <Text style={styles.paymentsRecordText}>Record Payment</Text>
          </Pressable>
          <Pressable
            style={styles.paymentsCreateInvoiceButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowInvoiceModal(true);
            }}
          >
            <Ionicons name="document-text-outline" size={16} color={Colors.dark.successNeon} />
            <Text style={styles.paymentsCreateInvoiceText}>Create Invoice</Text>
          </Pressable>
        </View>

        {coachRecorded.length > 0 ? (
          <View style={{ marginTop: Spacing.md }}>
            <Text style={{ ...Typography.caption, color: Colors.dark.textMuted, fontWeight: "700" as const, letterSpacing: 1, marginBottom: Spacing.sm }}>
              COACH-RECORDED PAYMENTS ({coachRecorded.length})
            </Text>
            {coachRecorded.map((p) => (
              <View
                key={p.id}
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: BorderRadius.sm,
                  padding: Spacing.sm,
                  marginBottom: 6,
                  borderLeftWidth: 3,
                  borderLeftColor: Colors.dark.successNeon,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "600" as const }}>
                      {methodLabel(p.paymentMethod)} · {sourceLabel(p.source)}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>
                      {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "No date"}
                      {p.recordedByName ? ` · by ${p.recordedByName}` : ""}
                    </Text>
                    {p.notes ? (
                      <Text style={{ fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 }} numberOfLines={2}>
                        {p.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700" as const, color: Colors.dark.successNeon }}>
                    {p.currency} {p.amount.toLocaleString()}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  <Pressable
                    onPress={() => openEditPayment(p)}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 4,
                      paddingHorizontal: 10, paddingVertical: 6,
                      borderRadius: BorderRadius.xs,
                      backgroundColor: `${Colors.dark.primary}15`,
                      borderWidth: 1,
                      borderColor: `${Colors.dark.primary}30`,
                    }}
                  >
                    <Ionicons name="create-outline" size={12} color={Colors.dark.primary} />
                    <Text style={{ fontSize: 11, color: Colors.dark.primary, fontWeight: "700" as const }}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => voidPayment(p)}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 4,
                      paddingHorizontal: 10, paddingVertical: 6,
                      borderRadius: BorderRadius.xs,
                      backgroundColor: `${Colors.dark.error}15`,
                      borderWidth: 1,
                      borderColor: `${Colors.dark.error}30`,
                    }}
                  >
                    <Ionicons name="trash-outline" size={12} color={Colors.dark.error} />
                    <Text style={{ fontSize: 11, color: Colors.dark.error, fontWeight: "700" as const }}>Void</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {payments.invoices && payments.invoices.length > 0 ? (
          <View style={{ marginTop: Spacing.md }}>
            <Text style={{ ...Typography.caption, color: Colors.dark.textMuted, fontWeight: "700" as const, letterSpacing: 1, marginBottom: Spacing.sm }}>
              INVOICES ({payments.invoices.length})
            </Text>
            {payments.invoices.map((inv: PaymentsInvoice) => {
              const isOverdue = inv.isOverdue;
              const isPaid = inv.status === "paid";
              const statusColor = isPaid ? Colors.dark.successNeon : isOverdue ? Colors.dark.error : "#FFD700";
              const statusLabel = isPaid ? "PAID" : isOverdue ? "OVERDUE" : "PENDING";
              const openViewer = () => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setViewerInvoice({
                  id: inv.id,
                  invoiceNumber: inv.invoiceNumber,
                  amount: inv.amount,
                  currency: inv.currency,
                  status: inv.status,
                  dueDate: inv.dueDate,
                  paidAt: inv.paidAt,
                  createdAt: inv.createdAt,
                  notes: inv.notes,
                  isOverdue: inv.isOverdue,
                });
              };
              return (
                <View
                  key={inv.id}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: BorderRadius.sm,
                    padding: Spacing.sm,
                    marginBottom: 6,
                    borderLeftWidth: 3,
                    borderLeftColor: statusColor,
                  }}
                >
                  <Pressable
                    onPress={openViewer}
                    accessibilityRole="button"
                    accessibilityLabel={`View invoice ${inv.invoiceNumber}`}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "600" as const }}>
                        #{inv.invoiceNumber}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>
                        Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "No date"}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "700" as const, color: statusColor }}>
                      {inv.currency} {inv.amount.toLocaleString()}
                    </Text>
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                    <Pressable
                      onPress={openViewer}
                      style={{ backgroundColor: `${statusColor}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.xs }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700" as const, color: statusColor }}>{statusLabel}</Text>
                    </Pressable>
                    <Pressable
                      onPress={openViewer}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 3,
                        paddingHorizontal: 8, paddingVertical: 4,
                        borderRadius: BorderRadius.xs,
                      }}
                    >
                      <Ionicons name="document-text-outline" size={12} color={Colors.dark.textMuted} />
                      <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontWeight: "600" as const }}>View</Text>
                    </Pressable>
                    {!isPaid ? (
                      <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
                        <Pressable
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 4,
                            backgroundColor: `${Colors.dark.successNeon}20`,
                            paddingHorizontal: 14, paddingVertical: 8,
                            borderRadius: BorderRadius.sm, borderWidth: 1,
                            borderColor: `${Colors.dark.successNeon}40`,
                          }}
                          onPress={async () => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            try {
                              await apiRequest("PATCH", `/api/billing/invoices/${inv.id}`, { status: "paid", paidAt: new Date().toISOString() });
                              queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                              invalidatePlayersList(queryClient);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              Alert.alert("Invoice Paid", `Invoice #${inv.invoiceNumber} has been marked as paid.`);
                            } catch {
                              Alert.alert("Error", "Failed to mark invoice as paid. Please try again.");
                            }
                          }}
                        >
                          <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                          <Text style={{ fontSize: 12, color: Colors.dark.successNeon, fontWeight: "700" as const }}>Paid</Text>
                        </Pressable>
                        <Pressable
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 4,
                            backgroundColor: `${isOverdue ? Colors.dark.error : "#FFD700"}15`,
                            paddingHorizontal: 14, paddingVertical: 8,
                            borderRadius: BorderRadius.sm, borderWidth: 1,
                            borderColor: `${isOverdue ? Colors.dark.error : "#FFD700"}30`,
                          }}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setShowInvoiceModal(true);
                          }}
                        >
                          <Ionicons name="mail-outline" size={14} color={isOverdue ? Colors.dark.error : "#FFD700"} />
                          <Text style={{ fontSize: 12, color: isOverdue ? Colors.dark.error : "#FFD700", fontWeight: "700" as const }}>Reminder</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <InvoiceViewerModal
        invoice={viewerInvoice}
        visible={!!viewerInvoice}
        onClose={() => setViewerInvoice(null)}
        onPaid={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
          invalidatePlayersList(queryClient);
        }}
      />

      <CreateInvoiceModal
        visible={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        player={playerStats?.player ? {
          id: playerStats.player.id,
          name: playerStats.player.name,
          email: playerStats.player.email,
          phone: playerStats.player.phone,
          parentName: playerStats.player.parentName,
          parentEmail: undefined,
          parentPhone: playerStats.player.parentPhone,
        } : null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
        }}
      />

      <Modal
        visible={showRecordPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRecordPaymentModal(false)}
      >
        <View style={styles.recordPaymentOverlay}>
          <View style={styles.recordPaymentContainer}>
            <View style={styles.recordPaymentHeader}>
              <Text style={styles.recordPaymentTitle}>Record Payment</Text>
              <Pressable style={styles.recordPaymentClose} onPress={() => setShowRecordPaymentModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.recordPaymentContent}>
              {playerStats?.packages?.filter((p: PackageData) => !p.isPaid).length === 0 ? (
                <View style={styles.noUnpaidBox}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.dark.successNeon} />
                  <Text style={styles.noUnpaidTitleText}>All Paid!</Text>
                  <Text style={styles.noUnpaidSubText}>This player has no outstanding payments.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.unpaidTitle}>Unpaid Packages</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      marginBottom: Spacing.sm,
                    }}
                  >
                    {([
                      { key: "cash", label: "Cash" },
                      { key: "bank_transfer", label: "Bank transfer" },
                      { key: "card", label: "Card" },
                    ] as Array<{ key: CoachPaymentMethod; label: string }>).map((m) => {
                      const active = markPaidMethod === m.key;
                      return (
                        <Pressable
                          key={m.key}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setMarkPaidMethod(m.key);
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 8,
                            borderRadius: 8,
                            alignItems: "center",
                            backgroundColor: active
                              ? `${Colors.dark.primary}30`
                              : `${Colors.dark.primary}10`,
                            borderWidth: 1,
                            borderColor: active
                              ? Colors.dark.primary
                              : `${Colors.dark.primary}30`,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: Colors.dark.primary,
                              fontWeight: "700",
                            }}
                          >
                            {m.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {playerStats?.packages?.filter((p: PackageData) => !p.isPaid).map((pkg: PackageData) => (
                    <View key={pkg.id} style={styles.unpaidCard}>
                      <View style={styles.unpaidInfo}>
                        <View style={styles.unpaidRow}>
                          <Ionicons
                            name={pkg.creditType === "private" ? "person" : pkg.creditType === "semi_private" ? "people" : "people-circle"}
                            size={20}
                            color={Colors.dark.primary}
                          />
                          <Text style={styles.unpaidType}>
                            {pkg.creditType === "private" ? "Private" : pkg.creditType === "semi_private" ? "Semi-Private" : "Group"}
                          </Text>
                        </View>
                        <Text style={styles.unpaidCredits}>
                          {formatCredits(pkg.remainingCredits)} / {formatCredits(pkg.totalCredits)} credits
                        </Text>
                        <Text style={styles.unpaidPrice}>
                          AED {Number(pkg.price || 0).toLocaleString()}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.markPaidBtn}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          try {
                            await apiRequest("PATCH", `/api/packages/${pkg.id}`, {
                              isPaid: true,
                              paidAt: new Date().toISOString(),
                              paymentMethod: markPaidMethod,
                            });
                            queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
                            invalidatePlayersList(queryClient);
                            queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert("Payment Recorded", "Package marked as paid.");
                          } catch {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            Alert.alert("Error", "Failed to record payment. Please try again.");
                          }
                        }}
                      >
                        <Ionicons name="checkmark" size={18} color={Colors.dark.buttonText} />
                        <Text style={styles.markPaidBtnText}>Mark Paid</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            <Pressable style={styles.recordPaymentDone} onPress={() => setShowRecordPaymentModal(false)}>
              <Text style={styles.recordPaymentDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Task #980 — edit / void modal for a coach-recorded payment */}
      <Modal
        visible={!!editingPayment}
        transparent
        animationType="slide"
        onRequestClose={closeEditPayment}
      >
        <View style={styles.recordPaymentOverlay}>
          <View style={styles.recordPaymentContainer}>
            <View style={styles.recordPaymentHeader}>
              <Text style={styles.recordPaymentTitle}>Edit Payment</Text>
              <Pressable style={styles.recordPaymentClose} onPress={closeEditPayment}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.recordPaymentContent} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 4, fontWeight: "700" as const, letterSpacing: 1 }}>
                AMOUNT ({editingPayment?.currency || "AED"})
              </Text>
              <TextInput
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.dark.textMuted}
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: BorderRadius.sm,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 10,
                  color: Colors.dark.text,
                  fontSize: 16,
                  marginBottom: Spacing.md,
                }}
              />

              <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 4, fontWeight: "700" as const, letterSpacing: 1 }}>
                METHOD
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: Spacing.md }}>
                {([
                  { key: "cash", label: "Cash" },
                  { key: "bank_transfer", label: "Bank transfer" },
                  { key: "card", label: "Card" },
                ] as Array<{ key: CoachPaymentMethod; label: string }>).map((m) => {
                  const active = editMethod === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setEditMethod(m.key);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: "center",
                        backgroundColor: active ? `${Colors.dark.primary}30` : `${Colors.dark.primary}10`,
                        borderWidth: 1,
                        borderColor: active ? Colors.dark.primary : `${Colors.dark.primary}30`,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: Colors.dark.primary, fontWeight: "700" as const }}>
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 4, fontWeight: "700" as const, letterSpacing: 1 }}>
                DATE (YYYY-MM-DD)
              </Text>
              <TextInput
                value={editDate}
                onChangeText={setEditDate}
                placeholder="2026-04-22"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: BorderRadius.sm,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 10,
                  color: Colors.dark.text,
                  fontSize: 16,
                  marginBottom: Spacing.md,
                }}
              />

              <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginBottom: 4, fontWeight: "700" as const, letterSpacing: 1 }}>
                NOTES
              </Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Optional notes"
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: BorderRadius.sm,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 10,
                  color: Colors.dark.text,
                  fontSize: 14,
                  minHeight: 60,
                  textAlignVertical: "top",
                  marginBottom: Spacing.md,
                }}
              />

              <Pressable
                onPress={() => editingPayment && voidPayment(editingPayment)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: BorderRadius.sm,
                  backgroundColor: `${Colors.dark.error}15`,
                  borderWidth: 1,
                  borderColor: `${Colors.dark.error}40`,
                  marginBottom: Spacing.md,
                }}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                <Text style={{ color: Colors.dark.error, fontWeight: "700" as const }}>Void payment</Text>
              </Pressable>
            </ScrollView>

            <Pressable
              style={[styles.recordPaymentDone, editSaving && { opacity: 0.6 }]}
              onPress={submitEditPayment}
              disabled={editSaving}
            >
              {editSaving ? (
                <ActivityIndicator color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.recordPaymentDoneText}>Save changes</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
