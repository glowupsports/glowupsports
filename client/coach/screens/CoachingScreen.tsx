import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { styles } from "./coaching/coachingStyles";
import type { TabType, ProgressTrend, EffortLevel } from "./coaching/types";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { SeriesTab } from "./coaching/SeriesTab";
import { WeekPlannerTab } from "./coaching/WeekPlannerTab";
import { RosterPlannerTab } from "./coaching/RosterPlannerTab";
import { TodayFeedbackTab } from "./coaching/TodayFeedbackTab";
import { ProgressTab } from "./coaching/ProgressTab";
import { PlansTab } from "./coaching/PlansTab";
import { GlowLevelsTab } from "./coaching/GlowLevelsTab";
import { TemplatesTab } from "./coaching/TemplatesTab";
import { LevelCardsTab } from "./coaching/LevelCardsTab";
import { MatchLogTab } from "./coaching/MatchLogTab";
import { SessionPlanTab } from "./coaching/SessionPlanTab";
import { DrillBankTab } from "./coaching/DrillBankTab";

const TAB_BAR_HEIGHT = 80;

export default function CoachingScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [activeTab, setActiveTab] = useState<TabType>("series");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { coach } = useCoach();
  const { registerTabCallback } = useTabNavigation();
  const queryClient = useQueryClient();

  // Warm the Players-tab queries the moment the Coaching tab gains
  // focus so tapping into Players opens instantly from cache. The
  // staleTime on those queries (60s) keeps this cheap on rapid
  // navigations.
  useFocusEffect(
    React.useCallback(() => {
      const keys = [
        "/api/players?withCredits=true",
        "/api/players?withCredits=true&status=inactive",
        "/api/players?withCredits=true&status=pending_payment",
      ];
      keys.forEach((k) => {
        queryClient.prefetchQuery({ queryKey: [k] }).catch(() => {});
      });
    }, [queryClient]),
  );

  useEffect(() => {
    const unregister = registerTabCallback("Coaching", (screen: string) => {
      if (screen === "feedback" || screen === "today") {
        setActiveTab("today");
      }
    });
    return unregister;
  }, [registerTabCallback]);

  useEffect(() => {
    if (route.params?.openTab) {
      setActiveTab(route.params.openTab as TabType);
    }
  }, [route.params?.openTab]);

  const { data: xpData } = useQuery<{ level: number; totalXp: number; currentLevelXp: number; nextLevelXp: number; xpProgress: number }>({
    queryKey: [`/api/coach/${coach?.id}/xp`],
    enabled: !!coach?.id,
  });

  const { data: statsData } = useQuery<{ sessionsCount: number; playersCount: number }>({
    queryKey: [`/api/coach/${coach?.id}/stats`],
    enabled: !!coach?.id,
  });

  const { data: pendingActions } = useQuery<{
    pendingRatings: number;
    trialReady: number;
    newReviews: number;
  }>({
    queryKey: [`/api/coach/pending-actions`],
    enabled: !!coach?.id,
    staleTime: 60000,
  });

  const headerPulse = useSharedValue(0.4);
  const iconGlow = useSharedValue(1);

  useEffect(() => {
    headerPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    iconGlow.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const headerGlowStyle = useAnimatedStyle(() => ({
    opacity: headerPulse.value,
  }));

  const iconPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconGlow.value }],
  }));

  const hasPendingActions =
    !bannerDismissed &&
    ((pendingActions?.pendingRatings ?? 0) > 0 ||
      (pendingActions?.trialReady ?? 0) > 0 ||
      (pendingActions?.newReviews ?? 0) > 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundRoot]}
        style={StyleSheet.absoluteFill}
      />

      {/* Compact Header */}
      <View style={styles.compactHeader}>
        <View style={styles.compactHeaderLeft}>
          <View style={styles.compactLevelBadge}>
            <Text style={styles.compactLevelText}>{xpData?.level ?? coach?.level ?? 1}</Text>
          </View>
          <View>
            <Text style={styles.compactTitle}>COACHING HQ</Text>
            <View style={styles.compactXpRow}>
              <View style={styles.compactXpBar}>
                <View style={[styles.compactXpFill, { width: `${xpData?.xpProgress ?? 65}%` }]} />
              </View>
              <Text style={styles.compactXpText}>{(xpData?.totalXp ?? coach?.totalXp ?? 0).toLocaleString()} XP</Text>
            </View>
          </View>
        </View>
        <View style={styles.compactHeaderRight}>
          <Text style={styles.compactStatValue}>{statsData?.sessionsCount ?? 0}</Text>
          <Text style={styles.compactStatLabel}>SESSIONS</Text>
        </View>
      </View>

      {/* Pending Actions Banner (A4) */}
      {hasPendingActions ? (
        <View style={localStyles.pendingBanner}>
          <View style={localStyles.pendingBannerContent}>
            <Text style={localStyles.pendingBannerTitle}>Today's Actions</Text>
            <View style={localStyles.pendingBannerItems}>
              {(pendingActions?.pendingRatings ?? 0) > 0 ? (
                <Pressable
                  style={localStyles.pendingItem}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveTab("today");
                  }}
                >
                  <Ionicons name="time-outline" size={12} color={Colors.dark.gold} />
                  <Text style={localStyles.pendingItemText}>
                    {pendingActions!.pendingRatings} session{pendingActions!.pendingRatings !== 1 ? "s" : ""} need ratings
                  </Text>
                </Pressable>
              ) : null}
              {(pendingActions?.trialReady ?? 0) > 0 ? (
                <Pressable
                  style={localStyles.pendingItem}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveTab("levels");
                  }}
                >
                  <Ionicons name="star-outline" size={12} color={Colors.dark.successNeon} />
                  <Text style={localStyles.pendingItemText}>
                    {pendingActions!.trialReady} player{pendingActions!.trialReady !== 1 ? "s" : ""} ready for trial
                  </Text>
                </Pressable>
              ) : null}
              {(pendingActions?.newReviews ?? 0) > 0 ? (
                <Pressable
                  style={localStyles.pendingItem}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate("MyReviews");
                  }}
                >
                  <Ionicons name="star-half-outline" size={12} color={Colors.dark.xpCyan} />
                  <Text style={localStyles.pendingItemText}>
                    {pendingActions!.newReviews} new player review{pendingActions!.newReviews !== 1 ? "s" : ""}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Pressable
            onPress={() => setBannerDismissed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Category: PLANNING TOOLS */}
      <View style={localStyles.categoryHeader}>
        <Text style={localStyles.categoryLabel}>PLANNING TOOLS</Text>
      </View>

      {/* Compact Pill Tabs */}
      <View style={styles.pillTabContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillTabScroll}
        >
          {([
            { id: "series", label: "Classes", icon: "layers", color: Colors.dark.xpCyan },
            { id: "weekPlanner", label: "Week View", icon: "calendar-outline", color: Colors.dark.primary },
            { id: "roster", label: "Roster", icon: "people-outline", color: "#FF8C00" },
            { id: "plans", label: "Plans", icon: "bulb", color: Colors.dark.gold },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.pillTab, isActive && styles.pillTabActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(tab.id);
                }}
              >
                <View style={[
                  styles.pillTabIconContainer,
                  { backgroundColor: isActive ? (tab.color + "30") : Colors.dark.backgroundSecondary }
                ]}>
                  <Ionicons
                    name={tab.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={isActive ? tab.color : Colors.dark.textMuted}
                  />
                </View>
                <Text style={[styles.pillTabText, isActive && styles.pillTabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Category: FEEDBACK & ASSESSMENT */}
      <View style={localStyles.categoryHeader}>
        <Text style={localStyles.categoryLabel}>FEEDBACK & ASSESSMENT</Text>
      </View>

      {/* Feedback & Assessment Tools Row */}
      <View style={styles.glowToolsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.glowToolsScroll}
        >
          <Pressable
            style={[styles.glowToolButton, (activeTab === "today" || activeTab === "feedback") && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "today" ? "series" : "today");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.successNeon + "20" }, (activeTab === "today" || activeTab === "feedback") && { backgroundColor: Colors.dark.successNeon + "40" }]}>
              <Ionicons name="star-outline" size={18} color={Colors.dark.successNeon} />
            </View>
            <Text style={[styles.glowToolLabel, (activeTab === "today" || activeTab === "feedback") && { color: Colors.dark.successNeon }]}>Rate Sessions</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "progress" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "progress" ? "series" : "progress");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.xpCyan + "20" }, activeTab === "progress" && { backgroundColor: Colors.dark.xpCyan + "40" }]}>
              <Ionicons name="trending-up-outline" size={18} color={Colors.dark.xpCyan} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "progress" && { color: Colors.dark.xpCyan }]}>Progress</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "levels" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "levels" ? "series" : "levels");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.gold + "20" }, activeTab === "levels" && { backgroundColor: Colors.dark.gold + "40" }]}>
              <Ionicons name="trophy-outline" size={18} color={Colors.dark.gold} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "levels" && { color: Colors.dark.gold }]}>Glow Levels</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Category: CONTENT TOOLS */}
      <View style={localStyles.categoryHeader}>
        <Text style={localStyles.categoryLabel}>CONTENT TOOLS</Text>
      </View>

      {/* Glow Tools Quick Access Row */}
      <View style={styles.glowToolsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.glowToolsScroll}
        >
          <Pressable
            style={[styles.glowToolButton, activeTab === "templates" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "templates" ? "series" : "templates");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.xpCyan + "20" }, activeTab === "templates" && { backgroundColor: Colors.dark.xpCyan + "40" }]}>
              <Ionicons name="book-outline" size={18} color={Colors.dark.xpCyan} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "templates" && { color: Colors.dark.xpCyan }]}>Templates</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "levelCards" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "levelCards" ? "series" : "levelCards");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.primary + "20" }, activeTab === "levelCards" && { backgroundColor: Colors.dark.primary + "40" }]}>
              <Ionicons name="layers-outline" size={18} color={Colors.dark.primary} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "levelCards" && { color: Colors.dark.primary }]}>Level Cards</Text>
          </Pressable>

          <Pressable
            style={styles.glowToolButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("EvidenceCapture", {});
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.successNeon + "20" }]}>
              <Ionicons name="videocam-outline" size={18} color={Colors.dark.successNeon} />
            </View>
            <Text style={styles.glowToolLabel}>Evidence</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "matchLog" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "matchLog" ? "series" : "matchLog");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.orange + "20" }, activeTab === "matchLog" && { backgroundColor: Colors.dark.orange + "40" }]}>
              <Ionicons name="tennisball-outline" size={18} color={Colors.dark.orange} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "matchLog" && { color: Colors.dark.orange }]}>Match Log</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "sessionPlan" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "sessionPlan" ? "series" : "sessionPlan");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: Colors.dark.gold + "20" }, activeTab === "sessionPlan" && { backgroundColor: Colors.dark.gold + "40" }]}>
              <Ionicons name="clipboard-outline" size={18} color={Colors.dark.gold} />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "sessionPlan" && { color: Colors.dark.gold }]}>Session Plan</Text>
          </Pressable>

          <Pressable
            style={[styles.glowToolButton, activeTab === "drillBank" && styles.glowToolButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(activeTab === "drillBank" ? "series" : "drillBank");
            }}
          >
            <View style={[styles.glowToolIcon, { backgroundColor: "#A855F720" }, activeTab === "drillBank" && { backgroundColor: "#A855F740" }]}>
              <Ionicons name="barbell-outline" size={18} color="#A855F7" />
            </View>
            <Text style={[styles.glowToolLabel, activeTab === "drillBank" && { color: "#A855F7" }]}>Drill Bank</Text>
          </Pressable>
        </ScrollView>
      </View>

      {activeTab === "series" ? (
        <SeriesTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "weekPlanner" ? (
        <WeekPlannerTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "roster" ? (
        <RosterPlannerTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "feedback" ? (
        <TodayFeedbackTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "today" ? (
        <TodayFeedbackTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "progress" ? (
        <ProgressTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "plans" ? (
        <PlansTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "levels" ? (
        <GlowLevelsTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "templates" ? (
        <TemplatesTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "levelCards" ? (
        <LevelCardsTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "matchLog" ? (
        <MatchLogTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "sessionPlan" ? (
        <SessionPlanTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : activeTab === "drillBank" ? (
        <DrillBankTab insets={insets} tabBarHeight={tabBarHeight} />
      ) : (
        <SeriesTab insets={insets} tabBarHeight={tabBarHeight} />
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.gold,
    gap: Spacing.sm,
  },
  pendingBannerContent: {
    flex: 1,
  },
  pendingBannerTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.gold,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  pendingBannerItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  pendingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pendingItemText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  categoryHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: 2,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
  },
});

interface SessionPlayer {
  id: string;
  playerId: string;
  player: { id: string; name: string; ballLevel: string | null };
}

type SkillChipState = "stable" | "up" | "down";

interface SkillProgress {
  [skill: string]: SkillChipState;
}

type QuickSignal = "focused" | "smart_decisions" | "good_teammate" | "took_initiative" | "showed_respect" | "listened_well" | "fair_play";
type SocialIssue = "disruptive" | "poor_attitude" | "disrespect";

interface PlayerFeedbackState {
  playerId: string;
  playerName: string;
  progressTrend: ProgressTrend;
  effortLevel: EffortLevel;
  note: string;
  skillProgress: SkillProgress;
  quickSignals: QuickSignal[];
  socialIssue: SocialIssue | null;
}

interface DomainImpact {
  technical: "up" | "stable" | "down";
  mental: "up" | "stable" | "down";
  physical: "up" | "stable" | "down";
  social: "up" | "stable" | "down";
  tactical: "up" | "stable" | "down";
}

// XP rewards for providing feedback (to motivate coaches)
// Values based on session complexity and player count
