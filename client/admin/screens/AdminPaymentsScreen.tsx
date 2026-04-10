import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useDesktop } from "@/hooks/useDesktop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useNavigation } from "@react-navigation/native";

interface Payment {
  id: string;
  academyId: string;
  playerId: string | null;
  payerName: string | null;
  playerName?: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentDate: string;
  dueDate?: string | null;
  packageName?: string | null;
  status: string;
  receivedBy: string | null;
  receiverName?: string;
  proofUrl: string | null;
  notes: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface Player {
  id: string;
  name: string;
}

type FilterStatus = "all" | "pending" | "confirmed" | "rejected";
type FilterMethod = "all" | "cash" | "bank_transfer";

export default function AdminPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterMethod, setFilterMethod] = useState<FilterMethod>("all");
  const [filterCoach, setFilterCoach] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<"all" | "today" | "week" | "month">("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [formData, setFormData] = useState({
    playerId: "",
    payerName: "",
    amount: "",
    paymentMethod: "cash" as "cash" | "bank_transfer",
    notes: "",
    status: "pending" as "pending" | "confirmed",
  });

  const getPaymentsUrl = () => {
    const params: string[] = [];
    if (filterStatus !== "all") params.push(`status=${filterStatus}`);
    if (filterMethod !== "all") params.push(`paymentMethod=${filterMethod}`);
    const queryString = params.length > 0 ? `?${params.join("&")}` : "";
    return `/api/admin/payments${queryString}`;
  };

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: [getPaymentsUrl()],
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const invalidatePayments = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && key.startsWith('/api/admin/payments');
    }});
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/payments", data),
    onSuccess: () => {
      invalidatePayments();
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create payment");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/payments/${id}/confirm`),
    onSuccess: () => {
      invalidatePayments();
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/admin/revenue');
      }});
      setShowDetailModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to confirm payment");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/admin/payments/${id}/reject`, { reason }),
    onSuccess: () => {
      invalidatePayments();
      setShowRejectModal(false);
      setShowDetailModal(false);
      setRejectReason("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to reject payment");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/payments/${id}`),
    onSuccess: () => {
      invalidatePayments();
      setShowDetailModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to delete payment");
    },
  });

  const resetForm = () => {
    setFormData({
      playerId: "",
      payerName: "",
      amount: "",
      paymentMethod: "cash",
      notes: "",
      status: "pending",
    });
  };

  const handleCreate = () => {
    if (!formData.amount) {
      Alert.alert("Error", "Amount is required");
      return;
    }
    createMutation.mutate({
      ...formData,
      amount: parseFloat(formData.amount),
      playerId: formData.playerId || null,
      payerName: formData.payerName || null,
    });
  };

  const handleConfirm = (payment: Payment) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Confirm payment of AED ${payment.amount} from ${payment.playerName || payment.payerName}?`)) {
        confirmMutation.mutate(payment.id);
      }
    } else {
      Alert.alert(
        "Confirm Payment",
        `Confirm payment of AED ${payment.amount} from ${payment.playerName || payment.payerName}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm", onPress: () => confirmMutation.mutate(payment.id) },
        ]
      );
    }
  };

  const handleReject = () => {
    if (!selectedPayment) return;
    rejectMutation.mutate({ id: selectedPayment.id, reason: rejectReason || "No reason provided" });
  };

  const handleDelete = (payment: Payment) => {
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to delete this payment?")) {
        deleteMutation.mutate(payment.id);
      }
    } else {
      Alert.alert(
        "Delete Payment",
        "Are you sure you want to delete this payment?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(payment.id) },
        ]
      );
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return Colors.dark.successNeon;
      case "rejected":
        return Colors.dark.error;
      default:
        return Colors.dark.orange;
    }
  };

  const getMethodIcon = (method: string): IoniconName => {
    return method === "cash" ? "cash-outline" : "card-outline";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isDesktop = useDesktop();

  const uniqueCoaches = React.useMemo(() => {
    const names = new Set<string>();
    payments.forEach((p: Payment) => { if (p.receiverName) names.add(p.receiverName); });
    return Array.from(names);
  }, [payments]);

  const pendingCount = payments.filter((p: Payment) => p.status === "pending").length;
  const confirmedTotal = payments.filter((p: Payment) => p.status === "confirmed").reduce((sum: number, p: Payment) => sum + parseFloat(p.amount), 0);
  const overdueCount = payments.filter((p: Payment) => {
    if (p.status !== "pending") return false;
    const dueDate = p.dueDate ? new Date(p.dueDate) : null;
    return dueDate !== null && dueDate < new Date();
  }).length;
  const thisMonthTotal = payments
    .filter((p: Payment) => {
      const d = new Date(p.paymentDate);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && p.status === "confirmed";
    })
    .reduce((sum: number, p: Payment) => sum + parseFloat(p.amount), 0);

  const desktopPayments = payments.filter((p: Payment) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterMethod !== "all" && p.paymentMethod !== filterMethod) return false;
    if (filterCoach !== "all" && (p.receiverName ?? "") !== filterCoach) return false;
    if (filterDateRange === "all") return true;
    const d = new Date(p.paymentDate);
    const now = new Date();
    if (filterDateRange === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (filterDateRange === "week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    }
    if (filterDateRange === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  });

  if (isDesktop) {
    return (
      <View style={payStyles.root}>
        <View style={payStyles.toolbar}>
          <Text style={payStyles.title}>Payments</Text>
          <View style={{ flex: 1 }} />
          <Pressable style={payStyles.addBtn} onPress={() => { setShowAddModal(true); setSelectedPayment(null); setShowDetailModal(false); }}>
            <Ionicons name="add" size={16} color="#0B0D10" />
            <Text style={payStyles.addBtnText}>Record Payment</Text>
          </Pressable>
        </View>

        <View style={payStyles.body}>
          <View style={payStyles.leftPanel}>
            {[
              { label: "Total Revenue", value: `AED ${confirmedTotal.toLocaleString()}`, color: "#22c55e" },
              { label: "Pending", value: String(pendingCount), color: Colors.dark.gold },
              { label: "This Month", value: `AED ${thisMonthTotal.toLocaleString()}`, color: Colors.dark.orange },
              { label: "Overdue", value: String(overdueCount), color: Colors.dark.error },
            ].map((kpi) => (
              <View key={kpi.label} style={payStyles.kpiCard}>
                <Text style={[payStyles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                <Text style={payStyles.kpiLabel}>{kpi.label}</Text>
              </View>
            ))}

            <Text style={payStyles.filterLabel}>Date Range</Text>
            {(["all", "today", "week", "month"] as const).map((d) => (
              <Pressable
                key={d}
                style={[payStyles.filterItem, filterDateRange === d && payStyles.filterItemActive]}
                onPress={() => setFilterDateRange(d)}
              >
                <Text style={[payStyles.filterItemText, filterDateRange === d && payStyles.filterItemTextActive]}>
                  {d === "all" ? "All Time" : d === "today" ? "Today" : d === "week" ? "This Week" : "This Month"}
                </Text>
              </Pressable>
            ))}

            <Text style={payStyles.filterLabel}>Status</Text>
            {(["all", "pending", "confirmed", "rejected"] as FilterStatus[]).map((s) => (
              <Pressable
                key={s}
                style={[payStyles.filterItem, filterStatus === s && payStyles.filterItemActive]}
                onPress={() => setFilterStatus(s)}
              >
                <Text style={[payStyles.filterItemText, filterStatus === s && payStyles.filterItemTextActive]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            ))}

            <Text style={payStyles.filterLabel}>Method</Text>
            {(["all", "cash", "bank_transfer"] as FilterMethod[]).map((m) => (
              <Pressable
                key={m}
                style={[payStyles.filterItem, filterMethod === m && payStyles.filterItemActive]}
                onPress={() => setFilterMethod(m)}
              >
                <Text style={[payStyles.filterItemText, filterMethod === m && payStyles.filterItemTextActive]}>
                  {m === "all" ? "All Methods" : m === "cash" ? "Cash" : "Bank Transfer"}
                </Text>
              </Pressable>
            ))}

            {uniqueCoaches.length > 0 ? (
              <>
                <Text style={payStyles.filterLabel}>Received By</Text>
                <Pressable
                  style={[payStyles.filterItem, filterCoach === "all" && payStyles.filterItemActive]}
                  onPress={() => setFilterCoach("all")}
                >
                  <Text style={[payStyles.filterItemText, filterCoach === "all" && payStyles.filterItemTextActive]}>All Coaches</Text>
                </Pressable>
                {uniqueCoaches.map((coach) => (
                  <Pressable
                    key={coach}
                    style={[payStyles.filterItem, filterCoach === coach && payStyles.filterItemActive]}
                    onPress={() => setFilterCoach(coach)}
                  >
                    <Text style={[payStyles.filterItemText, filterCoach === coach && payStyles.filterItemTextActive]} numberOfLines={1}>{coach}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>

          <View style={payStyles.tableArea}>
            <View style={payStyles.tableHeader}>
              <View style={[payStyles.thCell, payStyles.colPlayer]}>
                <Text style={payStyles.thText}>Player / Payer</Text>
              </View>
              <View style={[payStyles.thCell, payStyles.colPackage]}>
                <Text style={payStyles.thText}>Package</Text>
              </View>
              <View style={[payStyles.thCell, payStyles.colAmount]}>
                <Text style={payStyles.thText}>Amount</Text>
              </View>
              <View style={[payStyles.thCell, payStyles.colDate]}>
                <Text style={payStyles.thText}>Due Date</Text>
              </View>
              <View style={[payStyles.thCell, payStyles.colStatus]}>
                <Text style={payStyles.thText}>Status</Text>
              </View>
              <View style={[payStyles.thCell, payStyles.colActions]}>
                <Text style={payStyles.thText}>Actions</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={payStyles.tableScroll}>
              {isLoading ? (
                <View style={payStyles.emptyRow}>
                  <ActivityIndicator size="small" color={Colors.dark.orange} />
                </View>
              ) : desktopPayments.length === 0 ? (
                <View style={payStyles.emptyRow}>
                  <Text style={payStyles.emptyText}>No payments found</Text>
                </View>
              ) : desktopPayments.map((payment: Payment) => {
                const isOverdue = payment.status === "pending" && payment.dueDate != null && new Date(payment.dueDate) < new Date();
                const displayStatus = isOverdue ? "overdue" : payment.status;
                const statusColor = isOverdue ? Colors.dark.error : getStatusColor(payment.status);
                const name = payment.playerName || payment.payerName || "Unknown";
                return (
                  <Pressable
                    key={payment.id}
                    style={[payStyles.tableRow, isOverdue && { borderLeftWidth: 2, borderLeftColor: Colors.dark.error }]}
                    onPress={() => { setSelectedPayment(payment); setShowDetailModal(true); setShowAddModal(false); }}
                  >
                    <View style={[payStyles.tdCell, payStyles.colPlayer]}>
                      <View style={payStyles.playerIcon}>
                        <Text style={payStyles.playerIconText}>{name[0]?.toUpperCase() ?? "?"}</Text>
                      </View>
                      <Text style={payStyles.playerName} numberOfLines={1}>{name}</Text>
                    </View>
                    <View style={[payStyles.tdCell, payStyles.colPackage]}>
                      <Text style={payStyles.dateText} numberOfLines={1}>{payment.packageName ?? payment.notes ?? "—"}</Text>
                    </View>
                    <View style={[payStyles.tdCell, payStyles.colAmount]}>
                      <Text style={payStyles.amountText}>{payment.currency} {parseFloat(payment.amount).toLocaleString()}</Text>
                    </View>
                    <View style={[payStyles.tdCell, payStyles.colDate]}>
                      <Text style={[payStyles.dateText, isOverdue && { color: Colors.dark.error }]}>{payment.dueDate ? formatDate(payment.dueDate) : formatDate(payment.paymentDate)}</Text>
                    </View>
                    <View style={[payStyles.tdCell, payStyles.colStatus]}>
                      <View style={[payStyles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
                        <Text style={[payStyles.statusText, { color: statusColor }]}>
                          {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                        </Text>
                      </View>
                    </View>
                    <View style={[payStyles.tdCell, payStyles.colActions]}>
                      {payment.status === "pending" ? (
                        <Pressable
                          style={payStyles.actionBtn}
                          onPress={(e) => { e.stopPropagation(); handleConfirm(payment); }}
                        >
                          <Text style={payStyles.actionBtnText}>Confirm</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={[payStyles.actionBtn, { backgroundColor: "rgba(255,255,255,0.04)" }]}
                        onPress={(e) => { e.stopPropagation(); setSelectedPayment(payment); setShowDetailModal(true); }}
                      >
                        <Text style={[payStyles.actionBtnText, { color: Colors.dark.textMuted }]}>View</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {(showAddModal || showDetailModal) ? (
            <View style={payStyles.rightPanel}>
              {showAddModal ? (
                <>
                  <View style={[payStyles.toolbar, { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" }]}>
                    <Text style={[payStyles.title, { fontSize: 15 }]}>Record Payment</Text>
                    <Pressable onPress={() => { setShowAddModal(false); resetForm(); }}>
                      <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
                    </Pressable>
                  </View>
                  <ScrollView style={styles.modalBody}>
                    <Text style={styles.inputLabel}>Payer Name</Text>
                    <TextInput
                      style={styles.input}
                      value={formData.payerName}
                      onChangeText={(v) => setFormData({ ...formData, payerName: v })}
                      placeholder="Enter payer name"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                    <Text style={styles.inputLabel}>Amount *</Text>
                    <TextInput
                      style={styles.input}
                      value={formData.amount}
                      onChangeText={(v) => setFormData({ ...formData, amount: v })}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                    <Text style={styles.inputLabel}>Payment Method</Text>
                    <View style={styles.methodPicker}>
                      {(["cash", "bank_transfer"] as const).map((m) => (
                        <Pressable
                          key={m}
                          style={[styles.methodOption, formData.paymentMethod === m && styles.methodOptionActive]}
                          onPress={() => setFormData({ ...formData, paymentMethod: m })}
                        >
                          <Text style={[styles.methodOptionText, formData.paymentMethod === m && styles.methodOptionTextActive]}>
                            {m === "cash" ? "Cash" : "Bank Transfer"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.inputLabel}>Notes</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={formData.notes}
                      onChangeText={(v) => setFormData({ ...formData, notes: v })}
                      placeholder="Optional notes"
                      placeholderTextColor={Colors.dark.textMuted}
                      multiline
                    />
                  </ScrollView>
                  <View style={[styles.actionButtons, { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg }]}>
                    <Pressable style={[styles.actionButton, styles.confirmButton]} onPress={handleCreate}>
                      <Text style={styles.confirmButtonText}>{createMutation.isPending ? "Saving..." : "Record Payment"}</Text>
                    </Pressable>
                  </View>
                </>
              ) : selectedPayment ? (
                <>
                  <View style={[payStyles.toolbar, { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" }]}>
                    <Text style={[payStyles.title, { fontSize: 15 }]}>Payment Details</Text>
                    <Pressable onPress={() => setShowDetailModal(false)}>
                      <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
                    </Pressable>
                  </View>
                  <ScrollView style={styles.modalBody}>
                    {[
                      { label: "Player / Payer", value: selectedPayment.playerName || selectedPayment.payerName || "Unknown" },
                      { label: "Amount", value: `${selectedPayment.currency} ${parseFloat(selectedPayment.amount).toLocaleString()}` },
                      { label: "Date", value: formatDate(selectedPayment.paymentDate) },
                      { label: "Due Date", value: selectedPayment.dueDate ? formatDate(selectedPayment.dueDate) : "—" },
                      { label: "Method", value: selectedPayment.paymentMethod === "cash" ? "Cash" : "Bank Transfer" },
                      { label: "Status", value: selectedPayment.status.charAt(0).toUpperCase() + selectedPayment.status.slice(1) },
                    ].map((row) => (
                      <View key={row.label} style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{row.label}</Text>
                        <Text style={styles.detailValue}>{row.value}</Text>
                      </View>
                    ))}
                    {selectedPayment.notes ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Notes</Text>
                        <Text style={styles.detailValue}>{selectedPayment.notes}</Text>
                      </View>
                    ) : null}
                  </ScrollView>
                  {selectedPayment.status === "pending" ? (
                    <View style={[styles.actionButtons, { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, flexDirection: "column", gap: Spacing.sm }]}>
                      <Pressable style={[styles.actionButton, styles.confirmButton]} onPress={() => handleConfirm(selectedPayment)}>
                        <Text style={styles.confirmButtonText}>{confirmMutation.isPending ? "Confirming..." : "Confirm Payment"}</Text>
                      </Pressable>
                      <Pressable style={[styles.actionButton, styles.rejectButton]} onPress={() => setShowRejectModal(true)}>
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        <Modal visible={showRejectModal} animationType="fade" transparent>
          <View style={[styles.modalOverlay, { justifyContent: "center" }]}>
            <View style={[styles.modalContent, { maxHeight: 340, maxWidth: 400, width: "90%", alignSelf: "center", borderRadius: BorderRadius.xl }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Reject Payment</Text>
                <Pressable onPress={() => setShowRejectModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>Reason for rejection</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Enter reason..."
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                />
              </View>
              <View style={[styles.actionButtons, { paddingBottom: Spacing.lg }]}>
                <Pressable style={[styles.actionButton, { backgroundColor: "rgba(255,255,255,0.08)" }]} onPress={() => setShowRejectModal(false)}>
                  <Text style={styles.submitButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={handleReject}
                >
                  <Text style={styles.rejectButtonText}>
                    {rejectMutation.isPending ? "Rejecting..." : "Reject Payment"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#1a1a0a", "#0a0a0a"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.title}>Payments</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{pendingCount}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: Colors.dark.successNeon }]}>
              AED {confirmedTotal.toLocaleString()}
            </Text>
            <Text style={styles.summaryLabel}>Confirmed</Text>
          </View>
        </View>
      </View>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(["all", "pending", "confirmed", "rejected"] as FilterStatus[]).map((status) => (
            <Pressable
              key={status}
              style={[styles.filterChip, filterStatus === status && styles.filterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterStatus(status);
              }}
            >
              <Text style={[styles.filterChipText, filterStatus === status && styles.filterChipTextActive]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </Pressable>
          ))}
          <View style={styles.filterDivider} />
          {(["all", "cash", "bank_transfer"] as FilterMethod[]).map((method) => (
            <Pressable
              key={method}
              style={[styles.filterChip, filterMethod === method && styles.filterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterMethod(method);
              }}
            >
              <Text style={[styles.filterChipText, filterMethod === method && styles.filterChipTextActive]}>
                {method === "all" ? "All Methods" : method === "cash" ? "Cash" : "Bank"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.orange} />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
          {payments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={Colors.dark.textSecondary} />
              <Text style={styles.emptyText}>No payments found</Text>
              <Text style={styles.emptySubtext}>Tap the + button to record a payment</Text>
            </View>
          ) : (
            payments.map((payment: Payment) => (
              <Pressable
                key={payment.id}
                style={styles.paymentCard}
                onPress={() => {
                  setSelectedPayment(payment);
                  setShowDetailModal(true);
                }}
              >
                <View style={styles.paymentHeader}>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentName}>{payment.playerName || payment.payerName || "Unknown"}</Text>
                    <Text style={styles.paymentDate}>{formatDate(payment.paymentDate || payment.createdAt)}</Text>
                  </View>
                  <View style={styles.paymentAmount}>
                    <Text style={styles.amountText}>AED {parseFloat(payment.amount).toLocaleString()}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payment.status) + "20" }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(payment.status) }]}>
                        {payment.status}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.paymentFooter}>
                  <View style={styles.methodBadge}>
                    <Ionicons name={getMethodIcon(payment.paymentMethod)} size={14} color={Colors.dark.textSecondary} />
                    <Text style={styles.methodText}>
                      {payment.paymentMethod === "cash" ? "Cash" : "Bank Transfer"}
                    </Text>
                  </View>
                  {payment.receiverName ? (
                    <Text style={styles.receiverText}>Received by {payment.receiverName}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      <Pressable
        style={styles.fab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAddModal(true);
        }}
      >
        <LinearGradient colors={[Colors.dark.orange, "#CC9900"]} style={styles.fabGradient}>
          <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
        </LinearGradient>
      </Pressable>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Player (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerPicker}>
                <Pressable
                  style={[styles.playerChip, !formData.playerId && styles.playerChipActive]}
                  onPress={() => setFormData({ ...formData, playerId: "" })}
                >
                  <Text style={[styles.playerChipText, !formData.playerId && styles.playerChipTextActive]}>
                    Other
                  </Text>
                </Pressable>
                {players.map((player: Player) => (
                  <Pressable
                    key={player.id}
                    style={[styles.playerChip, formData.playerId === player.id && styles.playerChipActive]}
                    onPress={() => setFormData({ ...formData, playerId: player.id, payerName: player.name })}
                  >
                    <Text style={[styles.playerChipText, formData.playerId === player.id && styles.playerChipTextActive]}>
                      {player.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {!formData.playerId ? (
                <>
                  <Text style={styles.inputLabel}>Payer Name</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.payerName}
                    onChangeText={(text) => setFormData({ ...formData, payerName: text })}
                    placeholder="Enter payer name"
                    placeholderTextColor={Colors.dark.textSecondary}
                  />
                </>
              ) : null}

              <Text style={styles.inputLabel}>Amount (AED)</Text>
              <TextInput
                style={styles.input}
                value={formData.amount}
                onChangeText={(text) => setFormData({ ...formData, amount: text.replace(/[^0-9.]/g, "") })}
                placeholder="0.00"
                placeholderTextColor={Colors.dark.textSecondary}
                keyboardType="decimal-pad"
              />

              <Text style={styles.inputLabel}>Payment Method</Text>
              <View style={styles.methodPicker}>
                <Pressable
                  style={[styles.methodOption, formData.paymentMethod === "cash" && styles.methodOptionActive]}
                  onPress={() => setFormData({ ...formData, paymentMethod: "cash" })}
                >
                  <Ionicons name="cash-outline" size={20} color={formData.paymentMethod === "cash" ? Colors.dark.orange : Colors.dark.textSecondary} />
                  <Text style={[styles.methodOptionText, formData.paymentMethod === "cash" && styles.methodOptionTextActive]}>Cash</Text>
                </Pressable>
                <Pressable
                  style={[styles.methodOption, formData.paymentMethod === "bank_transfer" && styles.methodOptionActive]}
                  onPress={() => setFormData({ ...formData, paymentMethod: "bank_transfer" })}
                >
                  <Ionicons name="card-outline" size={20} color={formData.paymentMethod === "bank_transfer" ? Colors.dark.orange : Colors.dark.textSecondary} />
                  <Text style={[styles.methodOptionText, formData.paymentMethod === "bank_transfer" && styles.methodOptionTextActive]}>Bank Transfer</Text>
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.methodPicker}>
                <Pressable
                  style={[styles.methodOption, formData.status === "pending" && styles.methodOptionActive]}
                  onPress={() => setFormData({ ...formData, status: "pending" })}
                >
                  <Text style={[styles.methodOptionText, formData.status === "pending" && styles.methodOptionTextActive]}>Pending</Text>
                </Pressable>
                <Pressable
                  style={[styles.methodOption, formData.status === "confirmed" && styles.methodOptionActive]}
                  onPress={() => setFormData({ ...formData, status: "confirmed" })}
                >
                  <Text style={[styles.methodOptionText, formData.status === "confirmed" && styles.methodOptionTextActive]}>Confirmed</Text>
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="Add notes..."
                placeholderTextColor={Colors.dark.textSecondary}
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <Pressable
              style={[styles.submitButton, createMutation.isPending && styles.submitButtonDisabled]}
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.submitButtonText}>Record Payment</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {selectedPayment ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Payment Details</Text>
                  <Pressable onPress={() => setShowDetailModal(false)}>
                    <Ionicons name="close" size={24} color={Colors.dark.text} />
                  </Pressable>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.detailAmount}>
                    <Text style={styles.detailAmountValue}>AED {parseFloat(selectedPayment.amount).toLocaleString()}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedPayment.status) + "20" }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(selectedPayment.status) }]}>
                        {selectedPayment.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>From</Text>
                    <Text style={styles.detailValue}>{selectedPayment.playerName || selectedPayment.payerName || "Unknown"}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Method</Text>
                    <Text style={styles.detailValue}>{selectedPayment.paymentMethod === "cash" ? "Cash" : "Bank Transfer"}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedPayment.paymentDate || selectedPayment.createdAt)}</Text>
                  </View>

                  {selectedPayment.receiverName ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Received By</Text>
                      <Text style={styles.detailValue}>{selectedPayment.receiverName}</Text>
                    </View>
                  ) : null}

                  {selectedPayment.notes ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Notes</Text>
                      <Text style={styles.detailValue}>{selectedPayment.notes}</Text>
                    </View>
                  ) : null}

                  {selectedPayment.rejectionReason ? (
                    <View style={[styles.detailRow, styles.rejectionRow]}>
                      <Text style={styles.detailLabel}>Rejection Reason</Text>
                      <Text style={[styles.detailValue, { color: Colors.dark.error }]}>{selectedPayment.rejectionReason}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                {selectedPayment.status === "pending" ? (
                  <View style={styles.actionButtons}>
                    <Pressable
                      style={[styles.actionButton, styles.confirmButton]}
                      onPress={() => handleConfirm(selectedPayment)}
                      disabled={confirmMutation.isPending}
                    >
                      {confirmMutation.isPending ? (
                        <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={20} color={Colors.dark.buttonText} />
                          <Text style={styles.confirmButtonText}>Confirm</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, styles.rejectButton]}
                      onPress={() => setShowRejectModal(true)}
                    >
                      <Ionicons name="close" size={20} color={Colors.dark.text} />
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </Pressable>
                  </View>
                ) : null}

                {selectedPayment.status !== "confirmed" ? (
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => handleDelete(selectedPayment)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.error} />
                    ) : (
                      <Text style={styles.deleteButtonText}>Delete Payment</Text>
                    )}
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showRejectModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.rejectModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Text style={styles.rejectModalTitle}>Reject Payment</Text>
            <Text style={styles.rejectModalSubtitle}>Please provide a reason for rejection</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason for rejection..."
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={3}
            />
            <View style={styles.rejectModalButtons}>
              <Pressable
                style={styles.rejectModalCancel}
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
              >
                <Text style={styles.rejectModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.rejectModalConfirm}
                onPress={handleReject}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.rejectModalConfirmText}>Reject</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  summaryValue: {
    ...Typography.numberMedium,
    color: Colors.dark.orange,
  },
  summaryLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  filters: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  filterScroll: {
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  filterChipActive: {
    backgroundColor: Colors.dark.orange + "20",
    borderColor: Colors.dark.orange,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  filterDivider: {
    width: 1,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  paymentCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  paymentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  paymentInfo: {
    flex: 1,
  },
  paymentName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  paymentDate: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  paymentAmount: {
    alignItems: "flex-end",
  },
  amountText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  statusText: {
    ...Typography.caption,
    textTransform: "capitalize",
  },
  paymentFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  methodText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  receiverText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  fab: {
    position: "absolute",
    bottom: 100,
    right: Spacing.lg,
    borderRadius: 28,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabGradient: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  inputLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  playerPicker: {
    marginTop: Spacing.xs,
  },
  playerChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  playerChipActive: {
    backgroundColor: Colors.dark.orange + "20",
    borderColor: Colors.dark.orange,
  },
  playerChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  playerChipTextActive: {
    color: Colors.dark.orange,
  },
  methodPicker: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  methodOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  methodOptionActive: {
    backgroundColor: Colors.dark.orange + "20",
    borderColor: Colors.dark.orange,
  },
  methodOptionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  methodOptionTextActive: {
    color: Colors.dark.orange,
  },
  submitButton: {
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginHorizontal: Spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  detailAmount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  detailAmountValue: {
    ...Typography.numberLarge,
    color: Colors.dark.text,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  detailLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  detailValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
    marginLeft: Spacing.md,
  },
  rejectionRow: {
    backgroundColor: Colors.dark.error + "10",
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  confirmButton: {
    backgroundColor: Colors.dark.successNeon,
  },
  confirmButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  rejectButton: {
    backgroundColor: Colors.dark.error,
  },
  rejectButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  deleteButton: {
    alignItems: "center",
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  deleteButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
  rejectModalContent: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.xl,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  rejectModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rejectModalSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  rejectModalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  rejectModalCancel: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  rejectModalCancelText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  rejectModalConfirm: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
  },
  rejectModalConfirmText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});

const payStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0D10",
    flexDirection: "column",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#C8FF3D",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B0D10",
  },
  body: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  leftPanel: {
    width: 220,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.07)",
    padding: 16,
    overflow: "scroll",
  },
  kpiCard: {
    backgroundColor: "#11141A",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 6,
  },
  filterItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 2,
  },
  filterItemActive: {
    backgroundColor: "rgba(200,255,61,0.08)",
  },
  filterItemText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  filterItemTextActive: {
    color: "#C8FF3D",
    fontWeight: "600",
  },
  tableArea: {
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
  },
  rightPanel: {
    width: 300,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#0D0F13",
    flexDirection: "column",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#0D0F13",
  },
  thCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  thText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7C8290",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  colPlayer: { flex: 2 },
  colPackage: { flex: 2 },
  colAmount: { flex: 1 },
  colDate: { flex: 1 },
  colMethod: { flex: 1, gap: 6 },
  colStatus: { flex: 1 },
  colActions: { flex: 1, gap: 8 },
  tableScroll: {
    flex: 1,
    overflow: "scroll",
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    
  },
  tableRowHovered: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  tdCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,133,27,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  playerIconText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FF851B",
  },
  playerName: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  amountText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  methodText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginLeft: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(200,255,61,0.08)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#C8FF3D",
  },
  emptyRow: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#7C8290",
    fontSize: 14,
  },
});
