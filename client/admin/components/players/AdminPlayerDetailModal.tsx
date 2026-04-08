import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, CardStyles, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { styles } from "./adminPlayersStyles";
import { generateAttendanceReportPDF, StatItem, SkillBar } from "./AdminPlayerHelpers";
import { AdminPlayer, AdminPlayerPackage, AdminPlayerStats, AdminPlayerInvoice, AdminPlayerSessionItem } from "./adminPlayerTypes";

interface AdminPlayerDetailModalProps {
  showFullDetailsModal: boolean;
  closeFullDetailsModal: () => void;
  insets: { top: number; bottom: number };
  statsLoading: boolean;
  statsError: Error | null;
  refetchStats: () => void;
  playerStats: AdminPlayerStats | undefined;
  selectedPlayer: AdminPlayer | undefined;
  selectedPlayerId: string | null;
  setShowReportIssueModal: (v: boolean) => void;
  setEditingPlayer: (p: AdminPlayer | null) => void;
  setFormData: (d: Record<string, unknown>) => void;
  closeDetailModal: () => void;
  setShowAddModal: (v: boolean) => void;
  setShowRecordPaymentModal: (v: boolean) => void;
  setSelectedPackageForPayment: (p: AdminPlayerPackage | null) => void;
  setShowInvoiceModal: (v: boolean) => void;
  setShowCreditStoreModal: (v: boolean) => void;
  progressExpanded: boolean;
  setProgressExpanded: (v: boolean) => void;
  selectedSeriesFilter: string | null;
  setSelectedSeriesFilter: (v: string | null) => void;
  uniqueSeries: Array<{ id: string; name: string }>;
  filteredSessions: AdminPlayerSessionItem[];
  handleCopyInviteCode: () => void;
  playerInvite: { inviteCode: string; status: string } | undefined;
  inviteLoading: boolean;
  inviteError: boolean;
  refetchInvite: () => void;
  inviteCopied: boolean;
  handleDelete: () => void;
}

const getBallLevelColor = (level?: string): string => {
  switch (level?.toLowerCase()) {
    case "blue": return "#3B82F6";
    case "red": return "#EF4444";
    case "orange": return "#F97316";
    case "green": return "#22C55E";
    case "yellow": return "#EAB308";
    case "adult":
    case "glow": return "#00E5FF";
    default: return Colors.dark.textMuted;
  }
};

const getPaymentStatusColor = (status?: string): string => {
  switch (status) {
    case "paid": return Colors.dark.successNeon;
    case "partial": return Colors.dark.orange;
    case "overdue": return Colors.dark.error;
    default: return Colors.dark.textMuted;
  }
};

