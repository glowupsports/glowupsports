import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { PlatformCommandCenter } from "@/platform/components/PlatformCommandCenter";
import { AcademyHealthCards } from "@/platform/components/AcademyHealthCards";
import { SubscriptionFunnel } from "@/platform/components/SubscriptionFunnel";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";
import { SmartInsightsPanel, Insight } from "@/admin/components/SmartInsightsPanel";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";

const PLATFORM_PURPLE = "#9B59B6";

interface PlatformDashboardData {
  platform: {
    name: string;
    currency: string;
  };
  metrics: {
    activeAcademies: number;
    totalCoaches: number;
    totalPlayers: number;
    mrr: number;
    newSignups: number;
    churnRate: number;
    trialAcademies: number;
    pausedAcademies: number;
  };
  subscriptions: {
    activeCount: number;
    trialCount: number;
    pausedCount: number;
    churnedThisMonth: number;
    conversionRate: number;
  };
  academies: Array<{
    id: string;
    name: string;
    players: number;
    coaches: number;
    mrr: number;
    healthScore: number;
    status: "healthy" | "warning" | "critical" | "trial" | "paused";
  }>;
  weekActivity: Array<{
    day: string;
    intensity: number;
  }>;
  insights: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    change?: number;
  }>;
  alerts: Array<{
    type: "warning" | "error" | "info";
    title: string;
    description: string;
  }>;
}

interface ActivityDayProps {
  day: string;
  intensity: number;
}

function ActivityDay({ day, intensity }: ActivityDayProps) {
  const opacity = Math.min(1, 0.2 + (intensity * 0.2));
  return (
    <View style={styles.activityDayContainer}>
      <View style={[styles.activityDay, { backgroundColor: `rgba(46, 204, 113, ${opacity})` }]} />
      <Text style={styles.activityDayLabel}>{day}</Text>
    </View>
  );
}

