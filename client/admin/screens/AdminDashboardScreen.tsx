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
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import type { AdminTabParamList, AdminStackParamList } from "@/admin/navigation/AdminNavigator";

import { AcademyCommandCenter } from "@/admin/components/AcademyCommandCenter";
import { TodayOperationsPanel } from "@/admin/components/TodayOperationsPanel";
import { RevenueHealthGauge } from "@/admin/components/RevenueHealthGauge";
import { LiveActivityFeed, ActivityEvent } from "@/admin/components/LiveActivityFeed";
import { CoachPerformanceRow, CoachPerformance } from "@/admin/components/CoachPerformanceRow";
import { SmartInsightsPanel, Insight } from "@/admin/components/SmartInsightsPanel";
import { WeekHeatmap } from "@/admin/components/WeekHeatmap";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";

type AdminNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<AdminTabParamList>,
  NativeStackNavigationProp<AdminStackParamList>
>;

interface EnhancedDashboardData {
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
  alerts: Array<{
    id: string;
    type: "error" | "warning" | "info";
    category: string;
    title: string;
    description: string;
  }>;
}

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AdminNavProp>();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: dashboardData, isLoading, refetch } = useQuery<EnhancedDashboardData>({
    queryKey: ["/api/admin/dashboard/enhanced"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const kpis = dashboardData?.kpis;
  const todayOps = dashboardData?.todayOperations;
  const currency = kpis?.currency || "AED";

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

  const formatCurrency = (amount: number) => `${currency} ${amount.toLocaleString()}`;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
        <Text style={styles.loadingText}>Loading Command Center...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.12)", "rgba(255,215,0,0.08)", "transparent"]}
        style={styles.headerGradient}
      />

      <CollapsibleModeSwitcher />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.orange} />
        }
      >
        <AcademyCommandCenter
          academyName={dashboardData?.academy?.name || "Tennis Academy"}
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
          onViewSchedule={() => navigation.navigate("AdminSchedule")}
        />

        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="people"
              label="Active Players"
              value={kpis?.activePlayers || 0}
              color={Colors.dark.xpCyan}
              onPress={() => navigation.navigate("AdminPlayers")}
            />
          </View>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="person"
              label="Coaches"
              value={kpis?.activeCoaches || 0}
              color={Colors.dark.primary}
              onPress={() => navigation.navigate("AdminCoaches")}
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
          onCoachPress={(id) => navigation.navigate("AdminCoaches")}
          onViewAll={() => navigation.navigate("AdminCoaches")}
        />

        <WeekHeatmap
          days={weekDays}
          onDayPress={(date) => navigation.navigate("AdminSchedule")}
        />

        <LiveActivityFeed events={activityEvents} maxEvents={5} />

        <SmartInsightsPanel insights={insights} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminPlayers");
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
                navigation.navigate("AdminCoaches");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
                <Ionicons name="person-add-outline" size={22} color={Colors.dark.primary} />
              </View>
              <Text style={styles.quickActionLabel}>Add Coach</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminSchedule");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.orange}15` }]}>
                <Ionicons name="calendar-outline" size={22} color={Colors.dark.orange} />
              </View>
              <Text style={styles.quickActionLabel}>Schedule</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminReports");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.gold}15` }]}>
                <Ionicons name="analytics" size={22} color={Colors.dark.gold} />
              </View>
              <Text style={styles.quickActionLabel}>Reports</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
          <Pressable 
            style={styles.menuCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminCoaches");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="people-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Manage Coaches</Text>
                <Text style={styles.menuCardSubtitle}>Performance, payments, profiles</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={styles.menuCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminPlayers");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="person-outline" size={24} color={Colors.dark.xpCyan} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Manage Players</Text>
                <Text style={styles.menuCardSubtitle}>Attendance, progress, payments</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={styles.menuCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminPayments");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="cash-outline" size={24} color={Colors.dark.gold} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Payments</Text>
                <Text style={styles.menuCardSubtitle}>Record, confirm, track payments</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={styles.menuCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminSettings");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="settings-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Academy Settings</Text>
                <Text style={styles.menuCardSubtitle}>Profile, branding, permissions</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
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
    height: 250,
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
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
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
  menuCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  menuCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuCardText: {
    flex: 1,
  },
  menuCardTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  menuCardSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
