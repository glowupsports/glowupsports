import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ObservationTrendChart } from "@/components/ObservationTrendChart";
import { NeoLoadoutPanel, NeoGlowBadge } from "@/components/NeoLoadoutPanel";

interface ProgressSummary {
  skillArea: string;
  avgRating: number;
  trend: string;
}

interface PlayerWithProgress {
  id: string;
  name: string;
  ballLevel: string | null;
  progressSummary: ProgressSummary[];
  totalNotes: number;
  totalXp: number;
  recentNote?: {
    content: string;
    category: string | null;
    createdAt: string | null;
  };
}

type TabType = "today" | "progress" | "plans";
type ProgressTrend = "up" | "stable" | "down";
type EffortLevel = "high" | "normal" | "low";
type Intensity = "light" | "normal" | "intense";

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
}

interface SessionFeedback {
  sessionId: string;
  intensity: Intensity;
  focusTags: string[];
  generalNote: string;
  playerFeedback: PlayerFeedback[];
}

interface PlayerFeedback {
  playerId: string;
  playerName: string;
  progressTrend: ProgressTrend;
  effortLevel: EffortLevel;
  note: string;
}

interface SkillDomain {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  icon: string | null;
  sortOrder: number | null;
}

interface PlayerSkillState {
  id: string;
  playerId: string;
  domainId: string;
  progressValue: number;
  trend: string | null;
  momentum: string | null;
  confidenceScore: number | null;
  assessmentStatus: string | null;
  isFrozen: boolean | null;
  domain: SkillDomain | null;
  domainXp: number;
  observationCount: number;
  avgDelta: number;
  lastObservation: string | null;
}

interface PlayerXpData {
  totalXp: number;
  transactions: { id: string; xpAmount: number; source: string; description: string | null; createdAt: string }[];
}

interface ObservationTrend {
  domainId: string;
  history: { date: string; delta: number; direction: string }[];
  streakUp: number;
  streakDown: number;
  hasSpeedrunWarning: boolean;
  improvementRate: number;
  hasData: boolean;
  domain?: SkillDomain | null;
}

export default function CoachingScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("today");

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      {/* HUD Command Header - EPIC tier (only this section has glow) */}
      <View style={styles.hudHeader}>
        <NeoLoadoutPanel 
          variant="header" 
          accentColor={Colors.dark.primary}
          tone="epic"
          enableGlow={true}
          enableSweep={true}
          style={styles.headerPanel}
        >
          <View style={styles.hudHeaderContent}>
            {/* Left: Animated Academy Sigil */}
            <View style={styles.hudSigilContainer}>
              <NeoGlowBadge size={42} accentColor={Colors.dark.primary}>
                <Animated.View style={iconPulseStyle}>
                  <Ionicons name="tennisball" size={22} color={Colors.dark.backgroundRoot} />
                </Animated.View>
              </NeoGlowBadge>
            </View>

            {/* Center: Title with glowing effect */}
            <View style={styles.hudTitleContainer}>
              <Animated.View style={[styles.hudTitleGlow, headerGlowStyle]} />
              <Text style={styles.hudTitle}>COACHING</Text>
              <Text style={styles.hudSubtitle}>COMMAND CENTER</Text>
            </View>

            {/* Right: Status indicator */}
            <View style={styles.hudStatusContainer}>
              <View style={styles.hudStatusDot} />
              <Text style={styles.hudStatusText}>LIVE</Text>
            </View>
          </View>
        </NeoLoadoutPanel>
      </View>

      {/* Calm Tab Bar (simplified - no glow) */}
      <View style={styles.calmTabBar}>
        {([
          { id: "today", label: "Today", icon: "today-outline" },
          { id: "progress", label: "Progress", icon: "trending-up-outline" },
          { id: "plans", label: "Plans", icon: "document-text-outline" },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.calmTab, isActive && styles.calmTabActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.id);
              }}
            >
              <Ionicons
                name={tab.icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={isActive ? Colors.dark.primary : Colors.dark.tabIconDefault}
              />
              <Text style={[styles.calmTabText, isActive && styles.calmTabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === "today" ? (
        <TodayFeedbackTab insets={insets} />
      ) : activeTab === "progress" ? (
        <ProgressTab insets={insets} />
      ) : (
        <PlansTab insets={insets} />
      )}
    </View>
  );
}

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

type FeedbackPeriod = "today" | "yesterday" | "this_week" | "last_week" | "last_month";

const FEEDBACK_PERIODS: { id: FeedbackPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
  { id: "last_month", label: "Last Month" },
];

// XP rewards for providing feedback (to motivate coaches)
// Values based on session complexity and player count
const FEEDBACK_XP_REWARDS: Record<string, number> = {
  private: 25,
  semi_private: 35,
  group: 50,
  camp: 75,
  team_training: 60,
  clinic: 45,
  match: 30,
  assessment: 40,
  // Default fallback for unknown types
  default: 20,
};

