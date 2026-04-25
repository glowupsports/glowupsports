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
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
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
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
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
  sessionQueue: {
    id: string;
    title: string;
    time: string;
    coachName: string;
    playerCount: number;
    status: "upcoming" | "in_progress" | "completed";
  }[];
  checkIns: {
    id: string;
    playerName: string;
    sessionTitle: string;
    time: string;
    status: "pending" | "confirmed" | "late";
  }[];
  taskAlerts: {
    id: string;
    type: "no_show" | "late" | "payment" | "session" | "urgent";
    title: string;
    description: string;
    actionLabel?: string;
  }[];
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
  const { navigateToTab } = useTabNavigation();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showWelcome, setShowWelcome] = useState(false);
  const dateQueryStr = selectedDate.toISOString().split('T')[0];
  const { data: operationsData, isLoading, isFetching, refetch } = useQuery<AdminOperationsData>({
    queryKey: [`/api/admin/dashboard/operations?date=${dateQueryStr}`],
    placeholderData: (prev) => prev,
  });
  const handleDateChange = (newDate: Date) => {
    setSelectedDate(newDate);
  };

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

  const adminChecklistSteps = useMemo(() => {
    const hasData = !!operationsData;
    const hasSessions = (operationsData?.todayOperations?.totalSessions || 0) > 0;
    const hasCoaches = (operationsData?.quickStats?.todayCoaches || 0) > 0;
    const hasPlayers = (operationsData?.quickStats?.todayPlayers || 0) > 0;
    
    return [
      {
        id: "setup_academy",
        icon: "business" as const,
        title: "Set Up Academy Profile",
        description: "Configure your academy name, timezone, currency, and logo",
        actionLabel: "Academy Settings",
        onAction: () => navigation.navigate("AdminSettings" as never),
        isCompleted: !!operationsData?.academy,
      },
      {
        id: "add_coaches",
        icon: "people" as const,
        title: "Add Your Coaches",
        description: "Invite coaches to join your academy",
        actionLabel: "Manage Coaches",
        onAction: () => navigateToTab("AdminCoaches"),
        isCompleted: hasCoaches,
      },
      {
        id: "add_players",
        icon: "person-add" as const,
        title: "Register Players",
        description: "Add players to your academy roster",
        actionLabel: "Manage Players",
        onAction: () => navigateToTab("AdminPlayers"),
        isCompleted: hasPlayers,
      },
      {
        id: "create_schedule",
        icon: "calendar" as const,
        title: "Create Your Schedule",
        description: "Set up your first training sessions",
        actionLabel: "Go to Schedule",
        onAction: () => navigateToTab("AdminSchedule"),
        isCompleted: hasSessions,
      },
      {
        id: "configure_courts",
        icon: "tennisball" as const,
        title: "Configure Courts",
        description: "Add your courts and set availability",
        actionLabel: "Manage Courts",
        onAction: () => navigation.navigate("AdminCourts" as never),
        isCompleted: false,
      },
      {
        id: "setup_billing",
        icon: "card" as const,
        title: "Set Up Billing",
        description: "Configure credit packages and payment settings",
        actionLabel: "Billing Settings",
        onAction: () => navigation.navigate("AdminPayments" as never),
        isCompleted: false,
      },
    ];
  }, [operationsData, navigation, navigateToTab]);

  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });

  const adminFeatureUsage = useMemo(() => [
    { id: "coaches", name: "Coach Management", icon: "people", isUsed: true },
    { id: "players", name: "Player Registry", icon: "person-add", isUsed: true },
    { id: "schedule", name: "Session Scheduling", icon: "calendar", isUsed: false },
    { id: "courts", name: "Court Management", icon: "tennisball", isUsed: false },
    { id: "billing", name: "Billing & Payments", icon: "card", isUsed: false },
    { id: "reports", name: "Reports", icon: "document-text", isUsed: false },
  ], []);

  const adminTips = [
    { id: "tip_checkin", icon: "log-in", text: "Tip: Check the Check-In Stream to see who's arriving for sessions" },
    { id: "tip_schedule", icon: "calendar", text: "Tip: Use the Schedule tab to drag and drop sessions to new times" },
    { id: "tip_reports", icon: "document-text", text: "Tip: Monthly reports are auto-generated on the 1st of each month" },
    { id: "tip_players", icon: "people", text: "Tip: Use the Players tab to search and filter your academy roster" },
    { id: "tip_courts", icon: "tennisball", text: "Tip: Set court availability hours to prevent bookings outside operating times" },
  ];

  const adminFAQs = [
    { question: "How do I add a new coach?", answer: "Go to the Coaches tab and tap 'Invite Coach'. Enter their email and they'll receive an invitation to join your academy.", category: "Staff" },
    { question: "How do I register a new player?", answer: "Go to the Players tab and tap 'Add Player'. Fill in their details including name, email, and ball level.", category: "Players" },
    { question: "How do I create a session?", answer: "Go to the Schedule tab, tap the + button, select a coach, court, time slot, and add players.", category: "Schedule" },
    { question: "How do credit packages work?", answer: "Credit packages are prepaid lesson bundles. Go to Payments to create packages with specific credit types (private, semi-private, group) and expiry dates.", category: "Billing" },
    { question: "How do I view reports?", answer: "Go to the Reports tab to see monthly performance reports, attendance statistics, and financial summaries.", category: "Reports" },
    { question: "How do I manage courts?", answer: "Go to Courts settings to add, edit, or deactivate courts. Set availability hours and maintenance schedules.", category: "Settings" },
  ];

  const adminWelcomeSlides = [
    {
      icon: "business",
      iconColor: "#FF9800",
      title: "Welcome, Academy Owner!",
      description: "You're now running your academy on Glow Up Sports. Let's get you set up to manage coaches, players, and sessions.",
    },
    {
      icon: "people",
      iconColor: "#00BCD4",
      title: "Manage Your Team",
      description: "Add coaches and players to your academy. They'll get access to their own dashboards with everything they need.",
    },
    {
      icon: "calendar",
      iconColor: "#2ECC40",
      title: "Schedule & Track",
      description: "Create training sessions, track attendance, manage payments, and monitor your academy's performance in real-time.",
    },
    {
      icon: "rocket",
      iconColor: "#9B59B6",
      title: "Let's Build Your Academy!",
      description: "Follow the Getting Started checklist on your dashboard. Each step brings you closer to a fully set up academy!",
    },
  ];

  const isDesktop = useDesktop();

  if (isLoading && !operationsData) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: isDesktop ? 0 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
        <Text style={styles.loadingText}>Loading Operations Hub...</Text>
      </View>
    );
  }

  if (isDesktop) {
    const today = new Date();
    const greetingHour = today.getHours();
    const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";
    const displayName = user?.name?.split(" ")[0] ?? "Admin";
    const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    return (
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
            <Pressable
              style={styles.desktopTopBtn}
              onPress={() => navigateToTab("AdminSchedule")}
            >
              <Ionicons name="add" size={16} color="#0B0D10" />
              <Text style={styles.desktopTopBtnText}>Add Session</Text>
            </Pressable>
            <Pressable
              style={[styles.desktopTopBtn, styles.desktopTopBtnSecondary]}
              onPress={() => navigateToTab("AdminPlayers")}
            >
              <Ionicons name="person-add-outline" size={16} color={Colors.dark.orange} />
              <Text style={[styles.desktopTopBtnText, { color: Colors.dark.orange }]}>Add Player</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.desktopKpiRow}>
          {[
            { icon: "play-circle-outline" as const, label: "Active Sessions", value: liveStats.activeSessions, color: Colors.dark.orange },
            { icon: "people-outline" as const, label: "Players Today", value: operationsData?.quickStats?.todayPlayers || 0, color: Colors.dark.xpCyan },
            { icon: "cash-outline" as const, label: "Revenue MTD", value: `AED ${(operationsData?.quickStats?.revenueMTD || 0).toLocaleString()}`, color: "#22c55e" },
            { icon: "people-circle-outline" as const, label: "Coaches On Court", value: liveStats.activeCoaches, color: Colors.dark.gold },
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

        <View style={styles.desktopRow2}>
          <View style={styles.desktopCol60}>
            <Text style={styles.desktopSectionTitle}>Session Queue</Text>
            <SessionQueuePanel
              sessions={operationsData?.sessionQueue || []}
              onSessionPress={(id) => navigateToTab("AdminSchedule")}
              onStartSession={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              onViewAll={() => navigateToTab("AdminSchedule")}
            />
          </View>
          <View style={styles.desktopCol40}>
            <Text style={styles.desktopSectionTitle}>Check-in Stream</Text>
            <CheckInStream
              checkIns={operationsData?.checkIns || []}
              onConfirm={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onViewPlayer={(id) => navigateToTab("AdminPlayers")}
            />
          </View>
        </View>

        <View style={styles.desktopRow3}>
          <View style={styles.desktopCol60}>
            <Text style={styles.desktopSectionTitle}>Task Alerts</Text>
            <TaskAlertsList
              alerts={operationsData?.taskAlerts || []}
              onAlertPress={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              onAction={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
            />
          </View>
          <View style={styles.desktopCol40}>
            <Text style={styles.desktopSectionTitle}>Today at a Glance</Text>
            <View style={styles.desktopGlanceCard}>
              {([
                { label: "Total Sessions", value: todayOps.totalSessions, icon: "calendar-outline" as const, color: Colors.dark.orange },
                { label: "In Progress", value: todayOps.inProgressSessions, icon: "play-circle-outline" as const, color: Colors.dark.primary },
                { label: "Upcoming", value: todayOps.upcomingSessions, icon: "time-outline" as const, color: Colors.dark.xpCyan },
                { label: "Attendance Rate", value: `${operationsData?.quickStats?.attendanceRate ?? 0}%`, icon: "trending-up-outline" as const, color: Colors.dark.gold },
              ]).map((stat) => (
                <View key={stat.label} style={styles.desktopGlanceRow}>
                  <Ionicons name={stat.icon} size={16} color={stat.color} />
                  <Text style={styles.desktopGlanceLabel}>{stat.label}</Text>
                  <Text style={[styles.desktopGlanceValue, { color: stat.color }]}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
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
        
          <GettingStartedChecklist
            role="admin"
            steps={adminChecklistSteps}
          />
        

        <QuickTipsBanner role="admin" tips={adminTips} />

        <PlatformUsageProgress
          role="admin"
          features={adminFeatureUsage}
        />

        
          <OperationsHubHero
            activeSessions={liveStats.activeSessions}
            waitingCheckIns={liveStats.waitingCheckIns}
            activeCoaches={liveStats.activeCoaches}
            nextSessionIn={liveStats.nextSessionIn}
            onViewSchedule={() => navigateToTab("AdminSchedule")}
          />
        

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
          sessions={operationsData?.sessionQueue || []}
          onSessionPress={(id) => navigateToTab("AdminSchedule")}
          onStartSession={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          onViewAll={() => navigateToTab("AdminSchedule")}
        />

        
          <View style={styles.twoColumnRow}>
            <View style={styles.columnHalf}>
              <CheckInStream
                checkIns={operationsData?.checkIns || []}
                onConfirm={(id) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                onViewPlayer={(id) => navigateToTab("AdminPlayers")}
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
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigateToTab("AdminSchedule");
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
                navigateToTab("AdminPlayers");
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
                navigateToTab("AdminSchedule");
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
                navigateToTab("AdminPlayers");
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
              navigateToTab("AdminCoaches");
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
              navigateToTab("AdminPlayers");
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
              navigateToTab("AdminClasses");
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
      <WelcomeIntroModal
        role="admin"
        slides={adminWelcomeSlides}
        onComplete={() => {}}
      />
      
        <HelpButton
          role="admin"
          faqs={adminFAQs}
          supportEmail="support@glowupsports.com"
          bottomOffset={120}
        />
      
      <NotificationGuideModal
        visible={showNotificationGuide}
        onClose={() => setShowNotificationGuide(false)}
        role="admin"
      />
      <FirstActionCelebration
        visible={showFirstCelebration}
        onClose={() => setShowFirstCelebration(false)}
        title={celebrationData.title}
        description={celebrationData.description}
        icon={celebrationData.icon}
        xpReward={celebrationData.xpReward}
      />
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
  desktopScroll: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  desktopContent: {
    padding: 32,
    paddingBottom: 48,
  },
  desktopTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  desktopGreeting: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  desktopDate: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  desktopTopActions: {
    flexDirection: "row",
    gap: 12,
  },
  desktopTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#C8FF3D",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  desktopTopBtnSecondary: {
    backgroundColor: "rgba(255,133,27,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,133,27,0.3)",
  },
  desktopTopBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0B0D10",
  },
  desktopKpiRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  desktopKpiCard: {
    flex: 1,
    backgroundColor: "#11141A",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "flex-start",
  },
  desktopKpiIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  desktopKpiValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  desktopKpiLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  desktopRow2: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 20,
  },
  desktopRow3: {
    flexDirection: "row",
    gap: 20,
  },
  desktopCol60: {
    flex: 3,
  },
  desktopCol40: {
    flex: 2,
  },
  desktopSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 12,
  },
  desktopGlanceCard: {
    backgroundColor: "#11141A",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 0,
  },
  desktopGlanceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    gap: 10,
  },
  desktopGlanceLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  desktopGlanceValue: {
    fontSize: 16,
    fontWeight: "700",
  },
});
