import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, ActivityIndicator, RefreshControl, DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { PlatformCommandCenter } from "@/platform/components/PlatformCommandCenter";
import { AcademyHealthCards } from "@/platform/components/AcademyHealthCards";
import { SubscriptionFunnel } from "@/platform/components/SubscriptionFunnel";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";
import { SmartInsightsPanel, Insight } from "@/admin/components/SmartInsightsPanel";
import { BetaFeedbackPanel } from "@/platform/components/BetaFeedbackPanel";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { WelcomeIntroModal } from "@/components/WelcomeIntroModal";
import { HelpButton } from "@/components/HelpButton";
import { QuickTipsBanner } from "@/components/QuickTipsBanner";
import { PlatformUsageProgress } from "@/components/PlatformUsageProgress";
import { NotificationGuideModal } from "@/components/NotificationGuideModal";
import { FirstActionCelebration } from "@/components/FirstActionCelebration";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import type { PlatformStackParamList } from "@/platform/navigation/PlatformNavigator";

const PLATFORM_PURPLE = "#9B59B6";

const FEATURE_LABEL_MAP: Record<string, string> = {
  "tab:home": "Home Tab",
  "tab:social": "Social Tab",
  "tab:play": "Play Tab",
  "tab:schedule": "Schedule Tab",
  "tab:quests": "Quests Tab",
  "tab:stats": "Stats Tab",
  "tab:me": "Profile Tab",
  "action:book_lesson": "Book Lesson",
  "action:match": "Match",
  "action:messages": "Messages",
  "action:shop": "Shop",
  "action:marketplace": "Marketplace",
  "action:equipment": "Equipment",
  "action:quests": "Quests Action",
  "action:classes": "Classes",
  "action:open_session": "Open Session",
  "action:chat_coach": "Chat Coach",
  "action:record_video": "Record Video",
  "screen:create_match": "Create Match",
  "screen:quick_book": "Quick Book",
  "screen:shop": "Shop Screen",
  "screen:lesson_booking": "Lesson Booking",
  "progress:pillar_tap": "Progress Pillar Tap",
  "progress:video_feedback": "Video Feedback",
  "progress:coach_notes_all": "Coach Notes (All)",
  "quests:tab_daily": "Quests - Daily Tab",
  "quests:tab_weekly": "Quests - Weekly Tab",
  "quests:tab_monthly": "Quests - Monthly Tab",
  "quests:claim": "Quest Claim Reward",
  "quests:upload_proof": "Quest Upload Proof",
  "collection:badges": "Collection - Badges",
  "collection:titles": "Collection - Titles",
  "tournaments:upcoming": "Tournaments - Upcoming",
  "tournaments:my_tournaments": "Tournaments - My Tournaments",
  "tournaments:ladders": "Tournaments - Ladders",
  "tournaments:register": "Tournament Register",
  "community:feed_for_you": "Community - For You Feed",
  "community:feed_friends": "Community - Friends Feed",
  "community:create_post": "Community - Create Post",
  "schedule:vacation_mode": "Vacation Mode Toggle",
  "schedule:session_detail": "Session Detail",
  "booking:court": "Court Booking",
  "match:log_match": "Log Match",
  "match:history": "Match History",
  "home:quest_tracker": "Home - Quest Tracker",
  "home:streak": "Home - Streak",
  "home:family_lobby": "Home - Family Lobby",
  "progress:skill_radar": "Skill Radar",
  "progress:level_readiness": "Level Readiness",
  "collection:equip_title": "Equip Title",
  "ladder:challenge": "Ladder Challenge",
};

interface FeatureUsageItem {
  feature: string;
  total: number;
  intensity: number;
}

interface FeatureUsageData {
  features: FeatureUsageItem[];
  days: number;
  generatedAt: string;
}

interface AcademyOption {
  id: string;
  name: string;
}