export function AdminPlayerDetailModal({
  showFullDetailsModal,
  closeFullDetailsModal,
  insets,
  statsLoading,
  statsError,
  refetchStats,
  playerStats,
  selectedPlayer,
  selectedPlayerId,
  setShowReportIssueModal,
  setEditingPlayer,
  setFormData,
  closeDetailModal,
  setShowAddModal,
  setShowRecordPaymentModal,
  setSelectedPackageForPayment,
  setShowInvoiceModal,
  setShowCreditStoreModal,
  progressExpanded,
  setProgressExpanded,
  selectedSeriesFilter,
  setSelectedSeriesFilter,
  uniqueSeries,
  filteredSessions,
  handleCopyInviteCode,
  playerInvite,
  inviteLoading,
  inviteError,
  refetchInvite,
  inviteCopied,
  handleDelete,
}: AdminPlayerDetailModalProps) {
  const queryClient = useQueryClient();
    const stats = playerStats;
    
    return (
      <Modal
        visible={showFullDetailsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeFullDetailsModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeFullDetailsModal}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Player Details</Text>
            <Pressable onPress={() => {
              if (stats?.player) {
                setEditingPlayer({
                  id: stats.player.id,
                  name: stats.player.name,
                  email: stats.player.email,
                  phone: stats.player.phone,
                  ballLevel: stats.player.ballLevel,
                });
                setFormData({
                  name: stats.player.name || "",
                  email: stats.player.email || "",
                  phone: stats.player.phone || "",
                  ballLevel: stats.player.ballLevel || "green",
                  parentName: stats.player.parentName || "",
                  parentPhone: stats.player.parentPhone || "",
                  dateOfBirth: stats.player.dateOfBirth || "",
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
              <Text style={styles.loadingText}>Loading player details...</Text>
            </View>
          ) : statsError ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
              <Text style={styles.errorText}>Failed to load player details</Text>
              <Pressable style={styles.retryButton} onPress={() => refetchStats()}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
              <Pressable 
                style={[styles.retryButton, { backgroundColor: Colors.dark.surface, marginTop: Spacing.sm }]} 
                onPress={() => setShowReportIssueModal(true)}
              >
                <Ionicons name="warning-outline" size={16} color={Colors.dark.text} style={{ marginRight: Spacing.xs }} />
                <Text style={[styles.retryButtonText, { color: Colors.dark.text }]}>Report Issue</Text>
              </Pressable>
            </View>
          ) : stats ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(stats.player.ballLevel) }]}>
                  <Text style={styles.profileAvatarText}>
                    {stats.player.name?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <Text style={styles.profileName}>{stats.player.name}</Text>
                <View style={[styles.ballBadgeLarge, { backgroundColor: `${getBallLevelColor(stats.player.ballLevel)}20` }]}>
                  <View style={[styles.ballDotLarge, { backgroundColor: getBallLevelColor(stats.player.ballLevel) }]} />
                  <Text style={[styles.ballTextLarge, { color: getBallLevelColor(stats.player.ballLevel) }]}>
                    {stats.player.ballLevel || "N/A"} Ball
                  </Text>
                </View>
                {stats.player.coachName ? (
                  <Text style={styles.coachAssignment}>Coach: {stats.player.coachName}</Text>
                ) : null}
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Attendance</Text>
                <View style={styles.statsGrid}>
                  <StatItem 
                    icon="checkmark-circle" 
                    label="Attended" 
                    value={stats.attendance.attended}
                    color={Colors.dark.successNeon}
                  />
                  <StatItem 
                    icon="close-circle" 
                    label="Missed" 
                    value={stats.attendance.missed}
                    color={Colors.dark.error}
                  />
                  <StatItem 
                    icon="trending-up" 
                    label="Rate" 
                    value={`${stats.attendance.rate}%`}
                    color={Colors.dark.orange}
                  />
                  <StatItem 
                    icon="flame" 
                    label="Streak" 
                    value={stats.attendance.streak}
                    color={Colors.dark.gold}
                  />
                </View>
              </View>

              <Pressable 
                style={[styles.section, CardStyles.elevated]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setProgressExpanded(!progressExpanded);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.sectionTitle}>Progress</Text>
                  <Ionicons 
                    name={progressExpanded ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color={Colors.dark.textMuted} 
                  />
                </View>
                {progressExpanded ? (
                  <>
                    <View style={styles.progressHeader}>
                      <View style={styles.levelBadge}>
                        <Text style={styles.levelNumber}>{stats.progress.level}</Text>
                        <Text style={styles.levelLabel}>Level</Text>
                      </View>
                      <View style={styles.xpInfo}>
                        <Text style={styles.xpText}>{stats.progress.xp} / {stats.progress.xpToNextLevel} XP</Text>
                        <View style={styles.xpBar}>
                          <View 
                            style={[
                              styles.xpFill, 
                              { width: `${(stats.progress.xp / stats.progress.xpToNextLevel) * 100}%` }
                            ]} 
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.skillsSection}>
                      <SkillBar label="Technical" value={stats.progress.skills.technical} color={Colors.dark.xpCyan} />
                      <SkillBar label="Tactical" value={stats.progress.skills.tactical} color={Colors.dark.primary} />
                      <SkillBar label="Physical" value={stats.progress.skills.physical} color={Colors.dark.orange} />
                      <SkillBar label="Mental" value={stats.progress.skills.mental} color={Colors.dark.gold} />
                      <SkillBar label="Social" value={stats.progress.skills.social} color={Colors.dark.successNeon} />
                    </View>
                  </>
                ) : null}
              </Pressable>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Payments</Text>
                <View style={styles.paymentSummary}>
                  <View style={[
                    styles.paymentStatusBadge, 
                    { backgroundColor: `${getPaymentStatusColor(stats.payments.status)}20` }
                  ]}>
                    <Text style={[styles.paymentStatusText, { color: getPaymentStatusColor(stats.payments.status) }]}>
                      {stats.payments.status?.toUpperCase() || "N/A"}
                    </Text>
                  </View>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Total Owed</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.error }]}>
                    {stats.payments.currency} {stats.payments.totalOwed}
                  </Text>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Total Paid</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.successNeon }]}>
                    {stats.payments.currency} {stats.payments.totalPaid}
                  </Text>
                </View>
                {stats.payments.lastPaymentDate ? (
                  <View style={styles.financeRow}>
                    <Text style={styles.financeLabel}>Last Payment</Text>
                    <Text style={styles.financeValue}>{stats.payments.lastPaymentDate}</Text>
                  </View>
                ) : null}
                <View style={styles.paymentActions}>
                  <Pressable 
                    style={styles.recordPaymentButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowRecordPaymentModal(true);
                    }}
                  >
                    <Ionicons name="card-outline" size={16} color={Colors.dark.buttonText} />
                    <Text style={styles.recordPaymentText}>Record Payment</Text>
                  </Pressable>
                  <Pressable 
                    style={styles.createInvoiceButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowInvoiceModal(true);
                    }}
                  >
                    <Ionicons name="document-text-outline" size={16} color={Colors.dark.successNeon} />
                    <Text style={styles.createInvoiceText}>Create Invoice</Text>
                  </Pressable>
                </View>

                {stats.payments.invoices && stats.payments.invoices.length > 0 ? (
                  <View style={{ marginTop: Spacing.md }}>
                    <Text style={{ ...Typography.caption, color: Colors.dark.textMuted, fontWeight: "700", letterSpacing: 1, marginBottom: Spacing.sm }}>
                      INVOICES ({stats.payments.invoices.length})
                    </Text>
                    {stats.payments.invoices.map((inv: AdminPlayerInvoice) => {
                      const isOverdue = inv.isOverdue;
                      const isPaid = inv.status === "paid";
                      const statusColor = isPaid ? Colors.dark.successNeon : isOverdue ? Colors.dark.error : "#FFD700";
                      const statusLabel = isPaid ? "PAID" : isOverdue ? "OVERDUE" : "PENDING";
                      return (
                        <View key={inv.id} style={{
                          backgroundColor: "rgba(255,255,255,0.04)",
                          borderRadius: BorderRadius.sm,
                          padding: Spacing.sm,
                          marginBottom: 6,
                          borderLeftWidth: 3,
                          borderLeftColor: statusColor,
                        }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "600" }}>
                                #{inv.invoiceNumber}
                              </Text>
                              <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>
                                Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "No date"}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 15, fontWeight: "700", color: statusColor }}>
                              {inv.currency} {inv.amount.toLocaleString()}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                            <View style={{
                              backgroundColor: `${statusColor}20`,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: BorderRadius.xs,
                            }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: statusColor }}>{statusLabel}</Text>
                            </View>
                            {!isPaid ? (
                              <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
                                <Pressable
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 4,
                                    backgroundColor: `${Colors.dark.successNeon}20`,
                                    paddingHorizontal: 14,
                                    paddingVertical: 8,
                                    borderRadius: BorderRadius.sm,
                                    borderWidth: 1,
                                    borderColor: `${Colors.dark.successNeon}40`,
                                  }}
                                  onPress={async () => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    try {
                                      await apiRequest("PATCH", `/api/billing/invoices/${inv.id}`, { status: "paid", paidAt: new Date().toISOString() });
                                      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
                                      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                                      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
                                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                      Alert.alert("Invoice Paid", `Invoice #${inv.invoiceNumber} has been marked as paid.`);
                                    } catch (error) {
                                      Alert.alert("Error", "Failed to mark invoice as paid. Please try again.");
                                    }
                                  }}
                                >
                                  <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                                  <Text style={{ fontSize: 12, color: Colors.dark.successNeon, fontWeight: "700" }}>Paid</Text>
                                </Pressable>
                                <Pressable
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 4,
                                    backgroundColor: `${isOverdue ? Colors.dark.error : "#FFD700"}15`,
                                    paddingHorizontal: 14,
                                    paddingVertical: 8,
                                    borderRadius: BorderRadius.sm,
                                    borderWidth: 1,
                                    borderColor: `${isOverdue ? Colors.dark.error : "#FFD700"}30`,
                                  }}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    setShowInvoiceModal(true);
                                  }}
                                >
                                  <Ionicons name="mail-outline" size={14} color={isOverdue ? Colors.dark.error : "#FFD700"} />
                                  <Text style={{ fontSize: 12, color: isOverdue ? Colors.dark.error : "#FFD700", fontWeight: "700" }}>Reminder</Text>
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

              {/* Credits/Packages Section */}
              <View style={[styles.section, CardStyles.elevated]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="ticket-outline" size={18} color={Colors.dark.primary} />
                    <Text style={styles.sectionTitle}>Packages</Text>
                  </View>
                  <Pressable 
                    style={styles.addCreditsButtonPremium}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowCreditStoreModal(true);
                    }}
                  >
                    <Ionicons name="add" size={16} color={Colors.dark.buttonText} />
                    <Text style={styles.addCreditsButtonText}>Add</Text>
                  </Pressable>
                </View>
                
                <View style={styles.creditsOverview}>
                  <View style={styles.creditStatCard}>
                    <Text style={styles.creditStatValue}>{stats.credits?.total || 0}</Text>
                    <Text style={styles.creditStatLabel}>Total Credits</Text>
                  </View>
                  <View style={styles.creditStatCard}>
                    <Text style={styles.creditStatValue}>{stats.credits?.activePackages || 0}</Text>
                    <Text style={styles.creditStatLabel}>Active Packages</Text>
                  </View>
                </View>

                <View style={styles.creditTypeRow}>
                  <View style={[styles.creditTypeCard, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                    <Text style={[styles.creditTypeValue, { color: Colors.dark.xpCyan }]}>{stats.credits?.group || 0}</Text>
                    <Text style={styles.creditTypeLabel}>Group</Text>
                  </View>
                  <View style={[styles.creditTypeCard, { backgroundColor: `${Colors.dark.orange}15` }]}>
                    <Text style={[styles.creditTypeValue, { color: Colors.dark.orange }]}>{stats.credits?.private || 0}</Text>
                    <Text style={styles.creditTypeLabel}>Private</Text>
                  </View>
                  <View style={[styles.creditTypeCard, { backgroundColor: `${Colors.dark.primary}15` }]}>
                    <Text style={[styles.creditTypeValue, { color: Colors.dark.primary }]}>{stats.credits?.semiPrivate || 0}</Text>
                    <Text style={styles.creditTypeLabel}>Semi-Private</Text>
                  </View>
                </View>

                <Pressable 
                  style={styles.grantCreditsButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowCreditStoreModal(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.dark.primary} />
                  <Text style={styles.grantCreditsText}>Grant Credits</Text>
                </Pressable>

                {/* Package Cards */}
                {stats.packages && stats.packages.length > 0 ? (
                  <View style={styles.packageCardsList}>
                    {stats.packages.map((pkg) => {
                      const isDepleted = pkg.remainingCredits <= 0;
                      const isExpired = pkg.expiryDate && new Date(pkg.expiryDate) < new Date();
                      const typeColor = pkg.creditType === "private" ? Colors.dark.orange : 
                                       pkg.creditType === "semi_private" ? Colors.dark.primary : Colors.dark.xpCyan;
                      const typeLabel = pkg.creditType === "private" ? "Private" : 
                                       pkg.creditType === "semi_private" ? "Semi-Private" : "Group";
                      const expiryDate = pkg.expiryDate ? new Date(pkg.expiryDate) : null;
                      const pkgPrice = Number(pkg.price) || (Number(pkg.pricePerCredit || 0) * pkg.totalCredits);
                      
                      return (
                        <View key={pkg.id} style={[styles.packageCard, { borderColor: `${typeColor}40` }]}>
                          <View style={styles.packageCardHeader}>
                            <View style={[styles.packageTypeBadge, { backgroundColor: `${typeColor}20` }]}>
                              <Text style={[styles.packageTypeText, { color: typeColor }]}>{typeLabel}</Text>
                            </View>
                            <View style={styles.packageHeaderRight}>
                              <View style={[
                                styles.packagePaymentBadge, 
                                { backgroundColor: pkg.isPaid ? `${Colors.dark.successNeon}20` : `${Colors.dark.gold}20` }
                              ]}>
                                <Text style={[
                                  styles.packagePaymentText, 
                                  { color: pkg.isPaid ? Colors.dark.successNeon : Colors.dark.gold }
                                ]}>
                                  {pkg.isPaid ? "Paid" : "Unpaid"}
                                </Text>
                              </View>
                              <View style={[
                                styles.packageStatusBadge, 
                                { backgroundColor: isDepleted ? `${Colors.dark.error}20` : `${Colors.dark.successNeon}20` }
                              ]}>
                                <Text style={[
                                  styles.packageStatusText, 
                                  { color: isDepleted ? Colors.dark.error : Colors.dark.successNeon }
                                ]}>
                                  {isDepleted ? "Depleted" : "Active"}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.packageCardBody}>
                            <View style={styles.packageCreditsRow}>
                              <View>
                                <Text style={styles.packageCreditsLabel}>Credits</Text>
                                <Text style={[styles.packageCreditsValue, { color: typeColor }]}>
                                  {formatCredits(pkg.remainingCredits)} / {formatCredits(pkg.totalCredits)}
                                </Text>
                              </View>
                              {pkgPrice > 0 && (
                                <View style={styles.packagePriceBlock}>
                                  <Text style={styles.packageCreditsLabel}>Price</Text>
                                  <Text style={[styles.packagePriceValue, { color: pkg.isPaid ? Colors.dark.successNeon : Colors.dark.gold }]}>
                                    AED {pkgPrice.toFixed(0)}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                          {expiryDate ? (
                            <View style={styles.packageCardFooter}>
                              <Ionicons name="calendar-outline" size={12} color={Colors.dark.textMuted} />
                              <Text style={[
                                styles.packageExpiryText,
                                isExpired && { color: Colors.dark.error }
                              ]}>
                                {isExpired ? "Expired " : "Valid until "}
                                {expiryDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </Text>
                            </View>
                          ) : null}
                          {!pkg.isPaid && (
                            <Pressable 
                              style={styles.markPaidButton}
                              onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                try {
                                  await apiRequest("PATCH", `/api/packages/${pkg.id}`, { isPaid: true, paidAt: new Date().toISOString() });
                                  queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  Alert.alert("Payment Recorded", "Package marked as paid.");
                                } catch (error) {
                                  console.error("Failed to mark package as paid:", error);
                                  Alert.alert("Error", "Failed to mark as paid. Please try again.");
                                }
                              }}
                            >
                              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.successNeon} />
                              <Text style={styles.markPaidText}>Mark as Paid</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {/* Attendance History Section - Premium */}
              <View style={[styles.section, styles.attendanceSectionPremium]}>
                <View style={styles.attendanceHeader}>
                  <View style={styles.attendanceHeaderLeft}>
                    <View style={styles.attendanceIconWrapper}>
                      <Ionicons name="calendar" size={20} color={Colors.dark.xpCyan} />
                    </View>
                    <View>
                      <Text style={styles.attendanceTitle}>Attendance History</Text>
                      <Text style={styles.attendanceSubtitle}>{filteredSessions?.length || 0} sessions recorded</Text>
                    </View>
                  </View>
                  <Pressable 
                    style={styles.downloadReportButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      generateAttendanceReportPDF(stats, selectedPlayer);
                    }}
                  >
                    <Ionicons name="download-outline" size={16} color={Colors.dark.buttonText} />
                    <Text style={styles.downloadReportText}>Report</Text>
                  </Pressable>
                </View>

                {uniqueSeries.length > 0 ? (
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.seriesFilterContainer}
                    contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}
                  >
                    <Pressable
                      style={[
                        styles.seriesFilterChip,
                        selectedSeriesFilter === null && styles.seriesFilterChipActive,
                      ]}
                      onPress={() => {
                        setSelectedSeriesFilter(null);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[
                        styles.seriesFilterChipText,
                        selectedSeriesFilter === null && styles.seriesFilterChipTextActive,
                      ]}>All</Text>
                    </Pressable>
                    {uniqueSeries.map((series) => (
                      <Pressable
                        key={series.id}
                        style={[
                          styles.seriesFilterChip,
                          selectedSeriesFilter === series.id && styles.seriesFilterChipActive,
                        ]}
                        onPress={() => {
                          setSelectedSeriesFilter(series.id);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Text style={[
                          styles.seriesFilterChipText,
                          selectedSeriesFilter === series.id && styles.seriesFilterChipTextActive,
                        ]}>{series.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                {filteredSessions && filteredSessions.length > 0 ? (
                  <View style={styles.attendanceList}>
                    {filteredSessions.slice(0, 10).map((session: AdminPlayerSessionItem, index: number) => {
                      const sessionDate = new Date(session.startTime);
                      const isAttended = session.attended === "present";
                      const isAbsent = session.attended === "absent" || session.attended === "no_show";
                      const attendanceLabel = isAttended ? "Present" : isAbsent ? "Absent" : "Pending";
                      const attendanceColor = isAttended ? Colors.dark.successNeon : isAbsent ? Colors.dark.error : Colors.dark.gold;
                      const attendanceIcon = isAttended ? "checkmark-circle" : isAbsent ? "close-circle" : "time";
                      
                      return (
                        <View key={session.id || index} style={styles.attendanceCard}>
                          <View style={styles.attendanceDateSection}>
                            <Text style={styles.attendanceDay}>
                              {sessionDate.toLocaleDateString("en-US", { weekday: "short" })}
                            </Text>
                            <Text style={styles.attendanceDateNum}>
                              {sessionDate.getDate()}
                            </Text>
                            <Text style={styles.attendanceMonth}>
                              {sessionDate.toLocaleDateString("en-US", { month: "short" })}
                            </Text>
                          </View>
                          <View style={styles.attendanceDetails}>
                            <View style={styles.attendanceTimeRow}>
                              <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
                              <Text style={styles.attendanceTimeText}>
                                {sessionDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </Text>
                              <View style={[styles.sessionTypeChip, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                                <Text style={[styles.sessionTypeChipText, { color: Colors.dark.xpCyan }]}>
                                  {session.sessionType === "private" ? "Private" : 
                                   session.sessionType === "semi_private" ? "Semi-Private" : "Group"}
                                </Text>
                              </View>
                            </View>
                            {session.seriesName ? (
                              <Text style={styles.seriesNameText}>{session.seriesName}</Text>
                            ) : null}
                            <View style={styles.attendanceCreditsRow}>
                              <Text style={styles.attendanceCreditsText}>
                                {session.creditsUsed || 1} credit{(session.creditsUsed || 1) > 1 ? "s" : ""} used
                              </Text>
                            </View>
                          </View>
                          <View style={[styles.attendanceStatusBadge, { backgroundColor: `${attendanceColor}15`, borderColor: `${attendanceColor}40` }]}>
                            <Ionicons name={attendanceIcon} size={18} color={attendanceColor} />
                            <Text style={[styles.attendanceStatusText, { color: attendanceColor }]}>
                              {attendanceLabel}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyAttendanceState}>
                    <View style={styles.emptyAttendanceIcon}>
                      <Ionicons name="calendar-outline" size={40} color={Colors.dark.textMuted} />
                    </View>
                    <Text style={styles.emptyAttendanceTitle}>No Sessions Yet</Text>
                    <Text style={styles.emptyAttendanceText}>Sessions will appear here once scheduled</Text>
                  </View>
                )}
              </View>

              {stats.player.parentName || stats.player.parentPhone ? (
                <View style={[styles.section, CardStyles.elevated]}>
                  <Text style={styles.sectionTitle}>Parent/Guardian</Text>
                  {stats.player.parentName ? (
                    <View style={styles.contactRow}>
                      <Ionicons name="person" size={18} color={Colors.dark.textMuted} />
                      <Text style={styles.contactText}>{stats.player.parentName}</Text>
                    </View>
                  ) : null}
                  {stats.player.parentPhone ? (
                    <View style={styles.contactRow}>
                      <Ionicons name="call" size={18} color={Colors.dark.textMuted} />
                      <Text style={styles.contactText}>{stats.player.parentPhone}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {stats.player.medicalNotes ? (
                <View style={[styles.section, CardStyles.elevated, styles.medicalSection]}>
                  <Text style={styles.sectionTitle}>Medical Notes</Text>
                  <Text style={styles.medicalText}>{stats.player.medicalNotes}</Text>
                </View>
              ) : null}

              {inviteLoading ? (
                <View style={[styles.section, CardStyles.elevated, { alignItems: "center", paddingVertical: 20 }]}>
                  <ActivityIndicator size="small" color={Colors.dark.orange} />
                  <Text style={{ color: Colors.dark.textMuted, marginTop: 8, fontSize: 13 }}>Loading invite code...</Text>
                </View>
              ) : inviteError ? (
                <Pressable
                  style={[styles.section, CardStyles.elevated, { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16 }]}
                  onPress={() => refetchInvite()}
                >
                  <Ionicons name="alert-circle" size={20} color={Colors.dark.error} />
                  <Text style={{ color: Colors.dark.error, fontSize: 13 }}>Failed to load invite — tap to retry</Text>
                </Pressable>
              ) : playerInvite?.inviteCode && playerInvite?.status === "pending" ? (
                <View style={{
                  backgroundColor: Colors.dark.backgroundTertiary,
                  borderRadius: BorderRadius.lg,
                  padding: Spacing.lg,
                  marginBottom: Spacing.md,
                  borderWidth: 2,
                  borderColor: Colors.dark.primary + "40",
                }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.dark.primary, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
                    Invite Code — Awaiting Signup
                  </Text>
                  <Text style={{ fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 18, marginBottom: 8 }}>
                    Give this code to {stats?.player?.name ?? selectedPlayer?.name} — they enter it when signing up in the app
                  </Text>
                  <Text style={{
                    fontSize: 36,
                    fontWeight: "900",
                    color: Colors.dark.primary,
                    textAlign: "center",
                    letterSpacing: 8,
                    fontFamily: "Menlo",
                    marginVertical: Spacing.md,
                  }} selectable>{playerInvite.inviteCode}</Text>
                  <Pressable
                    style={{ borderRadius: BorderRadius.md, overflow: "hidden", marginBottom: Spacing.sm }}
                    onPress={handleCopyInviteCode}
                  >
                    <LinearGradient
                      colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.lg }}
                    >
                      <Ionicons name={inviteCopied ? "checkmark-circle" : "copy-outline"} size={18} color={Colors.dark.buttonText} />
                      <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.dark.buttonText }}>{inviteCopied ? "Copied!" : "Copy Code"}</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              ) : null}

              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteText}>Delete Player</Text>
              </Pressable>
            </ScrollView>
          ) : selectedPlayer ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(selectedPlayer.ballLevel) }]}>
                  <Text style={styles.profileAvatarText}>
                    {selectedPlayer.name?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <Text style={styles.profileName}>{selectedPlayer.name}</Text>
                <View style={[styles.levelBadge, { backgroundColor: `${getBallLevelColor(selectedPlayer.ballLevel)}20` }]}>
                  <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(selectedPlayer.ballLevel) }]} />
                  <Text style={[styles.levelText, { color: getBallLevelColor(selectedPlayer.ballLevel) }]}>
                    {selectedPlayer.ballLevel || "Unknown"} Ball
                  </Text>
                </View>
                {selectedPlayer.email ? (
                  <Text style={styles.profileEmail}>{selectedPlayer.email}</Text>
                ) : null}
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Basic Info</Text>
                <View style={styles.contactRow}>
                  <Ionicons name="call" size={18} color={Colors.dark.textMuted} />
                  <Text style={styles.contactText}>{selectedPlayer.phone || "No phone"}</Text>
                </View>
              </View>

              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.dark.orange} />
                <Text style={styles.loadingText}>Loading full stats...</Text>
              </View>

              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteText}>Delete Player</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <View style={styles.loadingContainer}>
              <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.errorText}>No player selected</Text>
            </View>
          )}
        </View>
      </Modal>
    );
}
