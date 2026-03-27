import React, { useState, useMemo } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type Ionicons from "@expo/vector-icons/Ionicons";
import type {
  TabProps,
  ProgressTrend,
  EffortLevel,
  Intensity,
  Session,
  SessionPlayer,
  SkillDomain,
  SkillChipState,
  SkillProgress,
  QuickSignal,
  SocialIssue,
  PlayerFeedbackState,
  DomainImpact,
} from "../types";

const FEEDBACK_XP_REWARDS: Record<string, number> = {
  private: 25,
  semi_private: 35,
  group: 50,
  camp: 75,
  team_training: 60,
  clinic: 45,
  match: 30,
  assessment: 40,
  default: 20,
};

export function useFeedbackTab(tabBarHeight: number) {
  const { coach } = useCoach();
  const queryClient = useQueryClient();

  type ViewPeriod = "week" | "month";
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("week");
  const [periodOffset, setPeriodOffset] = useState(0);

  const getPeriodDateString = (offset: number, period: ViewPeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + (offset * 7));
      return weekStart.toISOString().split("T")[0];
    } else {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      return monthStart.toISOString().split("T")[0];
    }
  };

  const periodDateString = getPeriodDateString(periodOffset, viewPeriod);

  const { data: periodCalendarData, isLoading } = useQuery<{ ownSessions: any[] }>({
    queryKey: [`/api/coach/calendar?date=${periodDateString}&view=${viewPeriod}`],
    enabled: !!coach?.id,
  });

  const handlePeriodChange = (newPeriod: ViewPeriod) => {
    if (newPeriod !== viewPeriod) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setViewPeriod(newPeriod);
      setPeriodOffset(0);
    }
  };

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [detailSession, setDetailSession] = useState<any>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>("normal");
  const [mood, setMood] = useState<"good" | "neutral" | "low">("neutral");
  const [focusTags, setFocusTags] = useState<string[]>([]);
  const [generalNote, setGeneralNote] = useState("");
  const [playerFeedback, setPlayerFeedback] = useState<PlayerFeedbackState[]>([]);
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState<string | null>(null);
  const [playerExpandedSkillGroups, setPlayerExpandedSkillGroups] = useState<Record<string, Set<string>>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "open" | "pending">("all");
  const [expandedDays, setExpandedDays] = useState<Set<string | number>>(new Set());

  const { data: sessionPlayers = [] } = useQuery<SessionPlayer[]>({
    queryKey: [`/api/coach/sessions/${selectedSession?.id}/players`],
    enabled: !!selectedSession,
  });

  const isPrivateSession = sessionPlayers.length === 1;
  const skillChips = ["Forehand", "Backhand", "Serve", "Volley", "Movement", "Mental"];
  const skillGroups = [
    { key: "Technical", label: "Technical", skills: ["Forehand", "Backhand", "Serve", "Volley"] },
    { key: "Physical", label: "Physical", skills: ["Movement"] },
    { key: "Mental", label: "Mental", skills: ["Mental"] },
  ];

  const toggleSkillGroup = (playerId: string, groupKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerExpandedSkillGroups(prev => {
      const currentPlayerGroups = prev[playerId] || new Set(["Technical"]);
      const next = new Set(currentPlayerGroups);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return { ...prev, [playerId]: next };
    });
  };

  const getPlayerExpandedGroups = (playerId: string): Set<string> => {
    return playerExpandedSkillGroups[playerId] || new Set(["Technical"]);
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
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
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
      return { ...pf, quickSignals: hasSignal ? pf.quickSignals.filter(s => s !== signal) : [...pf.quickSignals, signal] };
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
      let nextState: SkillChipState = "stable";
      if (currentState === "stable") nextState = "up";
      else if (currentState === "up") nextState = "down";
      else nextState = "stable";
      const newSkillProgress = { ...pf.skillProgress };
      if (nextState === "stable") delete newSkillProgress[skill];
      else newSkillProgress[skill] = nextState;
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

  const updatePlayerFeedback = (playerId: string, field: keyof PlayerFeedbackState, value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlayerFeedback((prev) =>
      prev.map((pf) => {
        if (pf.playerId !== playerId) return pf;
        if (field === "progressTrend" && focusTags.length > 0) {
          const newSkillProgress: SkillProgress = { ...pf.skillProgress };
          const currentTrend = pf.progressTrend;
          if (currentTrend === "stable" && (value === "up" || value === "down")) {
            for (const skill of focusTags) {
              if (!(skill in newSkillProgress)) newSkillProgress[skill] = value as SkillChipState;
            }
          } else if (value === "stable") {
            for (const skill of focusTags) delete newSkillProgress[skill];
          }
          return { ...pf, [field]: value, skillProgress: newSkillProgress } as PlayerFeedbackState;
        }
        return { ...pf, [field]: value } as PlayerFeedbackState;
      })
    );
    if (field === "progressTrend" && value === "stable") setShowSkillSelector(null);
  };

  const hasSessionFeedback = (session: any) => session.status === "completed";
  const getSessionXp = (sessionType: string): number => FEEDBACK_XP_REWARDS[sessionType] || FEEDBACK_XP_REWARDS.default;
  const availableTags = ["Movement", "Forehand", "Backhand", "Serve", "Volley", "Mental", "Footwork"];

  const toggleTag = (tag: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const { data: domains = [] } = useQuery<SkillDomain[]>({
    queryKey: ["/api/progress/domains"],
  });

  const periodSessions = useMemo(() => {
    if (!periodCalendarData?.ownSessions) return [];
    return periodCalendarData.ownSessions
      .filter((session: any) => !session.seriesId && session.status !== "cancelled")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [periodCalendarData?.ownSessions]);

  const filteredPeriodSessions = useMemo(() => {
    if (statusFilter === "all") return periodSessions;
    return periodSessions.filter((session) => {
      const hasFeedback = hasSessionFeedback(session);
      switch (statusFilter) {
        case "complete": return hasFeedback;
        case "open": return !hasFeedback;
        case "pending": return !hasFeedback;
        default: return true;
      }
    });
  }, [periodSessions, statusFilter]);

  const groupedByDay = useMemo(() => {
    const groups: Record<number | string, any[]> = {};
    for (const session of filteredPeriodSessions) {
      const sessionDate = new Date(session.startTime);
      const groupKey = viewPeriod === "week" ? sessionDate.getDay() : sessionDate.toISOString().split("T")[0];
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(session);
    }
    return groups;
  }, [filteredPeriodSessions, viewPeriod]);

  const sortedDays = useMemo(() => {
    const keys = Object.keys(groupedByDay);
    if (viewPeriod === "week") return keys.map(Number).sort((a, b) => a - b);
    return keys.sort((a, b) => a.localeCompare(b));
  }, [groupedByDay, viewPeriod]);

  const periodStatusCounts = useMemo(() => {
    const complete = periodSessions.filter(s => hasSessionFeedback(s)).length;
    const open = periodSessions.filter(s => !hasSessionFeedback(s)).length;
    return { complete, open, all: periodSessions.length };
  }, [periodSessions]);

  const saveFeedbackMutation = useMutation({
    mutationFn: async (data: { sessionId: string; feedback: any }) => {
      await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/feedback`, data.feedback);
      const coachId = coach?.id;
      if (coachId && domains.length > 0) {
        for (const pf of data.feedback.playerFeedback) {
          const skillProgress = pf.skillProgress || {};
          const upCount = Object.values(skillProgress).filter(s => s === "up").length;
          const downCount = Object.values(skillProgress).filter(s => s === "down").length;
          const overallDirection = upCount > downCount ? "up" : downCount > upCount ? "down" : "stable";
          const technicalDomain = domains.find(d => d.name === "technical");
          const mentalDomain = domains.find(d => d.name === "mental");
          const observations = [];
          if (technicalDomain) {
            const technicalSkills = ["Forehand", "Backhand", "Serve", "Volley"];
            const techUpCount = technicalSkills.filter(s => skillProgress[s] === "up").length;
            const techDownCount = technicalSkills.filter(s => skillProgress[s] === "down").length;
            const techDirection = techUpCount > techDownCount ? "up" : techDownCount > techUpCount ? "down" : overallDirection;
            observations.push({ domainId: technicalDomain.id, direction: techDirection, effortLevel: pf.effortLevel, note: pf.note || null });
          }
          if (mentalDomain) {
            const mentalSkillDirection = skillProgress["Mental"];
            const moodDirection = data.feedback.mood === "good" ? "up" : data.feedback.mood === "low" ? "down" : null;
            const mentalDirection = mentalSkillDirection || moodDirection || "stable";
            observations.push({ domainId: mentalDomain.id, direction: mentalDirection, effortLevel: pf.effortLevel, note: null });
          }
          if (observations.length > 0) {
            try {
              await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/observations`, { playerId: pf.playerId, coachId, observations });
            } catch (err) {
              console.error("Failed to submit observations for player:", pf.playerId, err);
            }
          }
        }
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["/api/progress/domains"] });
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
    const enrichedPlayerFeedback = playerFeedback.map(pf => {
      const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
      const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
      const derivedTrend: ProgressTrend = upCount > downCount ? "up" : downCount > upCount ? "down" : "stable";
      return { ...pf, progressTrend: derivedTrend };
    });
    saveFeedbackMutation.mutate({
      sessionId: selectedSession.id,
      feedback: { intensity, mood, focusTags, generalNote, playerFeedback: enrichedPlayerFeedback },
    });
  };

  return {
    viewPeriod, setViewPeriod,
    periodOffset, setPeriodOffset,
    isLoading,
    handlePeriodChange,
    selectedSession, setSelectedSession,
    detailSession, setDetailSession,
    showDetailDrawer, setShowDetailDrawer,
    intensity, setIntensity,
    mood, setMood,
    focusTags, setFocusTags,
    generalNote, setGeneralNote,
    playerFeedback, setPlayerFeedback,
    expandedPlayers,
    showSuccess,
    showSkillSelector, setShowSkillSelector,
    playerExpandedSkillGroups,
    statusFilter, setStatusFilter,
    expandedDays, setExpandedDays,
    sessionPlayers,
    isPrivateSession,
    skillChips,
    skillGroups,
    periodStatusCounts,
    sortedDays,
    groupedByDay,
    domains,
    saveFeedbackMutation,
    toggleSkillGroup,
    getPlayerExpandedGroups,
    togglePlayerExpanded,
    applyEffortToAll,
    setAsExpected,
    toggleQuickSignal,
    setSocialIssue,
    calculateDomainImpact,
    cycleSkillState,
    getSkillChipStyle,
    getSkillChipIcon,
    getSkillChipColor,
    updatePlayerFeedback,
    hasSessionFeedback,
    getSessionXp,
    availableTags,
    toggleTag,
    formatTime,
    handleSaveFeedback,
    tabBarHeight,
    periodSessions,
  };
}

export type FeedbackTabState = ReturnType<typeof useFeedbackTab>;
