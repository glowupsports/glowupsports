import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  FadeInDown,
  SlideInUp,
  SlideOutDown,
} from "react-native-reanimated";
import { useTabNavigation } from "@/components/TabNavigationContext";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import type { AdminTabParamList, AdminStackParamList } from "@/admin/navigation/AdminNavigator";
import { useDesktop } from "@/hooks/useDesktop";

import { OperationsHubHero } from "@/admin/components/OperationsHubHero";
import { SessionQueuePanel } from "@/admin/components/SessionQueuePanel";
import { CheckInStream } from "@/admin/components/CheckInStream";
import { TaskAlertsList } from "@/admin/components/TaskAlertsList";
import { TodayOperationsPanel } from "@/admin/components/TodayOperationsPanel";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";
import { LiveCourtGrid } from "@/admin/components/LiveCourtGrid";
import { CoachLoadStrip } from "@/admin/components/CoachLoadStrip";
import { OutstandingAlertsCard } from "@/admin/components/OutstandingAlertsCard";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

type AdminNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<AdminTabParamList>,
  NativeStackNavigationProp<AdminStackParamList>
>;

interface AdminOperationsData {
  academy: { id: string; name: string; currency: string } | null;
  liveStats: { activeSessions: number; waitingCheckIns: number; activeCoaches: number; nextSessionIn: number };
  todayOperations: { totalSessions: number; completedSessions: number; inProgressSessions: number; upcomingSessions: number };
  sessionQueue: { id: string; title: string; time: string; coachName: string; playerCount: number; status: "upcoming" | "in_progress" | "completed" }[];
  checkIns: { id: string; playerName: string; sessionTitle: string; time: string; status: "pending" | "confirmed" | "late" }[];
  taskAlerts: { id: string; type: "no_show" | "late" | "payment" | "session" | "urgent"; title: string; description: string; actionLabel?: string }[];
  quickStats: { todayPlayers: number; todayCoaches: number; attendanceRate: number; completedSessions: number };
}

interface UndoToastItem {
  id: string;
  message: string;
  onUndo: () => void;
}

function SkeletonBlock({ height, style }: { height: number; style?: object }) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.7, { duration: 750 }), withTiming(0.35, { duration: 750 })),
      -1, false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ height, backgroundColor: Colors.dark.border, borderRadius: 12 }, animStyle, style]} />
  );
}

function DashboardSkeleton() {
  return (
    <View style={skStyles.container}>
      <SkeletonBlock height={120} style={{ marginBottom: 16 }} />
      <SkeletonBlock height={80} style={{ marginBottom: 16 }} />
      <View style={skStyles.row}>
        <SkeletonBlock height={80} style={{ flex: 1, marginRight: 8 }} />
        <SkeletonBlock height={80} style={{ flex: 1, marginLeft: 8 }} />
      </View>
      <SkeletonBlock height={160} style={{ marginTop: 16, marginBottom: 16 }} />
      <SkeletonBlock height={120} />
    </View>
  );
}

const skStyles = StyleSheet.create({
  container: { padding: Spacing.lg },
  row: { flexDirection: "row", marginTop: 16 },
});

function RefreshTick({ lastRefresh }: { lastRefresh: Date }) {
  const [label, setLabel] = useState("Just now");

  useEffect(() => {
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
      if (secs < 10) setLabel("Just now");
      else if (secs < 60) setLabel(`${secs}s ago`);
      else setLabel(`${Math.floor(secs / 60)}m ago`);
    }, 5000);
    setLabel("Just now");
    return () => clearInterval(id);
  }, [lastRefresh]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.dark.primary }} />
      <Text style={{ fontSize: 10, color: Colors.dark.textMuted }}>Updated {label}</Text>
    </View>
  );
}

