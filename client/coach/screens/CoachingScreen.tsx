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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

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
}

interface PlayerXpData {
  totalXp: number;
  transactions: { id: string; xpAmount: number; source: string; description: string | null; createdAt: string }[];
}

export default function CoachingScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("today");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Coaching</Text>
      </View>

      <View style={styles.tabBar}>
        {([
          { id: "today", label: "Today", icon: "today-outline" },
          { id: "progress", label: "Progress", icon: "trending-up-outline" },
          { id: "plans", label: "Plans", icon: "document-text-outline" },
        ] as const).map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab.id);
            }}
          >
            <Ionicons
              name={tab.icon as keyof typeof Ionicons.glyphMap}
              size={20}
              color={activeTab === tab.id ? Colors.dark.primary : Colors.dark.tabIconDefault}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
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
    else if (pf.progressTrend === "up") technical = "up";
    else if (pf.progressTrend === "down") technical = "down";

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
    else if (pf.progressTrend === "up" && focusTags.length > 0) tactical = "up";

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

  const today = new Date();
  const todaysSessions = useMemo(() => {
    if (!calendarData?.ownSessions) return [];
    return calendarData.ownSessions
      .filter((session) => {
        const sessionDate = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        return (
          sessionDate.getFullYear() === today.getFullYear() &&
          sessionDate.getMonth() === today.getMonth() &&
          sessionDate.getDate() === today.getDate() &&
          session.status !== "cancelled" &&
          endTime < new Date()
        );
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [calendarData?.ownSessions, today]);

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
          // Map progressTrend to domain observations
          // We create observations for Technical domain based on progress trend
          const technicalDomain = domains.find(d => d.name === "technical");
          const mentalDomain = domains.find(d => d.name === "mental");
          
          const observations = [];
          
          // Technical domain observation based on progressTrend
          if (technicalDomain) {
            observations.push({
              domainId: technicalDomain.id,
              direction: pf.progressTrend === "up" ? "up" : pf.progressTrend === "down" ? "down" : "stable",
              effortLevel: pf.effortLevel,
              note: pf.note || null,
            });
          }
          
          // Mental domain observation based on mood
          if (mentalDomain && data.feedback.mood) {
            observations.push({
              domainId: mentalDomain.id,
              direction: data.feedback.mood === "good" ? "up" : data.feedback.mood === "low" ? "down" : "stable",
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
    saveFeedbackMutation.mutate({
      sessionId: selectedSession.id,
      feedback: {
        intensity,
        mood,
        focusTags,
        generalNote,
        playerFeedback,
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
                      {!isExpanded && pf.progressTrend !== "stable" ? (
                        <Ionicons 
                          name={pf.progressTrend === "up" ? "trending-up" : "trending-down"}
                          size={14}
                          color={pf.progressTrend === "up" ? Colors.dark.primary : Colors.dark.error}
                          style={{ marginRight: Spacing.sm }}
                        />
                      ) : null}
                      <Ionicons 
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={Colors.dark.tabIconDefault}
                      />
                    </View>
                  </Pressable>
                  
                  {isExpanded ? (
                    <>
                      <View style={styles.playerFeedbackRow}>
                        <Text style={styles.playerFeedbackLabel}>Observed Progress</Text>
                        <View style={styles.trendButtons}>
                          {([
                            { value: "up", icon: "trending-up" as const, color: Colors.dark.primary },
                            { value: "stable", icon: "remove" as const, color: Colors.dark.orange },
                            { value: "down", icon: "trending-down" as const, color: Colors.dark.error },
                          ] as const).map((opt) => (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.trendButton,
                                pf.progressTrend === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                              ]}
                              onPress={() => updatePlayerFeedback(pf.playerId, "progressTrend", opt.value)}
                              onLongPress={() => {
                                if (opt.value !== "stable" && focusTags.length > 0) {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                  updatePlayerFeedback(pf.playerId, "progressTrend", opt.value);
                                  setShowSkillSelector(pf.playerId);
                                }
                              }}
                              delayLongPress={400}
                            >
                              <Ionicons
                                name={opt.icon}
                                size={16}
                                color={pf.progressTrend === opt.value ? opt.color : Colors.dark.disabled}
                              />
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      
                      {/* Inline skill selector (appears on long-press) */}
                      {showSkillSelector === pf.playerId ? (
                        <View style={styles.skillSelectorContainer}>
                          <View style={styles.skillSelectorHeader}>
                            <Text style={styles.skillSelectorTitle}>
                              Refine which skills {pf.progressTrend === "up" ? "improved" : "need work"}:
                            </Text>
                            <Pressable 
                              onPress={() => setShowSkillSelector(null)}
                              hitSlop={8}
                            >
                              <Ionicons name="close" size={18} color={Colors.dark.tabIconDefault} />
                            </Pressable>
                          </View>
                          <View style={styles.skillSelectorChips}>
                            {focusTags.map((skill) => {
                              const isSelected = pf.skillProgress[skill] === pf.progressTrend;
                              return (
                                <Pressable
                                  key={skill}
                                  style={[
                                    styles.skillSelectorChip,
                                    isSelected && { 
                                      backgroundColor: pf.progressTrend === "up" ? Colors.dark.primary + "20" : Colors.dark.error + "20",
                                      borderColor: pf.progressTrend === "up" ? Colors.dark.primary : Colors.dark.error,
                                    },
                                  ]}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setPlayerFeedback(prev => prev.map(p => {
                                      if (p.playerId !== pf.playerId) return p;
                                      const newSkillProgress = { ...p.skillProgress };
                                      if (isSelected) {
                                        delete newSkillProgress[skill];
                                      } else {
                                        newSkillProgress[skill] = pf.progressTrend as SkillChipState;
                                      }
                                      return { ...p, skillProgress: newSkillProgress };
                                    }));
                                  }}
                                >
                                  <Ionicons 
                                    name={isSelected ? "checkmark-circle" : "ellipse-outline"} 
                                    size={14} 
                                    color={isSelected 
                                      ? (pf.progressTrend === "up" ? Colors.dark.primary : Colors.dark.error)
                                      : Colors.dark.tabIconDefault
                                    } 
                                  />
                                  <Text style={[
                                    styles.skillSelectorChipText,
                                    isSelected && { 
                                      color: pf.progressTrend === "up" ? Colors.dark.primary : Colors.dark.error,
                                    },
                                  ]}>
                                    {skill}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}
                      
                      {/* Show focus skills connection hint */}
                      {focusTags.length > 0 && pf.progressTrend !== "stable" && showSkillSelector !== pf.playerId ? (
                        <Pressable 
                          style={styles.focusLinkHint}
                          onPress={() => setShowSkillSelector(pf.playerId)}
                        >
                          <Ionicons name="link-outline" size={12} color={Colors.dark.tabIconDefault} />
                          <Text style={styles.focusLinkText}>
                            Applied to: {focusTags.join(", ")}
                          </Text>
                          <Ionicons name="chevron-forward" size={10} color={Colors.dark.tabIconDefault} />
                        </Pressable>
                      ) : focusTags.length === 0 && pf.progressTrend !== "stable" ? (
                        <View style={styles.focusLinkHint}>
                          <Ionicons name="information-circle-outline" size={12} color={Colors.dark.tabIconDefault} />
                          <Text style={styles.focusLinkText}>
                            General progress (no focus selected)
                          </Text>
                        </View>
                      ) : null}

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
      <Text style={styles.sectionTitle}>Today's Lessons</Text>
      {todaysSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.dark.primary} />
          <Text style={styles.emptyText}>No completed lessons today</Text>
          <Text style={styles.emptySubtext}>Feedback will appear here after each lesson</Text>
        </View>
      ) : (
        todaysSessions.map((session) => {
          const needsFeedback = session.status !== "completed";
          return (
            <Pressable
              key={session.id}
              style={styles.sessionCard}
              onPress={() => needsFeedback && setSelectedSession(session)}
            >
              <View style={styles.sessionTime}>
                <Text style={styles.sessionTimeText}>{formatTime(session.startTime)}</Text>
                <Text style={styles.sessionDuration}>{session.duration}m</Text>
              </View>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionType}>
                  {session.sessionType === "private"
                    ? "Private"
                    : session.sessionType === "semi_private"
                    ? "Semi-Private"
                    : session.sessionType === "group"
                    ? "Group"
                    : session.sessionType}
                </Text>
                {needsFeedback ? (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingText}>Needs feedback</Text>
                  </View>
                ) : (
                  <View style={styles.doneBadge}>
                    <Ionicons name="checkmark" size={14} color={Colors.dark.primary} />
                    <Text style={styles.doneText}>Completed</Text>
                  </View>
                )}
              </View>
              {needsFeedback ? (
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
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

function PlansTab({ insets }: { insets: { bottom: number } }) {
  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>Lesson Preparation</Text>
      <View style={styles.emptyCard}>
        <Ionicons name="document-text-outline" size={48} color={Colors.dark.gold} />
        <Text style={styles.emptyText}>Session Templates</Text>
        <Text style={styles.emptySubtext}>
          Create templates for your lessons and link them to your calendar
        </Text>
        <Pressable style={styles.createTemplateButton}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
          <Text style={styles.createTemplateText}>Create Template</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xs,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  tabText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  tabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
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
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  emptyCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
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
});
