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
import { useTabNavigation } from "@/components/TabNavigationContext";

import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import type { OwnerTabParamList } from "@/owner/navigation/OwnerNavigator";

import { BusinessCommandCenter } from "@/owner/components/BusinessCommandCenter";
import { GrowthMetricsPanel } from "@/owner/components/GrowthMetricsPanel";
import { StaffPerformancePanel } from "@/owner/components/StaffPerformancePanel";
import { RevenueHealthGauge } from "@/admin/components/RevenueHealthGauge";
import { SmartInsightsPanel, Insight } from "@/admin/components/SmartInsightsPanel";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { SettingsWalkthroughModal } from "@/components/SettingsWalkthroughModal";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
type NavigationProp = NativeStackNavigationProp<OwnerTabParamList>;

interface OwnerBusinessDashboardData {
  academy: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  } | null;
  financials: {
    monthlyRevenue: number;
    revenueTarget: number;
    outstandingPayments: number;
    cashFlow: number;
    healthScore: number;
  };
  growth: {
    newSignups: number;
    signupChange: number;
    retentionRate: number;
    retentionChange: number;
    churnRate: number;
    activeGrowth: number;
  };
  staffPerformance: Array<{
    id: string;
    name: string;
    sessionsThisMonth: number;
    playersManaged: number;
    earnings: number;
    rating: number;
    trend: "up" | "down" | "stable";
  }>;
  kpis: {
    totalPlayers: number;
    activePlayers: number;
    totalCoaches: number;
    attendanceRate: number;
  };
  topPerformers: Array<{
    id: string;
    name: string;
    level: number;
    glowScore: number;
    ballLevel: string;
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
    title: string;
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
  const { navigateToTab } = useTabNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [showSettingsWalkthrough, setShowSettingsWalkthrough] = useState(false);
  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });
  const { data: dashboardData, isLoading, refetch } = useQuery<OwnerBusinessDashboardData>({
    queryKey: ["/api/owner/dashboard/business"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const financials = dashboardData?.financials || {
    monthlyRevenue: 0,
    revenueTarget: 50000,
    outstandingPayments: 0,
    cashFlow: 0,
    healthScore: 0,
  };

  const growth = dashboardData?.growth || {
    newSignups: 0,
    signupChange: 0,
    retentionRate: 0,
    retentionChange: 0,
    churnRate: 0,
    activeGrowth: 0,
  };

  const kpis = dashboardData?.kpis || {
    totalPlayers: 0,
    activePlayers: 0,
    totalCoaches: 0,
    attendanceRate: 0,
  };

  const currency = dashboardData?.academy?.currency || "AED";
  const topPerformers = dashboardData?.topPerformers || [];

  const ownerChecklistSteps = useMemo(() => {
    const hasCoaches = (kpis.totalCoaches || 0) > 0;
    const hasPlayers = (kpis.totalPlayers || 0) > 0;
    const hasRevenue = (financials.monthlyRevenue || 0) > 0;

    return [
      {
        id: "setup_academy",
        icon: "business" as const,
        title: "Set Up Academy Profile",
        description: "Configure your academy name, logo, timezone, and currency",
        actionLabel: "Go to Settings",
        onAction: () => navigateToTab("Settings"),
        isCompleted: !!dashboardData?.academy,
      },
      {
        id: "add_coaches",
        icon: "people" as const,
        title: "Add Your Coaches",
        description: "Invite coaches to join your academy and manage sessions",
        actionLabel: "Manage People",
        onAction: () => navigateToTab("People"),
        isCompleted: hasCoaches,
      },
      {
        id: "register_players",
        icon: "person-add" as const,
        title: "Register Players",
        description: "Add players to your academy roster",
        actionLabel: "Manage People",
        onAction: () => navigateToTab("People"),
        isCompleted: hasPlayers,
      },
      {
        id: "setup_pricing",
        icon: "pricetag" as const,
        title: "Set Up Pricing & Credits",
        description: "Create credit packages so players can book sessions",
        actionLabel: "Go to Finance",
        onAction: () => navigateToTab("Finance"),
        isCompleted: hasRevenue,
      },
      {
        id: "configure_courts",
        icon: "tennisball" as const,
        title: "Configure Courts",
        description: "Add your courts and set availability hours",
        actionLabel: "Go to Settings",
        onAction: () => navigateToTab("Settings"),
        isCompleted: false,
      },
      {
        id: "review_performance",
        icon: "analytics" as const,
        title: "Review Performance",
        description: "Check your academy's growth metrics and staff performance",
        actionLabel: "View Performance",
        onAction: () => navigateToTab("Performance"),
        isCompleted: false,
      },
    ];
  }, [dashboardData, kpis, financials, navigateToTab]);

  const ownerWelcomeSlides = [
    {
      icon: "business",
      iconColor: "#FFD700",
      title: "Welcome, Academy Owner!",
      description: "You now have full control over your tennis academy. Manage coaches, players, finances, and growth from one dashboard.",
    },
    {
      icon: "people",
      iconColor: "#00BCD4",
      title: "Build Your Team",
      description: "Invite coaches, register players, and watch your academy community grow. Everyone gets their own personalized experience.",
    },
    {
      icon: "cash",
      iconColor: "#2ECC40",
      title: "Track Your Business",
      description: "Monitor revenue, outstanding payments, retention rates, and staff performance in real-time.",
    },
    {
      icon: "rocket",
      iconColor: "#9B59B6",
      title: "Let's Get Started!",
      description: "Follow the Getting Started checklist on your dashboard. Each step brings you closer to a fully operational academy!",
    },
  ];

  const ownerTips = [
    { id: "tip_health", icon: "pulse", text: "Tip: Keep your Revenue Health Score above 70 for a thriving academy" },
    { id: "tip_retention", icon: "people", text: "Tip: High retention comes from consistent coaching and regular feedback" },
    { id: "tip_pricing", icon: "pricetag", text: "Tip: Create credit packages with clear expiry dates to encourage regular bookings" },
    { id: "tip_staff", icon: "person", text: "Tip: Review staff performance monthly to identify coaching superstars" },
    { id: "tip_insights", icon: "bulb", text: "Tip: Check Smart Insights daily for actionable recommendations" },
  ];

  const ownerFAQs = [
    { question: "How do I invite a coach?", answer: "Go to the People tab and tap 'Invite Coach'. Enter their email and they'll receive an invitation to join your academy.", category: "Staff" },
    { question: "How do I set up credit packages?", answer: "Go to the Finance tab > Credit Packages. Create packages with credit types (private, semi-private, group), quantities, prices, and expiry dates.", category: "Billing" },
    { question: "What is Revenue Health Score?", answer: "It's a 0-100 score reflecting your academy's financial health based on revenue vs target, outstanding payments, attendance rate, and cash flow.", category: "Finance" },
    { question: "How do I add courts?", answer: "Go to Settings > Courts Management. Add courts with names, types, and availability hours.", category: "Settings" },
    { question: "How do I track coach performance?", answer: "The Staff Performance Panel on your dashboard shows sessions, players managed, earnings, and ratings for each coach.", category: "Staff" },
    { question: "How do pricing tiers work?", answer: "Go to Settings > Pricing to set rates for private, semi-private, and group sessions. You can also set different rates per coach.", category: "Billing" },
  ];

  const ownerFeatureUsage = useMemo(() => [
    { id: "dashboard", name: "Business Dashboard", icon: "grid", isUsed: true },
    { id: "people", name: "People Management", icon: "people", isUsed: (kpis.totalCoaches || 0) > 0 },
    { id: "finance", name: "Finance & Billing", icon: "cash", isUsed: (financials.monthlyRevenue || 0) > 0 },
    { id: "performance", name: "Performance Analytics", icon: "analytics", isUsed: false },
    { id: "settings", name: "Academy Settings", icon: "settings", isUsed: !!dashboardData?.academy },
    { id: "operations", name: "Operations", icon: "calendar", isUsed: false },
  ], [kpis, financials, dashboardData]);

  const ownerSettingsAreas = useMemo(() => [
    {
      id: "profile",
      icon: "business",
      title: "Academy Profile",
      description: "Set your academy name, logo, and contact details",
      whyImportant: "Players and coaches see this when they join. A complete profile builds trust and professionalism.",
      actionLabel: "Edit Profile",
      onAction: () => navigateToTab("Settings"),
      isConfigured: !!dashboardData?.academy?.name,
    },
    {
      id: "timezone",
      icon: "time",
      title: "Timezone & Currency",
      description: "Set your operating timezone and currency for billing",
      whyImportant: "Ensures all sessions, schedules, and payments are displayed in your local time and currency.",
      actionLabel: "Configure",
      onAction: () => navigateToTab("Settings"),
      isConfigured: !!dashboardData?.academy?.timezone,
    },
    {
      id: "courts",
      icon: "tennisball",
      title: "Courts",
      description: "Add your courts and set their availability hours",
      whyImportant: "Courts are required for scheduling sessions. Without them, coaches can't create bookings.",
      actionLabel: "Manage Courts",
      onAction: () => navigateToTab("Settings"),
      isConfigured: false,
    },
    {
      id: "pricing",
      icon: "pricetag",
      title: "Pricing",
      description: "Set session rates for different lesson types",
      whyImportant: "Defines how much players pay for each session type. Required before selling credit packages.",
      actionLabel: "Set Pricing",
      onAction: () => navigateToTab("Finance"),
      isConfigured: false,
    },
  ], [dashboardData, navigateToTab]);
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
        <Text style={styles.loadingText}>Loading Business Center...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,215,0,0.18)", "rgba(184,134,11,0.10)", "transparent"]}
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
        
          <GettingStartedChecklist
            role="academy_owner"
            steps={ownerChecklistSteps}
          />
        

        <QuickTipsBanner role="academy_owner" tips={ownerTips} />

        <PlatformUsageProgress
          role="academy_owner"
          features={ownerFeatureUsage}
        />

        
          <BusinessCommandCenter
            academyName={dashboardData?.academy?.name || "My Academy"}
            monthlyRevenue={financials.monthlyRevenue}
            revenueTarget={financials.revenueTarget}
            healthScore={financials.healthScore}
            currency={currency}
            notificationCount={dashboardData?.alerts?.length || 0}
            onNotificationPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          />
        

        
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <AnimatedKpiCard
                icon="people"
                label="Total Players"
                value={kpis.totalPlayers}
                color={Colors.dark.xpCyan}
                onPress={() => navigateToTab("People")}
              />
            </View>
            <View style={styles.kpiItem}>
              <AnimatedKpiCard
                icon="person"
                label="Coaches"
                value={kpis.totalCoaches}
                color={Colors.dark.primary}
                onPress={() => navigateToTab("People")}
              />
            </View>
          </View>
        

        
          <GrowthMetricsPanel
            newSignups={growth.newSignups}
            signupChange={growth.signupChange}
            retentionRate={growth.retentionRate}
            retentionChange={growth.retentionChange}
            churnRate={growth.churnRate}
            activeGrowth={growth.activeGrowth}
          />
        

        <RevenueHealthGauge
          monthlyRevenue={financials.monthlyRevenue}
          revenueTarget={financials.revenueTarget}
          outstandingPayments={financials.outstandingPayments}
          attendanceRate={kpis.attendanceRate}
          currency={currency}
        />

        <StaffPerformancePanel
          coaches={dashboardData?.staffPerformance || []}
          currency={currency}
          onCoachPress={(id) => navigateToTab("People")}
          onViewAll={() => navigateToTab("People")}
        />

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
                  navigateToTab("Performance");
                }}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.gold}15` }]}>
                  <Ionicons name="analytics" size={22} color={Colors.dark.gold} />
                </View>
                <Text style={styles.quickActionLabel}>Reports</Text>
              </Pressable>
              <Pressable 
                style={styles.quickAction}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigateToTab("People");
                }}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
                  <Ionicons name="people" size={22} color={Colors.dark.primary} />
                </View>
                <Text style={styles.quickActionLabel}>Staff</Text>
              </Pressable>
              <Pressable 
                style={styles.quickAction}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigateToTab("Finance");
                }}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                  <Ionicons name="cash" size={22} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.quickActionLabel}>Payments</Text>
              </Pressable>
              <Pressable 
                style={styles.quickAction}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigateToTab("Settings");
                }}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.orange}15` }]}>
                  <Ionicons name="settings" size={22} color={Colors.dark.orange} />
                </View>
                <Text style={styles.quickActionLabel}>Settings</Text>
              </Pressable>
              <Pressable
                style={styles.quickAction}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("CoachPostComposer", { mode: "academy" });
                }}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
                  <Ionicons name="megaphone" size={22} color={Colors.dark.primary} />
                </View>
                <Text style={styles.quickActionLabel}>New Post</Text>
              </Pressable>
            </View>
          
        </View>
      </ScrollView>

      <HelpButton
        role="academy_owner"
        faqs={ownerFAQs}
        supportEmail="support@glowupsports.com"
        bottomOffset={120}
      />

      <WelcomeIntroModal
        role="academy_owner"
        slides={ownerWelcomeSlides}
        onComplete={() => {}}
      />

      <SettingsWalkthroughModal
        visible={showSettingsWalkthrough}
        onClose={() => setShowSettingsWalkthrough(false)}
        areas={ownerSettingsAreas}
      />

      <NotificationGuideModal
        visible={showNotificationGuide}
        onClose={() => setShowNotificationGuide(false)}
        role="academy_owner"
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
    height: 300,
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
