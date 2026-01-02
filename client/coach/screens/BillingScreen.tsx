import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface Invoice {
  id: string;
  academyId: string;
  playerId: string | null;
  packageId: string | null;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  lineItems: any;
  notes: string | null;
  createdAt: string;
}

interface Payment {
  id: string;
  academyId: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  stripePaymentId: string | null;
  createdAt: string;
}

interface BillingAccount {
  id: string;
  academyId: string;
  stripeCustomerId: string | null;
  stripeAccountId: string | null;
  billingEmail: string | null;
  billingName: string | null;
  isActive: boolean;
}

interface Player {
  id: string;
  name: string;
}

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "invoices" | "payments">("overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInvoiceAmount, setNewInvoiceAmount] = useState("");
  const [newInvoiceNotes, setNewInvoiceNotes] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const { data: account, isLoading: accountLoading } = useQuery<BillingAccount>({
    queryKey: ["/api/billing/account"],
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/billing/payments"],
  });

  const { data: playersData } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });
  const players = Array.isArray(playersData) ? playersData : [];

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: { amount: number; notes?: string; playerId?: string }) => {
      return apiRequest("POST", "/api/billing/invoices", {
        amount: data.amount,
        notes: data.notes,
        playerId: data.playerId,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      setShowCreateModal(false);
      setNewInvoiceAmount("");
      setNewInvoiceNotes("");
      setSelectedPlayerId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Invoice created!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to create invoice");
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: { invoiceId: string; amount: number }) => {
      return apiRequest("POST", "/api/billing/payments", {
        invoiceId: data.invoiceId,
        amount: data.amount,
        paymentMethod: "cash",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Payment recorded!");
    },
  });

  const handleCreateInvoice = () => {
    const amount = parseFloat(newInvoiceAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    createInvoiceMutation.mutate({
      amount,
      notes: newInvoiceNotes || undefined,
      playerId: selectedPlayerId || undefined,
    });
  };

  const handleMarkAsPaid = (invoice: Invoice) => {
    Alert.alert(
      "Mark as Paid",
      `Record payment of ${invoice.currency} ${invoice.amount}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record Payment",
          onPress: () => recordPaymentMutation.mutate({ invoiceId: invoice.id, amount: invoice.amount }),
        },
      ]
    );
  };

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAmount = invoices
    .filter((i) => i.status === "pending" || i.status === "sent")
    .reduce((sum, i) => sum + i.amount, 0);

  const currency = invoices[0]?.currency || payments[0]?.currency || "AED";

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.revenueCard]}>
          <Ionicons name="cash-outline" size={24} color={Colors.dark.primary} />
          <Text style={styles.statValue}>{currency} {totalRevenue.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total Revenue</Text>
        </View>
        <View style={[styles.statCard, styles.pendingCard]}>
          <Ionicons name="time-outline" size={24} color={Colors.dark.orange} />
          <Text style={styles.statValue}>{currency} {pendingAmount.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Invoices</Text>
          <Pressable onPress={() => setActiveTab("invoices")}>
            <Text style={styles.seeAllLink}>See All</Text>
          </Pressable>
        </View>
        
        {invoicesLoading ? (
          <ActivityIndicator color={Colors.dark.primary} />
        ) : invoices.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-outline" size={40} color={Colors.dark.disabled} />
            <Text style={styles.emptyText}>No invoices yet</Text>
            <Text style={styles.emptySubtext}>Create your first invoice to get started</Text>
          </View>
        ) : (
          invoices.slice(0, 3).map((invoice) => (
            <View key={invoice.id} style={styles.invoiceCard}>
              <View style={styles.invoiceInfo}>
                <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
                <Text style={styles.invoiceDate}>
                  {new Date(invoice.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.invoiceAmount}>
                <Text style={styles.amountText}>
                  {invoice.currency} {invoice.amount.toLocaleString()}
                </Text>
                <View style={[styles.statusBadge, invoice.status === "paid" ? styles.paidBadge : styles.pendingBadge]}>
                  <Text style={[styles.statusText, invoice.status === "paid" && styles.paidText]}>
                    {invoice.status}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Payments</Text>
          <Pressable onPress={() => setActiveTab("payments")}>
            <Text style={styles.seeAllLink}>See All</Text>
          </Pressable>
        </View>
        
        {paymentsLoading ? (
          <ActivityIndicator color={Colors.dark.primary} />
        ) : payments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={40} color={Colors.dark.disabled} />
            <Text style={styles.emptyText}>No payments yet</Text>
          </View>
        ) : (
          payments.slice(0, 3).map((payment) => (
            <View key={payment.id} style={styles.paymentCard}>
              <View style={styles.paymentIcon}>
                <Ionicons
                  name={payment.paymentMethod === "card" ? "card-outline" : "cash-outline"}
                  size={20}
                  color={Colors.dark.primary}
                />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentMethod}>
                  {payment.paymentMethod.charAt(0).toUpperCase() + payment.paymentMethod.slice(1)}
                </Text>
                <Text style={styles.paymentDate}>
                  {new Date(payment.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>
                +{payment.currency} {payment.amount.toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );

  const renderInvoicesTab = () => (
    <View style={styles.tabContent}>
      <Pressable style={styles.createButton} onPress={() => setShowCreateModal(true)}>
        <LinearGradient colors={[Colors.dark.primary, "#1EA030"]} style={styles.createButtonGradient}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.createButtonText}>Create Invoice</Text>
        </LinearGradient>
      </Pressable>

      {invoicesLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.xl }} />
      ) : invoices.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={60} color={Colors.dark.disabled} />
          <Text style={styles.emptyStateTitle}>No invoices yet</Text>
          <Text style={styles.emptyStateText}>Create invoices to track payments from players</Text>
        </View>
      ) : (
        invoices.map((invoice) => (
          <View key={invoice.id} style={styles.invoiceListCard}>
            <View style={styles.invoiceListHeader}>
              <Text style={styles.invoiceListNumber}>{invoice.invoiceNumber}</Text>
              <View style={[styles.statusBadge, invoice.status === "paid" ? styles.paidBadge : styles.pendingBadge]}>
                <Text style={[styles.statusText, invoice.status === "paid" && styles.paidText]}>
                  {invoice.status}
                </Text>
              </View>
            </View>
            <View style={styles.invoiceListDetails}>
              <Text style={styles.invoiceListAmount}>
                {invoice.currency} {invoice.amount.toLocaleString()}
              </Text>
              <Text style={styles.invoiceListDate}>
                Created: {new Date(invoice.createdAt).toLocaleDateString()}
              </Text>
              {invoice.dueDate ? (
                <Text style={styles.invoiceListDue}>
                  Due: {new Date(invoice.dueDate).toLocaleDateString()}
                </Text>
              ) : null}
            </View>
            {invoice.notes ? <Text style={styles.invoiceNotes}>{invoice.notes}</Text> : null}
            {invoice.status !== "paid" ? (
              <Pressable style={styles.markPaidButton} onPress={() => handleMarkAsPaid(invoice)}>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.dark.primary} />
                <Text style={styles.markPaidText}>Mark as Paid</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );

  const renderPaymentsTab = () => (
    <View style={styles.tabContent}>
      {paymentsLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.xl }} />
      ) : payments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={60} color={Colors.dark.disabled} />
          <Text style={styles.emptyStateTitle}>No payments yet</Text>
          <Text style={styles.emptyStateText}>Payments will appear here once recorded</Text>
        </View>
      ) : (
        payments.map((payment) => (
          <View key={payment.id} style={styles.paymentListCard}>
            <View style={styles.paymentListIcon}>
              <Ionicons
                name={payment.paymentMethod === "card" ? "card" : "cash"}
                size={24}
                color={Colors.dark.primary}
              />
            </View>
            <View style={styles.paymentListInfo}>
              <Text style={styles.paymentListAmount}>
                +{payment.currency} {payment.amount.toLocaleString()}
              </Text>
              <Text style={styles.paymentListMethod}>
                {payment.paymentMethod.charAt(0).toUpperCase() + payment.paymentMethod.slice(1)} Payment
              </Text>
              <Text style={styles.paymentListDate}>
                {new Date(payment.createdAt).toLocaleString()}
              </Text>
            </View>
            <View style={[styles.statusBadge, styles.paidBadge]}>
              <Text style={[styles.statusText, styles.paidText]}>{payment.status}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Billing</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        {[
          { key: "overview", label: "Overview", icon: "pie-chart-outline" },
          { key: "invoices", label: "Invoices", icon: "document-text-outline" },
          { key: "payments", label: "Payments", icon: "wallet-outline" },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as typeof activeTab)}
          >
            <Ionicons
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? Colors.dark.primary : Colors.dark.disabled}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" && renderOverviewTab()}
        {activeTab === "invoices" && renderInvoicesTab()}
        {activeTab === "payments" && renderPaymentsTab()}
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Invoice</Text>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.input}
                  value={newInvoiceAmount}
                  onChangeText={setNewInvoiceAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={newInvoiceNotes}
                  onChangeText={setNewInvoiceNotes}
                  placeholder="Invoice description..."
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Player (Optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
                  <Pressable
                    style={[styles.playerChip, !selectedPlayerId && styles.playerChipActive]}
                    onPress={() => setSelectedPlayerId(null)}
                  >
                    <Text style={[styles.playerChipText, !selectedPlayerId && styles.playerChipTextActive]}>
                      None
                    </Text>
                  </Pressable>
                  {players.map((player) => (
                    <Pressable
                      key={player.id}
                      style={[styles.playerChip, selectedPlayerId === player.id && styles.playerChipActive]}
                      onPress={() => setSelectedPlayerId(player.id)}
                    >
                      <Text style={[styles.playerChipText, selectedPlayerId === player.id && styles.playerChipTextActive]}>
                        {player.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </KeyboardAwareScrollViewCompat>

            <Pressable
              style={[styles.modalButton, createInvoiceMutation.isPending && styles.buttonDisabled]}
              onPress={handleCreateInvoice}
              disabled={createInvoiceMutation.isPending}
            >
              <LinearGradient colors={[Colors.dark.primary, "#1EA030"]} style={styles.modalButtonGradient}>
                {createInvoiceMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Create Invoice</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  tabText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: Spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  revenueCard: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 64, 0.3)",
  },
  pendingCard: {
    backgroundColor: "rgba(255, 133, 27, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 133, 27, 0.3)",
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  seeAllLink: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  invoiceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  invoiceInfo: {},
  invoiceNumber: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  invoiceDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  invoiceAmount: {
    alignItems: "flex-end",
  },
  amountText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: "rgba(255, 133, 27, 0.2)",
  },
  paidBadge: {
    backgroundColor: "rgba(46, 204, 64, 0.2)",
  },
  statusText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    textTransform: "capitalize",
  },
  paidText: {
    color: Colors.dark.primary,
  },
  paymentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentMethod: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  paymentDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  paymentAmount: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  createButton: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  createButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  createButtonText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "600",
  },
  invoiceListCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  invoiceListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  invoiceListNumber: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  invoiceListDetails: {},
  invoiceListAmount: {
    ...Typography.h3,
    color: Colors.dark.primary,
    marginBottom: Spacing.xs,
  },
  invoiceListDate: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  invoiceListDue: {
    ...Typography.small,
    color: Colors.dark.orange,
  },
  invoiceNotes: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
    fontStyle: "italic",
  },
  markPaidButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  markPaidText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  emptyStateTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptyStateText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  paymentListCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  paymentListIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  paymentListInfo: {
    flex: 1,
  },
  paymentListAmount: {
    ...Typography.h4,
    color: Colors.dark.primary,
  },
  paymentListMethod: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  paymentListDate: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  modalBody: {
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  playerScroll: {
    marginTop: Spacing.xs,
  },
  playerChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  playerChipActive: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderColor: Colors.dark.primary,
  },
  playerChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  playerChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  modalButton: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalButtonGradient: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
  },
  modalButtonText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "600",
  },
});