function TodayFeedbackTab({ insets }: { insets: { bottom: number } }) {
  const { calendarData, isLoading } = useCoach();
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [intensity, setIntensity] = useState<Intensity>("normal");
  const [mood, setMood] = useState<"good" | "neutral" | "low">("neutral");
  const [focusTags, setFocusTags] = useState<string[]>([]);
  const [generalNote, setGeneralNote] = useState("");
  const [playerFeedback, setPlayerFeedback] = useState<PlayerFeedbackState[]>([]);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState<string | null>(null); // playerId for skill selector
  // Per-player skill group expansion state: { playerId: Set<groupKey> }
  const [playerExpandedSkillGroups, setPlayerExpandedSkillGroups] = useState<Record<string, Set<string>>>({});
  // Time period filter
  const [feedbackPeriod, setFeedbackPeriod] = useState<FeedbackPeriod>("today");
  // Status filter
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "open" | "pending">("all");

  const { data: sessionPlayers = [] } = useQuery<SessionPlayer[]>({
    queryKey: [`/api/coach/sessions/${selectedSession?.id}/players`],
    enabled: !!selectedSession,
  });

  // Determine if this is a private session (1 player) or group session (>1 player)
  const isPrivateSession = sessionPlayers.length === 1;

  // Default skills for tracking
  const skillChips = ["Forehand", "Backhand", "Serve", "Volley", "Movement", "Mental"];
  
  // Skill Groups for collapsible sections
  const skillGroups = [
    { key: "Technical", label: "Technical", skills: ["Forehand", "Backhand", "Serve", "Volley"] },
    { key: "Physical", label: "Physical", skills: ["Movement"] },
    { key: "Mental", label: "Mental", skills: ["Mental"] },
  ];
  
  const toggleSkillGroup = (playerId: string, groupKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerExpandedSkillGroups(prev => {
      const currentPlayerGroups = prev[playerId] || new Set(["Technical"]); // Default Technical open
      const next = new Set(currentPlayerGroups);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return { ...prev, [playerId]: next };
    });
  };
  
  const getPlayerExpandedGroups = (playerId: string): Set<string> => {
    return playerExpandedSkillGroups[playerId] || new Set(["Technical"]); // Default Technical open
  };

  React.useEffect(() => {
    if (sessionPlayers.length > 0) {
      const validPlayers = sessionPlayers.filter((sp) => sp.player && sp.player.name);
      setPlayerFeedback(
        validPlayers.map((sp) => ({
          playerId: sp.playerId,
          playerName: sp.player.name,
          progressTrend: "stable" as ProgressTrend,
          effortLevel: "normal" as EffortLevel,
          note: "",
          skillProgress: {},
          quickSignals: [],
          socialIssue: null,
        }))
      );
      // For private sessions, expand all players by default
      // For group sessions, collapse all players by default
      if (validPlayers.length === 1) {
        setExpandedPlayers(new Set(validPlayers.map(sp => sp.playerId)));
      } else {
        setExpandedPlayers(new Set());
      }
    }
  }, [sessionPlayers]);

  const togglePlayerExpanded = (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const applyEffortToAll = (effortLevel: EffortLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlayerFeedback(prev => prev.map(pf => ({ ...pf, effortLevel })));
  };

  const setAsExpected = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPlayerFeedback(prev => prev.map(pf => ({
      ...pf,
      progressTrend: "stable" as ProgressTrend,
      effortLevel: "normal" as EffortLevel,
      skillProgress: {},
      quickSignals: [],
      socialIssue: null,
    })));
    setIntensity("normal");
    setMood("neutral");
    setShowSkillSelector(null);
  };

  const toggleQuickSignal = (playerId: string, signal: QuickSignal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedback(prev => prev.map(pf => {
      if (pf.playerId !== playerId) return pf;
      const hasSignal = pf.quickSignals.includes(signal);
      return {
        ...pf,
        quickSignals: hasSignal 
          ? pf.quickSignals.filter(s => s !== signal)
          : [...pf.quickSignals, signal],
      };
    }));
  };

  const setSocialIssue = (playerId: string, issue: SocialIssue | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlayerFeedback(prev => prev.map(pf => {
      if (pf.playerId !== playerId) return pf;
      return { ...pf, socialIssue: pf.socialIssue === issue ? null : issue };
    }));
  };

  const calculateDomainImpact = (pf: PlayerFeedbackState): DomainImpact => {
    let technical: "up" | "stable" | "down" = "stable";
    let mental: "up" | "stable" | "down" = "stable";
    let physical: "up" | "stable" | "down" = "stable";
    let social: "up" | "stable" | "down" = "stable";
    let tactical: "up" | "stable" | "down" = "stable";

    const technicalSkills = ["Forehand", "Backhand", "Serve", "Volley"];
    const hasUpTechnical = technicalSkills.some(s => pf.skillProgress[s] === "up");
    const hasDownTechnical = technicalSkills.some(s => pf.skillProgress[s] === "down");
    if (hasUpTechnical) technical = "up";
    else if (hasDownTechnical) technical = "down";

    if (pf.skillProgress["Mental"] === "up" || mood === "good" || pf.quickSignals.includes("focused")) mental = "up";
    else if (pf.skillProgress["Mental"] === "down" || mood === "low") mental = "down";
    else if (pf.effortLevel === "high") mental = "up";

    if (pf.skillProgress["Movement"] === "up" || pf.effortLevel === "high" || intensity === "intense") physical = "up";
    else if (pf.skillProgress["Movement"] === "down" || pf.effortLevel === "low") physical = "down";

    const socialSignals: QuickSignal[] = ["good_teammate", "took_initiative", "showed_respect", "listened_well", "fair_play"];
    const hasSocialSignal = socialSignals.some(s => pf.quickSignals.includes(s));
    if (hasSocialSignal) social = "up";
    else if (pf.socialIssue) social = "down";
    // Passive Social growth: group sessions with normal+ effort = passive growth
    else if (sessionPlayers.length > 1 && pf.effortLevel === "high") social = "up";
    else if (sessionPlayers.length > 1 && pf.effortLevel !== "low") social = "stable";

    if (pf.quickSignals.includes("smart_decisions") || focusTags.includes("Positioning") || focusTags.includes("Shot choice")) tactical = "up";
    else if (pf.skillProgress["Shot choice"] === "up" || pf.skillProgress["Positioning"] === "up") tactical = "up";

    return { technical, mental, physical, social, tactical };
  };

  const cycleSkillState = (playerId: string, skill: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedback(prev => prev.map(pf => {
      if (pf.playerId !== playerId) return pf;
      const currentState = pf.skillProgress[skill] || "stable";
      // Cycle: stable -> up -> down -> stable
      let nextState: SkillChipState = "stable";
      if (currentState === "stable") nextState = "up";
      else if (currentState === "up") nextState = "down";
      else nextState = "stable";
      
      const newSkillProgress = { ...pf.skillProgress };
      if (nextState === "stable") {
        delete newSkillProgress[skill];
      } else {
        newSkillProgress[skill] = nextState;
      }
      return { ...pf, skillProgress: newSkillProgress };
    }));
  };

  const getSkillChipStyle = (state: SkillChipState | undefined) => {
    switch (state) {
      case "up": return { backgroundColor: Colors.dark.primary + "20", borderColor: Colors.dark.primary };
      case "down": return { backgroundColor: Colors.dark.error + "20", borderColor: Colors.dark.error };
      default: return {};
    }
  };

  const getSkillChipIcon = (state: SkillChipState | undefined): keyof typeof Ionicons.glyphMap | null => {
    switch (state) {
      case "up": return "trending-up";
      case "down": return "trending-down";
      default: return null;
    }
  };

  const getSkillChipColor = (state: SkillChipState | undefined) => {
    switch (state) {
      case "up": return Colors.dark.primary;
      case "down": return Colors.dark.error;
      default: return Colors.dark.tabIconDefault;
    }
  };

  const updatePlayerFeedback = (
    playerId: string,
    field: keyof PlayerFeedbackState,
    value: string
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedback((prev) =>
      prev.map((pf) => {
        if (pf.playerId !== playerId) return pf;
        
        // When progressTrend changes, auto-apply to focus skills
        if (field === "progressTrend" && focusTags.length > 0) {
          const newSkillProgress: SkillProgress = { ...pf.skillProgress };
          const currentTrend = pf.progressTrend;
          
          // Only auto-apply if switching from stable to up/down (initial selection)
          // Don't overwrite if already set (respects manual refinements)
          if (currentTrend === "stable" && (value === "up" || value === "down")) {
            // Apply the trend to all focus skills
            for (const skill of focusTags) {
              if (!(skill in newSkillProgress)) {
                newSkillProgress[skill] = value as SkillChipState;
              }
            }
          } else if (value === "stable") {
            // Clear skills when going back to stable
            for (const skill of focusTags) {
              delete newSkillProgress[skill];
            }
          }
          // If switching between up/down, keep existing skill selections
          
          return { ...pf, [field]: value, skillProgress: newSkillProgress } as PlayerFeedbackState;
        }
        
        return { ...pf, [field]: value } as PlayerFeedbackState;
      })
    );
    
    // Close skill selector when going to stable
    if (field === "progressTrend" && value === "stable") {
      setShowSkillSelector(null);
    }
  };

  // Helper to get date range for each period
  // Returns start (inclusive) and end (exclusive) dates for filtering
  const getDateRangeForPeriod = (period: FeedbackPeriod): { start: Date; end: Date } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
      case "today":
        // From start of today to now (only show past sessions)
        return { start: today, end: now };
      case "yesterday": {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        // From start of yesterday to start of today (full day)
        return { start: yesterday, end: today };
      }
      case "this_week": {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        return { start: weekStart, end: now };
      }
      case "last_week": {
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay());
        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(thisWeekStart); // End of last week = start of this week
        return { start: lastWeekStart, end: lastWeekEnd };
      }
      case "last_month": {
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastMonthStart = new Date(thisMonthStart);
        lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
        // End is start of current month (exclusive)
        return { start: lastMonthStart, end: thisMonthStart };
      }
      default:
        return { start: today, end: now };
    }
  };

  const filteredSessions = useMemo(() => {
    if (!calendarData?.ownSessions) return [];
    const { start, end } = getDateRangeForPeriod(feedbackPeriod);
    const now = new Date();
    
    return calendarData.ownSessions
      .filter((session) => {
        const sessionDate = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        return (
          sessionDate >= start &&
          sessionDate < end &&
          session.status !== "cancelled" &&
          endTime < now
        );
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()); // Chronological order
  }, [calendarData?.ownSessions, feedbackPeriod]);

  // Helper to check if a session has feedback submitted (status is "completed")
  const hasSessionFeedback = (session: any) => session.status === "completed";

  // Apply status filter
  // "Done" = sessions with feedback submitted (status = "completed")
  // "Open" = past sessions awaiting feedback (status = "scheduled" but end time passed)
  const statusFilteredSessions = useMemo(() => {
    if (statusFilter === "all") return filteredSessions;
    return filteredSessions.filter((session) => {
      const hasFeedback = hasSessionFeedback(session);
      switch (statusFilter) {
        case "complete":
          return hasFeedback;
        case "open":
          return !hasFeedback;
        case "pending":
          return !hasFeedback;
        default:
          return true;
      }
    });
  }, [filteredSessions, statusFilter]);

  // Get counts for each status
  const statusCounts = useMemo(() => {
    const complete = filteredSessions.filter(s => hasSessionFeedback(s)).length;
    const open = filteredSessions.filter(s => !hasSessionFeedback(s)).length;
    return { complete, open, pending: open, all: filteredSessions.length };
  }, [filteredSessions]);

  // Calculate pending feedback count and total XP
  const pendingFeedbackStats = useMemo(() => {
    const pendingSessions = filteredSessions.filter(s => !hasSessionFeedback(s));
    const totalXp = pendingSessions.reduce((sum, session) => {
      return sum + (FEEDBACK_XP_REWARDS[session.sessionType] || FEEDBACK_XP_REWARDS.default);
    }, 0);
    return { count: pendingSessions.length, totalXp };
  }, [filteredSessions]);

  // Get XP for a session type
  const getSessionXp = (sessionType: string): number => {
    return FEEDBACK_XP_REWARDS[sessionType] || FEEDBACK_XP_REWARDS.default;
  };

  const getPeriodLabel = (period: FeedbackPeriod): string => {
    switch (period) {
      case "today": return "Today's";
      case "yesterday": return "Yesterday's";
      case "this_week": return "This Week's";
      case "last_week": return "Last Week's";
      case "last_month": return "Last Month's";
      default: return "";
    }
  };

  const availableTags = ["Movement", "Forehand", "Backhand", "Serve", "Volley", "Mental", "Footwork"];

  const toggleTag = (tag: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const { data: domains = [] } = useQuery<SkillDomain[]>({
    queryKey: ["/api/progress/domains"],
  });

  const saveFeedbackMutation = useMutation({
    mutationFn: async (data: { sessionId: string; feedback: any }) => {
      // Save session feedback
      await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/feedback`, data.feedback);
      
      // Submit skill observations to Progress Engine V2 for each player
      const coachId = calendarData?.ownSessions?.[0]?.coachId;
      if (coachId && domains.length > 0) {
        for (const pf of data.feedback.playerFeedback) {
          // Derive direction from per-skill progress
          const skillProgress = pf.skillProgress || {};
          const upCount = Object.values(skillProgress).filter(s => s === "up").length;
          const downCount = Object.values(skillProgress).filter(s => s === "down").length;
          const overallDirection = upCount > downCount ? "up" : downCount > upCount ? "down" : "stable";
          
          const technicalDomain = domains.find(d => d.name === "technical");
          const mentalDomain = domains.find(d => d.name === "mental");
          
          const observations = [];
          
          // Technical domain observation based on per-skill progress
          if (technicalDomain) {
            const technicalSkills = ["Forehand", "Backhand", "Serve", "Volley"];
            const techUpCount = technicalSkills.filter(s => skillProgress[s] === "up").length;
            const techDownCount = technicalSkills.filter(s => skillProgress[s] === "down").length;
            const techDirection = techUpCount > techDownCount ? "up" : techDownCount > techUpCount ? "down" : overallDirection;
            
            observations.push({
              domainId: technicalDomain.id,
              direction: techDirection,
              effortLevel: pf.effortLevel,
              note: pf.note || null,
            });
          }
          
          // Mental domain observation based on mood or Mental skill
          if (mentalDomain) {
            const mentalSkillDirection = skillProgress["Mental"];
            const moodDirection = data.feedback.mood === "good" ? "up" : data.feedback.mood === "low" ? "down" : null;
            const mentalDirection = mentalSkillDirection || moodDirection || "stable";
            
            observations.push({
              domainId: mentalDomain.id,
              direction: mentalDirection,
              effortLevel: pf.effortLevel,
              note: null,
            });
          }

          if (observations.length > 0) {
            try {
              await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/observations`, {
                playerId: pf.playerId,
                coachId,
                observations,
              });
            } catch (err) {
              console.error("Failed to submit observations for player:", pf.playerId, err);
            }
          }
        }
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress/domains"] });
      // Show success overlay briefly
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedSession(null);
        setIntensity("normal");
        setMood("neutral");
        setFocusTags([]);
        setGeneralNote("");
        setPlayerFeedback([]);
      }, 1200);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save feedback");
    },
  });

  const handleSaveFeedback = () => {
    if (!selectedSession) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Derive progressTrend from skillProgress for each player (for backward compatibility)
    const enrichedPlayerFeedback = playerFeedback.map(pf => {
      const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
      const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
      const derivedTrend: ProgressTrend = upCount > downCount ? "up" : downCount > upCount ? "down" : "stable";
      return { ...pf, progressTrend: derivedTrend };
    });
    
    saveFeedbackMutation.mutate({
      sessionId: selectedSession.id,
      feedback: {
        intensity,
        mood,
        focusTags,
        generalNote,
        playerFeedback: enrichedPlayerFeedback,
      },
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (selectedSession) {
    return (
      <View style={{ flex: 1 }}>
        {showSuccess ? (
          <View style={styles.successOverlay}>
            <View style={styles.successContent}>
              <Ionicons name="checkmark-circle" size={64} color={Colors.dark.primary} />
              <Text style={styles.successText}>Feedback Saved</Text>
              <Text style={styles.successSubtext}>Progress updated for all players</Text>
            </View>
          </View>
        ) : null}
        <ScrollView
          style={styles.feedbackForm}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.backRow} onPress={() => setSelectedSession(null)}>
            <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
            <Text style={styles.backText}>Back to overview</Text>
          </Pressable>

        <View style={styles.feedbackHeader}>
          <Text style={styles.feedbackTitle}>Session Feedback</Text>
          <Text style={styles.feedbackTime}>
            {formatTime(selectedSession.startTime)} - {formatTime(selectedSession.endTime)}
          </Text>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Intensity</Text>
          <View style={styles.intensityRow}>
            {([
              { value: "light", label: "Light", color: Colors.dark.primary },
              { value: "normal", label: "Normal", color: Colors.dark.orange },
              { value: "intense", label: "Intense", color: Colors.dark.error },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.intensityButton,
                  intensity === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIntensity(opt.value);
                }}
              >
                <View style={[styles.intensityDot, { backgroundColor: opt.color }]} />
                <Text
                  style={[
                    styles.intensityText,
                    intensity === opt.value && { color: opt.color },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Observed Mood</Text>
          <View style={styles.intensityRow}>
            {([
              { value: "good", label: "Good", icon: "happy-outline" as const, color: Colors.dark.primary },
              { value: "neutral", label: "Neutral", icon: "remove-outline" as const, color: Colors.dark.orange },
              { value: "low", label: "Low", icon: "sad-outline" as const, color: Colors.dark.error },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.intensityButton,
                  mood === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMood(opt.value);
                }}
              >
                <Ionicons name={opt.icon} size={18} color={mood === opt.value ? opt.color : Colors.dark.disabled} />
                <Text
                  style={[
                    styles.intensityText,
                    mood === opt.value && { color: opt.color },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Session Focus (optional)</Text>
          <View style={styles.tagsGrid}>
            {availableTags.map((tag) => (
              <Pressable
                key={tag}
                style={[styles.tagChip, focusTags.includes(tag) && styles.tagChipActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagText, focusTags.includes(tag) && styles.tagTextActive]}>
                  {tag}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {playerFeedback.length > 0 && (
          <View style={styles.feedbackSection}>
            <View style={styles.feedbackLabelRow}>
              <Text style={styles.feedbackLabel}>Player Feedback</Text>
              {playerFeedback.length > 1 ? (
                <View style={styles.quickActionsRow}>
                  <Pressable
                    style={styles.applyAllButton}
                    onPress={() => applyEffortToAll("normal")}
                  >
                    <Ionicons name="copy-outline" size={12} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.applyAllText}>All Normal</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            
            {/* Quick action for standard sessions */}
            <Pressable
              style={styles.asExpectedButton}
              onPress={setAsExpected}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.xpCyan} />
              <Text style={styles.asExpectedText}>Session went as expected</Text>
            </Pressable>

            {playerFeedback.map((pf) => {
              const isExpanded = expandedPlayers.has(pf.playerId);
              return (
                <View key={pf.playerId} style={styles.playerFeedbackCard}>
                  <Pressable 
                    style={styles.playerFeedbackHeader}
                    onPress={() => togglePlayerExpanded(pf.playerId)}
                  >
                    <Text style={styles.playerFeedbackName}>{pf.playerName}</Text>
                    <View style={styles.playerFeedbackHeaderRight}>
                      {!isExpanded ? (() => {
                        const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
                        const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
                        return (
                          <>
                            {upCount > 0 ? (
                              <View style={styles.headerProgressBadge}>
                                <Ionicons name="trending-up" size={10} color={Colors.dark.primary} />
                                <Text style={[styles.headerProgressText, { color: Colors.dark.primary }]}>{upCount}</Text>
                              </View>
                            ) : null}
                            {downCount > 0 ? (
                              <View style={styles.headerProgressBadge}>
                                <Ionicons name="trending-down" size={10} color={Colors.dark.error} />
                                <Text style={[styles.headerProgressText, { color: Colors.dark.error }]}>{downCount}</Text>
                              </View>
                            ) : null}
                          </>
                        );
                      })() : null}
                      <Ionicons 
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={Colors.dark.tabIconDefault}
                      />
                    </View>
                  </Pressable>
                  
                  {isExpanded ? (
                    <>
                      {/* Per-skill progress summary */}
                      {(() => {
                        const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
                        const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
                        const hasProgress = upCount > 0 || downCount > 0;
                        return hasProgress ? (
                          <View style={styles.skillProgressSummary}>
                            {upCount > 0 ? (
                              <View style={styles.skillProgressBadge}>
                                <Ionicons name="trending-up" size={12} color={Colors.dark.primary} />
                                <Text style={[styles.skillProgressBadgeText, { color: Colors.dark.primary }]}>
                                  {upCount} improved
                                </Text>
                              </View>
                            ) : null}
                            {downCount > 0 ? (
                              <View style={styles.skillProgressBadge}>
                                <Ionicons name="trending-down" size={12} color={Colors.dark.error} />
                                <Text style={[styles.skillProgressBadgeText, { color: Colors.dark.error }]}>
                                  {downCount} needs work
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null;
                      })()}

                      <View style={styles.playerFeedbackRow}>
                        <Text style={styles.playerFeedbackLabel}>Effort</Text>
                        <View style={styles.trendButtons}>
                          {([
                            { value: "high", label: "High", color: Colors.dark.primary },
                            { value: "normal", label: "Normal", color: Colors.dark.orange },
                            { value: "low", label: "Low", color: Colors.dark.error },
                          ] as const).map((opt) => (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.effortButton,
                                pf.effortLevel === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                              ]}
                              onPress={() => updatePlayerFeedback(pf.playerId, "effortLevel", opt.value)}
                            >
                              <Text
                                style={[
                                  styles.effortButtonText,
                                  pf.effortLevel === opt.value && { color: opt.color },
                                ]}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {/* Quick Signals Section */}
                      <View style={styles.quickSignalsSection}>
                        <Text style={styles.playerFeedbackLabel}>Quick Signals (optional)</Text>
                        <View style={styles.quickSignalsGrid}>
                          {([
                            { id: "focused" as QuickSignal, icon: "eye-outline" as const, label: "Focused", domain: "mental" },
                            { id: "smart_decisions" as QuickSignal, icon: "bulb-outline" as const, label: "Smart", domain: "tactical" },
                            { id: "good_teammate" as QuickSignal, icon: "people-outline" as const, label: "Teammate", domain: "social" },
                            { id: "took_initiative" as QuickSignal, icon: "hand-right-outline" as const, label: "Initiative", domain: "social" },
                            { id: "showed_respect" as QuickSignal, icon: "heart-outline" as const, label: "Respect", domain: "social" },
                            { id: "listened_well" as QuickSignal, icon: "ear-outline" as const, label: "Listened", domain: "social" },
                            { id: "fair_play" as QuickSignal, icon: "shield-checkmark-outline" as const, label: "Fair Play", domain: "social" },
                          ] as const).map((signal) => {
                            const isActive = pf.quickSignals.includes(signal.id);
                            return (
                              <Pressable
                                key={signal.id}
                                style={[
                                  styles.quickSignalChip,
                                  isActive && styles.quickSignalChipActive,
                                ]}
                                onPress={() => toggleQuickSignal(pf.playerId, signal.id)}
                              >
                                <Ionicons 
                                  name={signal.icon} 
                                  size={14} 
                                  color={isActive ? Colors.dark.primary : Colors.dark.tabIconDefault} 
                                />
                                <Text style={[
                                  styles.quickSignalText,
                                  isActive && styles.quickSignalTextActive,
                                ]}>
                                  {signal.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        
                        {/* Social Correction (hidden toggle) */}
                        <Pressable
                          style={styles.issueToggle}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (pf.socialIssue) {
                              setSocialIssue(pf.playerId, null);
                            } else {
                              setSocialIssue(pf.playerId, "disruptive");
                            }
                          }}
                        >
                          <Ionicons 
                            name={pf.socialIssue ? "warning" : "warning-outline"} 
                            size={12} 
                            color={pf.socialIssue ? Colors.dark.error : Colors.dark.tabIconDefault} 
                          />
                          <Text style={[
                            styles.issueToggleText,
                            pf.socialIssue && { color: Colors.dark.error },
                          ]}>
                            {pf.socialIssue ? "Issue observed" : "Issue observed?"}
                          </Text>
                        </Pressable>
                        
                        {pf.socialIssue ? (
                          <View style={styles.issueOptions}>
                            {([
                              { id: "disruptive" as SocialIssue, label: "Disruptive" },
                              { id: "poor_attitude" as SocialIssue, label: "Poor attitude" },
                              { id: "disrespect" as SocialIssue, label: "Disrespect" },
                            ] as const).map((issue) => (
                              <Pressable
                                key={issue.id}
                                style={[
                                  styles.issueChip,
                                  pf.socialIssue === issue.id && styles.issueChipActive,
                                ]}
                                onPress={() => setSocialIssue(pf.playerId, issue.id)}
                              >
                                <Text style={[
                                  styles.issueChipText,
                                  pf.socialIssue === issue.id && styles.issueChipTextActive,
                                ]}>
                                  {issue.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </View>

                      {/* Domain Preview Chips (read-only) */}
                      {(() => {
                        const impact = calculateDomainImpact(pf);
                        const domains = [
                          { key: "technical", label: "Tech", value: impact.technical },
                          { key: "mental", label: "Mental", value: impact.mental },
                          { key: "physical", label: "Physical", value: impact.physical },
                          { key: "social", label: "Social", value: impact.social },
                          { key: "tactical", label: "Tactical", value: impact.tactical },
                        ];
                        const hasAnyChange = domains.some(d => d.value !== "stable");
                        if (!hasAnyChange) return null;
                        return (
                          <View style={styles.domainPreviewSection}>
                            <Text style={styles.domainPreviewLabel}>Core Impact (auto)</Text>
                            <View style={styles.domainPreviewGrid}>
                              {domains.map((d) => (
                                <View 
                                  key={d.key} 
                                  style={[
                                    styles.domainPreviewChip,
                                    d.value === "up" && styles.domainPreviewUp,
                                    d.value === "down" && styles.domainPreviewDown,
                                  ]}
                                >
                                  {d.value === "up" ? (
                                    <Ionicons name="arrow-up" size={10} color={Colors.dark.primary} />
                                  ) : d.value === "down" ? (
                                    <Ionicons name="arrow-down" size={10} color={Colors.dark.error} />
                                  ) : null}
                                  <Text style={[
                                    styles.domainPreviewText,
                                    d.value === "up" && { color: Colors.dark.primary },
                                    d.value === "down" && { color: Colors.dark.error },
                                  ]}>
                                    {d.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })()}

                      <View style={styles.skillChipsSection}>
                        <Text style={styles.playerFeedbackLabel}>Skills (tap to toggle)</Text>
                        {/* Skill Groups - Collapsible (per-player) */}
                        {skillGroups.map((group) => {
                          const playerGroups = getPlayerExpandedGroups(pf.playerId);
                          const isExpanded = playerGroups.has(group.key);
                          const groupSkillsWithState = group.skills.filter(s => pf.skillProgress[s]);
                          const hasUpSkills = group.skills.some(s => pf.skillProgress[s] === "up");
                          const hasDownSkills = group.skills.some(s => pf.skillProgress[s] === "down");
                          
                          return (
                            <View key={group.key} style={styles.skillGroupContainer}>
                              <Pressable 
                                style={styles.skillGroupHeader}
                                onPress={() => toggleSkillGroup(pf.playerId, group.key)}
                              >
                                <View style={styles.skillGroupHeaderLeft}>
                                  <Ionicons 
                                    name={isExpanded ? "chevron-down" : "chevron-forward"} 
                                    size={16} 
                                    color={Colors.dark.tabIconDefault} 
                                  />
                                  <Text style={styles.skillGroupLabel}>{group.label}</Text>
                                  {!isExpanded && groupSkillsWithState.length > 0 ? (
                                    <View style={styles.skillGroupBadge}>
                                      {hasUpSkills ? (
                                        <Ionicons name="trending-up" size={10} color={Colors.dark.primary} />
                                      ) : hasDownSkills ? (
                                        <Ionicons name="trending-down" size={10} color={Colors.dark.error} />
                                      ) : null}
                                      <Text style={[
                                        styles.skillGroupBadgeText,
                                        hasUpSkills && { color: Colors.dark.primary },
                                        hasDownSkills && { color: Colors.dark.error },
                                      ]}>
                                        {groupSkillsWithState.length}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </Pressable>
                              {isExpanded ? (
                                <View style={styles.skillChipsGrid}>
                                  {group.skills.sort((a, b) => {
                                    const aFocused = focusTags.includes(a);
                                    const bFocused = focusTags.includes(b);
                                    if (aFocused && !bFocused) return -1;
                                    if (!aFocused && bFocused) return 1;
                                    return 0;
                                  }).map((skill) => {
                                    const state = pf.skillProgress[skill];
                                    const icon = getSkillChipIcon(state);
                                    const isFocused = focusTags.includes(skill);
                                    return (
                                      <Pressable
                                        key={skill}
                                        style={[
                                          styles.skillChip,
                                          isFocused && !state && styles.skillChipFocused,
                                          getSkillChipStyle(state),
                                        ]}
                                        onPress={() => cycleSkillState(pf.playerId, skill)}
                                      >
                                        {isFocused && !state ? (
                                          <Ionicons name="star" size={10} color={Colors.dark.gold} />
                                        ) : icon ? (
                                          <Ionicons name={icon} size={12} color={getSkillChipColor(state)} />
                                        ) : null}
                                        <Text style={[
                                          styles.skillChipText, 
                                          { color: getSkillChipColor(state) },
                                          isFocused && !state && { color: Colors.dark.gold },
                                        ]}>
                                          {skill}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                        {/* Warning when too many skills (>7) marked as improved */}
                        {Object.values(pf.skillProgress).filter(s => s === "up").length > 7 ? (
                          <View style={styles.skillWarning}>
                            <Ionicons name="warning-outline" size={14} color={Colors.dark.orange} />
                            <Text style={styles.skillWarningText}>
                              Many skills improved - consider focusing on key areas
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <TextInput
                        style={styles.playerNoteInput}
                        placeholder="Optional coach note..."
                        placeholderTextColor={Colors.dark.tabIconDefault}
                        value={pf.note}
                        onChangeText={(text) => updatePlayerFeedback(pf.playerId, "note", text)}
                        maxLength={100}
                      />
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>General note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Short note about the session..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={generalNote}
            onChangeText={setGeneralNote}
            multiline
            maxLength={200}
          />
        </View>

        <Pressable
          style={[styles.saveButton, saveFeedbackMutation.isPending && styles.saveButtonDisabled]}
          onPress={handleSaveFeedback}
          disabled={saveFeedbackMutation.isPending}
        >
          {saveFeedbackMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              <Text style={styles.saveButtonText}>Save Feedback</Text>
            </>
          )}
        </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Calm Period Filter Pills */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.calmPeriodScroll}
        contentContainerStyle={styles.calmPeriodContent}
      >
        {FEEDBACK_PERIODS.map((period) => {
          const isActive = feedbackPeriod === period.id;
          return (
            <Pressable
              key={period.id}
              style={[styles.calmPeriodPill, isActive && styles.calmPeriodPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFeedbackPeriod(period.id);
              }}
            >
              <Text style={[styles.calmPeriodText, isActive && styles.calmPeriodTextActive]}>
                {period.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Calm Status Filter Row */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.calmStatusScroll}
        contentContainerStyle={styles.calmStatusContent}
      >
        {([
          { id: "all" as const, label: "All", count: statusCounts.all, icon: null, color: Colors.dark.primary },
          { id: "complete" as const, label: "Done", count: statusCounts.complete, icon: "checkmark-circle" as const, color: Colors.dark.primary },
          { id: "open" as const, label: "Open", count: statusCounts.open, icon: "alert-circle" as const, color: "#F39C12" },
          { id: "pending" as const, label: "Pending", count: statusCounts.pending, icon: "time" as const, color: Colors.dark.xpCyan },
        ]).map((status) => {
          const isActive = statusFilter === status.id;
          return (
            <Pressable
              key={status.id}
              style={[
                styles.calmStatusPill,
                isActive && { backgroundColor: status.color + "20", borderColor: status.color },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStatusFilter(status.id);
              }}
            >
              {status.icon ? (
                <Ionicons 
                  name={status.icon} 
                  size={14} 
                  color={isActive ? status.color : Colors.dark.tabIconDefault}
                />
              ) : null}
              <Text style={[styles.calmStatusText, isActive && { color: status.color }]}>
                {status.label} ({status.count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* XP Reward Banner - only show if pending feedback exists */}
      {pendingFeedbackStats.count > 0 ? (
        <View style={styles.xpRewardBanner}>
          <View style={styles.xpRewardLeft}>
            <Ionicons name="star" size={20} color={Colors.dark.gold} />
            <View style={styles.xpRewardTextContainer}>
              <Text style={styles.xpRewardTitle}>
                {pendingFeedbackStats.count} session{pendingFeedbackStats.count > 1 ? "s" : ""} awaiting feedback
              </Text>
              <Text style={styles.xpRewardSubtitle}>
                Complete all for +{pendingFeedbackStats.totalXp} XP
              </Text>
            </View>
          </View>
          <View style={styles.xpRewardBadge}>
            <Text style={styles.xpRewardBadgeText}>+{pendingFeedbackStats.totalXp} XP</Text>
          </View>
        </View>
      ) : null}

      {/* Section Title with tactical styling */}
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionTitleAccent} />
        <Text style={styles.sectionTitle}>{getPeriodLabel(feedbackPeriod).toUpperCase()} LESSONS</Text>
      </View>
      
      {statusFilteredSessions.length === 0 ? (
        <View style={styles.calmEmptyCard}>
          <View style={styles.calmEmptyIcon}>
            <Ionicons name="checkmark-done" size={26} color={Colors.dark.tabIconDefault} />
          </View>
          <Text style={styles.calmEmptyText}>
            {filteredSessions.length === 0 
              ? `No completed lessons ${feedbackPeriod === "today" ? "today" : "in this period"}`
              : `No ${statusFilter === "complete" ? "completed" : statusFilter} lessons`
            }
          </Text>
          <Text style={styles.calmEmptySubtext}>
            {filteredSessions.length === 0 
              ? "Feedback will appear here after each lesson"
              : "Try selecting a different filter"
            }
          </Text>
        </View>
      ) : (
        statusFilteredSessions.map((session) => {
          const needsFeedback = session.status !== "completed";
          const sessionXp = getSessionXp(session.sessionType);
          const sessionDate = new Date(session.startTime);
          const showDate = feedbackPeriod !== "today" && feedbackPeriod !== "yesterday";
          const accentColor = needsFeedback ? Colors.dark.gold : Colors.dark.primary;
          return (
            <Pressable
              key={session.id}
              onPress={() => needsFeedback && setSelectedSession(session)}
              style={[
                styles.calmSessionCard,
                needsFeedback && styles.calmSessionCardNeedsFeedback,
              ]}
            >
              {/* Left: Time Badge */}
              <View style={styles.calmSessionTimeBadge}>
                <Text style={styles.calmSessionTimeText}>{formatTime(session.startTime)}</Text>
                <Text style={styles.calmSessionDuration}>{session.duration}m</Text>
              </View>
              
              {/* Center: Session Info */}
              <View style={styles.calmSessionInfo}>
                <Text style={styles.calmSessionType}>
                  {session.sessionType === "private"
                    ? "Private Session"
                    : session.sessionType === "semi_private"
                    ? "Semi-Private"
                    : session.sessionType === "group"
                    ? "Group Session"
                    : session.sessionType}
                </Text>
                {showDate ? (
                  <Text style={styles.calmSessionDate}>
                    {sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                ) : null}
                {needsFeedback ? (
                  <View style={styles.calmSessionBadgeRow}>
                    <View style={styles.calmPendingBadge}>
                      <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
                      <Text style={styles.calmPendingText}>Needs Feedback</Text>
                    </View>
                    <Text style={styles.calmXpText}>+{sessionXp} XP</Text>
                  </View>
                ) : (
                  <View style={styles.calmSessionBadgeRow}>
                    <View style={styles.calmDoneBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
                      <Text style={styles.calmDoneText}>Complete</Text>
                    </View>
                  </View>
                )}
              </View>
              
              {/* Right: Arrow */}
              {needsFeedback ? (
                <Ionicons name="chevron-forward" size={22} color={accentColor} />
              ) : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

type AssessmentStatus = "not_yet" | "developing" | "meets" | "above";

function ProgressTab({ insets }: { insets: { bottom: number } }) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithProgress | null>(null);
  const [assessmentMode, setAssessmentMode] = useState(false);
  const [pendingAssessments, setPendingAssessments] = useState<Record<string, AssessmentStatus>>({});
  const queryClient = useQueryClient();
  const { calendarData } = useCoach();

  // Get coachId from calendar data (coach's own sessions)
  const coachId = calendarData?.ownSessions?.[0]?.coachId;
  
  const { data: players = [], isLoading: playersLoading } = useQuery<PlayerWithProgress[]>({
    queryKey: ["/api/coach/players/progress"],
  });

  const { data: domains = [] } = useQuery<SkillDomain[]>({
    queryKey: ["/api/progress/domains"],
  });

  const { data: skillStates = [], isLoading: statesLoading } = useQuery<PlayerSkillState[]>({
    queryKey: [`/api/players/${selectedPlayer?.id}/skill-state`],
    enabled: !!selectedPlayer,
  });

  const { data: xpData } = useQuery<PlayerXpData>({
    queryKey: [`/api/players/${selectedPlayer?.id}/xp`],
    enabled: !!selectedPlayer,
  });

  const { data: observationTrends = [] } = useQuery<ObservationTrend[]>({
    queryKey: [`/api/players/${selectedPlayer?.id}/observation-trends`],
    enabled: !!selectedPlayer,
  });

  const submitAssessmentMutation = useMutation({
    mutationFn: async (data: { playerId: string; domainId: string; status: AssessmentStatus }) => {
      return apiRequest("POST", `/api/players/${data.playerId}/assessments`, {
        domainId: data.domainId,
        status: data.status,
        coachId: coachId,
        notes: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${selectedPlayer?.id}/skill-state`] });
    },
  });

  const toggleAssessment = (domainId: string, status: AssessmentStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingAssessments(prev => {
      if (prev[domainId] === status) {
        const { [domainId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [domainId]: status };
    });
  };

  const saveAssessments = async () => {
    if (!selectedPlayer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    for (const [domainId, status] of Object.entries(pendingAssessments)) {
      await submitAssessmentMutation.mutateAsync({
        playerId: selectedPlayer.id,
        domainId,
        status,
      });
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingAssessments({});
    setAssessmentMode(false);
  };

  const getDomainIcon = (iconName: string | null): keyof typeof Ionicons.glyphMap => {
    switch (iconName) {
      case "tennisball-outline": return "tennisball-outline";
      case "brain-outline": return "bulb-outline";
      case "fitness-outline": return "fitness-outline";
      case "people-outline": return "people-outline";
      case "bulb-outline": return "flash-outline";
      default: return "star-outline";
    }
  };

  const getTrendIcon = (trend: string | null): keyof typeof Ionicons.glyphMap => {
    switch (trend) {
      case "improving": return "trending-up";
      case "focus": return "trending-down";
      default: return "remove";
    }
  };

  const getTrendColor = (trend: string | null) => {
    switch (trend) {
      case "improving": return Colors.dark.primary;
      case "focus": return Colors.dark.error;
      default: return Colors.dark.tabIconDefault;
    }
  };

  const getMomentumColor = (momentum: string | null) => {
    switch (momentum) {
      case "strong": return Colors.dark.primary;
      case "slowing": return Colors.dark.orange;
      default: return Colors.dark.xpCyan;
    }
  };

  const getProgressColor = (value: number) => {
    if (value >= 70) return Colors.dark.primary;
    if (value >= 40) return Colors.dark.xpCyan;
    if (value >= 20) return Colors.dark.gold;
    return Colors.dark.tabIconDefault;
  };

  const getAssessmentBadge = (status: string | null) => {
    switch (status) {
      case "above": return { label: "Above", color: Colors.dark.primary };
      case "meets": return { label: "Meets", color: Colors.dark.xpCyan };
      case "developing": return { label: "Developing", color: Colors.dark.gold };
      case "not_yet": return { label: "Not Yet", color: Colors.dark.orange };
      default: return { label: "No Assessment", color: Colors.dark.disabled };
    }
  };

  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red": return "#FF4444";
      case "orange": return "#FF851B";
      case "green": return "#2ECC40";
      case "yellow": return "#FFDC00";
      case "glow": return "#00D4FF";
      default: return Colors.dark.disabled;
    }
  };

  if (playersLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading progress...</Text>
      </View>
    );
  }

  // Player Detail View
  if (selectedPlayer) {
    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.backRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedPlayer(null);
          }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.dark.primary} />
          <Text style={styles.backText}>All Players</Text>
        </Pressable>

        <View style={styles.playerDetailHeader}>
          <View style={styles.playerAvatarLarge}>
            <Text style={styles.playerInitialLarge}>{selectedPlayer.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.playerDetailInfo}>
            <Text style={styles.playerDetailName}>{selectedPlayer.name}</Text>
            <View style={styles.playerDetailMeta}>
              {selectedPlayer.ballLevel ? (
                <View style={[styles.levelBadgeLarge, { borderColor: getLevelColor(selectedPlayer.ballLevel) }]}>
                  <View style={[styles.levelDotLarge, { backgroundColor: getLevelColor(selectedPlayer.ballLevel) }]} />
                  <Text style={[styles.levelBadgeTextLarge, { color: getLevelColor(selectedPlayer.ballLevel) }]}>
                    {selectedPlayer.ballLevel} Ball
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            style={[styles.assessmentToggle, assessmentMode && styles.assessmentToggleActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAssessmentMode(!assessmentMode);
              if (assessmentMode) {
                setPendingAssessments({});
              }
            }}
          >
            <Ionicons 
              name={assessmentMode ? "close" : "clipboard-outline"} 
              size={18} 
              color={assessmentMode ? Colors.dark.text : Colors.dark.gold} 
            />
          </Pressable>
        </View>

        {assessmentMode ? (
          <View style={styles.assessmentBanner}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.dark.gold} />
            <Text style={styles.assessmentBannerText}>Assessment Mode - Tap domains to set levels</Text>
          </View>
        ) : null}

        {/* XP Display */}
        {xpData ? (
          <View style={styles.xpCard}>
            <View style={styles.xpHeader}>
              <Ionicons name="star" size={24} color={Colors.dark.gold} />
              <Text style={styles.xpTotal}>{xpData.totalXp} XP</Text>
            </View>
            {xpData.transactions.length > 0 ? (
              <View style={styles.xpHistory}>
                <Text style={styles.xpHistoryTitle}>Recent XP</Text>
                {xpData.transactions.slice(0, 3).map((tx) => (
                  <View key={tx.id} style={styles.xpTransaction}>
                    <Text style={styles.xpAmount}>+{tx.xpAmount}</Text>
                    <Text style={styles.xpSource}>{tx.description || tx.source}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Observation Trends */}
        {observationTrends.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Progress Trends</Text>
            <View style={styles.trendsContainer}>
              {observationTrends.map((trend) => (
                <ObservationTrendChart
                  key={trend.domainId}
                  trend={trend}
                  width={320}
                  height={90}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Skill Domains */}
        <Text style={styles.sectionTitle}>Skill Domains</Text>
        {statesLoading ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        ) : (
          <View style={styles.domainGrid}>
            {skillStates.map((state) => {
              const assessment = getAssessmentBadge(state.assessmentStatus);
              return (
                <View key={state.id} style={styles.domainCard}>
                  <View style={styles.domainHeader}>
                    <Ionicons
                      name={getDomainIcon(state.domain?.icon || null)}
                      size={20}
                      color={getProgressColor(state.progressValue)}
                    />
                    <Text style={styles.domainName}>{state.domain?.displayName || "Unknown"}</Text>
                    {state.isFrozen ? (
                      <Ionicons name="snow-outline" size={14} color={Colors.dark.xpCyan} />
                    ) : null}
                  </View>
                  
                  {/* Progress Bar */}
                  <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarBg}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { 
                            width: `${state.progressValue}%`,
                            backgroundColor: getProgressColor(state.progressValue)
                          }
                        ]} 
                      />
                    </View>
                    <Text style={[styles.progressValue, { color: getProgressColor(state.progressValue) }]}>
                      {state.progressValue}%
                    </Text>
                  </View>

                  {assessmentMode ? (
                    <View style={styles.assessmentOptions}>
                      {(["not_yet", "developing", "meets", "above"] as AssessmentStatus[]).map((status) => {
                        const badge = getAssessmentBadge(status);
                        const isSelected = pendingAssessments[state.domainId] === status;
                        const isCurrent = state.assessmentStatus === status;
                        return (
                          <Pressable
                            key={status}
                            style={[
                              styles.assessmentOption,
                              isSelected && { backgroundColor: badge.color + "30", borderColor: badge.color },
                              isCurrent && !isSelected && { opacity: 0.6 },
                            ]}
                            onPress={() => toggleAssessment(state.domainId, status)}
                          >
                            <Text style={[styles.assessmentOptionText, { color: isSelected ? badge.color : Colors.dark.tabIconDefault }]}>
                              {badge.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <>
                      {state.domainXp > 0 || state.observationCount > 0 ? (
                        <View style={styles.domainXpRow}>
                          <View style={styles.domainXpBadge}>
                            <Ionicons name="star" size={10} color={Colors.dark.gold} />
                            <Text style={styles.domainXpText}>{state.domainXp} XP</Text>
                          </View>
                          <Text style={styles.domainObsCount}>
                            {state.observationCount} obs
                          </Text>
                          {state.avgDelta !== 0 ? (
                            <Text style={[
                              styles.domainAvgDelta,
                              { color: state.avgDelta > 0 ? Colors.dark.primary : state.avgDelta < 0 ? Colors.dark.error : Colors.dark.tabIconDefault }
                            ]}>
                              {state.avgDelta > 0 ? "+" : ""}{state.avgDelta}/obs
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <View style={styles.domainMeta}>
                        <View style={styles.trendBadge}>
                          <Ionicons
                            name={getTrendIcon(state.trend)}
                            size={12}
                            color={getTrendColor(state.trend)}
                          />
                          <Text style={[styles.trendText, { color: getTrendColor(state.trend) }]}>
                            {state.trend === "improving" ? "Improving" : state.trend === "focus" ? "Needs Focus" : "Stable"}
                          </Text>
                        </View>
                        <View style={[styles.assessmentBadge, { backgroundColor: assessment.color + "20" }]}>
                          <Text style={[styles.assessmentText, { color: assessment.color }]}>{assessment.label}</Text>
                        </View>
                      </View>

                      {state.momentum ? (
                        <View style={styles.momentumRow}>
                          <Ionicons name="flash-outline" size={12} color={getMomentumColor(state.momentum)} />
                          <Text style={[styles.momentumText, { color: getMomentumColor(state.momentum) }]}>
                            Momentum: {state.momentum.charAt(0).toUpperCase() + state.momentum.slice(1)}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {assessmentMode && Object.keys(pendingAssessments).length > 0 ? (
          <Pressable
            style={[styles.saveAssessmentsButton, submitAssessmentMutation.isPending && { opacity: 0.6 }]}
            onPress={saveAssessments}
            disabled={submitAssessmentMutation.isPending}
          >
            {submitAssessmentMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.saveAssessmentsText}>
                  Save {Object.keys(pendingAssessments).length} Assessment{Object.keys(pendingAssessments).length > 1 ? "s" : ""}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  // Player List View
  if (players.length === 0) {
    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Player Progress</Text>
        <View style={styles.emptyCard}>
          <Ionicons name="trending-up-outline" size={48} color={Colors.dark.xpCyan} />
          <Text style={styles.emptyText}>No players found</Text>
          <Text style={styles.emptySubtext}>
            Add players to track their progress
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>Player Progress</Text>
      <Text style={styles.sectionSubtitle}>{players.length} players - Tap to view details</Text>

      {players.map((player) => (
        <Pressable
          key={player.id}
          style={styles.progressCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedPlayer(player);
          }}
        >
          <View style={styles.progressCardHeader}>
            <View style={styles.playerAvatarSmall}>
              <Text style={styles.playerInitialSmall}>{player.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.progressPlayerInfo}>
              <Text style={styles.progressPlayerName}>{player.name}</Text>
              <View style={styles.progressMeta}>
                {player.ballLevel ? (
                  <View style={styles.levelBadge}>
                    <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(player.ballLevel) }]} />
                    <Text style={styles.levelBadgeText}>{player.ballLevel}</Text>
                  </View>
                ) : null}
                {player.totalXp > 0 ? (
                  <View style={styles.xpBadge}>
                    <Ionicons name="star" size={12} color={Colors.dark.gold} />
                    <Text style={styles.xpBadgeText}>{player.totalXp} XP</Text>
                  </View>
                ) : null}
                {player.totalNotes > 0 ? (
                  <View style={styles.notesBadge}>
                    <Ionicons name="document-text-outline" size={12} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.notesBadgeText}>{player.totalNotes}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

interface SessionTemplate {
  id: string;
  coachId: string | null;
  name: string;
  sessionType: string;
  duration: number;
  ballLevel: string | null;
  skillLevel: number | null;
  defaultPlayerIds: string[] | null;
  notes: string | null;
  createdAt: string | null;
}

function PlansTab({ insets }: { insets: { bottom: number } }) {
  const { coach, calendarData } = useCoach();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SessionTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState<string>("private");
  const [templateDuration, setTemplateDuration] = useState<number>(60);
  const [templateBallLevel, setTemplateBallLevel] = useState<string>("");
  const [templateNotes, setTemplateNotes] = useState("");

  const coachId = coach?.id || calendarData?.ownSessions?.[0]?.coachId;

  const { data: templates = [], isLoading } = useQuery<SessionTemplate[]>({
    queryKey: ["/api/coach/templates", { coachId }],
    enabled: !!coachId,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: Partial<SessionTemplate>) => {
      return apiRequest("POST", "/api/coach/templates", data);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates"], exact: false });
      resetForm();
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create template");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coach/templates/${id}`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/templates"], exact: false });
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to delete template");
    },
  });

  const resetForm = () => {
    setShowCreateModal(false);
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateType("private");
    setTemplateDuration(60);
    setTemplateBallLevel("");
    setTemplateNotes("");
  };

  const handleSaveTemplate = () => {
    if (!coachId) {
      Alert.alert("Error", "Coach session not loaded. Please try again.");
      return;
    }
    if (!templateName.trim()) {
      Alert.alert("Error", "Template name is required");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createTemplateMutation.mutate({
      coachId,
      name: templateName,
      sessionType: templateType,
      duration: templateDuration,
      ballLevel: templateBallLevel || null,
      notes: templateNotes || null,
    });
  };

  const handleDeleteTemplate = (template: SessionTemplate) => {
    Alert.alert(
      "Delete Template",
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteTemplateMutation.mutate(template.id),
        },
      ]
    );
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "semi_private": return "Semi-Private";
      case "group": return "Group";
      case "physical": return "Physical";
      case "activity": return "Activity";
      default: return type;
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case "private": return Colors.dark.primary;
      case "semi_private": return Colors.dark.xpCyan;
      case "group": return Colors.dark.gold;
      case "physical": return Colors.dark.orange;
      default: return Colors.dark.tabIconDefault;
    }
  };

  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red": return "#FF4444";
      case "orange": return "#FF851B";
      case "green": return "#2ECC40";
      case "yellow": return "#FFDC00";
      case "glow": return "#00D4FF";
      default: return Colors.dark.disabled;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading templates...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.plansHeader}>
        <Text style={styles.sectionTitle}>Session Templates</Text>
        <Pressable
          style={styles.addTemplateButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreateModal(true);
          }}
        >
          <Ionicons name="add" size={20} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {templates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={48} color={Colors.dark.gold} />
          <Text style={styles.emptyText}>No Templates Yet</Text>
          <Text style={styles.emptySubtext}>
            Create templates for quick session booking
          </Text>
          <Pressable
            style={styles.createTemplateButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCreateModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.createTemplateText}>Create Template</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.templatesGrid}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              style={styles.templateCard}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleDeleteTemplate(template);
              }}
            >
              <View style={styles.templateHeader}>
                <View style={[styles.templateTypeIndicator, { backgroundColor: getSessionTypeColor(template.sessionType) }]} />
                <Text style={styles.templateName}>{template.name}</Text>
              </View>
              <View style={styles.templateMeta}>
                <View style={styles.templateMetaItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.templateMetaText}>{template.duration}min</Text>
                </View>
                <View style={[styles.templateTypeBadge, { backgroundColor: getSessionTypeColor(template.sessionType) + "20" }]}>
                  <Text style={[styles.templateTypeText, { color: getSessionTypeColor(template.sessionType) }]}>
                    {getSessionTypeLabel(template.sessionType)}
                  </Text>
                </View>
              </View>
              {template.ballLevel ? (
                <View style={styles.templateBallLevel}>
                  <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(template.ballLevel) }]} />
                  <Text style={styles.templateBallText}>{template.ballLevel} Ball</Text>
                </View>
              ) : null}
              {template.notes ? (
                <Text style={styles.templateNotes} numberOfLines={2}>{template.notes}</Text>
              ) : null}
              <View style={styles.templateActions}>
                <Pressable
                  style={styles.templateActionButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Alert.alert("Quick Book", "This template can be used when creating a new session from the calendar.");
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
                  <Text style={styles.templateActionText}>Use</Text>
                </Pressable>
                <Pressable
                  style={styles.templateActionButton}
                  onPress={() => handleDeleteTemplate(template)}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {showCreateModal ? (
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollViewCompat
            style={styles.modalScrollContainer}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Template</Text>
                <Pressable onPress={resetForm}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Template Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Morning Private"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={templateName}
                  onChangeText={setTemplateName}
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Session Type</Text>
                <View style={styles.typeButtons}>
                  {[
                    { value: "private", label: "Private" },
                    { value: "semi_private", label: "Semi" },
                    { value: "group", label: "Group" },
                  ].map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.typeButton,
                        templateType === opt.value && styles.typeButtonActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateType(opt.value);
                      }}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          templateType === opt.value && styles.typeButtonTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Duration</Text>
                <View style={styles.durationButtons}>
                  {[30, 45, 60, 90].map((dur) => (
                    <Pressable
                      key={dur}
                      style={[
                        styles.durationButton,
                        templateDuration === dur && styles.durationButtonActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateDuration(dur);
                      }}
                    >
                      <Text
                        style={[
                          styles.durationButtonText,
                          templateDuration === dur && styles.durationButtonTextActive,
                        ]}
                      >
                        {dur}m
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Ball Level (Optional)</Text>
                <View style={styles.ballLevelButtons}>
                  {["", "red", "orange", "green", "yellow"].map((level) => (
                    <Pressable
                      key={level || "any"}
                      style={[
                        styles.ballLevelButton,
                        templateBallLevel === level && styles.ballLevelButtonActive,
                        level ? { borderColor: getLevelColor(level) } : undefined,
                      ].filter(Boolean)}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTemplateBallLevel(level);
                      }}
                    >
                      {level ? (
                        <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(level) }]} />
                      ) : (
                        <Text style={styles.ballLevelText}>Any</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  placeholder="Session focus, warm-up routine, etc."
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={templateNotes}
                  onChangeText={setTemplateNotes}
                  multiline
                  maxLength={200}
                />
              </View>

              <Pressable
                style={[styles.saveTemplateButton, (createTemplateMutation.isPending || !coachId) && { opacity: 0.6 }]}
                onPress={handleSaveTemplate}
                disabled={createTemplateMutation.isPending || !coachId}
              >
                {createTemplateMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#FFF" />
                    <Text style={styles.saveTemplateText}>Save Template</Text>
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  hudHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerPanel: {
    overflow: "visible",
  },
  hudHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  hudSigilContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  hudTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  hudTitleGlow: {
    position: "absolute",
    width: 120,
    height: 40,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: 20,
    top: -5,
  },
  hudTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: 4,
    textShadowColor: Colors.dark.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  hudSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
    letterSpacing: 2,
    marginTop: 2,
  },
  hudStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  hudStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  hudStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  neoTabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  neoTabWrapper: {
    flex: 1,
    position: "relative",
  },
  neoTabUnderglow: {
    position: "absolute",
    bottom: -4,
    left: 8,
    right: 8,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
  },
  neoTab: {
    overflow: "visible",
  },
  neoTabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  neoTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  neoTabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  neoPeriodTab: {
    marginRight: Spacing.sm,
    minWidth: 80,
  },
  neoPeriodContent: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  neoPeriodText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  neoPeriodTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  neoStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  neoStatusWrapper: {
    marginBottom: Spacing.xs,
  },
  neoStatusChip: {
    minWidth: 70,
  },
  neoStatusContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  neoStatusText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.3,
  },
  neoStatusBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  neoStatusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitleAccent: {
    width: 4,
    height: 20,
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  neoEmptyCard: {
    marginBottom: Spacing.lg,
  },
  neoEmptyContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  neoEmptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  neoEmptySubtext: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  neoSessionWrapper: {
    marginBottom: Spacing.md,
  },
  neoSessionCard: {
    overflow: "visible",
  },
  neoSessionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  neoSessionTimeBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    minWidth: 60,
  },
  neoSessionTimeText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  neoSessionDuration: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  neoSessionInfo: {
    flex: 1,
  },
  neoSessionType: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1,
    marginBottom: 4,
  },
  neoSessionDate: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginBottom: 6,
  },
  neoSessionBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  neoPendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  neoPendingText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  neoXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.gold + "25",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  neoXpText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  neoDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  neoDoneText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
    letterSpacing: 0.3,
  },
  neoSessionArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: `${Colors.dark.primary}10`,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  periodFilterContainer: {
    marginBottom: Spacing.lg,
    marginHorizontal: -Spacing.lg,
  },
  periodFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  periodTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  periodTabActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  periodTabText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  periodTabTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  statusFilterRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    flexWrap: "wrap",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  statusChipActive: {
    borderColor: Colors.dark.primary + "50",
  },
  statusChipComplete: {
    backgroundColor: Colors.dark.primary + "15",
    borderColor: Colors.dark.primary,
  },
  statusChipOpen: {
    backgroundColor: "#F39C12" + "15",
    borderColor: "#F39C12",
  },
  statusChipPending: {
    backgroundColor: Colors.dark.xpCyan + "15",
    borderColor: Colors.dark.xpCyan,
  },
  statusChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  statusChipTextActive: {
    fontWeight: "600",
  },
  statusCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  statusCountBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  statusCountText: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  statusCountTextActive: {
    color: Colors.dark.text,
  },
  xpRewardBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  xpRewardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  xpRewardTextContainer: {
    flex: 1,
  },
  xpRewardTitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  xpRewardSubtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    marginTop: 2,
  },
  xpRewardBadge: {
    backgroundColor: Colors.dark.gold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  xpRewardBadgeText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sessionXpText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  sessionDateText: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  emptyCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "45",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  emptyText: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  emptySubtext: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 20, 20, 0.95)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "60",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sessionTime: {
    alignItems: "center",
    minWidth: 50,
  },
  sessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionDuration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sessionInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  sessionType: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  pendingBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pendingText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.orange,
    fontWeight: "500",
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  doneText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
  },
  feedbackForm: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  backText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  feedbackHeader: {
    marginBottom: Spacing.xl,
  },
  feedbackTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  feedbackTime: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  feedbackSection: {
    marginBottom: Spacing.xl,
  },
  feedbackLabel: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  feedbackLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  applyAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  applyAllText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  asExpectedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
    borderStyle: "dashed",
    marginBottom: Spacing.sm,
  },
  asExpectedText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.xpCyan,
  },
  intensityRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  intensityButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  intensityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  intensityText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  tagsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  tagChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tagChipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  tagText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  tagTextActive: {
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  noteInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  playerFeedbackCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  playerFeedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerFeedbackHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerFeedbackName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerFeedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerFeedbackLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  trendButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  trendButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  effortButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  effortButtonText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  playerNoteInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    marginTop: Spacing.xs,
  },
  skillChipsSection: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  skillGroupContainer: {
    marginBottom: Spacing.xs,
  },
  skillGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  skillGroupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  skillGroupLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500" as const,
  },
  skillGroupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    backgroundColor: Colors.dark.disabled + "30",
    borderRadius: BorderRadius.xs,
  },
  skillGroupBadgeText: {
    fontSize: Typography.small.fontSize - 2,
    color: Colors.dark.tabIconDefault,
  },
  skillChipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  skillChipFocused: {
    borderColor: Colors.dark.gold + "60",
    backgroundColor: Colors.dark.gold + "10",
  },
  skillChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  skillWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.orange + "15",
    borderRadius: BorderRadius.sm,
  },
  skillWarningText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.orange,
  },
  skillProgressSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  skillProgressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
  },
  skillProgressBadgeText: {
    fontSize: Typography.small.fontSize,
  },
  headerProgressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.xs,
    marginRight: Spacing.xs,
  },
  headerProgressText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  focusLinkHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
  },
  focusLinkText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
    flex: 1,
  },
  skillSelectorContainer: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.disabled + "40",
  },
  skillSelectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  skillSelectorTitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    flex: 1,
  },
  skillSelectorChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  skillSelectorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  skillSelectorChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  quickSignalsSection: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  quickSignalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  quickSignalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  quickSignalChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  quickSignalText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
  },
  quickSignalTextActive: {
    color: Colors.dark.primary,
  },
  issueToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  issueToggleText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
  },
  issueOptions: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  issueChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  issueChipActive: {
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "15",
  },
  issueChipText: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
  },
  issueChipTextActive: {
    color: Colors.dark.error,
  },
  domainPreviewSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.disabled + "30",
  },
  domainPreviewLabel: {
    fontSize: Typography.small.fontSize - 1,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  domainPreviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  domainPreviewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  domainPreviewUp: {
    backgroundColor: Colors.dark.primary + "15",
  },
  domainPreviewDown: {
    backgroundColor: Colors.dark.error + "15",
  },
  domainPreviewText: {
    fontSize: Typography.small.fontSize - 2,
    color: Colors.dark.tabIconDefault,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.backgroundRoot + "F5",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  successContent: {
    alignItems: "center",
    gap: Spacing.md,
  },
  successText: {
    ...Typography.h3,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  successSubtext: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  createTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  createTemplateText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sectionSubtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.lg,
  },
  progressCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  progressCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  playerAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitialSmall: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  progressPlayerInfo: {
    flex: 1,
  },
  progressPlayerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  progressMeta: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: 2,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  levelDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  levelBadgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    textTransform: "capitalize",
  },
  notesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  notesBadgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 193, 7, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  xpBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  skillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  skillItem: {
    width: "31%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  skillHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  skillLabel: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  skillRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingValue: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
  },
  noRating: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.disabled,
  },
  noProgressCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  noProgressText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.disabled,
  },
  recentNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.disabled,
  },
  recentNoteText: {
    flex: 1,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
  },
  // Progress Engine V2 Styles
  playerDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  playerAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitialLarge: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  playerDetailInfo: {
    flex: 1,
  },
  playerDetailName: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  playerDetailMeta: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  levelBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  levelDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  levelBadgeTextLarge: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
  },
  xpCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  xpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  xpTotal: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  xpHistory: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.disabled,
  },
  xpHistoryTitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  xpTransaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  xpAmount: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
    minWidth: 40,
  },
  xpSource: {
    flex: 1,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  domainGrid: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  domainCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  domainName: {
    flex: 1,
    ...Typography.h4,
    color: Colors.dark.text,
  },
  progressBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressValue: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "right",
  },
  domainMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trendText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
  },
  assessmentBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  assessmentText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  assessmentToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  assessmentToggleActive: {
    backgroundColor: Colors.dark.gold + "30",
  },
  assessmentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  assessmentBannerText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.gold,
  },
  assessmentOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  assessmentOption: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
  },
  assessmentOptionText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  saveAssessmentsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  saveAssessmentsText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },
  momentumRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  momentumText: {
    fontSize: Typography.small.fontSize,
  },
  domainXpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  domainXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  domainXpText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  domainObsCount: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  domainAvgDelta: {
    fontSize: 10,
    fontWeight: "500",
  },
  trendsContainer: {
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  plansHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  addTemplateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  templatesGrid: {
    gap: Spacing.md,
  },
  templateCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  templateTypeIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  templateName: {
    flex: 1,
    ...Typography.h4,
    color: Colors.dark.text,
  },
  templateMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  templateMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  templateMetaText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  templateTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  templateTypeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  templateBallLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  templateBallText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  templateNotes: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  templateActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  templateActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  templateActionText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalScrollContainer: {
    height: "85%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  modalScrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingBottom: 120,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  modalField: {
    marginBottom: Spacing.md,
  },
  modalLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  modalInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  modalTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  typeButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  typeButtonActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  typeButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  typeButtonTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  durationButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  durationButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  durationButtonActive: {
    backgroundColor: Colors.dark.xpCyan + "20",
    borderColor: Colors.dark.xpCyan,
  },
  durationButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  durationButtonTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  ballLevelButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ballLevelButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
  },
  ballLevelButtonActive: {
    backgroundColor: Colors.dark.disabled + "20",
  },
  ballLevelText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  saveTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  saveTemplateText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },

  // ============== CALM DESIGN STYLES ==============
  // Tab bar - simple pills
  calmTabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  calmTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  calmTabActive: {
    backgroundColor: Colors.dark.primary + "20",
  },
  calmTabText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  calmTabTextActive: {
    color: Colors.dark.primary,
  },

  // Period filter pills
  calmPeriodScroll: {
    flexGrow: 0,
    marginBottom: Spacing.sm,
  },
  calmPeriodContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  calmPeriodPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.xs,
  },
  calmPeriodPillActive: {
    backgroundColor: Colors.dark.primary + "20",
  },
  calmPeriodText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  calmPeriodTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },

  // Status filter pills
  calmStatusScroll: {
    flexGrow: 0,
    marginBottom: Spacing.md,
  },
  calmStatusContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  calmStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: "transparent",
    marginRight: Spacing.xs,
  },
  calmStatusText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },

  // Empty state
  calmEmptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  calmEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  calmEmptyText: {
    ...Typography.body,
    color: Colors.dark.text,
    textAlign: "center",
  },
  calmEmptySubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: Spacing.xs,
  },

  // Session cards
  calmSessionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  calmSessionCardNeedsFeedback: {
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  calmSessionTimeBadge: {
    alignItems: "center",
    minWidth: 50,
  },
  calmSessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  calmSessionDuration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  calmSessionInfo: {
    flex: 1,
  },
  calmSessionType: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  calmSessionDate: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: 4,
  },
  calmSessionBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  calmPendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  calmPendingText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
  },
  calmXpText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  calmDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  calmDoneText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
  },
});