function FeatureUsageCard({ academies }: { academies: AcademyOption[] }) {
  const [days, setDays] = useState(7);
  const navigation = useNavigation<NativeStackNavigationProp<PlatformStackParamList>>();
  const [selectedAcademyId, setSelectedAcademyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<FeatureUsageData>({
    queryKey: [`/api/platform/analytics/feature-usage`, days, selectedAcademyId],
    queryFn: async ({ queryKey }) => {
      const daysVal = queryKey[1];
      const academyId = queryKey[2];
      const url = new URL(`/api/platform/analytics/feature-usage`, getApiUrl());
      url.searchParams.set("days", String(daysVal));
      if (academyId) url.searchParams.set("academyId", String(academyId));
      const res = await fetch(url.toString(), { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch feature usage");
      return res.json();
    },
    staleTime: 1000 * 60 * 2,
  });

  const periodOptions = [
    { label: "Today", value: 1 },
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
  ];

  const CATEGORY_CONFIG: { prefix: string[]; label: string; color: string }[] = [
    { prefix: ["tab:"], label: "Navigation", color: PLATFORM_PURPLE },
    { prefix: ["action:"], label: "Quick Actions", color: "#3498DB" },
    { prefix: ["screen:"], label: "Screens", color: "#1ABC9C" },
    { prefix: ["progress:", "home:"], label: "Progress & Home", color: Colors.dark.xpCyan },
    { prefix: ["quests:"], label: "Quests", color: "#F39C12" },
    { prefix: ["collection:"], label: "Collection", color: "#9B59B6" },
    { prefix: ["tournaments:", "ladder:"], label: "Competition", color: "#E74C3C" },
    { prefix: ["community:"], label: "Social", color: "#2ECC71" },
    { prefix: ["schedule:", "booking:", "match:"], label: "Schedule & Booking", color: "#E67E22" },
  ];

  const getCategoryColor = (feature: string) => {
    for (const cat of CATEGORY_CONFIG) {
      if (cat.prefix.some(p => feature.startsWith(p))) return cat.color;
    }
    return Colors.dark.xpCyan;
  };

  const getCategoryLabel = (feature: string) => {
    for (const cat of CATEGORY_CONFIG) {
      if (cat.prefix.some(p => feature.startsWith(p))) return cat.label;
    }
    return "Other";
  };

  const features = data?.features || [];

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerActivity", { initialTab: "features" });
  };

  type GroupedFeatures = { category: string; color: string; items: (FeatureUsageItem & { globalIndex: number })[] };
  const groupedFeatures = useMemo<GroupedFeatures[]>(() => {
    const groups = new Map<string, GroupedFeatures>();
    features.forEach((item, idx) => {
      const catLabel = getCategoryLabel(item.feature);
      const catColor = getCategoryColor(item.feature);
      if (!groups.has(catLabel)) {
        groups.set(catLabel, { category: catLabel, color: catColor, items: [] });
      }
      groups.get(catLabel)!.items.push({ ...item, globalIndex: idx });
    });
    return Array.from(groups.values());
  }, [features]);

  return (
    <View style={styles.section}>
      <View style={fuStyles.header}>
        <Pressable style={fuStyles.titleRow} onPress={handleSeeAll} hitSlop={8}>
          <Ionicons name="analytics" size={16} color={PLATFORM_PURPLE} />
          <Text style={styles.sectionTitle}>Feature Usage</Text>
          <Ionicons name="chevron-forward" size={14} color={PLATFORM_PURPLE} style={{ marginLeft: 2 }} />
        </Pressable>
        <View style={fuStyles.periodRow}>
          {periodOptions.map((opt) => (
            <Pressable
              key={opt.value}
              style={[fuStyles.periodBtn, days === opt.value && fuStyles.periodBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDays(opt.value);
              }}
            >
              <Text style={[fuStyles.periodBtnText, days === opt.value && fuStyles.periodBtnTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {academies.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={fuStyles.academyFilterScroll}
          contentContainerStyle={fuStyles.academyFilterContent}
        >
          <Pressable
            style={[fuStyles.academyPill, selectedAcademyId === null && fuStyles.academyPillActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedAcademyId(null);
            }}
          >
            <Text style={[fuStyles.academyPillText, selectedAcademyId === null && fuStyles.academyPillTextActive]}>
              All Academies
            </Text>
          </Pressable>
          {academies.map((academy) => (
            <Pressable
              key={academy.id}
              style={[fuStyles.academyPill, selectedAcademyId === academy.id && fuStyles.academyPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedAcademyId(academy.id);
              }}
            >
              <Text style={[fuStyles.academyPillText, selectedAcademyId === academy.id && fuStyles.academyPillTextActive]}>
                {academy.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={fuStyles.card}>
        {isLoading ? (
          <View style={fuStyles.loadingContainer}>
            <ActivityIndicator size="small" color={PLATFORM_PURPLE} />
            <Text style={fuStyles.emptyText}>Loading usage data...</Text>
          </View>
        ) : features.length === 0 ? (
          <View style={fuStyles.loadingContainer}>
            <Ionicons name="bar-chart-outline" size={28} color={Colors.dark.textMuted} />
            <Text style={fuStyles.emptyText}>No events recorded yet</Text>
            <Text style={fuStyles.emptySubText}>Events appear as players use the app</Text>
          </View>
        ) : (
          groupedFeatures.map((group) => (
            <View key={group.category}>
              <View style={[fuStyles.categoryHeader, { borderLeftColor: group.color }]}>
                <Text style={[fuStyles.categoryLabel, { color: group.color }]}>{group.category}</Text>
              </View>
              {group.items.map((item, indexInGroup) => {
                const label = FEATURE_LABEL_MAP[item.feature] || item.feature;
                const barColor = group.color;
                const isLastInGroup = indexInGroup === group.items.length - 1;
                return (
                  <View key={item.feature} style={[fuStyles.row, !isLastInGroup && fuStyles.rowBorder]}>
                    <View style={fuStyles.rowLeft}>
                      <View style={[fuStyles.rankBadge, { backgroundColor: `${barColor}18` }]}>
                        <Text style={[fuStyles.rankText, { color: barColor }]}>{item.globalIndex + 1}</Text>
                      </View>
                      <Text style={fuStyles.featureLabel} numberOfLines={1}>{label}</Text>
                    </View>
                    <View style={fuStyles.rowRight}>
                      <View style={fuStyles.barTrack}>
                        <View style={[fuStyles.barFill, { width: `${Math.max(item.intensity * 100, 4)}%` as DimensionValue, backgroundColor: barColor }]} />
                      </View>
                      <Text style={fuStyles.countText}>{item.total}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
        {features.length > 0 && (
          <Pressable style={fuStyles.seeAllBtn} onPress={handleSeeAll}>
            <Text style={fuStyles.seeAllText}>See full report →</Text>
            <Ionicons name="arrow-forward" size={13} color={PLATFORM_PURPLE} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

interface MarketplaceStats {
  publicSeriesCount: number;
  dropInBookingsThisMonth: number;
  dropInRevenueThisMonth: number;
  topAcademiesByDropIn: {
    academyId: string | null;
    academyName: string;
    dropInCount: number;
  }[];
}

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
  academies: {
    id: string;
    name: string;
    players: number;
    coaches: number;
    mrr: number;
    healthScore: number;
    status: "healthy" | "warning" | "critical" | "trial" | "paused";
  }[];
  weekActivity: {
    day: string;
    intensity: number;
  }[];
  insights: {
    id: string;
    type: string;
    title: string;
    description: string;
    change?: number;
  }[];
  alerts: {
    type: "warning" | "error" | "info";
    title: string;
    description: string;
  }[];
  marketplace?: MarketplaceStats;
}

const MARKETPLACE_GREEN = "#2ECC71";

function MarketplaceCard({ marketplace, currency }: { marketplace?: MarketplaceStats; currency: string }) {
  const stats = marketplace || {
    publicSeriesCount: 0,
    dropInBookingsThisMonth: 0,
    dropInRevenueThisMonth: 0,
    topAcademiesByDropIn: [],
  };
  const topAcademy = stats.topAcademiesByDropIn?.[0];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="storefront" size={16} color={MARKETPLACE_GREEN} />
          <Text style={styles.sectionTitle}>Marketplace</Text>
        </View>
      </View>
      <View style={mkStyles.card}>
        <View style={mkStyles.row}>
          <View style={mkStyles.statBox}>
            <Text style={mkStyles.statValue}>{stats.publicSeriesCount}</Text>
            <Text style={mkStyles.statLabel}>Public listings</Text>
          </View>
          <View style={mkStyles.divider} />
          <View style={mkStyles.statBox}>
            <Text style={mkStyles.statValue}>{stats.dropInBookingsThisMonth}</Text>
            <Text style={mkStyles.statLabel}>Drop-in bookings</Text>
            <Text style={mkStyles.statSub}>this month</Text>
          </View>
          <View style={mkStyles.divider} />
          <View style={mkStyles.statBox}>
            <Text style={mkStyles.statValue}>
              {currency} {stats.dropInRevenueThisMonth.toLocaleString()}
            </Text>
            <Text style={mkStyles.statLabel}>Platform revenue</Text>
          </View>
        </View>
        {topAcademy ? (
          <View style={mkStyles.topAcademyRow}>
            <Ionicons name="trophy" size={13} color={MARKETPLACE_GREEN} />
            <Text style={mkStyles.topAcademyText}>
              Top academy: <Text style={mkStyles.topAcademyName}>{topAcademy.academyName}</Text>
              {" "}({topAcademy.dropInCount} bookings)
            </Text>
          </View>
        ) : (
          <View style={mkStyles.topAcademyRow}>
            <Ionicons name="information-circle-outline" size={13} color={Colors.dark.textMuted} />
            <Text style={mkStyles.noDataText}>No drop-in bookings recorded yet this month</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const mkStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.cardElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${MARKETPLACE_GREEN}22`,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.border,
  },
  statValue: {
    ...Typography.h3,
    color: MARKETPLACE_GREEN,
    fontWeight: "700",
    fontSize: 16,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginTop: 2,
    fontSize: 11,
  },
  statSub: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
    textAlign: "center",
  },
  topAcademyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  topAcademyText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  topAcademyName: {
    color: MARKETPLACE_GREEN,
    fontWeight: "600",
  },
  noDataText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
});

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

// Task #1095 — read-only tile that surfaces aggregate "Notify me" interest
// counts to the platform owner. Today we only track one feature key
// ("online_card_payments"); when more coming-soon teasers are added the tile
// can grow into a list.
function FeatureInterestTile() {
  const navigation = useNavigation<NativeStackNavigationProp<PlatformStackParamList>>();
  const { data } = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["/api/platform/feature-interest/counts"],
    staleTime: 60_000,
  });
  const onlineCardCount = data?.counts?.online_card_payments ?? 0;

  // Task #1097 — tile is now a drill-down entry point into the full
  // feature_interest list (filterable + CSV export).
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("FeatureInterest");
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Coming-soon interest</Text>
      <Pressable style={styles.featureInterestCard} onPress={handlePress}>
        <View style={[styles.featureInterestIcon, { backgroundColor: `${PLATFORM_PURPLE}15` }]}>
          <Ionicons name="card" size={22} color={PLATFORM_PURPLE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.featureInterestLabel}>
            Online payments
          </Text>
          <Text style={styles.featureInterestSub}>
            {onlineCardCount === 1
              ? "1 player waiting · tap to view"
              : `${onlineCardCount} players waiting · tap to view`}
          </Text>
        </View>
        <Text style={styles.featureInterestValue}>{onlineCardCount}</Text>
        <Ionicons name="chevron-forward" size={16} color={PLATFORM_PURPLE} style={{ marginLeft: 4 }} />
      </Pressable>
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
        

        {/* Task #1095 — coming-soon interest tile. Counts players who tapped
            "Notify me" on the online-card-payments teaser. Read-only. */}
        <FeatureInterestTile />

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

        <MarketplaceCard marketplace={platformData?.marketplace} currency={currency} />

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

        <FeatureUsageCard academies={(platformData?.academies || []).map(a => ({ id: a.id, name: a.name }))} />

        <BetaFeedbackPanel />

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
  featureInterestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  featureInterestIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  featureInterestLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  featureInterestSub: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  featureInterestValue: {
    fontSize: 24,
    fontWeight: "800",
    color: PLATFORM_PURPLE,
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

const fuStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  periodRow: {
    flexDirection: "row",
    gap: 4,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  periodBtnActive: {
    backgroundColor: `${PLATFORM_PURPLE}20`,
    borderColor: PLATFORM_PURPLE,
  },
  periodBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  periodBtnTextActive: {
    color: PLATFORM_PURPLE,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  emptySubText: {
    ...Typography.small,
    color: Colors.dark.textSubtle,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 11,
    fontWeight: "700",
  },
  featureLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontSize: 13,
    flex: 1,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: 120,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  countText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 30,
    textAlign: "right",
    fontWeight: "600",
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: PLATFORM_PURPLE,
  },
  categoryHeader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderLeftWidth: 3,
    marginLeft: 0,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  academyFilterScroll: {
    marginBottom: Spacing.sm,
  },
  academyFilterContent: {
    flexDirection: "row",
    gap: Spacing.xs,
    paddingHorizontal: 2,
  },
  academyPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  academyPillActive: {
    backgroundColor: `${PLATFORM_PURPLE}20`,
    borderColor: PLATFORM_PURPLE,
  },
  academyPillText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  academyPillTextActive: {
    color: PLATFORM_PURPLE,
    fontWeight: "600",
  },
});
