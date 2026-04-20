import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { getApiUrl } from "@/lib/query-client";
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
import { CoachingScrollProvider } from "./coaching/CoachingScrollContext";

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

  // Collapsible tools strip state (persisted per coach)
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const [stripNaturalHeight, setStripNaturalHeight] = useState(0);
  const stripProgress = useSharedValue(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let local: boolean | null = null;
      try {
        const v = await AsyncStorage.getItem(COACH_HQ_TOOLS_STORAGE_KEY);
        if (v !== null) {
          local = v === "true";
          if (!cancelled) {
            setToolsCollapsed(local);
            stripProgress.value = local ? 0 : 1;
          }
        }
      } catch {}

      try {
        const token = await AsyncStorage.getItem("authToken");
        if (!token || cancelled) return;
        const res = await fetch(
          new URL("/api/user/onboarding-state", getApiUrl()).toString(),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const server = data?.state?.[COACH_HQ_TOOLS_SERVER_KEY];
        if (typeof server === "boolean") {
          if (cancelled) return;
          setToolsCollapsed(server);
          stripProgress.value = withTiming(server ? 0 : 1, { duration: 220 });
          AsyncStorage.setItem(
            COACH_HQ_TOOLS_STORAGE_KEY,
            String(server),
          ).catch(() => {});
        } else if (local !== null) {
          persistToolsCollapsed(local);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistToolsCollapsed = async (v: boolean) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      await fetch(
        new URL("/api/user/onboarding-state", getApiUrl()).toString(),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: COACH_HQ_TOOLS_SERVER_KEY,
            value: v,
          }),
        },
      );
    } catch {}
  };

  const toggleToolsCollapsed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // If the strip is only auto-hidden (manual pref still expanded),
    // a header tap should just reveal it again — without persisting a
    // new collapsed preference.
    if (autoHiddenRef.current && !toolsCollapsed) {
      autoHiddenRef.current = false;
      setAutoHidden(false);
      lastScrollDirRef.current = null;
      lastScrollYRef.current = 0;
      stripProgress.value = withTiming(1, { duration: 220 });
      return;
    }
    const next = !toolsCollapsed;
    setToolsCollapsed(next);
    stripProgress.value = withTiming(next ? 0 : 1, { duration: 220 });
    autoHiddenRef.current = false;
    setAutoHidden(false);
    lastScrollDirRef.current = null;
    lastScrollYRef.current = 0;
    AsyncStorage.setItem(COACH_HQ_TOOLS_STORAGE_KEY, String(next)).catch(
      () => {},
    );
    persistToolsCollapsed(next);
  };

  // Auto-hide on scroll (does not overwrite persisted preference)
  const lastScrollYRef = useRef(0);
  const lastScrollDirRef = useRef<"up" | "down" | null>(null);
  const autoHiddenRef = useRef(false);
  const [autoHidden, setAutoHidden] = useState(false);

  const handleTabScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Manual collapse takes precedence — leave the strip closed.
      if (toolsCollapsed) return;

      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastScrollYRef.current;
      lastScrollYRef.current = y;

      // Ignore tiny jitters and overscroll bounces.
      if (Math.abs(dy) < 4) return;

      if (dy > 0 && y > 16) {
        if (lastScrollDirRef.current !== "down") {
          lastScrollDirRef.current = "down";
          if (!autoHiddenRef.current) {
            autoHiddenRef.current = true;
            setAutoHidden(true);
            stripProgress.value = withTiming(0, { duration: 220 });
          }
        }
      } else if (dy < 0) {
        if (lastScrollDirRef.current !== "up") {
          lastScrollDirRef.current = "up";
          if (autoHiddenRef.current) {
            autoHiddenRef.current = false;
            setAutoHidden(false);
            stripProgress.value = withTiming(1, { duration: 220 });
          }
        }
      }
    },
    [toolsCollapsed, stripProgress],
  );

  // Reset auto-hide state when switching tabs so the new tab opens
  // with the strip visible (unless the user manually collapsed it).
  useEffect(() => {
    lastScrollYRef.current = 0;
    lastScrollDirRef.current = null;
    if (autoHiddenRef.current && !toolsCollapsed) {
      autoHiddenRef.current = false;
      setAutoHidden(false);
      stripProgress.value = withTiming(1, { duration: 220 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const onStripLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && stripNaturalHeight === 0) {
      setStripNaturalHeight(h);
    }
  };

  const stripAnimStyle = useAnimatedStyle(() => ({
    height:
      stripNaturalHeight === 0
        ? undefined
        : stripProgress.value * stripNaturalHeight,
    opacity:
      stripNaturalHeight === 0
        ? toolsCollapsed
          ? 0
          : 1
        : stripProgress.value,
  }));

  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${stripProgress.value * 180}deg` }],
  }));

  const handleToolPress = (tool: ToolItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tool.id === "evidence") {
      navigation.navigate("EvidenceCapture", {});
      return;
    }
    if (!tool.tabId) return;
    if (tool.togglesToSeries) {
      const isOn = tool.isActive
        ? tool.isActive(activeTab)
        : activeTab === tool.tabId;
      setActiveTab(isOn ? "series" : tool.tabId);
    } else {
      setActiveTab(tool.tabId);
    }
  };

  const isToolActive = (tool: ToolItem): boolean => {
    if (tool.isActive) return tool.isActive(activeTab);
    if (tool.tabId) return activeTab === tool.tabId;
    return false;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundRoot]}
        style={StyleSheet.absoluteFill}
      />

      {/* Compact Header (tap to collapse/expand tools) */}
      <Pressable
        onPress={toggleToolsCollapsed}
        style={styles.compactHeader}
        accessibilityRole="button"
        accessibilityLabel={
          toolsCollapsed || autoHidden
            ? "Expand coaching tools"
            : "Collapse coaching tools"
        }
        accessibilityState={{ expanded: !toolsCollapsed && !autoHidden }}
      >
        <View style={styles.compactHeaderLeft}>
          <View style={styles.compactLevelBadge}>
            <Text style={styles.compactLevelText}>{xpData?.level ?? coach?.level ?? 1}</Text>
          </View>
          <View>
            <View style={localStyles.titleRow}>
              <Text style={styles.compactTitle}>COACHING HQ</Text>
              <Animated.View style={chevronAnimStyle}>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={Colors.dark.textMuted}
                />
              </Animated.View>
            </View>
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
      </Pressable>

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

      {/* Unified collapsible tools strip (all 12 tools, grouped) */}
      <Animated.View
        style={[styles.pillTabContainer, localStyles.toolsStripWrap, stripAnimStyle]}
      >
        <View
          onLayout={onStripLayout}
          style={
            stripNaturalHeight === 0
              ? undefined
              : localStyles.toolsStripInnerAbsolute
          }
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillTabScroll}
          >
            {COACH_HQ_TOOLS.map((tool, idx) => {
              const prev = COACH_HQ_TOOLS[idx - 1];
              const showDivider = !!prev && prev.group !== tool.group;
              const active = isToolActive(tool);
              return (
                <React.Fragment key={tool.id}>
                  {showDivider ? (
                    <View style={localStyles.groupDivider} />
                  ) : null}
                  <Pressable
                    style={[styles.pillTab, active && styles.pillTabActive]}
                    onPress={() => handleToolPress(tool)}
                  >
                    <View
                      style={[
                        styles.pillTabIconContainer,
                        {
                          backgroundColor: active
                            ? tool.color + "30"
                            : Colors.dark.backgroundSecondary,
                        },
                      ]}
                    >
                      <Ionicons
                        name={tool.icon as keyof typeof Ionicons.glyphMap}
                        size={14}
                        color={active ? tool.color : Colors.dark.textMuted}
                      />
                    </View>
                    <Text
                      style={[
                        styles.pillTabText,
                        active && styles.pillTabTextActive,
                        active && { color: tool.color },
                      ]}
                    >
                      {tool.label}
                    </Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>

      <CoachingScrollProvider value={handleTabScroll}>
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
      </CoachingScrollProvider>
    </View>
  );
}

const COACH_HQ_TOOLS_STORAGE_KEY = "@glow_coach_hq_tools_collapsed";
const COACH_HQ_TOOLS_SERVER_KEY = "coach_hq_tools_collapsed";

type ToolGroup = "planning" | "feedback" | "content";

interface ToolItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  group: ToolGroup;
  tabId?: TabType;
  togglesToSeries?: boolean;
  isActive?: (a: TabType) => boolean;
}

const COACH_HQ_TOOLS: ToolItem[] = [
  { id: "series", label: "Classes", icon: "layers", color: Colors.dark.xpCyan, group: "planning", tabId: "series" },
  { id: "weekPlanner", label: "Week View", icon: "calendar-outline", color: Colors.dark.primary, group: "planning", tabId: "weekPlanner" },
  { id: "roster", label: "Roster", icon: "people-outline", color: "#FF8C00", group: "planning", tabId: "roster" },
  { id: "plans", label: "Plans", icon: "bulb", color: Colors.dark.gold, group: "planning", tabId: "plans" },
  {
    id: "today",
    label: "Rate Sessions",
    icon: "star-outline",
    color: Colors.dark.successNeon,
    group: "feedback",
    tabId: "today",
    togglesToSeries: true,
    isActive: (a) => a === "today" || a === "feedback",
  },
  { id: "progress", label: "Progress", icon: "trending-up-outline", color: Colors.dark.xpCyan, group: "feedback", tabId: "progress", togglesToSeries: true },
  { id: "levels", label: "Glow Levels", icon: "trophy-outline", color: Colors.dark.gold, group: "feedback", tabId: "levels", togglesToSeries: true },
  { id: "templates", label: "Templates", icon: "book-outline", color: Colors.dark.xpCyan, group: "content", tabId: "templates", togglesToSeries: true },
  { id: "levelCards", label: "Level Cards", icon: "layers-outline", color: Colors.dark.primary, group: "content", tabId: "levelCards", togglesToSeries: true },
  { id: "evidence", label: "Evidence", icon: "videocam-outline", color: Colors.dark.successNeon, group: "content" },
  { id: "matchLog", label: "Match Log", icon: "tennisball-outline", color: Colors.dark.orange, group: "content", tabId: "matchLog", togglesToSeries: true },
  { id: "sessionPlan", label: "Session Plan", icon: "clipboard-outline", color: Colors.dark.gold, group: "content", tabId: "sessionPlan", togglesToSeries: true },
  { id: "drillBank", label: "Drill Bank", icon: "barbell-outline", color: "#A855F7", group: "content", tabId: "drillBank", togglesToSeries: true },
];

const localStyles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolsStripWrap: {
    overflow: "hidden",
  },
  toolsStripInnerAbsolute: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  groupDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginHorizontal: Spacing.xs,
    marginVertical: Spacing.xs,
  },
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
