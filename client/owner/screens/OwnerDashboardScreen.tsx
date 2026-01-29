import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import type { OwnerTabParamList } from "@/owner/navigation/OwnerNavigator";

import { AcademyCommandCenter } from "@/admin/components/AcademyCommandCenter";
import { TodayOperationsPanel } from "@/admin/components/TodayOperationsPanel";
import { RevenueHealthGauge } from "@/admin/components/RevenueHealthGauge";
import { LiveActivityFeed, ActivityEvent } from "@/admin/components/LiveActivityFeed";
import { CoachPerformanceRow, CoachPerformance } from "@/admin/components/CoachPerformanceRow";
import { SmartInsightsPanel, Insight } from "@/admin/components/SmartInsightsPanel";
import { WeekHeatmap } from "@/admin/components/WeekHeatmap";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";

type NavigationProp = NativeStackNavigationProp<OwnerTabParamList>;

interface EnhancedOwnerDashboardData {
  academy: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  } | null;
  kpis: {
    activePlayers: number;
    activeCoaches: number;
    sessionsThisWeek: number;
    attendanceRate: number;
    outstandingPayments: number;
    monthlyRevenue: number;
    revenueTarget: number;
    currency: string;
  };
  todayOperations: {
    totalSessions: number;
    completedSessions: number;
    inProgressSessions: number;
    upcomingSessions: number;
    playersCheckedIn: number;
    activeCoachesNow: number;
  };
  coachPerformance: CoachPerformance[];
  weekData: Array<{
    date: string;
    sessionCount: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    subtitle?: string;
    timestamp: string;
  }>;
  insights: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    change?: number;
  }>;
  topPerformers: Array<{
    id: string;
    name: string;
    level: number;
    totalXp: number;
    glowScore: number;
    ballLevel: string;
  }>;
  alerts: Array<{
    id: string;
    type: "error" | "warning" | "info";
    category: string;
    title: string;
    description: string;
  }>;
}

interface TopPerformerRowProps {
  name: string;
  level: number;
  glowScore: number;
  ballLevel: string;
  rank: number;
}

