import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Platform,
  Image as RNImage,
  Dimensions} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSequence, interpolate } from "react-native-reanimated";
import { Colors, Spacing, getPlayerLevelColor, getPlayerLevelTextColor } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders, buildPhotoUrl } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import { useNavigation } from "@react-navigation/native";
import PackagesCard from "@/coach/components/PackagesCard";
import { CoachCreditV2Panel, useV2Enabled } from "./CoachCreditV2Panel";
import QuickFeedbackModal from "@/coach/components/QuickFeedbackModal";
import { PlayerAttendanceSection } from "./PlayerAttendanceSection";
import { PlayerStrokeFeedbackSection } from "./PlayerStrokeFeedbackSection";
import { PlayerNotesSection } from "./PlayerNotesSection";
import { CollapsibleSection } from "./CollapsibleSection";
import { PlayerMonthlyReportsSection } from "./PlayerMonthlyReportsSection";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { JuniorAssessmentFlow } from "@/coach/components/JuniorAssessmentFlow";
import { GlowAssessmentFlow } from "@/coach/components/GlowAssessmentFlow";
import { ActionSheet, ActionSheetItem } from "@/components/ActionSheet";
import { useSupervisorMode } from "@/context/SupervisorModeContext";
import { ScheduleExtraLessonModal } from "./ScheduleExtraLessonModal";
import CreateSessionWizard from "@/coach/components/CreateSessionWizard";
import type { AssessmentResult as JuniorAssessmentResult } from "@/coach/components/JuniorAssessmentFlow";
import { PlayerPaymentsSection } from "./PlayerPaymentsSection";
import CreateInvoiceModal from "@/admin/components/CreateInvoiceModal";

import * as Clipboard from "expo-clipboard";
import { styles } from "./playersStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { useAuth } from "@/coach/context/AuthContext";

const TAB_BAR_HEIGHT = 80;

interface CoachTechniqueAnalysis {
  id: string;
  stroke_type: string;
  status: "completed";
  overall_score: number | null;
  checkpoints: { name: string; rating: "Good" | "Needs Work" | "Focus Area"; explanation: string }[] | null;
  tips: string[] | null;
  created_at: string;
  completed_at: string | null;
}

const COACH_STROKE_COLORS: Record<string, string> = {
  Serve: "#6366F1",
  Forehand: "#10B981",
  Backhand: "#F59E0B",
  Volley: "#3B82F6",
  Return: "#EC4899",
  Overhead: "#8B5CF6",
};

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const COACH_RATING_CONFIG: Record<string, { color: string; icon: IoniconName }> = {
  Good: { color: "#22C55E", icon: "checkmark-circle" },
  "Needs Work": { color: "#F59E0B", icon: "time" },
  "Focus Area": { color: "#EF4444", icon: "alert-circle" },
};

