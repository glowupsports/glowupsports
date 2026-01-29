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

import { OperationsHubHero } from "@/admin/components/OperationsHubHero";
import { SessionQueuePanel } from "@/admin/components/SessionQueuePanel";
import { CheckInStream } from "@/admin/components/CheckInStream";
import { TaskAlertsList } from "@/admin/components/TaskAlertsList";
import { TodayOperationsPanel } from "@/admin/components/TodayOperationsPanel";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";

type AdminNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<AdminTabParamList>,
  NativeStackNavigationProp<AdminStackParamList>
>;

interface AdminOperationsData {
  academy: {
    id: string;
    name: string;
    currency: string;
  } | null;
  liveStats: {
    activeSessions: number;
    waitingCheckIns: number;
    activeCoaches: number;
    nextSessionIn: number;
  };
  todayOperations: {
    totalSessions: number;
    completedSessions: number;
    inProgressSessions: number;
    upcomingSessions: number;
  };
  sessionQueue: Array<{
    id: string;
    title: string;
    time: string;
    coachName: string;
    playerCount: number;
    status: "upcoming" | "in_progress" | "completed";
  }>;
  checkIns: Array<{
    id: string;
    playerName: string;
    sessionTitle: string;
    time: string;
    status: "pending" | "confirmed" | "late";
  }>;
  taskAlerts: Array<{
    id: string;
    type: "no_show" | "late" | "payment" | "session" | "urgent";
    title: string;
    description: string;
    actionLabel?: string;
  }>;
  quickStats: {
    todayPlayers: number;
    todayCoaches: number;
    attendanceRate: number;
    completedSessions: number;
  };
}

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AdminNavProp>();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: operationsData, isLoading, refetch } = useQuery<AdminOperationsData>({
    queryKey: ["/api/admin/dashboard/operations"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const liveStats = operationsData?.liveStats || {
    activeSessions: 0,
    waitingCheckIns: 0,
    activeCoaches: 0,
    nextSessionIn: 0,
  };

  const todayOps = operationsData?.todayOperations || {
    totalSessions: 0,
    completedSessions: 0,
    inProgressSessions: 0,
    upcomingSessions: 0,
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
        <Text style={styles.loadingText}>Loading Operations Hub...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "rgba(255,87,34,0.08)", "transparent"]}
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
        <OperationsHubHero
          activeSessions={liveStats.activeSessions}
          waitingCheckIns={liveStats.waitingCheckIns}
          activeCoaches={liveStats.activeCoaches}
          nextSessionIn={liveStats.nextSessionIn}
          onViewSchedule={() => navigation.navigate("AdminSchedule")}
        />

        <TodayOperationsPanel
          currentDate={new Date()}
          totalSessions={todayOps.totalSessions}
          completedSessions={todayOps.completedSessions}
          inProgressSessions={todayOps.inProgressSessions}
          upcomingSessions={todayOps.upcomingSessions}
          onViewSchedule={() => navigation.navigate("AdminSchedule")}
        />

        <SessionQueuePanel
          sessions={operationsData?.sessionQueue || []}
          onSessionPress={(id) => navigation.navigate("AdminSchedule")}
          onStartSession={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          onViewAll={() => navigation.navigate("AdminSchedule")}
        />

        <View style={styles.twoColumnRow}>
          <View style={styles.columnHalf}>
            <CheckInStream
              checkIns={operationsData?.checkIns || []}
              onConfirm={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onViewPlayer={(id) => navigation.navigate("AdminPlayers")}
            />
          </View>
        </View>

        <TaskAlertsList
          alerts={operationsData?.taskAlerts || []}
          onAlertPress={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          onAction={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        />

        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="people"
              label="Today's Players"
              value={operationsData?.quickStats?.todayPlayers || 0}
              color={Colors.dark.xpCyan}
              onPress={() => navigation.navigate("AdminPlayers")}
            />
          </View>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="checkmark-circle"
              label="Completed"
              value={operationsData?.quickStats?.completedSessions || todayOps.completedSessions}
              color={Colors.dark.primary}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminSchedule");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.orange}15` }]}>
                <Ionicons name="play-circle" size={22} color={Colors.dark.orange} />
              </View>
              <Text style={styles.quickActionLabel}>Start Session</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminPlayers");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                <Ionicons name="log-in" size={22} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.quickActionLabel}>Check-in</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminSchedule");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
                <Ionicons name="calendar" size={22} color={Colors.dark.primary} />
              </View>
              <Text style={styles.quickActionLabel}>Schedule</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminPlayers");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.gold}15` }]}>
                <Ionicons name="clipboard" size={22} color={Colors.dark.gold} />
              </View>
              <Text style={styles.quickActionLabel}>Attendance</Text>
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
                <Text style={styles.menuCardSubtitle}>Schedules, availability, assignments</Text>
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
                <Text style={styles.menuCardSubtitle}>Registrations, attendance, groups</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={styles.menuCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminClasses");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="grid-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Manage Classes</Text>
                <Text style={styles.menuCardSubtitle}>Groups, schedules, capacity</Text>
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
    height: 280,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  columnHalf: {
    flex: 1,
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
    fontSize: 11,
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
