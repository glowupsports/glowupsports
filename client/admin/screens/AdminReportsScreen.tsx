import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

interface AdminStats {
  totalCoaches: number;
  totalPlayers: number;
  totalSessions: number;
  activeSessions: number;
  monthlyRevenue: number;
  attendanceRate: number;
}

type ReportType = "player-progress" | "session-history" | "revenue" | "coach-performance" | null;

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();
  const [activeReport, setActiveReport] = useState<ReportType>(null);

  const { data: coaches = [] } = useQuery<any[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: players = [] } = useQuery<any[]>({
    queryKey: ["/api/players"],
  });

  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["/api/sessions"],
  });

  const stats: AdminStats = {
    totalCoaches: coaches.length,
    totalPlayers: players.length,
    totalSessions: sessions.length,
    activeSessions: sessions.filter((s: any) => s.status === "scheduled").length,
    monthlyRevenue: 4250,
    attendanceRate: 87,
  };

  const ballLevelDistribution = players.reduce((acc: Record<string, number>, player: any) => {
    const level = player.ballLevel || "unknown";
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});

  const getBallLevelColor = (level: string) => {
    switch (level) {
      case "red": return "#EF4444";
      case "orange": return "#F97316";
      case "green": return "#22C55E";
      case "yellow": return "#EAB308";
      default: return Colors.dark.textMuted;
    }
  };

  const openReport = (type: ReportType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveReport(type);
  };

  const closeReport = () => {
    setActiveReport(null);
  };

  const completedSessions = sessions.filter((s: any) => s.status === "completed");
  const scheduledSessions = sessions.filter((s: any) => s.status === "scheduled");
  const cancelledSessions = sessions.filter((s: any) => s.status === "cancelled");

  const coachStats = coaches.map((coach: any) => {
    const coachSessions = sessions.filter((s: any) => s.coachId === coach.id);
    const completed = coachSessions.filter((s: any) => s.status === "completed").length;
    return {
      ...coach,
      totalSessions: coachSessions.length,
      completed,
      utilization: coachSessions.length > 0 ? Math.round((completed / coachSessions.length) * 100) : 0,
    };
  });

  const renderReportModal = () => {
    let title = "";
    let icon: any = "document";
    let iconColor = Colors.dark.text;
    let content: React.ReactNode = null;

    switch (activeReport) {
      case "player-progress":
        title = "Player Progress";
        icon = "trending-up";
        iconColor = Colors.dark.successNeon;
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.reportStat}>
              <Text style={styles.reportStatValue}>{stats.totalPlayers}</Text>
              <Text style={styles.reportStatLabel}>Total Players</Text>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Level Distribution</Text>
            {Object.entries(ballLevelDistribution).map(([level, count]) => (
              <View key={level} style={styles.reportRow}>
                <View style={styles.reportRowLabel}>
                  <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(level) }]} />
                  <Text style={styles.reportRowText}>{level.charAt(0).toUpperCase() + level.slice(1)} Ball</Text>
                </View>
                <Text style={styles.reportRowValue}>{count as number} players</Text>
              </View>
            ))}
            {Object.keys(ballLevelDistribution).length === 0 ? (
              <Text style={styles.noDataText}>No player data available</Text>
            ) : null}
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Top Performers</Text>
            {players.slice(0, 5).map((player: any, index: number) => (
              <View key={player.id} style={styles.reportRow}>
                <View style={styles.reportRowLabel}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                  <Text style={styles.reportRowText}>{player.name}</Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: getBallLevelColor(player.ballLevel) }]}>
                  <Text style={styles.levelBadgeText}>{player.ballLevel || "N/A"}</Text>
                </View>
              </View>
            ))}
          </View>
        );
        break;

      case "session-history":
        title = "Session History";
        icon = "calendar-outline";
        iconColor = Colors.dark.orange;
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.sessionStatsGrid}>
              <View style={[styles.sessionStatCard, { backgroundColor: Colors.dark.successNeon + "20" }]}>
                <Text style={[styles.sessionStatValue, { color: Colors.dark.successNeon }]}>{completedSessions.length}</Text>
                <Text style={styles.sessionStatLabel}>Completed</Text>
              </View>
              <View style={[styles.sessionStatCard, { backgroundColor: Colors.dark.orange + "20" }]}>
                <Text style={[styles.sessionStatValue, { color: Colors.dark.orange }]}>{scheduledSessions.length}</Text>
                <Text style={styles.sessionStatLabel}>Scheduled</Text>
              </View>
              <View style={[styles.sessionStatCard, { backgroundColor: Colors.dark.error + "20" }]}>
                <Text style={[styles.sessionStatValue, { color: Colors.dark.error }]}>{cancelledSessions.length}</Text>
                <Text style={styles.sessionStatLabel}>Cancelled</Text>
              </View>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Recent Sessions</Text>
            {sessions.slice(0, 8).map((session: any) => {
              const coach = coaches.find((c: any) => c.id === session.coachId);
              return (
                <View key={session.id} style={styles.sessionRow}>
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionType}>{session.sessionType || "Training"}</Text>
                    <Text style={styles.sessionCoach}>{coach?.name || "Unassigned"}</Text>
                  </View>
                  <View style={[styles.statusBadge, { 
                    backgroundColor: session.status === "completed" ? Colors.dark.successNeon + "20" : 
                                   session.status === "scheduled" ? Colors.dark.orange + "20" : Colors.dark.error + "20" 
                  }]}>
                    <Text style={[styles.statusText, { 
                      color: session.status === "completed" ? Colors.dark.successNeon : 
                             session.status === "scheduled" ? Colors.dark.orange : Colors.dark.error 
                    }]}>{session.status}</Text>
                  </View>
                </View>
              );
            })}
            {sessions.length === 0 ? (
              <Text style={styles.noDataText}>No sessions recorded</Text>
            ) : null}
          </View>
        );
        break;

      case "revenue":
        title = "Revenue Report";
        icon = "cash-outline";
        iconColor = Colors.dark.gold;
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.revenueHeader}>
              <Text style={styles.revenueAmount}>AED {stats.monthlyRevenue.toLocaleString()}</Text>
              <Text style={styles.revenueLabel}>Monthly Revenue</Text>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Revenue Breakdown</Text>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Session Fees</Text>
              <Text style={styles.reportRowValue}>AED 3,200</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Monthly Subscriptions</Text>
              <Text style={styles.reportRowValue}>AED 850</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Equipment Rentals</Text>
              <Text style={styles.reportRowValue}>AED 200</Text>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Key Metrics</Text>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Average Session Rate</Text>
              <Text style={styles.reportRowValue}>AED {stats.totalSessions > 0 ? Math.round(3200 / stats.totalSessions) : 0}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Player Lifetime Value</Text>
              <Text style={styles.reportRowValue}>AED {stats.totalPlayers > 0 ? Math.round((stats.monthlyRevenue * 6) / stats.totalPlayers) : 0}</Text>
            </View>
          </View>
        );
        break;

      case "coach-performance":
        title = "Coach Performance";
        icon = "analytics-outline";
        iconColor = Colors.dark.primary;
        content = (
          <View style={styles.reportModalContent}>
            <View style={styles.reportStat}>
              <Text style={styles.reportStatValue}>{stats.totalCoaches}</Text>
              <Text style={styles.reportStatLabel}>Active Coaches</Text>
            </View>
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Coach Activity</Text>
            {coachStats.map((coach: any) => (
              <View key={coach.id} style={styles.coachRow}>
                <View style={styles.coachInfo}>
                  <Text style={styles.coachName}>{coach.name}</Text>
                  <Text style={styles.coachSpecialty}>{coach.specialty || "General"}</Text>
                </View>
                <View style={styles.coachStats}>
                  <Text style={styles.coachStatText}>{coach.totalSessions} sessions</Text>
                  <View style={styles.utilizationBar}>
                    <View style={[styles.utilizationFill, { width: `${coach.utilization}%` }]} />
                  </View>
                </View>
              </View>
            ))}
            {coaches.length === 0 ? (
              <Text style={styles.noDataText}>No coach data available</Text>
            ) : null}
            <View style={styles.reportDivider} />
            <Text style={styles.reportSubheader}>Performance Summary</Text>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Total Sessions Delivered</Text>
              <Text style={styles.reportRowValue}>{completedSessions.length}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportRowText}>Average Attendance Rate</Text>
              <Text style={styles.reportRowValue}>{stats.attendanceRate}%</Text>
            </View>
          </View>
        );
        break;
    }

    return (
      <Modal
        visible={activeReport !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeReport}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeReport}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <View style={styles.modalTitleRow}>
              <Ionicons name={icon} size={24} color={iconColor} />
              <Text style={styles.modalTitle}>{title}</Text>
            </View>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView 
            style={styles.modalScroll}
            contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Reports & Analytics</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="people" size={24} color={Colors.dark.primary} />
              <Text style={styles.statValue}>{stats.totalCoaches}</Text>
              <Text style={styles.statLabel}>Coaches</Text>
            </View>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="person" size={24} color={Colors.dark.xpCyan} />
              <Text style={styles.statValue}>{stats.totalPlayers}</Text>
              <Text style={styles.statLabel}>Players</Text>
            </View>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="calendar" size={24} color={Colors.dark.orange} />
              <Text style={styles.statValue}>{stats.totalSessions}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.dark.successNeon} />
              <Text style={styles.statValue}>{stats.attendanceRate}%</Text>
              <Text style={styles.statLabel}>Attendance</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Player Distribution</Text>
          <View style={[styles.distributionCard, CardStyles.elevated]}>
            {Object.entries(ballLevelDistribution).map(([level, count]) => (
              <View key={level} style={styles.distributionRow}>
                <View style={styles.distributionLabel}>
                  <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(level) }]} />
                  <Text style={styles.levelName}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
                </View>
                <View style={styles.distributionBarContainer}>
                  <View
                    style={[
                      styles.distributionBar,
                      {
                        width: `${((count as number) / stats.totalPlayers) * 100}%`,
                        backgroundColor: getBallLevelColor(level),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.distributionCount}>{count as number}</Text>
              </View>
            ))}
            {Object.keys(ballLevelDistribution).length === 0 ? (
              <Text style={styles.noDataText}>No player data available</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Reports</Text>
          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("player-progress")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="trending-up" size={24} color={Colors.dark.successNeon} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Player Progress</Text>
                <Text style={styles.reportSubtitle}>Track skill development over time</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("session-history")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="calendar-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Session History</Text>
                <Text style={styles.reportSubtitle}>View past sessions and attendance</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("revenue")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="cash-outline" size={24} color={Colors.dark.gold} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Revenue Report</Text>
                <Text style={styles.reportSubtitle}>Financial overview and trends</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.reportCard, CardStyles.elevated]}
            onPress={() => openReport("coach-performance")}
          >
            <View style={styles.reportContent}>
              <Ionicons name="analytics-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Coach Performance</Text>
                <Text style={styles.reportSubtitle}>Coach activity and metrics</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {renderReportModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statCard: {
    width: "47%",
    padding: Spacing.lg,
    alignItems: "center",
  },
  statValue: {
    ...Typography.numberLarge,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  distributionCard: {
    padding: Spacing.lg,
  },
  distributionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  distributionLabel: {
    flexDirection: "row",
    alignItems: "center",
    width: 80,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  levelName: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  distributionBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    marginHorizontal: Spacing.md,
  },
  distributionBar: {
    height: 8,
    borderRadius: 4,
  },
  distributionCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 30,
    textAlign: "right",
  },
  noDataText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    padding: Spacing.lg,
  },
  reportCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  reportContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  reportText: {
    flex: 1,
  },
  reportTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  reportSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: Spacing.lg,
  },
  reportModalContent: {
    gap: Spacing.md,
  },
  reportStat: {
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  reportStatValue: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  reportStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  reportDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.md,
  },
  reportSubheader: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  reportRowLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  reportRowText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  reportRowValue: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  rankText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 24,
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  levelBadgeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  sessionStatsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  sessionStatCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  sessionStatValue: {
    ...Typography.h2,
  },
  sessionStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  sessionCoach: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  revenueHeader: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: Colors.dark.gold + "20",
    borderRadius: BorderRadius.lg,
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  revenueLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  coachInfo: {
    flex: 1,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachSpecialty: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachStats: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  coachStatText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  utilizationBar: {
    width: 60,
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
  },
  utilizationFill: {
    height: 4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
});
