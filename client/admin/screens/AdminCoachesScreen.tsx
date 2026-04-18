import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
interface Coach {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
  status?: string;
  role?: string;
  hourlyRate?: number;
}

interface MonthlyPayment {
  month: number;
  year: number;
  hoursWorked: number;
  sessionsCount: number;
  hourlyRate: number;
  grossAmount: number;
  status: "pending" | "approved" | "paid" | "declined";
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  declineReason: string | null;
  payoutId: string | null;
}

interface CoachStats {
  coach: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    specialty?: string;
    bio?: string;
    yearsExperience?: number;
    role?: string;
  };
  performance: {
    sessionsThisMonth: number;
    completedSessions: number;
    activePlayers: number;
    feedbackCompletionRate: number;
    attendanceAccuracy: number;
  };
  finance: {
    hourlyRate: number;
    totalHours: number;
    amountOwed: number;
    amountPaid: number;
    monthlyHistory: MonthlyPayment[];
  };
}

interface StatItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
}

function StatItem({ icon, label, value, color = Colors.dark.primary }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer", icon: "business-outline" as const },
  { value: "cash", label: "Cash", icon: "cash-outline" as const },
  { value: "cheque", label: "Cheque", icon: "document-text-outline" as const },
  { value: "card", label: "Card", icon: "card-outline" as const },
];