function UndoToast({ toast, onDismiss }: { toast: UndoToastItem; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100);
  const scaleX = useSharedValue(1);

  useEffect(() => {
    const duration = 3000;
    const start = Date.now();
    scaleX.value = withTiming(0, { duration });

    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct === 0) { clearInterval(id); onDismiss(); }
    }, 100);

    return () => clearInterval(id);
  }, [toast.id]);

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: scaleX.value }] }));

  return (
    <Animated.View entering={SlideInUp.springify().damping(22)} exiting={SlideOutDown.duration(200)} style={toastStyles.container}>
      <View style={toastStyles.row}>
        <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
        <Text style={toastStyles.message}>{toast.message}</Text>
        <Pressable style={toastStyles.undoBtn} onPress={() => { toast.onUndo(); onDismiss(); }}>
          <Text style={toastStyles.undoText}>Undo</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
        </Pressable>
      </View>
      <View style={toastStyles.progressBg}>
        <Animated.View style={[toastStyles.progressFill, barStyle]} />
      </View>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 110,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "#22c55e40",
    overflow: "hidden",
    zIndex: 999,
    elevation: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  message: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    fontSize: 13,
  },
  undoBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#22c55e20",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22c55e40",
  },
  undoText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#22c55e",
  },
  progressBg: {
    height: 3,
    backgroundColor: Colors.dark.border,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#22c55e",
    transformOrigin: "left center",
  },
});

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AdminNavProp>();
  const { navigateToTab } = useTabNavigation();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [toast, setToast] = useState<UndoToastItem | null>(null);
  const [undoneCheckIns, setUndoneCheckIns] = useState<Set<string>>(new Set());
  const dateQueryStr = selectedDate.toISOString().split("T")[0];

  const { data: operationsData, isLoading, refetch } = useQuery<AdminOperationsData>({
    queryKey: [`/api/admin/dashboard/operations?date=${dateQueryStr}`],
    placeholderData: (prev) => prev,
  });

  const { data: pendingBookingRequests = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/admin/booking-requests"],
  });
  const pendingBookingCount = pendingBookingRequests.length;

  useEffect(() => {
    const id = setInterval(async () => {
      await refetch();
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, [refetch]);

  const handleDateChange = (newDate: Date) => setSelectedDate(newDate);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setLastRefresh(new Date());
    setRefreshing(false);
  };

  const handleCheckIn = useCallback((sessionId: string) => {
    if (undoneCheckIns.has(sessionId)) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const toastId = `${sessionId}-${Date.now()}`;
    setToast({
      id: toastId,
      message: "Player checked in",
      onUndo: () => {
        setUndoneCheckIns(prev => new Set([...prev, sessionId]));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    });
  }, [undoneCheckIns]);

  const handleAlertNavigate = useCallback((destination: "schedule" | "players" | "payments" | "coaches") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (destination) {
      case "schedule":  navigateToTab("AdminSchedule"); break;
      case "players":   navigateToTab("AdminPlayers"); break;
      case "payments":  navigateToTab("AdminPayments" as never); break;
      case "coaches":   navigateToTab("AdminCoaches"); break;
    }
  }, [navigateToTab]);

  const liveStats = operationsData?.liveStats || { activeSessions: 0, waitingCheckIns: 0, activeCoaches: 0, nextSessionIn: 0 };
  const todayOps = operationsData?.todayOperations || { totalSessions: 0, completedSessions: 0, inProgressSessions: 0, upcomingSessions: 0 };
  const sessionQueue = operationsData?.sessionQueue || [];
  const checkIns = operationsData?.checkIns || [];
  const taskAlerts = operationsData?.taskAlerts || [];

  const courtSessions = useMemo(() =>
    sessionQueue.map((s, idx) => ({
      ...s,
      minutesUntilStart: s.status === "upcoming" ? Math.max(0, 45 - idx * 15) : undefined,
    })), [sessionQueue]);


  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData, _setCelebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });


  const adminFAQs = [
    { question: "How do I add a new coach?", answer: "Go to the Coaches tab and tap 'Invite Coach'. Enter their email and they'll receive an invitation to join your academy.", category: "Staff" },
    { question: "How do I register a new player?", answer: "Go to the Players tab and tap 'Add Player'. Fill in their details including name, email, and ball level.", category: "Players" },
    { question: "How do I create a session?", answer: "Go to the Schedule tab, tap the + button, select a coach, court, time slot, and add players.", category: "Schedule" },
    { question: "How do credit packages work?", answer: "Credit packages are prepaid lesson bundles. Go to Payments to create packages with specific credit types (private, semi-private, group) and expiry dates.", category: "Billing" },
    { question: "How do I view reports?", answer: "Go to the Reports tab to see monthly performance reports, attendance statistics, and financial summaries.", category: "Reports" },
    { question: "How do I manage courts?", answer: "Go to Courts settings to add, edit, or deactivate courts. Set availability hours and maintenance schedules.", category: "Settings" },
  ];

  const adminWelcomeSlides = [
    { icon: "business", iconColor: "#FF9800", title: "Welcome, Academy Owner!", description: "You're now running your academy on Glow Up Sports. Let's get you set up to manage coaches, players, and sessions." },
    { icon: "people", iconColor: "#00BCD4", title: "Manage Your Team", description: "Add coaches and players to your academy. They'll get access to their own dashboards with everything they need." },
    { icon: "calendar", iconColor: "#2ECC40", title: "Schedule & Track", description: "Create training sessions, track attendance, manage payments, and monitor your academy's performance in real-time." },
    { icon: "rocket", iconColor: "#9B59B6", title: "Let's Build Your Academy!", description: "Follow the Getting Started checklist on your dashboard. Each step brings you closer to a fully set up academy!" },
  ];

  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });

  const isDesktop = useDesktop();

  if (isLoading && !operationsData) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: isDesktop ? 0 : insets.top }]}>
        <TennisBallSpinner size="large" color={Colors.dark.orange} />
        <Text style={styles.loadingText}>Loading Operations Hub...</Text>
      </View>
    );
  }

  if (isDesktop) {
    const today = new Date();
    const greetingHour = today.getHours();
    const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";
    const displayName = (user?.displayName ?? user?.username ?? "Admin").split(" ")[0];
    const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    return (
      <View style={styles.desktopContainer}>
        <CollapsibleModeSwitcher />
        <ScrollView
          style={styles.desktopScroll}
          contentContainerStyle={styles.desktopContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.orange} />}
        >
          <View style={styles.desktopTopBar}>
            <View>
              <Text style={styles.desktopGreeting}>{greeting}, {displayName}</Text>
              <Text style={styles.desktopDate}>{dateStr}</Text>
            </View>
            <View style={styles.desktopTopActions}>
              <RefreshTick lastRefresh={lastRefresh} />
              <Pressable style={styles.desktopTopBtn} onPress={() => navigateToTab("AdminSchedule")}>
                <Ionicons name="add" size={16} color="#0B0D10" />
                <Text style={styles.desktopTopBtnText}>Add Session</Text>
              </Pressable>
              <Pressable style={[styles.desktopTopBtn, styles.desktopTopBtnSecondary]} onPress={() => navigateToTab("AdminPlayers")}>
                <Ionicons name="person-add-outline" size={16} color={Colors.dark.orange} />
                <Text style={[styles.desktopTopBtnText, { color: Colors.dark.orange }]}>Add Player</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.desktopKpiRow}>
            {[
              { icon: "play-circle-outline" as const, label: "Active Sessions", value: liveStats.activeSessions, color: Colors.dark.orange },
              { icon: "people-outline" as const, label: "Players Today", value: operationsData?.quickStats?.todayPlayers || 0, color: Colors.dark.xpCyan },
              { icon: "people-circle-outline" as const, label: "Coaches On Court", value: liveStats.activeCoaches, color: Colors.dark.gold },
              { icon: "trending-up-outline" as const, label: "Attendance Rate", value: `${operationsData?.quickStats?.attendanceRate ?? 0}%`, color: "#22c55e" },
            ].map((kpi) => (
              <View key={kpi.label} style={styles.desktopKpiCard}>
                <View style={[styles.desktopKpiIconBox, { backgroundColor: `${kpi.color}15` }]}>
                  <Ionicons name={kpi.icon} size={22} color={kpi.color} />
                </View>
                <Text style={styles.desktopKpiValue}>{kpi.value}</Text>
                <Text style={styles.desktopKpiLabel}>{kpi.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.desktopFullRow}>
            <Text style={styles.desktopSectionTitle}>Live Court Status</Text>
            <LiveCourtGrid
              sessions={courtSessions}
              alerts={taskAlerts}
              totalCourts={6}
              onCheckIn={handleCheckIn}
              onFlagIssue={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)}
              onViewSession={(_id) => navigateToTab("AdminSchedule")}
              onReassignCoach={(_id) => navigateToTab("AdminCoaches")}
            />
          </View>

          <View style={styles.desktopFullRow}>
            <CoachLoadStrip sessions={sessionQueue} onCoachPress={(_name) => navigateToTab("AdminCoaches")} />
          </View>

          <View style={styles.desktopRow2}>
            <View style={styles.desktopCol60}>
              <Text style={styles.desktopSectionTitle}>Session Queue</Text>
              <SessionQueuePanel
                sessions={sessionQueue}
                onSessionPress={(_id) => navigateToTab("AdminSchedule")}
                onStartSession={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                onViewAll={() => navigateToTab("AdminSchedule")}
              />
            </View>
            <View style={styles.desktopCol40}>
              <Text style={styles.desktopSectionTitle}>Check-in Stream</Text>
              <CheckInStream
                checkIns={checkIns}
                onConfirm={handleCheckIn}
                onViewPlayer={(_id) => navigateToTab("AdminPlayers")}
              />
            </View>
          </View>

          <View style={styles.desktopRow3}>
            <View style={styles.desktopCol60}>
              <Text style={styles.desktopSectionTitle}>Outstanding Alerts</Text>
              <OutstandingAlertsCard
                alerts={taskAlerts}
                onAlertPress={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                onAction={(_id, _type) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                onNavigate={handleAlertNavigate}
              />
            </View>
            <View style={styles.desktopCol40}>
              <Text style={styles.desktopSectionTitle}>Today at a Glance</Text>
              <View style={styles.desktopGlanceCard}>
                {([
                  { label: "Total Sessions",  value: todayOps.totalSessions,        icon: "calendar-outline" as const, color: Colors.dark.orange },
                  { label: "In Progress",     value: todayOps.inProgressSessions,    icon: "play-circle-outline" as const, color: Colors.dark.primary },
                  { label: "Upcoming",        value: todayOps.upcomingSessions,      icon: "time-outline" as const, color: Colors.dark.xpCyan },
                  { label: "Attendance Rate", value: `${operationsData?.quickStats?.attendanceRate ?? 0}%`, icon: "trending-up-outline" as const, color: Colors.dark.gold },
                ]).map((stat, idx) => (
                  <View key={stat.label} style={[styles.desktopGlanceRow, idx === 3 && { borderBottomWidth: 0 }]}>
                    <Ionicons name={stat.icon} size={16} color={stat.color} />
                    <Text style={styles.desktopGlanceLabel}>{stat.label}</Text>
                    <Text style={[styles.desktopGlanceValue, { color: stat.color }]}>{stat.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        {toast && <UndoToast toast={toast} onDismiss={() => setToast(null)} />}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.orange} />}
      >
        {isLoading && !operationsData ? (
          <DashboardSkeleton />
        ) : (
          <>
            <OperationsHubHero
              activeSessions={liveStats.activeSessions}
              waitingCheckIns={liveStats.waitingCheckIns}
              activeCoaches={liveStats.activeCoaches}
              nextSessionIn={liveStats.nextSessionIn}
              onViewSchedule={() => navigateToTab("AdminSchedule")}
            />

            <Animated.View entering={FadeInDown.duration(400).delay(100)}>
              <LiveCourtGrid
                sessions={courtSessions}
                alerts={taskAlerts}
                totalCourts={6}
                onCheckIn={handleCheckIn}
                onFlagIssue={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)}
                onViewSession={(_id) => navigateToTab("AdminSchedule")}
                onReassignCoach={(_id) => navigateToTab("AdminCoaches")}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(180)}>
              <CoachLoadStrip sessions={sessionQueue} onCoachPress={(_name) => navigateToTab("AdminCoaches")} />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(240)}>
              <OutstandingAlertsCard
                alerts={taskAlerts}
                onAlertPress={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                onAction={(_id, _type) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                onNavigate={handleAlertNavigate}
              />
            </Animated.View>

            <TodayOperationsPanel
              currentDate={selectedDate}
              totalSessions={todayOps.totalSessions}
              completedSessions={todayOps.completedSessions}
              inProgressSessions={todayOps.inProgressSessions}
              upcomingSessions={todayOps.upcomingSessions}
              onDateChange={handleDateChange}
              onViewSchedule={() => navigateToTab("AdminSchedule")}
            />

            <SessionQueuePanel
              sessions={sessionQueue}
              onSessionPress={(_id) => navigateToTab("AdminSchedule")}
              onStartSession={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              onViewAll={() => navigateToTab("AdminSchedule")}
            />

            <CheckInStream
              checkIns={checkIns}
              onConfirm={handleCheckIn}
              onViewPlayer={(_id) => navigateToTab("AdminPlayers")}
            />

            <TaskAlertsList
              alerts={taskAlerts}
              onAlertPress={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onAction={(_id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
            />

            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <AnimatedKpiCard
                  icon="people"
                  label="Today's Players"
                  value={operationsData?.quickStats?.todayPlayers || 0}
                  color={Colors.dark.xpCyan}
                  onPress={() => navigateToTab("AdminPlayers")}
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
                {[
                  { icon: "play-circle" as const, label: "Start Session", color: Colors.dark.orange, onPress: () => navigateToTab("AdminSchedule") },
                  { icon: "log-in" as const, label: "Check-in", color: Colors.dark.xpCyan, onPress: () => navigateToTab("AdminPlayers") },
                  { icon: "calendar" as const, label: "Schedule", color: Colors.dark.primary, onPress: () => navigateToTab("AdminSchedule") },
                  { icon: "clipboard" as const, label: "Attendance", color: Colors.dark.gold, onPress: () => navigateToTab("AdminPlayers") },
                ].map((action) => (
                  <Pressable
                    key={action.label}
                    style={styles.quickAction}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); action.onPress(); }}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}15` }]}>
                      <Ionicons name={action.icon} size={22} color={action.color} />
                    </View>
                    <Text style={styles.quickActionLabel}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Management</Text>
              {[
                { icon: "people-outline" as const, color: Colors.dark.primary, title: "Manage Coaches", sub: "Schedules, availability, assignments", onPress: () => navigateToTab("AdminCoaches") },
                { icon: "person-outline" as const, color: Colors.dark.xpCyan, title: "Manage Players", sub: "Registrations, attendance, groups", onPress: () => navigateToTab("AdminPlayers") },
                { icon: "grid-outline" as const, color: Colors.dark.orange, title: "Manage Classes", sub: "Groups, schedules, capacity", onPress: () => navigateToTab("AdminClasses") },
              ].map((item) => (
                <Pressable key={item.title} style={styles.menuCard} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); item.onPress(); }}>
                  <View style={styles.menuCardContent}>
                    <Ionicons name={item.icon} size={24} color={item.color} />
                    <View style={styles.menuCardText}>
                      <Text style={styles.menuCardTitle}>{item.title}</Text>
                      <Text style={styles.menuCardSubtitle}>{item.sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                  </View>
                </Pressable>
              ))}

              <Pressable
                style={[styles.menuCard, pendingBookingCount > 0 && styles.menuCardHighlighted]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate("AdminBookingRequests" as never); }}
              >
                <View style={styles.menuCardContent}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.dark.gold} />
                  <View style={styles.menuCardText}>
                    <Text style={styles.menuCardTitle}>Booking Requests</Text>
                    <Text style={styles.menuCardSubtitle}>
                      {pendingBookingCount > 0
                        ? `${pendingBookingCount} pending ${pendingBookingCount === 1 ? "request" : "requests"} awaiting action`
                        : "Approve or decline lesson booking requests"}
                    </Text>
                  </View>
                  {pendingBookingCount > 0 ? (
                    <View style={styles.menuCardBadge}>
                      <Text style={styles.menuCardBadgeText}>{pendingBookingCount}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                  )}
                </View>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {toast && <UndoToast toast={toast} onDismiss={() => setToast(null)} />}

      <WelcomeIntroModal role="admin" slides={adminWelcomeSlides} onComplete={() => {}} />
      <HelpButton role="admin" faqs={adminFAQs} supportEmail="support@glowupsports.com" bottomOffset={120} />
      <NotificationGuideModal visible={showNotificationGuide} onClose={() => setShowNotificationGuide(false)} role="admin" />
      <FirstActionCelebration visible={showFirstCelebration} onClose={() => setShowFirstCelebration(false)} title={celebrationData.title} description={celebrationData.description} icon={celebrationData.icon} xpReward={celebrationData.xpReward} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  loadingText: { ...Typography.body, color: Colors.dark.textMuted, marginTop: Spacing.md },
  headerGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 280 },
  scrollView: { flex: 1 },
  content: { padding: Spacing.lg, flexGrow: 1 },
  kpiRow: { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.lg },
  kpiItem: { flex: 1 },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { ...Typography.h3, color: Colors.dark.text, marginBottom: Spacing.md },
  quickActionsGrid: { flexDirection: "row", gap: Spacing.md },
  quickAction: { flex: 1, alignItems: "center", padding: Spacing.md, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.dark.border },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: Spacing.sm },
  quickActionLabel: { ...Typography.small, color: Colors.dark.text, textAlign: "center", fontSize: 11 },
  menuCard: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.dark.border },
  menuCardHighlighted: { borderColor: Colors.dark.gold + "50", backgroundColor: Colors.dark.gold + "08" },
  menuCardBadge: { backgroundColor: Colors.dark.gold, borderRadius: 12, minWidth: 24, height: 24, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  menuCardBadgeText: { fontSize: 12, fontWeight: "700", color: "#000" },
  menuCardContent: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  menuCardText: { flex: 1 },
  menuCardTitle: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  menuCardSubtitle: { ...Typography.small, color: Colors.dark.textMuted },
  desktopContainer: { flex: 1 },
  desktopScroll: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  desktopContent: { padding: 32, paddingBottom: 48, flexGrow: 1 },
  desktopTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  desktopGreeting: { fontSize: 24, fontWeight: "700", color: Colors.dark.text },
  desktopDate: { fontSize: 13, color: Colors.dark.textMuted, marginTop: 4 },
  desktopTopActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  desktopTopBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#C8FF3D", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  desktopTopBtnSecondary: { backgroundColor: "rgba(255,133,27,0.1)", borderWidth: 1, borderColor: "rgba(255,133,27,0.3)" },
  desktopTopBtnText: { fontSize: 13, fontWeight: "600", color: "#0B0D10" },
  desktopKpiRow: { flexDirection: "row", gap: 16, marginBottom: 24 },
  desktopKpiCard: { flex: 1, backgroundColor: "#11141A", borderRadius: 12, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", alignItems: "flex-start" },
  desktopKpiIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  desktopKpiValue: { fontSize: 28, fontWeight: "700", color: Colors.dark.text },
  desktopKpiLabel: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 4 },
  desktopFullRow: { marginBottom: 20 },
  desktopRow2: { flexDirection: "row", gap: 20, marginBottom: 20 },
  desktopRow3: { flexDirection: "row", gap: 20 },
  desktopCol60: { flex: 3 },
  desktopCol40: { flex: 2 },
  desktopSectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text, marginBottom: 12 },
  desktopGlanceCard: { backgroundColor: "#11141A", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  desktopGlanceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", gap: 10 },
  desktopGlanceLabel: { flex: 1, fontSize: 13, color: Colors.dark.textSecondary },
  desktopGlanceValue: { fontSize: 16, fontWeight: "700" },
});
