import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import CreateInvoiceModal from "@/admin/components/CreateInvoiceModal";
import { InvoiceViewerModal, type ViewableInvoice } from "./InvoiceViewerModal";
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

interface PaymentsData {
  totalOwed: number;
  totalPaid: number;
  lastPaymentDate?: string;
  status: "paid" | "partial" | "overdue";
  currency: string;
  invoices?: PaymentsInvoice[];
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

export function PlayerPaymentsSection({ playerStats, playerId, playerName }: Props) {
  const queryClient = useQueryClient();
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  // Task #700: tap-to-open viewer for an existing invoice (PDF download / mark paid).
  const [viewerInvoice, setViewerInvoice] = useState<ViewableInvoice | null>(null);

  if (!playerStats?.payments) return null;

  const { payments } = playerStats;

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
              return (
                <Pressable
                  key={inv.id}
                  onPress={() => {
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
                  }}
                  style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: BorderRadius.sm,
                  padding: Spacing.sm,
                  marginBottom: 6,
                  borderLeftWidth: 3,
                  borderLeftColor: statusColor,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
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
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                    <View style={{ backgroundColor: `${statusColor}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.xs }}>
                      <Text style={{ fontSize: 10, fontWeight: "700" as const, color: statusColor }}>{statusLabel}</Text>
                    </View>
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
                              queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
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
                </Pressable>
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
          queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
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
                            await apiRequest("PATCH", `/api/packages/${pkg.id}`, { isPaid: true, paidAt: new Date().toISOString() });
                            queryClient.invalidateQueries({ queryKey: ["/api/admin/players", playerId, "stats"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
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
    </>
  );
}