function TopPerformerRow({ name, level, glowScore, ballLevel, rank }: TopPerformerRowProps) {
  const ballColors: Record<string, string> = {
    red: "#FF4444",
    orange: "#FF8C00",
    green: "#2ECC40",
    yellow: "#FFD700",
  };

  const getRankStyle = (r: number) => {
    if (r === 1) return { backgroundColor: Colors.dark.gold + "30", borderColor: Colors.dark.gold };
    if (r === 2) return { backgroundColor: "#C0C0C0" + "20", borderColor: "#C0C0C0" };
    if (r === 3) return { backgroundColor: "#CD7F32" + "20", borderColor: "#CD7F32" };
    return { backgroundColor: Colors.dark.backgroundSecondary, borderColor: Colors.dark.border };
  };

  return (
    <View style={[styles.performerRow, rank === 1 && styles.topPerformerHighlight]}>
      <View style={[styles.rankBadge, getRankStyle(rank)]}>
        <Text style={[styles.rankText, rank <= 3 && { color: getRankStyle(rank).borderColor }]}>
          {rank}
        </Text>
      </View>
      <View style={styles.performerInfo}>
        <Text style={styles.performerName} numberOfLines={1}>{name}</Text>
        <View style={styles.performerStats}>
          <View style={[styles.ballIndicator, { backgroundColor: ballColors[ballLevel] || ballColors.green }]} />
          <Text style={styles.performerLevel}>Level {level}</Text>
        </View>
      </View>
      <LinearGradient
        colors={[Colors.dark.gold + "20", Colors.dark.gold + "40"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.glowScoreBadge}
      >
        <Text style={styles.glowScoreText}>{glowScore}</Text>
      </LinearGradient>
    </View>
  );
}

export default function OwnerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: dashboardData, isLoading, refetch } = useQuery<EnhancedOwnerDashboardData>({
    queryKey: ["/api/owner/dashboard/enhanced"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const kpis = dashboardData?.kpis;
  const todayOps = dashboardData?.todayOperations;
  const currency = kpis?.currency || "AED";
  const topPerformers = dashboardData?.topPerformers || [];

  const activityEvents: ActivityEvent[] = useMemo(() => {
    return (dashboardData?.recentActivity || []).map(a => ({
      ...a,
      type: a.type as ActivityEvent["type"],
      timestamp: new Date(a.timestamp),
    }));
  }, [dashboardData?.recentActivity]);

  const weekDays = useMemo(() => {
    if (dashboardData?.weekData) {
      const maxSessions = Math.max(...dashboardData.weekData.map(d => d.sessionCount), 1);
      return dashboardData.weekData.map(d => ({
        date: new Date(d.date),
        sessionCount: d.sessionCount,
        intensity: d.sessionCount / maxSessions,
      }));
    }
    
    const days = [];
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push({
        date,
        sessionCount: 0,
        intensity: 0,
      });
    }
    return days;
  }, [dashboardData?.weekData]);

  const insights: Insight[] = useMemo(() => {
    return (dashboardData?.insights || []).map(i => ({
      ...i,
      type: i.type as Insight["type"],
    }));
  }, [dashboardData?.insights]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading Command Center...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,215,0,0.15)", "rgba(255,152,0,0.08)", "transparent"]}
        style={styles.headerGradient}
      />

      <CollapsibleModeSwitcher />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.gold} />
        }
      >
        <AcademyCommandCenter
          academyName={dashboardData?.academy?.name || "My Tennis Academy"}
          todaySessions={todayOps?.totalSessions || 0}
          activeCoaches={todayOps?.activeCoachesNow || 0}
          playersCheckedIn={todayOps?.playersCheckedIn || 0}
          isLive={true}
          notificationCount={dashboardData?.alerts?.length || 0}
          onNotificationPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        />

        <TodayOperationsPanel
          currentDate={new Date()}
          totalSessions={todayOps?.totalSessions || 0}
          completedSessions={todayOps?.completedSessions || 0}
          inProgressSessions={todayOps?.inProgressSessions || 0}
          upcomingSessions={todayOps?.upcomingSessions || 0}
          onViewSchedule={() => navigation.navigate("Operations")}
        />

        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="people"
              label="Active Players"
              value={kpis?.activePlayers || 0}
              color={Colors.dark.xpCyan}
              onPress={() => navigation.navigate("People")}
            />
          </View>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="person"
              label="Coaches"
              value={kpis?.activeCoaches || 0}
              color={Colors.dark.primary}
              onPress={() => navigation.navigate("People")}
            />
          </View>
        </View>

        <RevenueHealthGauge
          monthlyRevenue={kpis?.monthlyRevenue || 0}
          revenueTarget={kpis?.revenueTarget || 50000}
          outstandingPayments={kpis?.outstandingPayments || 0}
          attendanceRate={kpis?.attendanceRate || 0}
          currency={currency}
        />

        <CoachPerformanceRow
          coaches={dashboardData?.coachPerformance || []}
          currency={currency}
          onCoachPress={(id) => navigation.navigate("People")}
          onViewAll={() => navigation.navigate("People")}
        />

        <WeekHeatmap
          days={weekDays}
          onDayPress={(date) => navigation.navigate("Operations")}
        />

        <LiveActivityFeed events={activityEvents} maxEvents={5} />

        <SmartInsightsPanel insights={insights} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Performers</Text>
            <View style={styles.glowScoreLabel}>
              <Ionicons name="star" size={14} color={Colors.dark.gold} />
              <Text style={styles.glowScoreLabelText}>Glow Score</Text>
            </View>
          </View>
          <View style={styles.performersCard}>
            {topPerformers.length > 0 ? (
              topPerformers.slice(0, 5).map((performer, index) => (
                <TopPerformerRow 
                  key={performer.id}
                  name={performer.name}
                  level={performer.level}
                  glowScore={performer.glowScore}
                  ballLevel={performer.ballLevel}
                  rank={index + 1}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="trophy-outline" size={32} color={Colors.dark.textMuted} />
                <Text style={styles.emptyStateText}>No performers yet</Text>
                <Text style={styles.emptyStateSubtext}>Add players to track top performers</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("People");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                <Ionicons name="person-add" size={22} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.quickActionLabel}>Add Player</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("Operations");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
                <Ionicons name="add-circle" size={22} color={Colors.dark.primary} />
              </View>
              <Text style={styles.quickActionLabel}>New Session</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("Performance");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.orange}15` }]}>
                <Ionicons name="analytics" size={22} color={Colors.dark.orange} />
              </View>
              <Text style={styles.quickActionLabel}>Reports</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("Settings");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.gold}15` }]}>
                <Ionicons name="settings" size={22} color={Colors.dark.gold} />
              </View>
              <Text style={styles.quickActionLabel}>Settings</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  kpiRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  kpiItem: {
    flex: 1,
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
  glowScoreLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  glowScoreLabelText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  performersCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  performerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  topPerformerHighlight: {
    backgroundColor: Colors.dark.gold + "08",
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  rankText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  performerInfo: {
    flex: 1,
  },
  performerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  performerStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  ballIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  performerLevel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  glowScoreBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    minWidth: 50,
    alignItems: "center",
  },
  glowScoreText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  emptyState: {
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  emptyStateText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  emptyStateSubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  quickActionLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
});