export default function AdminCoachesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [pendingPayment, setPendingPayment] = useState<{ month: number; year: number } | null>(null);
  const [paymentFormData, setPaymentFormData] = useState({
    paymentMethod: "bank_transfer",
    paymentReference: "",
  });
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    specialty: "",
    hourlyRate: "",
  });

  const { data: coaches = [], isLoading, error, refetch } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: coachStats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery<CoachStats>({
    queryKey: ["/api/admin/coaches", selectedCoachId, "stats"],
    enabled: !!selectedCoachId && showDetailModal,
  });

  const selectedCoach = coaches.find(c => c.id === selectedCoachId);

  const addCoachMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/coaches", {
        ...data,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches"] });
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", specialty: "", hourlyRate: "" });
    setEditingCoach(null);
  };
  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openDetailModal = (coachId: string) => {
    setSelectedCoachId(coachId);
    setShowDetailModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedCoachId(null);
    // Reset nested-modal state so it never reopens stale next time the
    // detail drawer is presented (the Record Payment modal is rendered
    // inside this drawer — see replit.md → Modal stacking).
    setShowPaymentModal(false);
    setPendingPayment(null);
  };

  const markPaidMutation = useMutation({
    mutationFn: async ({ coachId, month, year, paymentMethod, paymentReference }: { 
      coachId: string; 
      month: number; 
      year: number;
      paymentMethod: string;
      paymentReference?: string;
    }) => {
      return apiRequest("POST", `/api/admin/coaches/${coachId}/payouts/${month}/${year}/pay`, {
        paymentMethod,
        paymentReference: paymentReference || undefined,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coaches", variables.coachId, "stats"] });
      setShowPaymentModal(false);
      setPendingPayment(null);
      setPaymentFormData({ paymentMethod: "bank_transfer", paymentReference: "" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Payment marked as paid!");
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async ({ coachId, month, year, reason }: { coachId: string; month: number; year: number; reason: string }) => {
      return apiRequest("POST", `/api/admin/coaches/${coachId}/payouts/${month}/${year}/decline`, {
        reason,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coaches", variables.coachId, "stats"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const deleteCoachMutation = useMutation({
    mutationFn: async (coachId: string) => {
      return apiRequest("DELETE", `/api/owner/coaches/${coachId}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Coach permanently deleted");
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleDeleteCoach = () => {
    if (!selectedCoachId || !selectedCoach) return;
    const coachIdToDelete = selectedCoachId;
    const coachToDelete = selectedCoach;
    closeDetailModal();
    setTimeout(() => {
      Alert.alert(
        "Permanently Remove Coach",
        `This will permanently remove ${coachToDelete.name} from this academy. They will lose access to all academy data. This action cannot be undone.`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => openDetailModal(coachIdToDelete),
          },
          {
            text: "Remove Forever",
            style: "destructive",
            onPress: () => deleteCoachMutation.mutate(coachIdToDelete),
          },
        ]
      );
    }, 300);
  };

  const handleMarkPaid = (month: number, year: number) => {
    if (!selectedCoachId) return;
    setPendingPayment({ month, year });
    setPaymentFormData({ paymentMethod: "bank_transfer", paymentReference: "" });
    setShowPaymentModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmPayment = () => {
    if (!selectedCoachId || !pendingPayment) return;
    markPaidMutation.mutate({
      coachId: selectedCoachId,
      month: pendingPayment.month,
      year: pendingPayment.year,
      paymentMethod: paymentFormData.paymentMethod,
      paymentReference: paymentFormData.paymentReference || undefined,
    });
  };

  const getPaymentMethodLabel = (method: string | null) => {
    if (!method) return "";
    const found = PAYMENT_METHODS.find(m => m.value === method);
    return found ? found.label : method;
  };

  const getPaymentMethodIcon = (method: string | null): keyof typeof Ionicons.glyphMap => {
    if (!method) return "help-outline";
    const found = PAYMENT_METHODS.find(m => m.value === method);
    return found ? found.icon : "help-outline";
  };

  const handleDecline = (month: number, year: number) => {
    if (!selectedCoachId) return;
    const coachId = selectedCoachId;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    Alert.alert(
      "Decline Payment",
      `Are you sure you want to decline ${monthNames[month - 1]} ${year} payment?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Decline", style: "destructive", onPress: () => {
          declineMutation.mutate({ coachId, month, year, reason: "Declined by admin" });
        }},
      ]
    );
  };

  const handleSendHoursOverview = () => {
    const coach = coachStats?.coach;
    if (!coach?.email) {
      Alert.alert("Error", "Coach has no email address set");
      return;
    }
    Alert.alert("Send Overview", `Hours overview will be sent to ${coach.email}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Sent", "Hours overview sent successfully!");
      }},
    ]);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter coach name");
      return;
    }
    addCoachMutation.mutate(formData);
  };

  const getRoleColor = (role?: string) => {
    switch (role) {
      case "head_coach": return Colors.dark.gold;
      case "assistant": return Colors.dark.orange;
      case "intern": return Colors.dark.xpCyan;
      default: return Colors.dark.primary;
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case "head_coach": return "Head Coach";
      case "assistant": return "Assistant";
      case "intern": return "Intern";
      default: return "Coach";
    }
  };

  const renderCoach = ({ item }: { item: Coach }) => (
    <Pressable
      style={[styles.coachCard, CardStyles.elevated]}
      onPress={() => openDetailModal(item.id)}
    >
      <View style={styles.coachAvatar}>
        <Ionicons name="person" size={24} color={Colors.dark.primary} />
      </View>
      <View style={styles.coachInfo}>
        <Text style={styles.coachName}>{item.name}</Text>
        <Text style={styles.coachEmail}>{item.email || "No email"}</Text>
        {item.specialty ? (
          <Text style={styles.coachSpecialty}>{item.specialty}</Text>
        ) : null}
      </View>
      <View style={styles.coachMeta}>
        <View style={[styles.roleBadge, { backgroundColor: `${getRoleColor(item.role)}20` }]}>
          <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>
            {getRoleLabel(item.role)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );

  const renderDetailModal = () => {
    const stats = coachStats;
    
    return (
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDetailModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeDetailModal}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Coach Details</Text>
            <Pressable onPress={() => {
              if (stats?.coach) {
                setEditingCoach({
                  id: stats.coach.id,
                  name: stats.coach.name,
                  email: stats.coach.email,
                  phone: stats.coach.phone,
                  specialty: stats.coach.specialty,
                  role: stats.coach.role,
                });
                setFormData({
                  name: stats.coach.name || "",
                  email: stats.coach.email || "",
                  phone: stats.coach.phone || "",
                  specialty: stats.coach.specialty || "",
                  hourlyRate: stats.finance?.hourlyRate?.toString() || "",
                });
                closeDetailModal();
                setShowAddModal(true);
              }
            }}>
              <Ionicons name="pencil" size={20} color={Colors.dark.orange} />
            </Pressable>
          </View>

          {statsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.orange} />
              <Text style={styles.loadingText}>Loading coach details...</Text>
            </View>
          ) : statsError ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
              <Text style={styles.errorText}>Failed to load coach details</Text>
              <Pressable style={styles.retryButton} onPress={() => refetchStats()}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
            </View>
          ) : stats ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={styles.profileAvatar}>
                  <Ionicons name="person" size={40} color={Colors.dark.primary} />
                </View>
                <Text style={styles.profileName}>{stats.coach.name}</Text>
                <View style={[styles.roleBadge, { backgroundColor: `${getRoleColor(stats.coach.role)}20` }]}>
                  <Text style={[styles.roleText, { color: getRoleColor(stats.coach.role) }]}>
                    {getRoleLabel(stats.coach.role)}
                  </Text>
                </View>
                {stats.coach.email ? (
                  <Text style={styles.profileEmail}>{stats.coach.email}</Text>
                ) : null}
                {stats.coach.phone ? (
                  <Text style={styles.profilePhone}>{stats.coach.phone}</Text>
                ) : null}
              </View>

              {stats.coach.bio ? (
                <View style={[styles.section, CardStyles.elevated]}>
                  <Text style={styles.sectionTitle}>About</Text>
                  <Text style={styles.bioText}>{stats.coach.bio}</Text>
                  {stats.coach.yearsExperience ? (
                    <Text style={styles.experienceText}>
                      {stats.coach.yearsExperience} years experience
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Performance</Text>
                <View style={styles.statsGrid}>
                  <StatItem 
                    icon="calendar" 
                    label="Sessions/Mo" 
                    value={stats.performance.sessionsThisMonth}
                    color={Colors.dark.orange}
                  />
                  <StatItem 
                    icon="checkmark-circle" 
                    label="Completed" 
                    value={stats.performance.completedSessions}
                    color={Colors.dark.successNeon}
                  />
                  <StatItem 
                    icon="people" 
                    label="Players" 
                    value={stats.performance.activePlayers}
                    color={Colors.dark.xpCyan}
                  />
                  <StatItem 
                    icon="chatbubble" 
                    label="Feedback %" 
                    value={`${stats.performance.feedbackCompletionRate}%`}
                    color={Colors.dark.primary}
                  />
                </View>
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Finance Overview</Text>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Hourly Rate</Text>
                  <Text style={styles.financeValue}>AED {stats.finance.hourlyRate}</Text>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Hours This Month</Text>
                  <Text style={styles.financeValue}>{stats.finance.totalHours}h</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Amount Owed</Text>
                  <Text style={[styles.financeValue, { color: stats.finance.amountOwed > 0 ? Colors.dark.orange : Colors.dark.successNeon }]}>
                    AED {stats.finance.amountOwed}
                  </Text>
                </View>
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Monthly Payment History</Text>
                </View>
                
                {stats.finance.monthlyHistory && stats.finance.monthlyHistory.length > 0 ? (
                  stats.finance.monthlyHistory.map((payment: MonthlyPayment, index: number) => {
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const monthLabel = `${monthNames[payment.month - 1]} ${payment.year}`;
                    
                    const getStatusColor = (status: string) => {
                      switch (status) {
                        case "paid": return Colors.dark.successNeon;
                        case "declined": return Colors.dark.error;
                        case "approved": return Colors.dark.xpCyan;
                        default: return Colors.dark.orange;
                      }
                    };
                    
                    const getStatusLabel = (status: string) => {
                      switch (status) {
                        case "paid": return "Paid";
                        case "declined": return "Declined";
                        case "approved": return "Approved";
                        default: return "Pending";
                      }
                    };

                    return (
                      <View key={`${payment.month}-${payment.year}`} style={[
                        styles.monthlyPaymentRow,
                        index < stats.finance.monthlyHistory.length - 1 && styles.monthlyPaymentBorder
                      ]}>
                        <View style={styles.monthlyPaymentHeader}>
                          <Text style={styles.monthlyPaymentMonth}>{monthLabel}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(payment.status)}20` }]}>
                            <Text style={[styles.statusBadgeText, { color: getStatusColor(payment.status) }]}>
                              {getStatusLabel(payment.status)}
                            </Text>
                          </View>
                        </View>
                        
                        <View style={styles.monthlyPaymentDetails}>
                          <View style={styles.monthlyPaymentStat}>
                            <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
                            <Text style={styles.monthlyPaymentStatText}>{payment.hoursWorked}h</Text>
                          </View>
                          <View style={styles.monthlyPaymentStat}>
                            <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
                            <Text style={styles.monthlyPaymentStatText}>{payment.sessionsCount} sessions</Text>
                          </View>
                          <Text style={[styles.monthlyPaymentAmount, { color: getStatusColor(payment.status) }]}>
                            AED {payment.grossAmount}
                          </Text>
                        </View>
                        
                        {payment.status === "declined" && payment.declineReason ? (
                          <Text style={styles.declineReason}>Reason: {payment.declineReason}</Text>
                        ) : null}

                        {payment.status === "paid" && (payment.paymentMethod || payment.paidAt) ? (
                          <View style={styles.paidDetailsRow}>
                            {payment.paymentMethod ? (
                              <View style={styles.paidDetailItem}>
                                <Ionicons name={getPaymentMethodIcon(payment.paymentMethod)} size={14} color={Colors.dark.successNeon} />
                                <Text style={styles.paidDetailText}>{getPaymentMethodLabel(payment.paymentMethod)}</Text>
                              </View>
                            ) : null}
                            {payment.paidAt ? (
                              <View style={styles.paidDetailItem}>
                                <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                                <Text style={styles.paidDetailText}>
                                  {new Date(payment.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </Text>
                              </View>
                            ) : null}
                            {payment.paymentReference ? (
                              <View style={styles.paidDetailItem}>
                                <Ionicons name="document-text-outline" size={14} color={Colors.dark.textMuted} />
                                <Text style={[styles.paidDetailText, { color: Colors.dark.textMuted }]}>{payment.paymentReference}</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                        
                        {payment.status === "pending" ? (
                          <View style={styles.paymentActions}>
                            <Pressable 
                              style={[styles.paymentActionButton, styles.payButton]}
                              onPress={() => handleMarkPaid(payment.month, payment.year)}
                            >
                              <Ionicons name="checkmark" size={16} color={Colors.dark.text} />
                              <Text style={styles.payButtonText}>Mark Paid</Text>
                            </Pressable>
                            <Pressable 
                              style={[styles.paymentActionButton, styles.declineButton]}
                              onPress={() => handleDecline(payment.month, payment.year)}
                            >
                              <Ionicons name="close" size={16} color={Colors.dark.error} />
                              <Text style={styles.declineButtonText}>Decline</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyPaymentHistory}>
                    <Ionicons name="receipt-outline" size={32} color={Colors.dark.textMuted} />
                    <Text style={styles.emptyPaymentText}>No payment history yet</Text>
                  </View>
                )}
              </View>

              <Pressable 
                style={styles.sendOverviewButton}
                onPress={() => handleSendHoursOverview()}
              >
                <Ionicons name="mail-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.sendOverviewText}>Send Hours Overview to Coach</Text>
              </Pressable>

              <Pressable 
                style={styles.deleteCoachButton}
                onPress={handleDeleteCoach}
                disabled={deleteCoachMutation.isPending}
              >
                {deleteCoachMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.error} />
                ) : (
                  <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
                )}
                <Text style={styles.deleteCoachText}>Remove Coach from Academy</Text>
              </Pressable>
            </ScrollView>
          ) : selectedCoach ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={styles.profileAvatar}>
                  <Ionicons name="person" size={40} color={Colors.dark.primary} />
                </View>
                <Text style={styles.profileName}>{selectedCoach.name}</Text>
                <View style={[styles.roleBadge, { backgroundColor: `${getRoleColor(selectedCoach.role)}20` }]}>
                  <Text style={[styles.roleText, { color: getRoleColor(selectedCoach.role) }]}>
                    {getRoleLabel(selectedCoach.role)}
                  </Text>
                </View>
                {selectedCoach.email ? (
                  <Text style={styles.profileEmail}>{selectedCoach.email}</Text>
                ) : null}
                {selectedCoach.phone ? (
                  <Text style={styles.profilePhone}>{selectedCoach.phone}</Text>
                ) : null}
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Basic Info</Text>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Specialty</Text>
                  <Text style={styles.financeValue}>{selectedCoach.specialty || "Not specified"}</Text>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Hourly Rate</Text>
                  <Text style={styles.financeValue}>AED {selectedCoach.hourlyRate || 0}</Text>
                </View>
              </View>

              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.dark.orange} />
                <Text style={styles.loadingText}>Loading full stats...</Text>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.loadingContainer}>
              <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.errorText}>No coach selected</Text>
            </View>
          )}
        </View>

        {/*
          NESTED Record Payment modal — see replit.md → Modal stacking.
          handleMarkPaid opens this modal while the Detail Modal is still
          visible, so it MUST render as a child of this <Modal>. Rendering it
          as a sibling on the screen would mount it in a separate native
          window and it would appear BEHIND the Detail drawer on iOS.
        */}
        <Modal
          visible={showPaymentModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            setShowPaymentModal(false);
            setPendingPayment(null);
          }}
        >
          <View style={styles.paymentModalOverlay}>
            <View style={[styles.paymentModalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.paymentModalHeader}>
                <Text style={styles.paymentModalTitle}>Record Payment</Text>
                <Pressable
                  onPress={() => {
                    setShowPaymentModal(false);
                    setPendingPayment(null);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
                </Pressable>
              </View>

              {pendingPayment ? (
                <Text style={styles.paymentModalSubtitle}>
                  {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][pendingPayment.month - 1]} {pendingPayment.year}
                </Text>
              ) : null}

              <Text style={styles.paymentModalLabel}>Payment Method</Text>
              <View style={styles.paymentMethodGrid}>
                {PAYMENT_METHODS.map((method) => (
                  <Pressable
                    key={method.value}
                    style={[
                      styles.paymentMethodOption,
                      paymentFormData.paymentMethod === method.value && styles.paymentMethodSelected
                    ]}
                    onPress={() => {
                      setPaymentFormData(prev => ({ ...prev, paymentMethod: method.value }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons
                      name={method.icon}
                      size={24}
                      color={paymentFormData.paymentMethod === method.value ? Colors.dark.text : Colors.dark.textMuted}
                    />
                    <Text style={[
                      styles.paymentMethodLabel,
                      paymentFormData.paymentMethod === method.value && styles.paymentMethodLabelSelected
                    ]}>
                      {method.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.paymentModalLabel}>Reference Number (Optional)</Text>
              <TextInput
                style={styles.paymentReferenceInput}
                value={paymentFormData.paymentReference}
                onChangeText={(text) => setPaymentFormData(prev => ({ ...prev, paymentReference: text }))}
                placeholder="Bank transfer ID, cheque number, etc."
                placeholderTextColor={Colors.dark.textMuted}
              />

              <View style={styles.paymentModalActions}>
                <Pressable
                  style={styles.paymentCancelButton}
                  onPress={() => {
                    setShowPaymentModal(false);
                    setPendingPayment(null);
                  }}
                >
                  <Text style={styles.paymentCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.paymentConfirmButton, markPaidMutation.isPending && styles.paymentButtonDisabled]}
                  onPress={confirmPayment}
                  disabled={markPaidMutation.isPending}
                >
                  {markPaidMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.dark.text} />
                      <Text style={styles.paymentConfirmText}>Confirm Payment</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </Modal>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load coaches</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      
        <View style={styles.header}>
          <Text style={styles.title}>Manage Coaches</Text>
          
            <Pressable style={styles.addButton} onPress={openAddModal}>
              <Ionicons name="add" size={24} color={Colors.dark.text} />
            </Pressable>
          
        </View>
      

      
        <FlatList
          data={coaches}
          keyExtractor={(item) => item.id}
          renderItem={renderCoach}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No coaches yet</Text>
              <Text style={styles.emptySubtext}>Tap + to add your first coach</Text>
            </View>
          }
        />
      

      {renderDetailModal()}

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingCoach ? "Edit Coach" : "Add Coach"}
            </Text>
            <Pressable 
              onPress={handleSubmit}
              disabled={addCoachMutation.isPending}
            >
              <Text style={[styles.saveButton, addCoachMutation.isPending && styles.disabledButton]}>
                {addCoachMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                placeholder="Coach name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                placeholder="coach@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
                placeholder="+1 234 567 8900"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Specialty</Text>
              <TextInput
                style={styles.input}
                value={formData.specialty}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, specialty: text }))}
                placeholder="e.g., Junior Training, Advanced"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Hourly Rate (AED)</Text>
              <TextInput
                style={styles.input}
                value={formData.hourlyRate}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, hourlyRate: text }))}
                placeholder="100"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="numeric"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.body.fontSize,
    marginTop: Spacing.sm,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  coachCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  coachInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  coachSpecialty: {
    ...Typography.caption,
    color: Colors.dark.orange,
    marginTop: 4,
  },
  coachMeta: {
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  roleText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  cancelButton: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  saveButton: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  formScroll: {
    flex: 1,
  },
  form: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: Spacing.lg,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  profileName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  profileEmail: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  profilePhone: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  bioText: {
    ...Typography.body,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  experienceText: {
    ...Typography.small,
    color: Colors.dark.orange,
    marginTop: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: "45%",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  financeLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  financeValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.md,
  },
  markPaidButton: {
    backgroundColor: Colors.dark.orange,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  markPaidText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  monthlyPaymentRow: {
    paddingVertical: Spacing.md,
  },
  monthlyPaymentBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  monthlyPaymentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  monthlyPaymentMonth: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  monthlyPaymentDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  monthlyPaymentStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  monthlyPaymentStatText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  monthlyPaymentAmount: {
    ...Typography.body,
    fontWeight: "700",
    marginLeft: "auto",
  },
  declineReason: {
    ...Typography.small,
    color: Colors.dark.error,
    marginTop: Spacing.sm,
    fontStyle: "italic",
  },
  paymentActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  paymentActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  payButton: {
    backgroundColor: Colors.dark.successNeon,
  },
  payButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  declineButton: {
    backgroundColor: `${Colors.dark.error}20`,
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  declineButtonText: {
    ...Typography.small,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  emptyPaymentHistory: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyPaymentText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  sendOverviewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  sendOverviewText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  deleteCoachButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: `${Colors.dark.error}15`,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.error}30`,
  },
  deleteCoachText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  paidDetailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: `${Colors.dark.successNeon}30`,
  },
  paidDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  paidDetailText: {
    ...Typography.small,
    color: Colors.dark.successNeon,
  },
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  paymentModalContent: {
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  paymentModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  paymentModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  paymentModalSubtitle: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
    marginBottom: Spacing.lg,
  },
  paymentModalLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  paymentMethodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  paymentMethodOption: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.card,
    minWidth: 80,
    gap: Spacing.xs,
  },
  paymentMethodSelected: {
    borderColor: Colors.dark.orange,
    backgroundColor: `${Colors.dark.orange}20`,
  },
  paymentMethodLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  paymentMethodLabelSelected: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  paymentReferenceInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  paymentModalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  paymentCancelButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  paymentCancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  paymentConfirmButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.successNeon,
  },
  paymentButtonDisabled: {
    opacity: 0.6,
  },
  paymentConfirmText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