export default function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { navigateToTab } = useTabNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const { data: platformData, isLoading, refetch } = useQuery<PlatformDashboardData>({
    queryKey: ["/api/platform/dashboard/enhanced"],
  });
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const weekActivity = platformData?.weekActivity || [
    { day: "M", intensity: 3 },
    { day: "T", intensity: 4 },
    { day: "W", intensity: 5 },
    { day: "T", intensity: 4 },
    { day: "F", intensity: 6 },
    { day: "S", intensity: 3 },
    { day: "S", intensity: 2 },
  ];

  const handleLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) {
        logout();
      }
    } else {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign Out",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              logout();
            },
          },
        ]
      );
    }
  };

  const metrics = platformData?.metrics || {
    activeAcademies: 0,
    totalCoaches: 0,
    totalPlayers: 0,
    mrr: 0,
    newSignups: 0,
    churnRate: 0,
    trialAcademies: 0,
    pausedAcademies: 0,
  };

  const subscriptions = platformData?.subscriptions || {
    activeCount: metrics.activeAcademies,
    trialCount: metrics.trialAcademies || 0,
    pausedCount: metrics.pausedAcademies || 0,
    churnedThisMonth: 0,
    conversionRate: 75,
  };

  const insights: Insight[] = (platformData?.insights || []).map(i => ({
    ...i,
    type: i.type as Insight["type"],
  }));

  const currency = platformData?.platform?.currency || "$";

  const [showWelcome, setShowWelcome] = useState(false);
  const [showNotificationGuide, setShowNotificationGuide] = useState(false);
  const [showFirstCelebration, setShowFirstCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: "", description: "", icon: "trophy", xpReward: 0 });

  const platformFeatureUsage = useMemo(() => [
    { id: "command_center", name: "Command Center", icon: "grid", isUsed: true },
    { id: "academies", name: "Academy Management", icon: "business", isUsed: false },
    { id: "analytics", name: "Platform Analytics", icon: "analytics", isUsed: false },
    { id: "audit_logs", name: "Audit Logs", icon: "document-text", isUsed: false },
    { id: "billing_config", name: "Billing Configuration", icon: "card", isUsed: false },
  ], []);

  const platformTips = [
    { id: "tip_health", icon: "pulse", text: "Tip: Check Academy Health Cards to spot issues before they become critical" },
    { id: "tip_impersonate", icon: "eye", text: "Tip: Use impersonation to see exactly what any user sees in their dashboard" },
    { id: "tip_mrr", icon: "trending-up", text: "Tip: Monitor your MRR and churn rate in the Command Center" },
    { id: "tip_audit", icon: "document-text", text: "Tip: Check Audit Logs regularly for security and compliance" },
  ];

  const platformFAQs = [
    { question: "How do I add a new academy?", answer: "Go to the Academies tab and use the onboarding flow to set up a new academy with all their details.", category: "Academies" },
    { question: "How does impersonation work?", answer: "You can view the platform as any user. This helps troubleshoot issues. Find the user and tap 'Impersonate' to switch to their view.", category: "Admin" },
    { question: "What do the health scores mean?", answer: "Health scores (0-100) reflect academy activity: sessions run, player engagement, coach utilization, and payment status. Below 50 is critical.", category: "Monitoring" },
    { question: "How do I manage subscriptions?", answer: "Go to System > Billing Config to set up plans, pricing, and trial periods for academies.", category: "Billing" },
  ];

  const platformChecklistSteps = useMemo(() => {
    const hasAcademies = (platformData?.metrics?.activeAcademies || 0) > 0;
    const hasCoaches = (platformData?.metrics?.totalCoaches || 0) > 0;
    const hasPlayers = (platformData?.metrics?.totalPlayers || 0) > 0;
    
    return [
      {
        id: "review_platform",
        icon: "grid" as const,
        title: "Review Your Platform",
        description: "Check the Command Center for an overview of all academies",
        isCompleted: true,
      },
      {
        id: "onboard_academy",
        icon: "business" as const,
        title: "Onboard Your First Academy",
        description: "Add an academy to the platform and configure their settings",
        actionLabel: "View Academies",
        onAction: () => navigateToTab("Academies"),
        isCompleted: hasAcademies,
      },
      {
        id: "verify_coaches",
        icon: "people" as const,
        title: "Verify Coach Registrations",
        description: "Review and approve coaches joining your academies",
        isCompleted: hasCoaches,
      },
      {
        id: "monitor_growth",
        icon: "trending-up" as const,
        title: "Monitor Player Growth",
        description: "Track total players across all academies",
        isCompleted: hasPlayers,
      },
      {
        id: "configure_billing",
        icon: "card" as const,
        title: "Configure Billing",
        description: "Set up subscription plans and pricing for academies",
        actionLabel: "System Settings",
        onAction: () => navigateToTab("System"),
        isCompleted: false,
      },
    ];
  }, [platformData, navigateToTab]);

  const platformWelcomeSlides = [
    {
      icon: "planet",
      iconColor: "#9B59B6",
      title: "Welcome, Platform Owner!",
      description: "You have full control over Glow Up Sports. Monitor all academies, coaches, and players from your Command Center.",
    },
    {
      icon: "business",
      iconColor: "#FF9800",
      title: "Academy Management",
      description: "Onboard new academies, configure their settings, and monitor their health scores and performance metrics.",
    },
    {
      icon: "analytics",
      iconColor: "#00BCD4",
      title: "Platform Analytics",
      description: "Track MRR, churn rates, subscription funnels, and player growth across all your academies.",
    },
    {
      icon: "rocket",
      iconColor: "#2ECC40",
      title: "You're in Control!",
      description: "Use the Getting Started checklist to set everything up. You can also impersonate any user to troubleshoot issues.",
    },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_PURPLE} />
        <Text style={styles.loadingText}>Loading Platform Center...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.18)", "rgba(142,68,173,0.10)", "transparent"]}
        style={styles.headerGradient}
      />

      <CollapsibleModeSwitcher />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PLATFORM_PURPLE} />
        }
      >
        {/* GETTING STARTED CHECKLIST */}
        
          <GettingStartedChecklist
            role="platform_owner"
            steps={platformChecklistSteps}
          />
        

        <QuickTipsBanner role="platform_owner" tips={platformTips} />

        <PlatformUsageProgress
          role="platform_owner"
          features={platformFeatureUsage}
        />

        
          <PlatformCommandCenter
            platformName={platformData?.platform?.name || "Glow Up Sports"}
            totalMrr={metrics.mrr}
            activeAcademies={metrics.activeAcademies}
            totalPlayers={metrics.totalPlayers}
            currency={currency}
            onLogoutPress={handleLogout}
            onSettingsPress={() => navigateToTab("System")}
          />
        

        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="people"
              label="Total Coaches"
              value={metrics.totalCoaches}
              color={Colors.dark.primary}
              onPress={() => navigateToTab("CoachHealth")}
            />
          </View>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="person-add"
              label="New Signups"
              value={metrics.newSignups}
              color={Colors.dark.xpCyan}
              onPress={() => navigateToTab("PlayerHealth")}
            />
          </View>
        </View>

        <SubscriptionFunnel
          activeCount={subscriptions.activeCount}
          trialCount={subscriptions.trialCount}
          pausedCount={subscriptions.pausedCount}
          churnedThisMonth={subscriptions.churnedThisMonth}
          conversionRate={subscriptions.conversionRate}
        />

        <AcademyHealthCards
          academies={platformData?.academies || []}
          currency={currency}
          onAcademyPress={(id) => navigateToTab("Academies")}
          onViewAll={() => navigateToTab("Academies")}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Platform Activity</Text>
            <Text style={styles.periodText}>{metrics.totalPlayers} players</Text>
          </View>
          <View style={styles.activityCard}>
            <Text style={styles.activityLabel}>Weekly Activity</Text>
            <View style={styles.activityRow}>
              {weekActivity.map((item, index) => (
                <ActivityDay key={index} day={item.day} intensity={item.intensity} />
              ))}
            </View>
          </View>
        </View>

        <SmartInsightsPanel insights={insights} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigateToTab("Academies");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${PLATFORM_PURPLE}15` }]}>
                <Ionicons name="business" size={22} color={PLATFORM_PURPLE} />
              </View>
              <Text style={styles.quickActionLabel}>Academies</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigateToTab("Financials");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
                <Ionicons name="cash" size={22} color={Colors.dark.primary} />
              </View>
              <Text style={styles.quickActionLabel}>Finance</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigateToTab("CoachHealth");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                <Ionicons name="people" size={22} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.quickActionLabel}>Coaches</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigateToTab("System");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.orange}15` }]}>
                <Ionicons name="settings" size={22} color={Colors.dark.orange} />
              </View>
              <Text style={styles.quickActionLabel}>System</Text>
            </Pressable>
          </View>
        </View>

        {(platformData?.alerts?.length || 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            {platformData?.alerts.slice(0, 3).map((alert, index) => (
              <View 
                key={index} 
                style={[styles.alertCard, { 
                  borderLeftColor: alert.type === "error" ? Colors.dark.error : 
                                   alert.type === "warning" ? Colors.dark.orange : Colors.dark.xpCyan 
                }]}
              >
                <Ionicons 
                  name={alert.type === "error" ? "alert-circle" : alert.type === "warning" ? "warning" : "information-circle"} 
                  size={20} 
                  color={alert.type === "error" ? Colors.dark.error : 
                         alert.type === "warning" ? Colors.dark.orange : Colors.dark.xpCyan} 
                />
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <Text style={styles.alertDescription}>{alert.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <WelcomeIntroModal
        role="platform_owner"
        slides={platformWelcomeSlides}
        onComplete={() => {}}
      />
      
        <HelpButton
          role="platform_owner"
          faqs={platformFAQs}
          supportEmail="support@glowupsports.com"
          bottomOffset={120}
        />
      
      <NotificationGuideModal
        visible={showNotificationGuide}
        onClose={() => setShowNotificationGuide(false)}
        role="platform_owner"
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
  centered: {
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
    height: 320,
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
    marginBottom: Spacing.md,
  },
  periodText: {
    ...Typography.small,
    color: PLATFORM_PURPLE,
    fontWeight: "600",
  },
  activityCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  activityLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  activityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  activityDayContainer: {
    alignItems: "center",
    gap: 6,
  },
  activityDay: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  activityDayLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
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
  alertCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    marginBottom: Spacing.sm,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  alertDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
