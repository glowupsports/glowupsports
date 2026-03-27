import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import StandaloneSessionDetailDrawer from "@/coach/components/StandaloneSessionDetailDrawer";
import QuickFeedbackModal from "@/coach/components/QuickFeedbackModal";
import type { TabProps, ProgressTrend, EffortLevel, Intensity } from "./types";
import { styles } from "./coachingStyles";

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

export function TodayFeedbackTab({ insets: _insets, tabBarHeight }: TabProps) {
  const { coach } = useCoach();
  const queryClient = useQueryClient();
  
  // Period toggle: week or month view
  type ViewPeriod = "week" | "month";
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("week");
  
  // Week/month offset for navigation (0 = current period, -1 = previous, +1 = next)
  const [periodOffset, setPeriodOffset] = useState(0);
  
  // Calculate the date string and query view based on period type
  const getPeriodDateString = (offset: number, period: ViewPeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + (offset * 7)); // Sunday of the target week
      return weekStart.toISOString().split('T')[0];
    } else {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      return monthStart.toISOString().split('T')[0];
    }
  };
  
  const periodDateString = getPeriodDateString(periodOffset, viewPeriod);
  
  // Fetch calendar data for the selected period - this is separate from CoachContext
  const { data: periodCalendarData, isLoading } = useQuery<{ ownSessions: any[] }>({
    queryKey: [`/api/coach/calendar?date=${periodDateString}&view=${viewPeriod}`],
    enabled: !!coach?.id,
  });
  
  // Reset offset when switching period type
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
  const [showSkillSelector, setShowSkillSelector] = useState<string | null>(null); // playerId for skill selector
  // Per-player skill group expansion state: { playerId: Set<groupKey> }
  const [playerExpandedSkillGroups, setPlayerExpandedSkillGroups] = useState<Record<string, Set<string>>>({});
  // Status filter
  const [statusFilter, setStatusFilter] = useState<"all" | "complete" | "open" | "pending">("all");
  
  // Track expanded state for day accordions (moved to top to fix hook order)
  const [expandedDays, setExpandedDays] = useState<Set<string | number>>(new Set());

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

  // Helper to check if a session has feedback submitted (status is "completed")
  const hasSessionFeedback = (session: any) => session.status === "completed";

  // Get XP for a session type
  const getSessionXp = (sessionType: string): number => {
    return FEEDBACK_XP_REWARDS[sessionType] || FEEDBACK_XP_REWARDS.default;
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
  
  // Filter STANDALONE sessions from the period calendar data (moved to top to fix hook order)
  const periodSessions = useMemo(() => {
    if (!periodCalendarData?.ownSessions) return [];
    
    return periodCalendarData.ownSessions
      .filter((session: any) => {
        const isStandalone = !session.seriesId;
        return isStandalone && session.status !== "cancelled";
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [periodCalendarData?.ownSessions]);
  
  // Apply status filter (moved to top to fix hook order)
  const filteredPeriodSessions = useMemo(() => {
    const hasSessionFeedbackCheck = (session: any) => session.status === "completed";
    if (statusFilter === "all") return periodSessions;
    return periodSessions.filter((session) => {
      const hasFeedback = hasSessionFeedbackCheck(session);
      switch (statusFilter) {
        case "complete": return hasFeedback;
        case "open": return !hasFeedback;
        case "pending": return !hasFeedback;
        default: return true;
      }
    });
  }, [periodSessions, statusFilter]);
  
  // Group by day of week (for week view) or by date (for month view) - moved to top
  const groupedByDay = useMemo(() => {
    const groups: Record<number | string, any[]> = {};
    for (const session of filteredPeriodSessions) {
      const sessionDate = new Date(session.startTime);
      const groupKey = viewPeriod === "week" 
        ? sessionDate.getDay() 
        : sessionDate.toISOString().split('T')[0];
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(session);
    }
    return groups;
  }, [filteredPeriodSessions, viewPeriod]);
  
  // Sort keys - for week view these are numbers (0-6), for month view these are date strings
  const sortedDays = useMemo(() => {
    const keys = Object.keys(groupedByDay);
    if (viewPeriod === "week") {
      return keys.map(Number).sort((a, b) => a - b);
    } else {
      return keys.sort((a, b) => a.localeCompare(b));
    }
  }, [groupedByDay, viewPeriod]);
  
  // Period status counts (moved to top to fix hook order)
  const periodStatusCounts = useMemo(() => {
    const hasSessionFeedbackCheck = (session: any) => session.status === "completed";
    const complete = periodSessions.filter(s => hasSessionFeedbackCheck(s)).length;
    const open = periodSessions.filter(s => !hasSessionFeedbackCheck(s)).length;
    return { complete, open, all: periodSessions.length };
  }, [periodSessions]);

  const saveFeedbackMutation = useMutation({
    mutationFn: async (data: { sessionId: string; feedback: any }) => {
      // Save session feedback
      await apiRequest("POST", `/api/coach/sessions/${data.sessionId}/feedback`, data.feedback);
      
      // Submit skill observations to Progress Engine V2 for each player
      const coachId = coach?.id;
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
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
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
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
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.saveButtonText}>Save Feedback</Text>
            </>
          )}
        </Pressable>
        </ScrollView>
      </View>
    );
  }

  // State for accordion expansion is defined as expandedDays below
  
  // Calculate the period's date range for display
  const getPeriodRange = (offset: number, period: ViewPeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + (offset * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return { start: weekStart, end: weekEnd };
    } else {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + offset + 1, 1);
      return { start: monthStart, end: monthEnd };
    }
  };
  
  const periodRange = getPeriodRange(periodOffset, viewPeriod);
  
  const formatPeriodLabel = () => {
    const { start, end } = periodRange;
    if (viewPeriod === "month") {
      return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    // Week view
    const endForDisplay = new Date(end);
    endForDisplay.setDate(endForDisplay.getDate() - 1);
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endForDisplay.toLocaleDateString('en-US', { month: 'short' });
    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${endForDisplay.getDate()}`;
    }
    return `${startMonth} ${start.getDate()} - ${endMonth} ${endForDisplay.getDate()}`;
  };
  
  const isCurrentPeriod = periodOffset === 0;
  
  const toggleDay = (day: string | number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };
  
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <>
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Period Toggle (Week/Month) */}
      <View style={styles.periodToggleRow}>
        {(["week", "month"] as const).map((period) => {
          const isActive = viewPeriod === period;
          return (
            <Pressable
              key={period}
              style={[
                styles.periodToggleButton,
                isActive && styles.periodToggleButtonActive,
              ]}
              onPress={() => handlePeriodChange(period)}
            >
              <Text style={[
                styles.periodToggleText,
                isActive && styles.periodToggleTextActive,
              ]}>
                {period === "week" ? "Week" : "Month"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Period Navigation Header */}
      <View style={styles.weekNavHeader}>
        <Pressable 
          style={styles.weekNavArrow} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPeriodOffset(prev => prev - 1);
          }}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.dark.primary} />
        </Pressable>
        
        <View style={styles.weekNavCenter}>
          <Text style={styles.weekNavLabel}>
            {isCurrentPeriod 
              ? (viewPeriod === "week" ? "This Week" : "This Month") 
              : formatPeriodLabel()
            }
          </Text>
          {!isCurrentPeriod ? (
            <Pressable 
              style={styles.todayButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPeriodOffset(0);
              }}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          ) : null}
        </View>
        
        <Pressable 
          style={styles.weekNavArrow} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPeriodOffset(prev => prev + 1);
          }}
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {/* Status Filter Pills */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.calmStatusScroll}
        contentContainerStyle={styles.calmStatusContent}
      >
        {([
          { id: "all" as const, label: "All", count: periodStatusCounts.all, icon: null, color: Colors.dark.primary },
          { id: "open" as const, label: "Needs Feedback", count: periodStatusCounts.open, icon: "alert-circle" as const, color: Colors.dark.gold },
          { id: "complete" as const, label: "Completed", count: periodStatusCounts.complete, icon: "checkmark-circle" as const, color: Colors.dark.primary },
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

      {/* Day Accordion Rows */}
      <View style={styles.dayAccordionContainer}>
        {sortedDays.length === 0 ? (
          <View style={styles.calmEmptyCard}>
            <View style={styles.calmEmptyIcon}>
              <Ionicons name="checkmark-done" size={26} color={Colors.dark.tabIconDefault} />
            </View>
            <Text style={styles.calmEmptyText}>
              {periodSessions.length === 0 
                ? `No standalone lessons this ${viewPeriod}`
                : "No matching lessons"
              }
            </Text>
            <Text style={styles.calmEmptySubtext}>
              {periodSessions.length === 0 
                ? "One-off lessons not part of a class appear here"
                : "Try selecting a different filter"
              }
            </Text>
          </View>
        ) : (
          sortedDays.map((dayKey) => {
            const daySessions = groupedByDay[dayKey] || [];
            const isExpanded = expandedDays.has(dayKey);
            const needsFeedbackCount = daySessions.filter(s => s.status !== "completed").length;
            
            // Format day header based on view period
            const getDayLabel = () => {
              if (viewPeriod === "week") {
                return DAY_NAMES[dayKey as number];
              } else {
                // For month view, show "Mon Jan 13" format
                const date = new Date(dayKey as string);
                return date.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                });
              }
            };
            
            return (
              <View key={String(dayKey)} style={styles.dayAccordion}>
                <Pressable 
                  style={styles.dayAccordionHeader}
                  onPress={() => toggleDay(dayKey)}
                >
                  <View style={styles.dayAccordionLeft}>
                    <Ionicons 
                      name={isExpanded ? "chevron-down" : "chevron-forward"} 
                      size={20} 
                      color={Colors.dark.gold} 
                    />
                    <Text style={styles.dayAccordionTitle}>{getDayLabel()}</Text>
                  </View>
                  <View style={styles.dayAccordionRight}>
                    {needsFeedbackCount > 0 ? (
                      <View style={styles.dayFeedbackBadge}>
                        <Ionicons name="alert-circle" size={12} color={Colors.dark.gold} />
                        <Text style={styles.dayFeedbackBadgeText}>{needsFeedbackCount}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.dayAccordionCount}>{daySessions.length}</Text>
                    <Text style={styles.dayAccordionLabel}>
                      {daySessions.length === 1 ? "lesson" : "lessons"}
                    </Text>
                  </View>
                </Pressable>
                
                {isExpanded ? (
                  <View style={styles.dayAccordionContent}>
                    {daySessions.map((session) => {
                      const needsFeedback = session.status !== "completed";
                      const sessionXp = getSessionXp(session.sessionType);
                      const players = session.players || [];
                      
                      const getTypeColor = (type: string) => {
                        switch (type) {
                          case "private": return Colors.dark.sessionPrivate;
                          case "semi_private": return Colors.dark.sessionSemiPrivate;
                          case "group": return Colors.dark.sessionGroup;
                          case "physical": return Colors.dark.sessionPhysical;
                          case "activity": return Colors.dark.sessionActivity;
                          default: return Colors.dark.sessionPrivate;
                        }
                      };
                      
                      const getBallLevelColor = (level?: string) => {
                        switch (level?.toUpperCase()) {
                          case "BLUE": return "#3B82F6";
                          case "RED": return "#EF4444";
                          case "ORANGE": return "#F97316";
                          case "GREEN": return "#22C55E";
                          case "YELLOW": return "#EAB308";
                          case "ADULT":
                          case "GLOW": return "#00E5FF"; // Cyan for adult players
                          default: return Colors.dark.textMuted;
                        }
                      };
                      
                      const typeColor = getTypeColor(session.sessionType);
                      const primaryBallLevel = players[0]?.ballLevel;
                      const ballLevelColor = getBallLevelColor(primaryBallLevel);
                      
                      const sessionDate = session.sessionDate ? new Date(session.sessionDate) : null;
                      const formattedDate = sessionDate 
                        ? sessionDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : null;
                      
                      return (
                        <Pressable
                          key={session.id}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setDetailSession(session);
                            setShowDetailDrawer(true);
                          }}
                          style={[
                            styles.richSessionCard,
                            needsFeedback && styles.richSessionCardNeedsFeedback,
                          ]}
                        >
                          <View style={[styles.richSessionHeader, { borderBottomColor: typeColor + '40' }]}>
                            <View style={styles.richSessionTimeRow}>
                              <View style={[styles.richSessionTimeBadge, { backgroundColor: typeColor + '20' }]}>
                                <Ionicons name="time-outline" size={12} color={typeColor} />
                                <Text style={[styles.richSessionTimeText, { color: typeColor }]}>
                                  {formatTime(session.startTime)}
                                </Text>
                              </View>
                              <View style={styles.richSessionTypeBadge}>
                                <Text style={styles.richSessionTypeText}>
                                  {session.sessionType === "private" ? "Private" 
                                    : session.sessionType === "semi_private" ? "Semi"
                                    : session.sessionType === "group" ? "Group"
                                    : session.sessionType === "physical" ? "Physical"
                                    : session.sessionType === "activity" ? "Activity"
                                    : session.sessionType}
                                </Text>
                              </View>
                              <Text style={styles.richSessionDuration}>{session.duration}m</Text>
                              {formattedDate ? (
                                <View style={styles.sessionDateBadge}>
                                  <Ionicons name="calendar-outline" size={10} color={Colors.dark.xpCyan} />
                                  <Text style={styles.sessionDateText}>{formattedDate}</Text>
                                </View>
                              ) : null}
                            </View>
                            {primaryBallLevel ? (
                              <View style={[styles.ballLevelBadge, { backgroundColor: ballLevelColor + '20', borderColor: ballLevelColor }]}>
                                <View style={[styles.ballLevelDot, { backgroundColor: ballLevelColor }]} />
                                <Text style={[styles.ballLevelText, { color: ballLevelColor }]}>
                                  {primaryBallLevel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          
                          <View style={styles.richSessionBody}>
                            <View style={styles.richSessionPlayersRow}>
                              <View style={styles.playerAvatarStack}>
                                {players.slice(0, 3).map((player: any, idx: number) => (
                                  <View 
                                    key={player.id || idx} 
                                    style={[
                                      styles.playerAvatarCircle,
                                      { marginLeft: idx > 0 ? -8 : 0, zIndex: 3 - idx }
                                    ]}
                                  >
                                    <Text style={styles.playerAvatarText}>
                                      {player.name?.charAt(0)?.toUpperCase() || "?"}
                                    </Text>
                                  </View>
                                ))}
                                {players.length > 3 ? (
                                  <View style={[styles.playerAvatarCircle, styles.playerAvatarMore, { marginLeft: -8 }]}>
                                    <Text style={styles.playerAvatarMoreText}>+{players.length - 3}</Text>
                                  </View>
                                ) : null}
                              </View>
                              <View style={styles.playerNamesContainer}>
                                <Text style={styles.playerNamesText} numberOfLines={1}>
                                  {players.length === 0 
                                    ? "No players" 
                                    : players.length <= 2 
                                      ? players.map((p: any) => p.name?.split(' ')[0]).join(', ')
                                      : `${players.slice(0, 2).map((p: any) => p.name?.split(' ')[0]).join(', ')} +${players.length - 2}`
                                  }
                                </Text>
                              </View>
                            </View>
                            
                            <View style={styles.richSessionFooter}>
                              {needsFeedback ? (
                                <View style={styles.xpRewardBadge}>
                                  <Ionicons name="flash" size={12} color={Colors.dark.gold} />
                                  <Text style={styles.xpRewardText}>+{sessionXp} XP</Text>
                                </View>
                              ) : (
                                <View style={styles.richCompletedBadge}>
                                  <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
                                  <Text style={styles.richCompletedText}>Completed</Text>
                                </View>
                              )}
                              <View style={styles.feedbackActionRow}>
                                <Text style={[styles.feedbackActionText, !needsFeedback && { color: Colors.dark.xpCyan }]}>
                                  {needsFeedback ? "Add Feedback" : "View Details"}
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color={needsFeedback ? Colors.dark.gold : Colors.dark.xpCyan} />
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
    
    <StandaloneSessionDetailDrawer
      visible={showDetailDrawer}
      session={detailSession}
      onClose={() => {
        setShowDetailDrawer(false);
        setDetailSession(null);
      }}
      onOpenFeedback={(session) => {
        setShowDetailDrawer(false);
        setDetailSession(null);
        setSelectedSession(session as any);
      }}
    />
  </>
  );
}

type AssessmentStatus = "not_yet" | "developing" | "meets" | "above";