function CoachTechniqueAnalysesSection({ playerId }: { playerId: string }) {
  const navigation = useNavigation<any>();
  const { data, isLoading } = useQuery<{ analyses: CoachTechniqueAnalysis[] }>({
    queryKey: [`/api/coach/players/${playerId}/technique-analyses`],
    staleTime: 60000,
  });

  const analyses = data?.analyses ?? [];

  if (isLoading) {
    return (
      <CollapsibleSection title="AI Technique Analyses" icon="videocam-outline" iconColor="#6366F1">
        <View style={{ padding: Spacing.md, alignItems: "center" }}>
          <Text style={{ color: Colors.dark.textMuted, fontSize: 13 }}>Loading...</Text>
        </View>
      </CollapsibleSection>
    );
  }

  if (analyses.length === 0) {
    return (
      <CollapsibleSection title="AI Technique Analyses" icon="videocam-outline" iconColor="#6366F1">
        <View style={{ padding: Spacing.md, flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
          <Ionicons name="film-outline" size={20} color={Colors.dark.textMuted} />
          <Text style={{ color: Colors.dark.textMuted, fontSize: 13, flex: 1 }}>
            No technique analyses shared by this player yet.
          </Text>
        </View>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection
      title={`AI Technique Analyses (${analyses.length})`}
      icon="videocam-outline"
      iconColor="#6366F1"
    >
      <View style={{ gap: Spacing.sm, padding: Spacing.sm }}>
        {analyses.map((a) => {
          const color = COACH_STROKE_COLORS[a.stroke_type] ?? "#6366F1";
          const score = a.overall_score ?? 0;
          const scoreColor = score >= 80 ? "#22C55E" : score >= 60 ? "#F59E0B" : "#EF4444";
          const dateStr = a.completed_at
            ? new Date(a.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
            : new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <Pressable
              key={a.id}
              style={({ pressed }) => ({
                backgroundColor: Colors.dark.surfaceElevated,
                borderRadius: 12,
                padding: Spacing.md,
                gap: Spacing.sm,
                borderLeftWidth: 3,
                borderLeftColor: color,
                opacity: pressed ? 0.85 : 1,
              })}
              onPress={() => {
                navigation.navigate("CoachTechniqueAnalysisDetail", { analysis: a });
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.dark.text, flex: 1 }}>
                  {a.stroke_type}
                </Text>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    borderWidth: 3,
                    borderColor: scoreColor,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: scoreColor + "14",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "900", color: scoreColor }}>{score}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
              </View>
              <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>{dateStr}</Text>
              {(a.checkpoints ?? []).length > 0 ? (
                <View style={{ gap: 4 }}>
                  {(a.checkpoints ?? []).map((cp, i) => {
                    const cfg = COACH_RATING_CONFIG[cp.rating] ?? COACH_RATING_CONFIG["Needs Work"];
                    return (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                        <Text style={{ fontSize: 12, color: Colors.dark.text, fontWeight: "600", width: 100 }}>{cp.name}</Text>
                        <Text style={{ fontSize: 11, color: Colors.dark.textMuted, flex: 1 }} numberOfLines={1}>{cp.explanation}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {(a.tips ?? []).length > 0 ? (
                <View style={{ backgroundColor: "#6366F110", borderRadius: 8, padding: Spacing.sm, gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#6366F1", marginBottom: 2 }}>AI Tips</Text>
                  {(a.tips ?? []).map((tip, i) => (
                    <Text key={i} style={{ fontSize: 11, color: Colors.dark.text, lineHeight: 16 }}>
                      {i + 1}. {tip}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </CollapsibleSection>
  );
}

const { width: _SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const BALL_LEVELS = ["blue", "red", "orange", "green", "yellow", "glow"];

// ---------- Task #1583: Coach match history section ----------
interface CoachMatchResult {
  id: string;
  opponentName: string;
  playedAt: string;
  scoreDisplay: string;
  didWin: boolean;
  status: string;
  isOwner: boolean;
}

function PlayerUpcomingMatchesSection({ playerId }: { playerId: string }) {
  const navigation = useNavigation<any>();
  const { coach } = useCoach();
  const [messagingMatchId, setMessagingMatchId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    id: string;
    preferredDate?: string | null;
    preferredTime?: string | null;
    matchType?: string | null;
    status?: string | null;
    currentPlayers?: number | null;
    maxPlayers?: number | null;
    playerName?: string | null;
  }[]>({
    queryKey: [`/api/open-matches`, { joinedByPlayerId: playerId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/open-matches?joinedByPlayerId=${playerId}`);
      return res.json();
    },
    staleTime: 60000,
  });

  const openChatMutation = useMutation({
    mutationFn: async ({ matchId, initialMessage }: { matchId: string; initialMessage: string }) => {
      setMessagingMatchId(matchId);
      const res = await apiRequest("POST", "/api/conversations/coach-player", { playerId });
      return { conversation: await res.json(), initialMessage };
    },
    onSuccess: ({ conversation, initialMessage }: { conversation: { id: string }; initialMessage: string }) => {
      setMessagingMatchId(null);
      try {
        navigation.navigate("PlayerBookingChat", {
          conversationId: conversation.id,
          initialMessage,
        });
      } catch {
        try {
          navigation.getParent()?.navigate("PlayerBookingChat", {
            conversationId: conversation.id,
            initialMessage,
          });
        } catch {
          Alert.alert("Chat opened", "Find the conversation in your messages.");
        }
      }
    },
    onError: () => {
      setMessagingMatchId(null);
      Alert.alert("Couldn't open chat", "Please try again.");
    },
  });

  if (!coach) return null;

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 20, alignItems: "center" }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.dark.primary, borderTopColor: "transparent" }} />
      </View>
    );
  }

  const matches = Array.isArray(data) ? data : [];

  if (matches.length === 0) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center", gap: 6 }}>
        <Ionicons name="tennisball-outline" size={32} color={Colors.dark.textMuted} />
        <Text style={{ color: Colors.dark.textMuted, fontSize: 13 }}>No upcoming open matches</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {matches.slice(0, 8).map((m) => {
        const dateStr = m.preferredDate
          ? new Date(m.preferredDate).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })
          : null;
        const timeStr = m.preferredTime ? m.preferredTime.slice(0, 5) : null;
        const playerCount = m.currentPlayers != null && m.maxPlayers != null
          ? `${m.currentPlayers}/${m.maxPlayers} players`
          : null;
        const isMessaging = messagingMatchId === m.id && openChatMutation.isPending;
        return (
          <View
            key={m.id}
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 10,
              padding: 10,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(249,115,22,0.15)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="tennisball" size={18} color="#f97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.dark.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                  {(m.matchType ?? "Open Match").charAt(0).toUpperCase() + (m.matchType ?? "open match").slice(1)} with {m.playerName ?? "host"}
                </Text>
                <Text style={{ color: Colors.dark.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {[dateStr, timeStr, playerCount].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <View style={{
                backgroundColor: m.status === "full" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)",
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}>
                <Text style={{ color: m.status === "full" ? "#ef4444" : "#22c55e", fontSize: 10, fontWeight: "700" }}>
                  {m.status === "full" ? "FULL" : "OPEN"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const template = dateStr
                  ? `Excited for your match on ${dateStr}?`
                  : "Excited for your upcoming match?";
                openChatMutation.mutate({ matchId: m.id, initialMessage: template });
              }}
              disabled={openChatMutation.isPending}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 8,
                backgroundColor: isMessaging ? "rgba(249,115,22,0.20)" : "rgba(249,115,22,0.10)",
                borderWidth: 1,
                borderColor: "rgba(249,115,22,0.35)",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="chatbubble-outline" size={14} color="#f97316" />
              <Text style={{ color: "#f97316", fontSize: 13, fontWeight: "600" }}>
                {isMessaging ? "Opening..." : "Message Player"}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function CoachMatchHistorySection({ playerId }: { playerId: string }) {
  const { data, isLoading } = useQuery<{
    results: CoachMatchResult[];
    stats: { wins: number; losses: number; total: number };
  }>({
    queryKey: [`/api/coach/players/${playerId}/match-results`],
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 20, alignItems: "center" }}>
        <TennisBallSpinner color={Colors.dark.primary} size="small" />
      </View>
    );
  }

  const results = data?.results ?? [];
  const stats = data?.stats;

  if (results.length === 0) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center", gap: 6 }}>
        <Ionicons name="tennisball-outline" size={32} color={Colors.dark.textMuted} />
        <Text style={{ color: Colors.dark.textMuted, fontSize: 13 }}>No matches logged yet</Text>
      </View>
    );
  }

  const winColor = "#22c55e";
  const lossColor = "#ef4444";

  return (
    <View style={{ gap: 8 }}>
      {stats && (stats.wins + stats.losses > 0) ? (
        <View style={{ flexDirection: "row", gap: 16, paddingVertical: 8, paddingHorizontal: 4 }}>
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.dark.text }}>{stats.wins}</Text>
            <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontWeight: "600" }}>WINS</Text>
          </View>
          <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.dark.text }}>{stats.losses}</Text>
            <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontWeight: "600" }}>LOSSES</Text>
          </View>
          <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.dark.text }}>
              {stats.wins + stats.losses > 0 ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0}%
            </Text>
            <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontWeight: "600" }}>WIN RATE</Text>
          </View>
        </View>
      ) : null}
      {results.slice(0, 10).map((r) => {
        const rc = r.didWin ? winColor : lossColor;
        let statusLabel = r.status === "pending" ? "Pending" : r.status === "confirmed" ? "Confirmed" : r.status === "auto_confirmed" ? "Auto-confirmed" : "Disputed";
        let statusColor = r.status === "pending" ? "#facc15" : r.status === "confirmed" ? winColor : r.status === "auto_confirmed" ? Colors.dark.textMuted : lossColor;
        return (
          <View
            key={r.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: Colors.dark.backgroundDefault,
              borderRadius: 10,
              padding: 10,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: rc + "20", borderWidth: 1.5, borderColor: rc + "50",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: rc }}>{r.didWin ? "W" : "L"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.dark.text }} numberOfLines={1}>
                vs {r.opponentName}
              </Text>
              {r.scoreDisplay ? (
                <Text style={{ fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "600" }}>{r.scoreDisplay}</Text>
              ) : null}
              <Text style={{ fontSize: 11, color: statusColor, fontWeight: "600", marginTop: 1 }}>{statusLabel}</Text>
            </View>
            <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(r.playedAt))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

interface Player {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ballLevel: string | null;
  skillLevel: string | null;
  status: string | null;
  medicalNotes: string | null;
  lastLessonDate: string | null;
  createdAt: string;
  age?: number | null;
  height?: number | null;
  tshirtSize?: string | null;
  onboardingCompleted?: boolean;
  motivationType?: string | null;
  experienceLevel?: string | null;
  dominantHand?: string | null;
  enjoymentTags?: string[] | null;
  focusGoals?: string[] | null;
  selfConfidenceFlags?: string[] | null;
  profilePhotoUrl?: string | null;
  remainingCredits?: number;
  totalCredits?: number;
  creditsByType?: { private: number; group: number; semiPrivate: number };
  primaryCreditType?: string | null;
  auditVerifiedAt?: string | null;
  auditVerifiedBy?: string | null;
  activeGroupsCount?: number;
  pausedGroupsCount?: number;
  onHoliday?: boolean;
  parentEmail?: string | null;
  parentReporting?: boolean;
}

interface PlayerXpData {
  totalXp: number;
  transactions: { id: string; xpAmount: number; source: string; description: string | null; createdAt: string }[];
}

// Level progression thresholds (XP required for each level)
const LEVEL_THRESHOLDS = {
  red: { xpRequired: 0, nextLevel: "orange", xpForNext: 500 },
  orange: { xpRequired: 500, nextLevel: "green", xpForNext: 1500 },
  green: { xpRequired: 1500, nextLevel: "yellow", xpForNext: 3500 },
  yellow: { xpRequired: 3500, nextLevel: "glow", xpForNext: 7000 },
  glow: { xpRequired: 7000, nextLevel: null, xpForNext: null },
};

type LevelReadiness = {
  nextLevel: string;
  progress: number;
  xpRemaining: number;
  xpInLevel: number;
  xpNeeded: number;
} | null;

const getLevelReadiness = (currentLevel: string | null, totalXp: number): LevelReadiness => {
  if (!currentLevel) return null;
  const levelData = LEVEL_THRESHOLDS[currentLevel.toLowerCase() as keyof typeof LEVEL_THRESHOLDS];
  // Return null for max level (Glow) or invalid level - no progress card needed
  if (!levelData || !levelData.nextLevel || !levelData.xpForNext) return null;
  
  const xpInLevel = totalXp - levelData.xpRequired;
  const xpNeeded = levelData.xpForNext - levelData.xpRequired;
  const progress = Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));
  const xpRemaining = Math.max(0, levelData.xpForNext - totalXp);
  
  return {
    nextLevel: levelData.nextLevel,
    progress,
    xpRemaining,
    xpInLevel,
    xpNeeded,
  };
};

interface PlayerQuestItem {
  id: string;
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  category: string;
  currentProgress: number;
  targetProgress: number;
  status: string;
  xpReward: number | null;
  personalisedBy: string | null;
}

interface DrillItem {
  id: string;
  name: string;
  category: string | null;
  difficulty: string | null;
  durationMinutes: number | null;
  description: string | null;
}

interface DrillLogSummary {
  completionCount: number;
  avgRating: number | null;
  lastLoggedAt: string | null;
}

interface DrillLogEntry {
  id: string;
  createdAt: string | null;
  durationDone: number | null;
  rating: number | null;
  notes: string | null;
}

interface CoachAssignment {
  id: string;
  drillId: string;
  message: string | null;
  assignedAt: string;
  dismissedAt: string | null;
  drill: DrillItem;
  logSummary: DrillLogSummary;
  recentLogs: DrillLogEntry[];
}

const CATEGORY_ICON: Record<string, string> = {
  "Serve": "arrow-up-circle-outline",
  "Forehand": "flash-outline",
  "Backhand": "swap-horizontal-outline",
  "Footwork": "footsteps-outline",
  "Net Play": "contract-outline",
  "Match Tactics": "bulb-outline",
  "Fitness & Conditioning": "barbell-outline",
  "Other": "ellipsis-horizontal-circle-outline",
};

const CATEGORY_COLOR: Record<string, string> = {
  "Serve": "#6366F1",
  "Forehand": "#F97316",
  "Backhand": "#10B981",
  "Footwork": "#EC4899",
  "Net Play": "#0EA5E9",
  "Match Tactics": "#8B5CF6",
  "Fitness & Conditioning": "#F59E0B",
  "Other": "#6B7280",
};

function PlayerDrillsSection({ playerId }: { playerId: string }) {
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const { data: assignedData, isLoading: loadingAssigned } = useQuery<{ assigned: CoachAssignment[] }>({
    queryKey: ["/api/coach/players", playerId, "drills", "assigned"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/coach/players/${playerId}/drills/assigned`);
      return res.json();
    },
  });

  const { data: drillsData } = useQuery<{ drills: DrillItem[] }>({
    queryKey: ["/api/coach/drills"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/coach/drills");
      return res.json();
    },
    enabled: showPicker,
  });

  const assigned = assignedData?.assigned ?? [];
  const availDrills = drillsData?.drills ?? [];

  const handleAssign = async () => {
    if (!selectedDrillId) {
      Alert.alert("Select a drill", "Please choose a drill to assign.");
      return;
    }
    setIsAssigning(true);
    try {
      await apiRequest("POST", `/api/coach/players/${playerId}/drills/assign`, {
        drillId: selectedDrillId,
        message: message.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/players", playerId, "drills", "assigned"] });
      setShowPicker(false);
      setSelectedDrillId(null);
      setMessage("");
    } catch {
      Alert.alert("Error", "Could not assign drill. Please try again.");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    try {
      await apiRequest("DELETE", `/api/coach/drills/assigned/${assignmentId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/players", playerId, "drills", "assigned"] });
    } catch {
      Alert.alert("Error", "Could not remove drill assignment.");
    }
  };

  if (loadingAssigned) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <TennisBallSpinner size="small" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      {assigned.length === 0 ? (
        <View style={{ paddingVertical: 8, alignItems: "center", gap: 6 }}>
          <Ionicons name="fitness-outline" size={24} color={Colors.dark.tabIconDefault} />
          <Text style={{ color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" }}>
            No drills assigned yet
          </Text>
        </View>
      ) : (
        assigned.map(a => {
          const cat = a.drill.category ?? "Other";
          const color = CATEGORY_COLOR[cat] ?? "#6B7280";
          const icon = CATEGORY_ICON[cat] ?? "ellipsis-horizontal-circle-outline";
          const { completionCount, avgRating } = a.logSummary ?? { completionCount: 0, avgRating: null, lastLoggedAt: null };
          const hasActivity = completionCount > 0;
          const avgStars = avgRating !== null ? Math.round(avgRating) : null;
          const recentLogs = a.recentLogs ?? [];
          return (
            <View key={a.id} style={{ backgroundColor: Colors.dark.backgroundDefault, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.chipBorder, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={icon as any} size={18} color={color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.dark.text }} numberOfLines={1}>{a.drill.name}</Text>
                  {a.message ? <Text style={{ fontSize: 12, color: Colors.dark.textMuted, fontStyle: "italic" }} numberOfLines={2}>{a.message}</Text> : null}
                  <Text style={{ fontSize: 11, color: Colors.dark.textSecondary }}>{a.drill.difficulty ?? "Intermediate"} • {a.drill.durationMinutes ?? 15} min</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => Alert.alert("Remove Drill", "Remove this drill assignment?", [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => handleUnassign(a.id) }])}>
                  <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                </Pressable>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 8, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="checkmark-circle-outline" size={13} color={hasActivity ? "#22C55E" : Colors.dark.textMuted} />
                    <Text style={{ fontSize: 11, fontWeight: "600", color: hasActivity ? Colors.dark.text : Colors.dark.textMuted }}>
                      {completionCount} {completionCount === 1 ? "completion" : "completions"}
                    </Text>
                  </View>
                  {avgStars !== null ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <Ionicons key={s} name={s <= avgStars ? "star" : "star-outline"} size={11} color={s <= avgStars ? "#F59E0B" : Colors.dark.textMuted} />
                      ))}
                      <Text style={{ fontSize: 11, color: Colors.dark.textSecondary, marginLeft: 2 }}>avg</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>No rating yet</Text>
                  )}
                </View>
                {recentLogs.length > 0 ? (
                  <View style={{ gap: 4, marginTop: 2 }}>
                    {recentLogs.map((log) => {
                      const logDate = log.createdAt
                        ? new Date(log.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : null;
                      const logStars = log.rating ?? null;
                      return (
                        <View key={log.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 7 }}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              {logDate ? <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.dark.textSecondary }}>{logDate}</Text> : null}
                              {log.durationDone ? <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>{log.durationDone} min</Text> : null}
                              {logStars !== null ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Ionicons key={s} name={s <= logStars ? "star" : "star-outline"} size={10} color={s <= logStars ? "#F59E0B" : Colors.dark.textMuted} />
                                  ))}
                                </View>
                              ) : null}
                            </View>
                            {log.notes ? <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontStyle: "italic" }} numberOfLines={2}>{log.notes}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ fontSize: 11, color: Colors.dark.textMuted, fontStyle: "italic" }}>No completions logged yet</Text>
                )}
              </View>
            </View>
          );
        })
      )}

      <Pressable
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.dark.chipBackgroundStrong, borderRadius: 12, paddingVertical: 10, opacity: pressed ? 0.75 : 1 })}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPicker(true); }}
      >
        <Ionicons name="add-circle-outline" size={16} color={Colors.dark.primary} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.dark.primary }}>Assign Drill</Text>
      </Pressable>

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setShowPicker(false)} />
          <View style={{ backgroundColor: Colors.dark.backgroundDefault, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: "75%" }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: Colors.dark.text }}>Assign Drill</Text>

            <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.dark.textSecondary }}>SELECT DRILL</Text>
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {availDrills.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <TennisBallSpinner size="small" color={Colors.dark.primary} />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {availDrills.map(drill => {
                    const cat = drill.category ?? "Other";
                    const color = CATEGORY_COLOR[cat] ?? "#6B7280";
                    const isSelected = selectedDrillId === drill.id;
                    return (
                      <Pressable
                        key={drill.id}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: isSelected ? color + "22" : Colors.dark.chipBackground, borderRadius: 10, borderWidth: 1.5, borderColor: isSelected ? color : Colors.dark.chipBorder, padding: 10 }}
                        onPress={() => setSelectedDrillId(drill.id)}
                      >
                        <Ionicons name={CATEGORY_ICON[cat] as any ?? "ellipsis-horizontal-circle-outline"} size={16} color={color} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.dark.text }} numberOfLines={1}>{drill.name}</Text>
                          <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>{cat} • {drill.difficulty ?? "Intermediate"} • {drill.durationMinutes ?? 15} min</Text>
                        </View>
                        {isSelected ? <Ionicons name="checkmark-circle" size={18} color={color} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.dark.textSecondary }}>MESSAGE (OPTIONAL)</Text>
            <TextInput
              style={{ backgroundColor: Colors.dark.chipBackground, borderRadius: 10, borderWidth: 1, borderColor: Colors.dark.chipBorder, padding: 12, fontSize: 14, color: Colors.dark.text, minHeight: 60 }}
              placeholder="Add a coaching tip or note..."
              placeholderTextColor={Colors.dark.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              style={({ pressed }) => ({ backgroundColor: Colors.dark.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center", opacity: pressed || isAssigning ? 0.8 : 1 })}
              onPress={handleAssign}
              disabled={isAssigning}
            >
              <Text style={{ fontSize: 15, fontWeight: "800", color: "#000" }}>
                {isAssigning ? "Assigning..." : "Assign to Player"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PlayerQuestsSection({ playerId }: { playerId: string }) {
  const { data, isLoading } = useQuery<{ quests: PlayerQuestItem[] }>({
    queryKey: ["/api/coach/players", playerId, "quests"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/coach/players/${playerId}/quests`);
      return res.json();
    },
  });

  const quests = data?.quests || [];

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <TennisBallSpinner size="small" color={Colors.dark.primary} />
      </View>
    );
  }

  if (quests.length === 0) {
    return (
      <View style={{ paddingVertical: 12, alignItems: "center", gap: 6 }}>
        <Ionicons name="flash-outline" size={24} color={Colors.dark.tabIconDefault} />
        <Text style={{ color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" }}>
          No active quests assigned
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8, paddingTop: 4 }}>
      {quests.map((quest) => {
        const progress = quest.targetProgress > 0 ? quest.currentProgress / quest.targetProgress : 0;
        const isComplete = quest.status === "completed" || quest.status === "claimed";
        return (
          <View
            key={quest.id}
            style={{
              backgroundColor: Colors.dark.backgroundSecondary,
              borderRadius: 10,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: isComplete ? 1 : 0,
              borderColor: isComplete ? Colors.dark.primary + "40" : "transparent",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: (quest.iconColor || "#00FF88") + "20",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name={(quest.iconName || "flash") as React.ComponentProps<typeof Ionicons>["name"]} size={18} color={isComplete ? Colors.dark.primary : (quest.iconColor || "#00FF88")} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ color: isComplete ? Colors.dark.primary : Colors.dark.text, fontSize: 13, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
                  {quest.name}
                </Text>
                {quest.personalisedBy ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#00FF8820", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 1, borderColor: "#00FF8840" }}>
                    <Ionicons name="sparkles" size={9} color="#00FF88" />
                    <Text style={{ fontSize: 9, fontWeight: "700", color: "#00FF88" }}>For you</Text>
                  </View>
                ) : null}
                {isComplete ? (
                  <View style={{ backgroundColor: Colors.dark.primary + "20", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: Colors.dark.primary }}>Done</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ flex: 1, height: 4, backgroundColor: Colors.dark.backgroundRoot, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{ width: `${Math.min(progress * 100, 100)}%`, height: "100%", backgroundColor: isComplete ? Colors.dark.primary : (quest.iconColor || "#00FF88"), borderRadius: 2 }} />
                </View>
                <Text style={{ fontSize: 11, color: Colors.dark.textSecondary, minWidth: 36 }}>
                  {quest.currentProgress}/{quest.targetProgress}
                </Text>
              </View>
            </View>
            {quest.xpReward ? (
              <View style={{ alignItems: "center" }}>
                <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                <Text style={{ fontSize: 10, fontWeight: "600", color: Colors.dark.xpCyan }}>+{quest.xpReward}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ProminentInviteCard({
  inviteCode,
  playerName,
  onSendEmail,
  isSendingEmail,
  onGenerateNewCode,
  isGeneratingNewCode,
}: {
  inviteCode: string;
  playerName: string;
  onSendEmail?: () => void;
  isSendingEmail?: boolean;
  onGenerateNewCode?: () => void;
  isGeneratingNewCode?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };
  const handleShare = async () => {
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(inviteCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 3000);
      return;
    }
    try {
      const { Share } = await import("react-native");
      await Share.share({
        message: `Hi ${playerName}! Use invite code ${inviteCode} to sign up on the Glow Up Sports app.`,
        title: "Invite Code",
      });
    } catch {}
  };
  const handleGenerateNewCode = () => {
    Alert.alert(
      "Generate New Code?",
      "The current invite code will stop working immediately. Anyone holding the old code will no longer be able to use it. Are you sure you want to generate a new code?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate New Code",
          style: "destructive",
          onPress: () => onGenerateNewCode?.(),
        },
      ]
    );
  };
  return (
    <View style={styles.prominentInviteCard}>
      <Text style={styles.prominentInviteCardTitle}>Invite Code — Awaiting Signup</Text>
      <Text style={styles.prominentInviteInstruction}>
        Share this code with {playerName} so they can sign up in the app
      </Text>
      <Text style={styles.prominentInviteCode} selectable>{inviteCode}</Text>
      <Pressable style={styles.prominentCopyButton} onPress={handleCopy}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.prominentCopyButtonGradient}
        >
          <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={18} color={Colors.dark.buttonText} />
          <Text style={styles.prominentCopyButtonText}>{copied ? "Copied!" : "Copy Code"}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable style={styles.prominentShareButton} onPress={handleShare}>
        <Ionicons name={codeCopied ? "checkmark-circle-outline" : "share-outline"} size={16} color={codeCopied ? Colors.dark.successNeon : Colors.dark.primary} />
        <Text style={[styles.prominentShareButtonText, codeCopied ? { color: Colors.dark.successNeon } : null]}>
          {codeCopied ? "Code Copied!" : "Share Code"}
        </Text>
      </Pressable>
      {onSendEmail ? (
        <Pressable
          style={[styles.prominentShareButton, { marginTop: 4, borderColor: Colors.dark.tabIconDefault + "40", backgroundColor: Colors.dark.backgroundTertiary }]}
          onPress={onSendEmail}
          disabled={isSendingEmail}
        >
          {isSendingEmail ? (
            <TennisBallSpinner size="small" color={Colors.dark.primary} />
          ) : (
            <Ionicons name="paper-plane-outline" size={16} color={Colors.dark.tabIconDefault} />
          )}
          <Text style={[styles.prominentShareButtonText, { color: Colors.dark.tabIconDefault }]}>
            {isSendingEmail ? "Sending..." : "Send invite by email"}
          </Text>
        </Pressable>
      ) : null}
      {onGenerateNewCode ? (
        <Pressable
          style={[styles.prominentShareButton, { marginTop: 4, borderColor: Colors.dark.error + "40", backgroundColor: Colors.dark.backgroundTertiary }]}
          onPress={handleGenerateNewCode}
          disabled={isGeneratingNewCode}
        >
          {isGeneratingNewCode ? (
            <TennisBallSpinner size="small" color={Colors.dark.error} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={Colors.dark.error} />
          )}
          <Text style={[styles.prominentShareButtonText, { color: Colors.dark.error }]}>
            {isGeneratingNewCode ? "Generating..." : "Generate New Code"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PlayerDetailView({
  player,
  onBack,
  onNavigateToPlayer,
  insets,
  onAssessmentComplete,
  impactedSessionIds,
  impactedSessions,
}: {
  player: Player;
  onBack: () => void;
  onNavigateToPlayer?: (playerId: string) => void;
  insets: { top: number; bottom: number };
  onAssessmentComplete?: (result: JuniorAssessmentResult) => void;
  impactedSessionIds?: string[];
  impactedSessions?: {
    id: string;
    startTime: string;
    sessionType?: string | null;
    title?: string | null;
  }[];
}) {
  const { coach, academy } = useCoach();
  const { user } = useAuth();
  const { isReadOnly: isSupervisorReadOnly } = useSupervisorMode();
  const canSeePayments =
    coach?.role === "head_coach" ||
    user?.role === "academy_owner" ||
    user?.role === "platform_owner";
  const { navigateToTab } = useTabNavigation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const v2Enabled = useV2Enabled(player.id);
  const tz = academy?.timezone || "Asia/Dubai";
  
  const tabBarHeight = TAB_BAR_HEIGHT;
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [pillarProgressExpanded, setPillarProgressExpanded] = useState(false);
  const [showRatePlayerSessions, setShowRatePlayerSessions] = useState(false);
  const [selectedSessionForRating, setSelectedSessionForRating] = useState<{ id: string; players: { id: string; name: string; ballLevel?: string | null }[] } | null>(null);
  const [_showDeepAssessment, setShowDeepAssessment] = useState(false);
  const [showJuniorAssessment, setShowJuniorAssessment] = useState(false);
  const [lastJuniorAssessmentResult, setLastJuniorAssessmentResult] = useState<JuniorAssessmentResult | null>(null);
  const [showGlowAssessment, setShowGlowAssessment] = useState(false);
  const [showEditPlayer, setShowEditPlayer] = useState(false);
  const [editName, setEditName] = useState(player.name);
  const [editEmail, setEditEmail] = useState(player.email ?? "");
  const [editPhone, setEditPhone] = useState(player.phone ?? "");
  const [editBallLevel, setEditBallLevel] = useState(player.ballLevel ?? "");
  const [editParentEmail, setEditParentEmail] = useState(player.parentEmail ?? "");
  const [editParentReporting, setEditParentReporting] = useState(player.parentReporting ?? false);

  const [showParentReport, setShowParentReport] = useState(false);
  const [parentReportLetter, setParentReportLetter] = useState<string | null>(null);
  const [parentReportMonthLabel, setParentReportMonthLabel] = useState<string>("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);


  const [localPlayer, setLocalPlayer] = useState(player);

  // Merge player state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [_mergeTarget, setMergeTarget] = useState<Player | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [showScheduleExtraLesson, setShowScheduleExtraLesson] = useState(false);
  const [extraLessonWizardConfig, setExtraLessonWizardConfig] = useState<
    | {
        date: Date;
        sessionType: "private" | "semi_private" | "group";
      }
    | null
  >(null);

  useEffect(() => {
    setLocalPlayer(player);
  }, [player]);

  const deletePlayerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/players/${player.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete player");
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.setQueryData<Player[]>(["/api/players?withCredits=true"], (old) =>
        old?.filter((p) => p.id !== player.id)
      );
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      onBack();
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Error", error.message || "Failed to delete player");
      }, 350);
    },
  });

  const handleDeletePlayer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Delete Player",
      `This will permanently remove ${localPlayer.name} and all their data from your academy. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePlayerMutation.mutate(),
        },
      ]
    );
  };

  const mergePlayerMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const res = await apiRequest("POST", `/api/players/${player.id}/merge-into/${targetId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to merge players");
      }
      return res.json();
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowMergeModal(false);
      setMergeTarget(null);
      if (data.userWarning) {
        setTimeout(() => {
          Alert.alert("Merge Complete", `Players merged successfully.\n\nNote: ${data.userWarning}`);
        }, 300);
      }
      if (onNavigateToPlayer && data.targetId) {
        onNavigateToPlayer(data.targetId);
      } else {
        onBack();
      }
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Error", error.message || "Failed to merge players");
      }, 350);
    },
  });

  const handleMergeConfirm = (target: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Merge Players",
      `All attendance, credits, groups, and notes from ${localPlayer.name} will be moved to ${target.name}. ${localPlayer.name} will then be deleted.\n\nThis cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Merge",
          style: "destructive",
          onPress: () => mergePlayerMutation.mutate(target.id),
        },
      ]
    );
  };

  const updatePlayerMutation = useMutation({
    mutationFn: async () => {
      const isHeadCoach = coach?.role === "head_coach";
      const payload: Record<string, unknown> = {
        name: editName.trim(),
        ballLevel: editBallLevel || null,
      };
      if (isHeadCoach) {
        payload.email = editEmail.trim() || null;
        payload.phone = editPhone.trim() || null;
        payload.parentEmail = editParentEmail.trim() || null;
        payload.parentReporting = editParentReporting;
      }
      const res = await apiRequest("PATCH", `/api/players/${player.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const isHeadCoach = coach?.role === "head_coach";
      setLocalPlayer((prev) => ({
        ...prev,
        name: editName.trim(),
        ballLevel: editBallLevel || null,
        ...(isHeadCoach
          ? {
              email: editEmail.trim() || null,
              phone: editPhone.trim() || null,
              parentEmail: editParentEmail.trim() || null,
              parentReporting: editParentReporting,
            }
          : {}),
      }));
      queryClient.setQueryData<Player[]>(["/api/players?withCredits=true"], (old) =>
        old?.map((p) =>
          p.id === player.id
            ? {
                ...p,
                name: editName.trim(),
                ballLevel: editBallLevel || null,
                ...(isHeadCoach
                  ? { email: editEmail.trim() || null, phone: editPhone.trim() || null, parentEmail: editParentEmail.trim() || null, parentReporting: editParentReporting }
                  : {}),
              }
            : p
        )
      );
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowEditPlayer(false);
      setTimeout(() => {
        Alert.alert("Saved", "Player details updated.");
      }, 300);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to update player");
    },
  });

  const handlePreviewParentReport = async () => {
    setIsGeneratingReport(true);
    setParentReportLetter(null);
    setShowParentReport(true);
    try {
      const res = await apiRequest("POST", `/api/players/${player.id}/parent-report/preview`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate report");
      setParentReportLetter(data.letter);
      setParentReportMonthLabel(data.monthLabel || "");
    } catch (err: any) {
      setShowParentReport(false);
      setTimeout(() => Alert.alert("Error", err.message || "Failed to generate parent report"), 300);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSendParentReport = async () => {
    if (!localPlayer.parentEmail) {
      Alert.alert("No Parent Email", "Please add a parent email address in the player edit form first.");
      return;
    }
    setIsSendingReport(true);
    try {
      const res = await apiRequest("POST", `/api/players/${player.id}/parent-report/send`, {
        letter: parentReportLetter,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send report");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowParentReport(false);
      setTimeout(() => Alert.alert("Sent", `Parent report sent to ${data.sentTo}`), 300);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send parent report");
    } finally {
      setIsSendingReport(false);
    }
  };

  const sendInviteEmailMutation = useMutation<
    { success: boolean; sent: boolean; sentTo?: string; reason?: string },
    Error
  >({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/players/${player.id}/send-invite-email`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.sent) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          Alert.alert("Invite Sent", `Invite email sent to ${data.sentTo}`);
        }, 350);
      } else {
        const msg =
          data.reason === "no_email"
            ? "This player has no email address."
            : "This player has already accepted their invite.";
        setTimeout(() => {
          Alert.alert("Not Sent", msg);
        }, 350);
      }
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Failed", error.message || "Could not send invite. Try again.");
      }, 350);
    },
  });

  const regenerateInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/players/${player.id}/invite/regenerate`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/players", player.id, "invite"] });
    },
    onError: (error: Error) => {
      setTimeout(() => {
        Alert.alert("Failed", error.message || "Could not generate new code. Try again.");
      }, 350);
    },
  });

  const [localAuditVerified, setLocalAuditVerified] = useState<boolean>(!!player.auditVerifiedAt);
  const [verifyFlashText, setVerifyFlashText] = useState<string | null>(null);
  const verifyFlashOpacity = useSharedValue(0);

  const verifyFlashStyle = useAnimatedStyle(() => ({
    opacity: verifyFlashOpacity.value,
    transform: [{ translateY: interpolate(verifyFlashOpacity.value, [0, 1], [8, 0]) }],
  }));

  const auditVerifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/players/${player.id}/audit-verify`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setLocalAuditVerified(data.auditVerified);
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVerifyFlashText(data.auditVerified ? "Verified" : "Unverified");
      verifyFlashOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(1, { duration: 1200 }),
        withTiming(0, { duration: 400 })
      );
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setVerifyFlashText("Error");
      verifyFlashOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(1, { duration: 1000 }),
        withTiming(0, { duration: 400 })
      );
      console.error("[AuditVerify] Error:", error);
    },
  });

  const handleExportProgressReport = async () => {
    try {
      setIsExportingReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const response = await fetch(new URL(`/api/players/${player.id}/progress-report`, getApiUrl()).toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate progress report");
      }
      
      const html = await response.text();
      
      const safeName = player.name.replace(/[^a-zA-Z0-9]/g, "_");
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeName}_Progress_Report.html`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const newUri = `${FileSystem.cacheDirectory}${safeName}_Progress_Report_${Date.now()}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, {
            mimeType: "application/pdf",
            dialogTitle: `${player.name} Progress Report`,
            UTI: "com.adobe.pdf",
          });
        } else {
          await Print.printAsync({ uri: newUri });
        }
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error exporting progress report:", error);
      Alert.alert("Error", "Failed to generate progress report. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExportingReport(false);
    }
  };

  const { data: xpData } = useQuery<PlayerXpData>({
    queryKey: [`/api/players/${player.id}/xp`],
  });

  interface PlayerStatsPayments {
    totalOwed: number;
    totalPaid: number;
    lastPaymentDate?: string;
    status: "paid" | "partial" | "overdue";
    currency: string;
    invoices?: {
      id: string;
      invoiceNumber: string;
      amount: number;
      currency: string;
      status: string;
      dueDate?: string;
      paidAt?: string;
      createdAt?: string;
      notes?: string;
      isOverdue: boolean;
    }[];
  }
  interface PlayerStatsData {
    player: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      parentName?: string;
      parentPhone?: string;
    };
    payments: PlayerStatsPayments;
    packages?: {
      id: string;
      creditType: string;
      totalCredits: number;
      remainingCredits: number;
      status: string;
      isPaid?: boolean;
      price?: number;
      packageName?: string;
    }[];
  }
  const { data: playerStats } = useQuery<PlayerStatsData>({
    queryKey: ["/api/admin/players", player.id, "stats"],
  });

  const { data: inviteData } = useQuery<{ inviteCode: string; status: string } | null>({
    queryKey: ["/api/players", player.id, "invite"],
    enabled: !localPlayer.onboardingCompleted,
    retry: false,
  });
  const isInvitePending = inviteData?.status === "pending";

  // Fetch baseline status
  interface BaselineData {
    id: string;
    playerId: string;
    status: string;
    ballLevel: string | null;
    skillLevel: number | null;
    createdAt: string;
    lockedAt: string | null;
  }
  const { data: _baselineData } = useQuery<BaselineData>({
    queryKey: [`/api/players/${player.id}/baseline`],
  });
  const [_showResetBaselineConfirm, setShowResetBaselineConfirm] = useState(false);

  const _resetBaselineMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/players/${player.id}/baseline`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/baseline`] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/baseline-stats"] });
      setShowResetBaselineConfirm(false);
    },
    onError: () => {
      Alert.alert("Error", "Failed to reset baseline. Please try again.");
    },
  });

  // Fetch pillar progress for Glow Leveling OS
  interface PillarProgressData {
    pillars: {
      name: string;
      score: number;
      trend: string;
      skillsTotal: number;
      skillsMeetsOrAbove: number;
      lastUpdated: string | null;
    }[];
    overallReadiness: number;
    trialGateReady: boolean;
    recentFeedbackCount: number;
    playerSelfRatings: Record<string, number> | null;
    latestAssessmentMonth: string | null;
    latestAssessmentSummary: string | null;
  }
  const { data: pillarProgress } = useQuery<PillarProgressData>({
    queryKey: [`/api/players/${player.id}/pillar-progress`],
  });

  // Fetch attendance summary
  interface AttendanceSummary {
    totalLessons: number;
    attendedCount: number;
    actuallyAttendedCount: number;
    presentCount: number;
    absentCount: number;
    attendancePercentage: number;
  }
  const { data: attendanceSummary } = useQuery<AttendanceSummary>({
    queryKey: [`/api/coach/players/${player.id}/attendance-summary`],
  });

  interface AttendanceHistoryRecord {
    sessionId: string;
    date: string;
    startTime: string;
    endTime: string;
    sessionType: string;
    status: string | null;
    sessionStatus: string | null;
    seriesTitle?: string | null;
  }
  const { data: attendanceHistoryData } = useQuery<{ history: AttendanceHistoryRecord[] }>({
    queryKey: [`/api/coach/players/${player.id}/attendance-history`],
    enabled: showRatePlayerSessions,
  });

  interface StrokeFeedbackRow {
    id: string;
    sessionId: string;
    createdAt: string;
  }
  // Fetches all session_skill_feedback rows for this player — used to exclude
  // already-rated sessions from the "Rate Player" picker so coach can't double-rate.
  const { data: strokeFeedbackData } = useQuery<StrokeFeedbackRow[]>({
    queryKey: [`/api/glow/players/${player.id}/stroke-feedback`],
    enabled: showRatePlayerSessions,
  });

  const recentCompletedSessions = React.useMemo(() => {
    if (!attendanceHistoryData?.history) return [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // Build set of sessionIds that already have any QuickFeedback for this player
    const ratedSessionIds = new Set((strokeFeedbackData ?? []).map(f => f.sessionId));
    return attendanceHistoryData.history
      .filter(h => {
        if (h.sessionStatus !== "completed") return false;
        const sessionDate = h.date ? new Date(h.date) : null;
        if (sessionDate && sessionDate < thirtyDaysAgo) return false;
        if (ratedSessionIds.has(h.sessionId)) return false;
        return true;
      })
      .slice(0, 10);
  }, [attendanceHistoryData, strokeFeedbackData]);

  // Calculate level readiness (returns null for max level or invalid level)
  const _levelReadiness = getLevelReadiness(localPlayer.ballLevel, xpData?.totalXp || 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      {/* Premium Header */}
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={styles.premiumDetailHeader}
      >
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.premiumHeaderTopLine}
        />
        <View style={styles.premiumHeaderNav}>
          <Pressable style={styles.premiumBackButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
          </Pressable>
          <Pressable
            style={styles.premiumActionsButton}
            onPress={() => {
              if (deletePlayerMutation.isPending) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowActionSheet(true);
            }}
          >
            {deletePlayerMutation.isPending ? (
              <TennisBallSpinner size="small" color={Colors.dark.error} />
            ) : (
              <Text style={styles.premiumActionsButtonText}>Actions</Text>
            )}
          </Pressable>
        </View>
      </LinearGradient>

      {/* Verify result toast */}
      {verifyFlashText ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.verifyToast,
            {
              backgroundColor:
                verifyFlashText === "Error"
                  ? Colors.dark.error + "EE"
                  : verifyFlashText === "Unverified"
                  ? Colors.dark.warning + "EE"
                  : Colors.dark.primary + "EE",
            },
            verifyFlashStyle,
          ]}
        >
          <Ionicons
            name={
              verifyFlashText === "Error"
                ? "alert-circle"
                : verifyFlashText === "Unverified"
                ? "close-circle"
                : "checkmark-circle"
            }
            size={16}
            color={verifyFlashText === "Error" || verifyFlashText === "Unverified" ? "#fff" : "#000"}
          />
          <Text
            style={[
              styles.verifyToastText,
              {
                color:
                  verifyFlashText === "Error" || verifyFlashText === "Unverified" ? "#fff" : "#000",
              },
            ]}
          >
            {verifyFlashText === "Verified"
              ? "Player verified"
              : verifyFlashText === "Unverified"
              ? "Verification removed"
              : "Verification failed"}
          </Text>
        </Animated.View>
      ) : null}

      <ScrollView
        style={styles.detailContent}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl, paddingTop: Spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        {impactedSessionIds && impactedSessionIds.length > 0 ? (
          <View
            style={{
              marginHorizontal: Spacing.lg,
              marginBottom: Spacing.md,
              padding: Spacing.md,
              borderRadius: 12,
              backgroundColor: Colors.dark.xpCyan + "20",
              borderWidth: 1,
              borderColor: Colors.dark.xpCyan + "55",
            }}
          >
            <Text
              style={{
                color: Colors.dark.text,
                fontWeight: "700",
                marginBottom: 4,
              }}
            >
              Vacation impacts {impactedSessionIds.length} session
              {impactedSessionIds.length === 1 ? "" : "s"}
            </Text>
            <Text
              style={{
                color: Colors.dark.textSecondary,
                fontSize: 13,
                marginBottom: Spacing.sm,
              }}
            >
              Tap a session to open it in the calendar and reschedule.
            </Text>
            {(impactedSessions ?? []).map((s) => {
              const dt = new Date(s.startTime);
              const dateStr = dt.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = dt.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              });
              const label =
                s.title || (s.sessionType ? `${s.sessionType} session` : "Session");
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    navigateToTab("Calendar", {
                      screen: "Calendar",
                      params: { openSessionId: s.id, _ts: Date.now() },
                    });
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.sm,
                    borderRadius: 8,
                    backgroundColor: pressed
                      ? Colors.dark.xpCyan + "15"
                      : "transparent",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  })}
                >
                  <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                    <Text
                      style={{ color: Colors.dark.text, fontWeight: "600" }}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                    <Text
                      style={{
                        color: Colors.dark.textSecondary,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {dateStr} · {timeStr}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: Colors.dark.xpCyan,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Open ›
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {/* Premium Profile Card */}
        <View style={styles.premiumProfileCard}>
          <View style={styles.premiumAvatarContainer}>
            <LinearGradient
              colors={[getPlayerLevelColor(localPlayer.ballLevel ?? "green"), Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumAvatarGlow}
            />
            {localPlayer.profilePhotoUrl ? (
              Platform.OS === 'web' ? (
                <RNImage
                  source={{ uri: buildPhotoUrl(localPlayer.profilePhotoUrl)! }}
                  style={styles.premiumAvatarPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: buildPhotoUrl(localPlayer.profilePhotoUrl)! }}
                  style={styles.premiumAvatarPhoto}
                  contentFit="cover"
                />
              )
            ) : (
              <View style={[styles.premiumAvatar, { backgroundColor: getPlayerLevelColor(localPlayer.ballLevel ?? "green") + "30" }]}>
                <Text style={[styles.premiumInitial, { color: getPlayerLevelTextColor(localPlayer.ballLevel ?? "green") }]}>{localPlayer.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.premiumProfileInfo}>
            <Text style={styles.premiumProfileName}>{localPlayer.name}</Text>
            {localPlayer.ballLevel ? (
              <View style={styles.premiumLevelBadge}>
                <View style={[styles.premiumLevelDot, { backgroundColor: getPlayerLevelColor(localPlayer.ballLevel) }]} />
                <Text style={styles.premiumLevelText}>
                  {localPlayer.ballLevel.charAt(0).toUpperCase() + localPlayer.ballLevel.slice(1)} Ball
                </Text>
              </View>
            ) : null}
            {xpData ? (
              <View style={styles.premiumXpBadge}>
                <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
                <Text style={styles.premiumXpText}>{xpData.totalXp} XP</Text>
              </View>
            ) : null}
          </View>

          {/* Quick Stats Row */}
          <View style={styles.premiumQuickStats}>
            <View style={styles.premiumQuickStat}>
              <Text style={styles.premiumQuickStatValue}>{attendanceSummary?.totalLessons ?? 0}</Text>
              <Text style={styles.premiumQuickStatLabel}>Sessions</Text>
            </View>
            <View style={styles.premiumQuickStatDivider} />
            <View style={styles.premiumQuickStat}>
              <Text style={[styles.premiumQuickStatValue, { color: Colors.dark.primary }]}>
                {attendanceSummary?.attendancePercentage ?? 0}%
              </Text>
              <Text style={styles.premiumQuickStatLabel}>Attendance</Text>
            </View>
          </View>

          {/* Glow Assessment Card - visible for adult/yellow/glow ball level players */}
          {!localPlayer.ballLevel || ["yellow", "glow", ""].includes((localPlayer.ballLevel ?? "").toLowerCase()) ? (
            <View style={[styles.levelReadinessCard, { borderColor: "#8B5CF655", marginTop: Spacing.md }]}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowGlowAssessment(true); }}
                style={[styles.levelReadinessHeader, { marginBottom: 0 }]}
              >
                <View style={[styles.levelReadinessIcon, { backgroundColor: "#8B5CF625", borderColor: "#8B5CF650" }]}>
                  <Ionicons name="trophy" size={18} color="#8B5CF6" />
                </View>
                <Text style={styles.levelReadinessTitle}>Glow Level Assessment</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
          ) : null}

          {/* Junior Assessment Card - visible for red/orange/green ball level players */}
          {localPlayer.ballLevel && ["red", "orange", "green"].includes(localPlayer.ballLevel.toLowerCase()) ? (() => {
            const bl = localPlayer.ballLevel!.toLowerCase();
            const lc = getPlayerLevelColor(bl);
            const pr = lastJuniorAssessmentResult;
            return (
              <View style={[styles.levelReadinessCard, { borderColor: lc + "35", marginTop: Spacing.md }]}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowJuniorAssessment(true); }}
                  style={[styles.levelReadinessHeader, { marginBottom: 0 }]}
                >
                  <View style={[styles.levelReadinessIcon, { backgroundColor: lc + "25", borderColor: lc + "50" }]}>
                    <Ionicons name="trophy" size={18} color={lc} />
                  </View>
                  <Text style={styles.levelReadinessTitle}>Assess for Promotion</Text>
                  {pr ? (
                    <View style={[styles.xpBadge, { backgroundColor: pr.passed ? lc + "25" : Colors.dark.error + "20" }]}>
                      <Ionicons name={pr.passed ? "checkmark-circle" : "close-circle"} size={12} color={pr.passed ? lc : Colors.dark.error} />
                      <Text style={[styles.xpBadgeText, { color: pr.passed ? lc : Colors.dark.error }]}>
                        {pr.passed ? "PASS" : "FAIL"} {pr.percentage}%
                      </Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} style={{ marginLeft: 4 }} />
                </Pressable>
              </View>
            );
          })() : null}
        </View>

        {pillarProgress ? (
          <View style={styles.levelReadinessCard}>
            <Pressable onPress={() => setPillarProgressExpanded(!pillarProgressExpanded)} style={styles.levelReadinessHeader}>
              <View style={[styles.levelReadinessIcon, { backgroundColor: Colors.dark.xpCyan + "25", borderColor: Colors.dark.xpCyan + "40" }]}>
                <Ionicons name="stats-chart" size={18} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.levelReadinessTitle}>Pillar Progress</Text>
              {pillarProgress.trialGateReady ? (
                <View style={[styles.xpBadge, { backgroundColor: Colors.dark.primary + "30" }]}>
                  <Ionicons name="trophy" size={12} color={Colors.dark.primary} />
                  <Text style={[styles.xpBadgeText, { color: Colors.dark.primary }]}>Trial Ready</Text>
                </View>
              ) : xpData ? (
                <View style={styles.xpBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                  <Text style={styles.xpBadgeText}>{xpData.totalXp} XP</Text>
                </View>
              ) : null}
              <Ionicons name={pillarProgressExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.dark.tabIconDefault} style={{ marginLeft: 4 }} />
            </Pressable>
            
            {pillarProgressExpanded ? <><View style={styles.pillarGrid}>
              {pillarProgress.pillars.map((pillar) => {
                const pillarColors: Record<string, string> = {
                  TECHNIQUE: Colors.dark.sessionPrivate,
                  TACTICAL: Colors.dark.xpCyan,
                  PHYSICAL: Colors.dark.gold,
                  MENTAL: Colors.dark.sessionSemiPrivate,
                  SOCIAL: Colors.dark.primary,
                  MATCH: Colors.dark.error,
                };
                const pillarIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
                  TECHNIQUE: "tennisball",
                  TACTICAL: "bulb",
                  PHYSICAL: "fitness",
                  MENTAL: "flash-outline",
                  SOCIAL: "people",
                  MATCH: "trophy",
                };
                const color = pillarColors[pillar.name] || Colors.dark.primary;
                const icon: keyof typeof Ionicons.glyphMap = pillarIcons[pillar.name] || "ellipse";
                const progressPercent = Math.round((pillar.score / 2) * 100);
                const trendIcon: keyof typeof Ionicons.glyphMap = pillar.trend === "improving" ? "trending-up" : 
                                  pillar.trend === "declining" ? "trending-down" : "remove";
                const trendColor = pillar.trend === "improving" ? Colors.dark.primary : 
                                   pillar.trend === "declining" ? Colors.dark.error : Colors.dark.tabIconDefault;
                
                return (
                  <View key={pillar.name} style={styles.pillarItem}>
                    <View style={[styles.pillarIconContainer, { backgroundColor: color + "20" }]}>
                      <Ionicons name={icon} size={14} color={color} />
                    </View>
                    <View style={styles.pillarInfo}>
                      <View style={styles.pillarNameRow}>
                        <Text style={styles.pillarName}>{pillar.name.charAt(0) + pillar.name.slice(1).toLowerCase()}</Text>
                        <Ionicons name={trendIcon} size={12} color={trendColor} />
                      </View>
                      <View style={styles.pillarProgressBar}>
                        <View style={[styles.pillarProgressFill, { width: `${progressPercent}%`, backgroundColor: color }]} />
                      </View>
                    </View>
                    <Text style={[styles.pillarPercent, { color }]}>{progressPercent}%</Text>
                  </View>
                );
              })}
            </View>
            
            {/* Player Voice — Perception Gap Section */}
            {pillarProgress.playerSelfRatings ? (() => {
              const SELF_KEY_MAP: Record<string, string> = {
                TECHNIQUE: "technical",
                TACTICAL: "tactical",
                PHYSICAL: "physical",
                MENTAL: "mental",
                MATCH: "matchplay",
              };
              const MIRROR_PURPLE = "#A78BFA";
              const gapPillars = pillarProgress.pillars
                .filter(p => SELF_KEY_MAP[p.name] && pillarProgress.playerSelfRatings![SELF_KEY_MAP[p.name]] != null)
                .map(p => {
                  const selfKey = SELF_KEY_MAP[p.name];
                  const selfRating = pillarProgress.playerSelfRatings![selfKey]; // 1–10
                  const selfPct = Math.round(selfRating * 10); // 0–100
                  const coachPct = Math.round((p.score / 2) * 100); // 0–100
                  const gap = selfPct - coachPct;
                  return { name: p.name, selfPct, coachPct, gap };
                });

              if (gapPillars.length === 0) return null;

              return (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: MIRROR_PURPLE + "20", paddingTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: MIRROR_PURPLE + "25", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="mic" size={11} color={MIRROR_PURPLE} />
                    </View>
                    <Text style={{ color: MIRROR_PURPLE, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
                      Player Self-Perception
                    </Text>
                    {pillarProgress.latestAssessmentMonth ? (
                      <View style={{ backgroundColor: MIRROR_PURPLE + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: MIRROR_PURPLE, fontSize: 10 }}>{pillarProgress.latestAssessmentMonth}</Text>
                      </View>
                    ) : null}
                  </View>

                  {gapPillars.map(({ name, selfPct, coachPct, gap }) => {
                    const absGap = Math.abs(gap);
                    const gapColor = gap > 15 ? "#FBBF24" : gap < -15 ? "#F87171" : Colors.dark.tabIconDefault;
                    const pillarLabel = name.charAt(0) + name.slice(1).toLowerCase();
                    return (
                      <View key={name} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <Text style={{ color: Colors.dark.textMuted, fontSize: 11 }}>{pillarLabel}</Text>
                          {absGap > 10 ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Ionicons
                                name={gap > 0 ? "arrow-up" : "arrow-down"}
                                size={10}
                                color={gapColor}
                              />
                              <Text style={{ color: gapColor, fontSize: 10, fontWeight: "600" }}>
                                {gap > 0 ? "Player rates higher" : "Player rates lower"}
                              </Text>
                            </View>
                          ) : (
                            <Text style={{ color: Colors.dark.tabIconDefault, fontSize: 10 }}>Aligned</Text>
                          )}
                        </View>
                        {/* Coach bar */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <Text style={{ color: Colors.dark.tabIconDefault, fontSize: 9, width: 42 }}>Coach</Text>
                          <View style={{ flex: 1, height: 4, backgroundColor: Colors.dark.surfaceElevated, borderRadius: 2 }}>
                            <View style={{ width: `${coachPct}%`, height: 4, backgroundColor: Colors.dark.primary, borderRadius: 2 }} />
                          </View>
                          <Text style={{ color: Colors.dark.primary, fontSize: 10, width: 30, textAlign: "right" }}>{coachPct}%</Text>
                        </View>
                        {/* Player self-rating bar */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: Colors.dark.tabIconDefault, fontSize: 9, width: 42 }}>Player</Text>
                          <View style={{ flex: 1, height: 4, backgroundColor: Colors.dark.surfaceElevated, borderRadius: 2 }}>
                            <View style={{ width: `${selfPct}%`, height: 4, backgroundColor: MIRROR_PURPLE, borderRadius: 2 }} />
                          </View>
                          <Text style={{ color: MIRROR_PURPLE, fontSize: 10, width: 30, textAlign: "right" }}>{selfPct}%</Text>
                        </View>
                      </View>
                    );
                  })}

                  {pillarProgress.latestAssessmentSummary ? (
                    <View style={{ backgroundColor: MIRROR_PURPLE + "12", borderRadius: 8, padding: 8, marginTop: 4 }}>
                      <Text style={{ color: Colors.dark.textMuted, fontSize: 11, lineHeight: 16 }} numberOfLines={3}>
                        {pillarProgress.latestAssessmentSummary}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })() : null}

            {pillarProgress.recentFeedbackCount > 0 ? (
              <View style={styles.feedbackSummaryRow}>
                <Ionicons name="chatbubble-outline" size={12} color={Colors.dark.tabIconDefault} />
                <Text style={styles.feedbackSummaryText}>
                  {pillarProgress.recentFeedbackCount} feedback{pillarProgress.recentFeedbackCount !== 1 ? "s" : ""} last 30 days
                </Text>
              </View>
            ) : null}
            <Pressable
              style={styles.ratePillarButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowRatePlayerSessions(true);
              }}
            >
              <Ionicons name="star" size={14} color={Colors.dark.primary} />
              <Text style={styles.ratePillarButtonText}>Rate Player</Text>
            </Pressable>
            </> : null}
          </View>
        ) : null}

        <CoachTechniqueAnalysesSection playerId={player.id} />

        {canSeePayments ? (
          <CollapsibleSection title="Packages" icon="ticket-outline" iconColor={Colors.dark.gold}>
            <CoachCreditV2Panel playerId={player.id} />
            {v2Enabled ? null : (
              <PackagesCard playerId={player.id} playerName={localPlayer.name} />
            )}
          </CollapsibleSection>
        ) : null}

        {canSeePayments ? (
          <PlayerPaymentsSection
            playerStats={playerStats}
            playerId={player.id}
            playerName={localPlayer.name}
          />
        ) : null}

        {isInvitePending && inviteData?.inviteCode ? (
          <CollapsibleSection title="Invite Code" icon="mail-outline" iconColor={Colors.dark.xpCyan}>
            <ProminentInviteCard inviteCode={inviteData.inviteCode} playerName={localPlayer.name} onSendEmail={() => sendInviteEmailMutation.mutate()} isSendingEmail={sendInviteEmailMutation.isPending} onGenerateNewCode={() => regenerateInviteMutation.mutate()} isGeneratingNewCode={regenerateInviteMutation.isPending} />
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection title="Basic Info" icon="person-outline" iconColor={Colors.dark.tabIconDefault}>
          <View style={styles.infoSection}>
            <View style={styles.infoCard}>
              {coach?.role === "head_coach" ? (
                <>
                  {localPlayer.email ? (
                    <View>
                      <View style={styles.infoRow}>
                        <Ionicons name="mail-outline" size={20} color={Colors.dark.tabIconDefault} />
                        <Text style={styles.infoText}>{localPlayer.email}</Text>
                      </View>
                    </View>
                  ) : null}
                  {localPlayer.phone ? (
                    <View style={styles.infoRow}>
                      <Ionicons name="call-outline" size={20} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.infoText}>{localPlayer.phone}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.infoRow}>
                  <Ionicons name="lock-closed-outline" size={16} color={Colors.dark.textMuted} />
                  <Text style={[styles.infoText, { color: Colors.dark.textMuted, fontSize: 13 }]}>
                    Contact details — Head Coach access only
                  </Text>
                </View>
              )}
              {player.skillLevel ? (
                <View style={styles.infoRow}>
                  <Ionicons name="trophy-outline" size={20} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.infoText}>Skill Level: {player.skillLevel}</Text>
                </View>
              ) : null}
              {player.age ? (
                <View style={styles.infoRow}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.infoText}>Age: {player.age} years</Text>
                </View>
              ) : null}
              {player.height ? (
                <View style={styles.infoRow}>
                  <Ionicons name="resize-outline" size={20} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.infoText}>Height: {player.height} cm</Text>
                </View>
              ) : null}
              {player.tshirtSize ? (
                <View style={styles.infoRow}>
                  <Ionicons name="shirt-outline" size={20} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.infoText}>T-Shirt: {player.tshirtSize}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {player.medicalNotes ? (
            <View style={styles.infoSection}>
              <View style={[styles.infoCard, styles.warningCard]}>
                <Ionicons name="medical-outline" size={20} color={Colors.dark.error} />
                <Text style={styles.medicalText}>{player.medicalNotes}</Text>
              </View>
            </View>
          ) : null}

          {/* Parent Reporting Section — gated to head_coach */}
          {coach?.role === "head_coach" && (localPlayer.parentEmail || (localPlayer.age && localPlayer.age < 18)) ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              {localPlayer.parentEmail ? (
                <View style={[styles.infoCard, { gap: 10 }]}>
                  <View style={styles.infoRow}>
                    <Ionicons name="people-outline" size={20} color={Colors.dark.xpCyan} />
                    <Text style={[styles.infoText, { flex: 1 }]}>Parent: {localPlayer.parentEmail}</Text>
                    {localPlayer.parentReporting ? (
                      <View style={{ backgroundColor: Colors.dark.primary + "25", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: Colors.dark.primary, fontSize: 11, fontWeight: "700" }}>REPORTING ON</Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: Colors.dark.xpCyan + "15",
                      borderWidth: 1,
                      borderColor: Colors.dark.xpCyan + "40",
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      handlePreviewParentReport();
                    }}
                  >
                    <Ionicons name="mail-outline" size={18} color={Colors.dark.xpCyan} />
                    <Text style={{ color: Colors.dark.xpCyan, fontWeight: "600", fontSize: 14 }}>
                      Send Parent Report
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection title="Attendance History" icon="calendar-outline" iconColor={Colors.dark.xpCyan}>
          <PlayerAttendanceSection playerId={player.id} playerName={localPlayer.name} tz={tz} hideHeader />
        </CollapsibleSection>

        <PlayerStrokeFeedbackSection playerId={player.id} />

        <CollapsibleSection title="Assigned Drills" icon="fitness-outline" iconColor="#6366F1">
          <PlayerDrillsSection playerId={player.id} />
        </CollapsibleSection>

        <CollapsibleSection title="Active Quests" icon="flash-outline" iconColor="#00FF88">
          <PlayerQuestsSection playerId={player.id} />
        </CollapsibleSection>

        <CollapsibleSection title="Coach Notes" icon="document-text-outline" iconColor={Colors.dark.primary}>
          <PlayerNotesSection playerId={player.id} coachId={coach?.id} hideHeader />
        </CollapsibleSection>

        <CollapsibleSection title="Monthly Reports" icon="mail-unread-outline" iconColor="#a855f7">
          <PlayerMonthlyReportsSection playerId={player.id} playerName={localPlayer.name} />
        </CollapsibleSection>

        <CollapsibleSection title="Upcoming Open Matches" icon="tennisball" iconColor="#f97316">
          <PlayerUpcomingMatchesSection playerId={player.id} />
        </CollapsibleSection>

        <CollapsibleSection title="Match History" icon="tennisball-outline" iconColor="#f97316">
          <CoachMatchHistorySection playerId={player.id} />
        </CollapsibleSection>

      </ScrollView>

      {/* Edit Player Modal */}
      <Modal visible={showEditPlayer} transparent animationType="fade" onRequestClose={() => setShowEditPlayer(false)}>
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => setShowEditPlayer(false)}>
          <Pressable style={[styles.editAttendanceModalContent, { gap: 12 }]} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            <Text style={styles.editAttendanceModalTitle}>Edit Player</Text>

            <View style={{ gap: 8 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>NAME *</Text>
              <TextInput
                style={{
                  backgroundColor: Colors.dark.backgroundDefault,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: Colors.dark.text,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                }}
                value={editName}
                onChangeText={setEditName}
                placeholder="Player name"
                placeholderTextColor={Colors.dark.tabIconDefault}
                autoCapitalize="words"
              />
            </View>

            {coach?.role === "head_coach" ? (
              <>
                <View style={{ gap: 8 }}>
                  <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>EMAIL</Text>
                  <TextInput
                    style={{
                      backgroundColor: Colors.dark.backgroundDefault,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 15,
                      color: Colors.dark.text,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.1)",
                    }}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    placeholder="Email address"
                    placeholderTextColor={Colors.dark.tabIconDefault}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>PHONE</Text>
                  <TextInput
                    style={{
                      backgroundColor: Colors.dark.backgroundDefault,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 15,
                      color: Colors.dark.text,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.1)",
                    }}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="Phone number"
                    placeholderTextColor={Colors.dark.tabIconDefault}
                    keyboardType="phone-pad"
                  />
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 2 }}>
                <Ionicons name="lock-closed-outline" size={14} color={Colors.dark.textMuted} />
                <Text style={{ color: Colors.dark.textMuted, fontSize: 13 }}>Phone &amp; email — Head Coach access only</Text>
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>BALL LEVEL</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {BALL_LEVELS.map(level => (
                  <Pressable
                    key={level}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      borderWidth: 1.5,
                      borderColor: editBallLevel === level ? getPlayerLevelColor(level) : "rgba(255,255,255,0.12)",
                      backgroundColor: editBallLevel === level ? getPlayerLevelColor(level) + "25" : "transparent",
                    }}
                    onPress={() => setEditBallLevel(level)}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: editBallLevel === level ? getPlayerLevelColor(level) : Colors.dark.textSecondary,
                    }}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {coach?.role === "head_coach" ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" }}>PARENT EMAIL</Text>
                <TextInput
                  style={{
                    backgroundColor: Colors.dark.backgroundDefault,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 15,
                    color: Colors.dark.text,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.1)",
                  }}
                  value={editParentEmail}
                  onChangeText={setEditParentEmail}
                  placeholder="Parent email (for monthly reports)"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            ) : null}

            {coach?.role === "head_coach" ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: "600" }}>Monthly parent reporting</Text>
                  <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 }}>AI progress letter sent on the 1st of each month</Text>
                </View>
                <Pressable
                  style={{
                    width: 48,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: editParentReporting ? Colors.dark.primary : "rgba(255,255,255,0.15)",
                    justifyContent: "center",
                    paddingHorizontal: 3,
                  }}
                  onPress={() => setEditParentReporting(!editParentReporting)}
                >
                  <View style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: "#fff",
                    alignSelf: editParentReporting ? "flex-end" : "flex-start",
                  }} />
                </Pressable>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Pressable
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center" }}
                onPress={() => setShowEditPlayer(false)}
              >
                <Text style={{ color: Colors.dark.text, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.dark.primary, alignItems: "center", opacity: updatePlayerMutation.isPending ? 0.7 : 1 }}
                onPress={() => {
                  if (!editName.trim()) {
                    Alert.alert("Required", "Player name cannot be empty");
                    return;
                  }
                  updatePlayerMutation.mutate();
                }}
                disabled={updatePlayerMutation.isPending}
              >
                {updatePlayerMutation.isPending ? (
                  <TennisBallSpinner size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={{ color: Colors.dark.buttonText, fontWeight: "700", fontSize: 15 }}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Session Picker Modal for Rate Player */}
      <Modal visible={showRatePlayerSessions} transparent animationType="slide" onRequestClose={() => setShowRatePlayerSessions(false)}>
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => setShowRatePlayerSessions(false)}>
          <Pressable style={[styles.editAttendanceModalContent, { maxHeight: "70%" }]} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            <Text style={styles.editAttendanceModalTitle}>Rate Session</Text>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 13, marginBottom: Spacing.md }}>
              Select a completed session to rate {localPlayer.name}
            </Text>
            {!attendanceHistoryData ? (
              <TennisBallSpinner size="small" color={Colors.dark.primary} style={{ marginVertical: Spacing.lg }} />
            ) : recentCompletedSessions.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: Spacing.xl }}>
                <Ionicons name="calendar-outline" size={32} color={Colors.dark.tabIconDefault} />
                <Text style={{ color: Colors.dark.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>No completed sessions found</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {recentCompletedSessions.map((session) => {
                  const sessionDate = new Date(session.date);
                  const dateStr = sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  return (
                    <Pressable
                      key={session.sessionId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: Spacing.md,
                        borderBottomWidth: 1,
                        borderBottomColor: "rgba(255,255,255,0.06)",
                        gap: Spacing.sm,
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowRatePlayerSessions(false);
                        setSelectedSessionForRating({
                          id: session.sessionId,
                          players: [{ id: player.id, name: localPlayer.name, ballLevel: localPlayer.ballLevel }],
                        });
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.primary + "20", justifyContent: "center", alignItems: "center" }}>
                        <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: "600" }}>{dateStr}</Text>
                        {session.seriesTitle ? (
                          <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 }}>{session.seriesTitle}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.dark.tabIconDefault} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick Feedback Modal launched from Rate Player */}
      <QuickFeedbackModal
        visible={selectedSessionForRating !== null}
        session={selectedSessionForRating}
        onClose={() => setSelectedSessionForRating(null)}
        onComplete={() => {
          setSelectedSessionForRating(null);
          queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/pillar-progress`] });
        }}
      />

      {/* Parent Report Preview Modal */}
      <Modal visible={showParentReport} transparent animationType="slide" onRequestClose={() => setShowParentReport(false)}>
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => !isGeneratingReport && !isSendingReport && setShowParentReport(false)}>
          <Pressable style={[styles.editAttendanceModalContent, { maxHeight: "85%" }]} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md }}>
              <Text style={styles.editAttendanceModalTitle}>Parent Progress Letter</Text>
              <Pressable onPress={() => setShowParentReport(false)}>
                <Ionicons name="close" size={22} color={Colors.dark.tabIconDefault} />
              </Pressable>
            </View>

            {parentReportMonthLabel ? (
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: Spacing.md }}>
                {parentReportMonthLabel} — Preview before sending
              </Text>
            ) : null}

            {isGeneratingReport ? (
              <View style={{ alignItems: "center", paddingVertical: Spacing.xl * 2 }}>
                <TennisBallSpinner size="large" color={Colors.dark.xpCyan} />
                <Text style={{ color: Colors.dark.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                  Generating AI letter for {localPlayer.name}...
                </Text>
              </View>
            ) : parentReportLetter ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
                <Text style={{
                  color: Colors.dark.text,
                  fontSize: 14,
                  lineHeight: 22,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}>
                  {parentReportLetter}
                </Text>
              </ScrollView>
            ) : null}

            {parentReportLetter ? (
              <View style={{ gap: 10 }}>
                {localPlayer.parentEmail ? (
                  <Pressable
                    style={{
                      paddingVertical: 13,
                      borderRadius: 12,
                      backgroundColor: Colors.dark.primary,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                      opacity: isSendingReport ? 0.7 : 1,
                    }}
                    onPress={handleSendParentReport}
                    disabled={isSendingReport}
                  >
                    {isSendingReport ? (
                      <TennisBallSpinner size="small" color={Colors.dark.buttonText} />
                    ) : (
                      <Ionicons name="send" size={16} color={Colors.dark.buttonText} />
                    )}
                    <Text style={{ color: Colors.dark.buttonText, fontWeight: "700", fontSize: 15 }}>
                      {isSendingReport ? "Sending..." : `Send to ${localPlayer.parentEmail}`}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ backgroundColor: Colors.dark.warning + "20", borderRadius: 10, padding: 12 }}>
                    <Text style={{ color: Colors.dark.warning, fontSize: 13, textAlign: "center" }}>
                      No parent email on file. Add one in the Edit Player form.
                    </Text>
                  </View>
                )}
                <Pressable
                  style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center" }}
                  onPress={() => setShowParentReport(false)}
                >
                  <Text style={{ color: Colors.dark.text, fontWeight: "600", fontSize: 15 }}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <JuniorAssessmentFlow
        visible={showJuniorAssessment}
        playerId={localPlayer.id}
        playerName={localPlayer.name}
        currentLevelId={
          localPlayer.ballLevel
            ? {
                red: "RED_2",
                orange: "ORANGE_2",
                green: "GREEN_1",
              }[localPlayer.ballLevel.toLowerCase()] ?? null
            : null
        }
        onClose={() => setShowJuniorAssessment(false)}
        onAssessmentComplete={(result) => {
          setLastJuniorAssessmentResult(result);
          onAssessmentComplete?.(result);
        }}
      />

      {showGlowAssessment ? (
        <GlowAssessmentFlow
          playerId={localPlayer.id}
          playerName={localPlayer.name}
          currentLevel={localPlayer.ballLevel ?? "GLOW_9"}
          onComplete={(_result) => {
            setShowGlowAssessment(false);
            queryClient.invalidateQueries({ queryKey: ["/api/players"] });
            queryClient.invalidateQueries({ queryKey: [`/api/adult-glow/player/${localPlayer.id}/rank`] });
          }}
          onCancel={() => setShowGlowAssessment(false)}
        />
      ) : null}

      <ActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        actions={[
          {
            id: "edit",
            label: "Edit Player",
            icon: "pencil-outline",
            color: Colors.dark.tabIconDefault,
            onPress: () => {
              setEditName(localPlayer.name);
              setEditEmail(localPlayer.email ?? "");
              setEditPhone(localPlayer.phone ?? "");
              setEditBallLevel(localPlayer.ballLevel ?? "");
              setEditParentEmail(localPlayer.parentEmail ?? "");
              setEditParentReporting(localPlayer.parentReporting ?? false);
              setShowEditPlayer(true);
            },
          },
          ...(canSeePayments ? [{
            id: "verify",
            label: localAuditVerified ? "Unverify Player" : "Verify Player",
            icon: (localAuditVerified ? "checkmark-circle" : "checkmark-circle-outline") as ActionSheetItem["icon"],
            color: localAuditVerified ? Colors.dark.primary : Colors.dark.tabIconDefault,
            isLoading: auditVerifyMutation.isPending,
            keepOpenWhileLoading: true,
            onPress: () => {
              auditVerifyMutation.mutate();
            },
          }] as ActionSheetItem[] : []),
          {
            id: "deep-assessment",
            label: "Deep Assessment",
            icon: "analytics",
            color: Colors.dark.xpCyan,
            onPress: () => {
              setShowDeepAssessment(true);
            },
          },
          {
            id: "progress-report",
            label: "Progress Report",
            icon: "document-text-outline",
            color: Colors.dark.xpCyan,
            isLoading: isExportingReport,
            keepOpenWhileLoading: true,
            onPress: handleExportProgressReport,
          },
          {
            id: "video-feedback",
            label: "Video Feedback",
            icon: "videocam-outline",
            color: "#4DA3FF",
            onPress: () => {
              navigation.navigate("VideoFeedback", { playerId: player.id });
            },
          },
          {
            id: "match-history",
            label: "Match History",
            icon: "trophy-outline",
            color: "#CCFF00",
            onPress: () => {
              navigation.navigate("PlayerMatchHistory", { playerId: player.id, playerName: player.name });
            },
          },
          ...(!isSupervisorReadOnly ? [{
            id: "schedule-extra-lesson",
            label: "Schedule Extra Lesson",
            icon: "calendar-outline" as ActionSheetItem["icon"],
            color: Colors.dark.xpCyan,
            onPress: () => {
              setShowScheduleExtraLesson(true);
            },
          }] : []),
          {
            id: "merge",
            label: "Merge Player",
            icon: "git-merge-outline",
            color: Colors.dark.tabIconDefault,
            onPress: () => {
              setMergeSearch("");
              setMergeTarget(null);
              setShowMergeModal(true);
            },
          },
          ...(canSeePayments ? [{
            id: "create-invoice",
            label: "Create Invoice",
            icon: "document-text-outline" as ActionSheetItem["icon"],
            color: Colors.dark.successNeon,
            onPress: () => {
              setShowCreateInvoiceModal(true);
            },
          }, {
            id: "delete",
            label: "Delete Player",
            icon: "trash-outline" as ActionSheetItem["icon"],
            isLoading: deletePlayerMutation.isPending,
            isDestructive: true,
            onPress: handleDeletePlayer,
          }] as ActionSheetItem[] : []),
        ]}
      />

      <MergePlayerModal
        visible={showMergeModal}
        sourcePlayer={localPlayer}
        search={mergeSearch}
        onSearchChange={setMergeSearch}
        onClose={() => setShowMergeModal(false)}
        onSelect={(target) => {
          setShowMergeModal(false);
          handleMergeConfirm(target);
        }}
        isMerging={mergePlayerMutation.isPending}
      />

      <CreateInvoiceModal
        visible={showCreateInvoiceModal}
        onClose={() => setShowCreateInvoiceModal(false)}
        player={playerStats?.player ? {
          id: playerStats.player.id,
          name: playerStats.player.name,
          email: playerStats.player.email,
          phone: playerStats.player.phone,
          parentName: playerStats.player.parentName,
          parentEmail: localPlayer.parentEmail ?? undefined,
          parentPhone: playerStats.player.parentPhone,
        } : {
          id: player.id,
          name: localPlayer.name,
          email: localPlayer.email ?? undefined,
          phone: localPlayer.phone ?? undefined,
          parentEmail: localPlayer.parentEmail ?? undefined,
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/players", player.id, "stats"] });
        }}
      />

      <ScheduleExtraLessonModal
        visible={showScheduleExtraLesson}
        onClose={() => setShowScheduleExtraLesson(false)}
        playerId={player.id}
        playerName={localPlayer.name}
        coachId={coach?.id}
        onCreateNewLesson={(date, sessionType) => {
          setShowScheduleExtraLesson(false);
          setExtraLessonWizardConfig({ date, sessionType });
        }}
      />

      <CreateSessionWizard
        visible={extraLessonWizardConfig !== null}
        onClose={() => {
          setExtraLessonWizardConfig(null);
          queryClient.invalidateQueries({
            predicate: (q) =>
              typeof q.queryKey[0] === "string" &&
              (q.queryKey[0] as string).includes(`/coach/players/${player.id}/attendance-history`),
          });
          queryClient.invalidateQueries({
            queryKey: [`/api/coach/players/${player.id}/attendance-summary`],
          });
          queryClient.invalidateQueries({
            queryKey: [`/api/coach/calendar`],
          });
        }}
        initialDate={extraLessonWizardConfig?.date}
        initialSessionType={extraLessonWizardConfig?.sessionType}
        initialSchedulePattern="one-time"
        initialPlayer={{
          id: player.id,
          name: localPlayer.name,
          email: localPlayer.email ?? "",
          ballLevel: localPlayer.ballLevel,
          skillLevel: localPlayer.skillLevel ? Number(localPlayer.skillLevel) : null,
        }}
      />

    </View>
  );
}

function MergePlayerModal({
  visible,
  sourcePlayer,
  search,
  onSearchChange,
  onClose,
  onSelect,
  isMerging,
}: {
  visible: boolean;
  sourcePlayer: Player;
  search: string;
  onSearchChange: (s: string) => void;
  onClose: () => void;
  onSelect: (p: Player) => void;
  isMerging: boolean;
}) {
  const { data: allPlayers } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true"],
    enabled: visible,
  });

  const filtered = (allPlayers || []).filter(
    (p) =>
      p.id !== sourcePlayer.id &&
      (search.trim() === "" ||
        p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (p.email || "").toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: Colors.dark.backgroundDefault,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: 32,
            maxHeight: "80%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 12,
              gap: 12,
            }}
          >
            <Ionicons name="git-merge-outline" size={22} color={Colors.dark.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.dark.text, fontWeight: "700", fontSize: 17 }}>
                Merge into another player
              </Text>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 }}>
                History from {sourcePlayer.name} will move to the selected player
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.dark.tabIconDefault} />
            </Pressable>
          </View>

          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: Colors.dark.backgroundSecondary,
              borderRadius: 10,
              paddingHorizontal: 12,
              gap: 8,
            }}
          >
            <Ionicons name="search-outline" size={16} color={Colors.dark.tabIconDefault} />
            <TextInput
              value={search}
              onChangeText={onSearchChange}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.tabIconDefault}
              style={{
                flex: 1,
                color: Colors.dark.text,
                fontSize: 15,
                paddingVertical: 10,
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <Ionicons name="people-outline" size={32} color={Colors.dark.tabIconDefault} />
                <Text style={{ color: Colors.dark.textSecondary, marginTop: 10, fontSize: 14 }}>
                  No other players found
                </Text>
              </View>
            ) : (
              filtered.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => onSelect(p)}
                  disabled={isMerging}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    gap: 12,
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: pressed ? Colors.dark.backgroundSecondary : "transparent",
                  })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: Colors.dark.primary + "30",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: Colors.dark.primary, fontWeight: "700", fontSize: 15 }}>
                      {p.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.dark.text, fontWeight: "600", fontSize: 15 }}>
                      {p.name}
                    </Text>
                    {p.email ? (
                      <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }} numberOfLines={1}>
                        {p.email}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

