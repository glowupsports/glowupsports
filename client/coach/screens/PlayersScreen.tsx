import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Image as RNImage,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const TAB_BAR_HEIGHT = 80;
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import * as Linking from "expo-linking";
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, FontSizes, getPlayerLevelColor, getPlayerLevelTextColor, GlowColors } from "@/constants/theme";
import { apiRequest, getStaticAssetsUrl, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import { convertUTCTimeToLocal, formatCredits } from "@/lib/dateUtils";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import PackagesCard from "@/coach/components/PackagesCard";
import QuickBaselineDrawer from "@/coach/components/QuickBaselineDrawer";
import { GuidedEmptyState } from "@/components/GuidedEmptyState";
import { PremiumBaselineFlow } from "@/coach/components/PremiumBaselineFlow";
import { DeepAssessmentDrawer } from "@/coach/components/DeepAssessmentDrawer";
import { PremiumAddPlayerFlow } from "@/coach/components/PremiumAddPlayerFlow";
import { useTabNavigation } from "@/components/TabNavigationContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const BALL_LEVELS = ["blue", "red", "orange", "green", "yellow", "glow"];

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
}

interface PlayerNote {
  id: string;
  playerId: string | null;
  coachId: string | null;
  content: string;
  category: string;
  isPinned: boolean;
  sessionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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

const NOTE_CATEGORIES = [
  { value: "technique", label: "Technique", icon: "fitness-outline" as const },
  { value: "mental", label: "Mental", icon: "bulb-outline" as const },
  { value: "physical", label: "Physical", icon: "body-outline" as const },
  { value: "next-lesson", label: "Next Lesson", icon: "arrow-forward-outline" as const },
  { value: "general", label: "General", icon: "document-text-outline" as const },
];

import { GamingPlayerCard } from "@/coach/components/players/GamingPlayerCard";
import { PlayerDetailView } from "@/coach/components/players/PlayerDetailView";
import { styles } from "@/coach/components/players/playersStyles";

let persistedPlayerId: string | null = null;

export default function PlayersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const { registerTabCallback } = useTabNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [assessmentBadges, setAssessmentBadges] = useState<Record<string, { passed: boolean; percentage: number; assessedAt?: string }>>({});
  const pendingPlayerIdRef = useRef<string | null>(null);
  const hasRestoredRef = useRef(false);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [filterPlayerIds, setFilterPlayerIds] = useState<string[] | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "nameDesc" | "credits" | "creditsDesc" | "negative" | "nonDebt" | "lastLesson" | "oldestLesson" | "newest" | "oldest" | "notActivated" | "appActive">("name");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [createdPlayerInvite, setCreatedPlayerInvite] = useState<{ name: string; inviteCode: string } | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [newPlayerPhone, setNewPlayerPhone] = useState("");
  const [newPlayerBallLevel, setNewPlayerBallLevel] = useState<string>("green");
  const [newPlayerSkillLevel, setNewPlayerSkillLevel] = useState<number>(1);
  const [newPlayerParentName, setNewPlayerParentName] = useState("");
  const [newPlayerParentPhone, setNewPlayerParentPhone] = useState("");
  const [baselinePlayer, setBaselinePlayer] = useState<Player | null>(null);
  const [showBaselineDrawer, setShowBaselineDrawer] = useState(false);
  // Active/Past/Pending Payment tab switcher
  const [rosterTab, setRosterTab] = useState<"active" | "past" | "pending_payment">("active");

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true"],
  });

  const { data: pastPlayers = [], isLoading: isPastLoading } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true&status=inactive"],
    enabled: rosterTab === "past",
  });

  const { data: pendingPaymentPlayers = [], isLoading: isPendingPaymentLoading } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true&status=pending_payment"],
  });

  const invalidatePlayerLists = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/players");
      },
    });
  };

  const archivePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/players/${playerId}/archive`, {});
    },
    onMutate: async (playerId: string) => {
      const queryKey = ["/api/players?withCredits=true"];
      await queryClient.cancelQueries({ queryKey });
      const previousPlayers = queryClient.getQueryData<Player[]>(queryKey);
      queryClient.setQueryData<Player[]>(queryKey, (old) =>
        (old ?? []).filter((p) => p.id !== playerId)
      );
      return { previousPlayers, queryKey };
    },
    onSuccess: () => {
      invalidatePlayerLists();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (_err, _playerId, context) => {
      if (context?.previousPlayers !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousPlayers);
      }
      Alert.alert("Error", "Failed to archive player");
    },
  });

  const restorePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/players/${playerId}/restore`, {});
    },
    onMutate: async (playerId: string) => {
      const queryKey = ["/api/players?withCredits=true&status=inactive"];
      await queryClient.cancelQueries({ queryKey });
      const previousPlayers = queryClient.getQueryData<Player[]>(queryKey);
      queryClient.setQueryData<Player[]>(queryKey, (old) =>
        (old ?? []).filter((p) => p.id !== playerId)
      );
      return { previousPlayers, queryKey };
    },
    onSuccess: () => {
      invalidatePlayerLists();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (_err, _playerId, context) => {
      if (context?.previousPlayers !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousPlayers);
      }
      Alert.alert("Error", "Failed to restore player");
    },
  });

  const markPendingPaymentMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/players/${playerId}/archive`, { status: "pending_payment" });
    },
    onMutate: async (playerId: string) => {
      const queryKey = ["/api/players?withCredits=true"];
      await queryClient.cancelQueries({ queryKey });
      const previousPlayers = queryClient.getQueryData<Player[]>(queryKey);
      queryClient.setQueryData<Player[]>(queryKey, (old) =>
        (old ?? []).filter((p) => p.id !== playerId)
      );
      return { previousPlayers, queryKey };
    },
    onSuccess: () => {
      invalidatePlayerLists();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (_err, _playerId, context) => {
      if (context?.previousPlayers !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousPlayers);
      }
      Alert.alert("Error", "Failed to mark player as pending payment");
    },
  });

  const restoreFromPendingPaymentMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/players/${playerId}/restore`, {});
    },
    onMutate: async (playerId: string) => {
      const queryKey = ["/api/players?withCredits=true&status=pending_payment"];
      await queryClient.cancelQueries({ queryKey });
      const previousPlayers = queryClient.getQueryData<Player[]>(queryKey);
      queryClient.setQueryData<Player[]>(queryKey, (old) =>
        (old ?? []).filter((p) => p.id !== playerId)
      );
      return { previousPlayers, queryKey };
    },
    onSuccess: () => {
      invalidatePlayerLists();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (_err, _playerId, context) => {
      if (context?.previousPlayers !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousPlayers);
      }
      Alert.alert("Error", "Failed to restore player");
    },
  });

  const archivePendingPaymentMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("POST", `/api/players/${playerId}/archive`, {});
    },
    onMutate: async (playerId: string) => {
      const queryKey = ["/api/players?withCredits=true&status=pending_payment"];
      await queryClient.cancelQueries({ queryKey });
      const previousPlayers = queryClient.getQueryData<Player[]>(queryKey);
      queryClient.setQueryData<Player[]>(queryKey, (old) =>
        (old ?? []).filter((p) => p.id !== playerId)
      );
      return { previousPlayers, queryKey };
    },
    onSuccess: () => {
      invalidatePlayerLists();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (_err, _playerId, context) => {
      if (context?.previousPlayers !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousPlayers);
      }
      Alert.alert("Error", "Failed to archive player");
    },
  });

  const { data: playersWithoutBaseline = [] } = useQuery<Player[]>({
    queryKey: ["/api/academy/players-without-baseline"],
  });
  
  const playerIdsWithoutBaseline = useMemo(() => {
    return new Set(playersWithoutBaseline.map(p => p.id));
  }, [playersWithoutBaseline]);

  useEffect(() => {
    const unregister = registerTabCallback("Players", (_screen: string, params?: any) => {
      if (params?.playerIds && Array.isArray(params.playerIds)) {
        setFilterPlayerIds(params.playerIds);
        setSearchQuery("");
        setFilterLevel(null);
        setFilterSubLevel(null);
      } else if (params?.playerId) {
        if (players.length > 0) {
          const player = players.find((p) => p.id === params.playerId || p.id === String(params.playerId));
          if (player) {
            persistedPlayerId = player.id;
            setSelectedPlayer(player);
          }
        } else {
          pendingPlayerIdRef.current = params.playerId;
        }
      }
    });
    return unregister;
  }, [registerTabCallback, players]);

  useEffect(() => {
    if (players.length > 0) {
      if (pendingPlayerIdRef.current) {
        const player = players.find((p) => p.id === pendingPlayerIdRef.current || p.id === String(pendingPlayerIdRef.current));
        if (player) {
          persistedPlayerId = player.id;
          setSelectedPlayer(player);
        }
        pendingPlayerIdRef.current = null;
        hasRestoredRef.current = true;
      } else if (persistedPlayerId && !hasRestoredRef.current) {
        const player = players.find((p) => p.id === persistedPlayerId);
        if (player) {
          setSelectedPlayer(player);
          hasRestoredRef.current = true;
        }
      }
    }
  }, [players]);

  const createPlayerMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string; phone?: string; ballLevel?: string; skillLevel?: number; coachId?: string; parentName?: string; parentPhone?: string }) => {
      return apiRequest("POST", "/api/players", data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setShowAddModal(false);
      
      // Show invite modal with the code
      if (data.inviteCode) {
        setCreatedPlayerInvite({ name: data.name, inviteCode: data.inviteCode });
        setShowInviteModal(true);
      }
      
      // Reset form
      setNewPlayerName("");
      setNewPlayerEmail("");
      setNewPlayerPhone("");
      setNewPlayerBallLevel("green");
      setNewPlayerSkillLevel(1);
      setNewPlayerParentName("");
      setNewPlayerParentPhone("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to create player");
    },
  });

  const getEffectiveBallLevel = (level: string | null) => level || "green";

  const ballLevels = BALL_LEVELS;
  const [filterSubLevel, setFilterSubLevel] = useState<number | null>(null);
  const [showSubLevelDropdown, setShowSubLevelDropdown] = useState<string | null>(null);

  const filteredPlayers = useMemo(() => {
    let result = rosterTab === "active" ? players : rosterTab === "past" ? pastPlayers : pendingPaymentPlayers;
    if (filterPlayerIds !== null) {
      const idSet = new Set(filterPlayerIds);
      result = result.filter((p) => idSet.has(p.id));
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.email && p.email.toLowerCase().includes(query))
      );
    }
    if (filterLevel) {
      result = result.filter((p) => getEffectiveBallLevel(p.ballLevel) === filterLevel);
      
      // Also filter by sublevel if selected (for kids ball stages: blue, red, orange, green, yellow)
      if (filterSubLevel !== null && ["blue", "red", "orange", "green", "yellow"].includes(filterLevel)) {
        result = result.filter((p) => {
          const playerSkillLevel = p.skillLevel ? parseInt(p.skillLevel) : null;
          return playerSkillLevel === filterSubLevel;
        });
      }
    }
    
    // Apply sorting
    return [...result].sort((a, b) => {
      const aCredits = a.remainingCredits ?? 0;
      const bCredits = b.remainingCredits ?? 0;
      
      switch (sortBy) {
        case "credits":
          return aCredits - bCredits;
        case "creditsDesc":
          return bCredits - aCredits;
        case "negative":
          if (aCredits < 0 && bCredits >= 0) return -1;
          if (bCredits < 0 && aCredits >= 0) return 1;
          if (aCredits < 0 && bCredits < 0) return aCredits - bCredits;
          return aCredits - bCredits;
        case "nonDebt":
          if (aCredits >= 0 && bCredits < 0) return -1;
          if (bCredits >= 0 && aCredits < 0) return 1;
          return bCredits - aCredits;
        case "lastLesson": {
          const aDate = a.lastLessonDate ? new Date(a.lastLessonDate).getTime() : 0;
          const bDate = b.lastLessonDate ? new Date(b.lastLessonDate).getTime() : 0;
          return bDate - aDate;
        }
        case "oldestLesson": {
          const aDate = a.lastLessonDate ? new Date(a.lastLessonDate).getTime() : 0;
          const bDate = b.lastLessonDate ? new Date(b.lastLessonDate).getTime() : 0;
          return aDate - bDate;
        }
        case "newest":
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case "oldest":
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        case "notActivated": {
          const aAct = a.onboardingCompleted ? 1 : 0;
          const bAct = b.onboardingCompleted ? 1 : 0;
          if (aAct !== bAct) return aAct - bAct;
          return a.name.localeCompare(b.name);
        }
        case "appActive": {
          const aAct = a.onboardingCompleted ? 0 : 1;
          const bAct = b.onboardingCompleted ? 0 : 1;
          if (aAct !== bAct) return aAct - bAct;
          return a.name.localeCompare(b.name);
        }
        case "nameDesc":
          return b.name.localeCompare(a.name);
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [players, pastPlayers, pendingPaymentPlayers, rosterTab, searchQuery, filterLevel, filterSubLevel, sortBy, filterPlayerIds]);

  const getStatusBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "holiday":
        return { color: Colors.dark.xpCyan, icon: "airplane" as const, label: "Holiday" };
      case "injured":
        return { color: Colors.dark.error, icon: "bandage" as const, label: "Injured" };
      case "new":
        return { color: Colors.dark.primary, icon: "sparkles" as const, label: "New" };
      default:
        return null;
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "No lessons";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days === -1) return "Tomorrow";
    if (days < 0) {
      const futureDays = Math.abs(days);
      if (futureDays < 7) return `In ${futureDays} days`;
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    }
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  };
  const handleSelectPlayer = (player: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persistedPlayerId = player.id;
    setSelectedPlayer(player);
  };

  if (selectedPlayer) {
    return (
      <PlayerDetailView
        player={selectedPlayer}
        onBack={() => {
          persistedPlayerId = null;
          setSelectedPlayer(null);
        }}
        onNavigateToPlayer={(targetId) => {
          const target = players.find((p) => p.id === targetId) || pastPlayers.find((p) => p.id === targetId);
          if (target) {
            persistedPlayerId = target.id;
            setSelectedPlayer(target);
          } else {
            persistedPlayerId = null;
            setSelectedPlayer(null);
          }
        }}
        insets={insets}
        onAssessmentComplete={(result) => {
          setAssessmentBadges((prev) => ({
            ...prev,
            [result.playerId]: { passed: result.passed, percentage: result.percentage, assessedAt: result.assessedAt },
          }));
        }}
      />
    );
  }

  const currentIsLoading = rosterTab === "active" ? isLoading : rosterTab === "past" ? isPastLoading : isPendingPaymentLoading;
  const currentPlayers = rosterTab === "active" ? players : rosterTab === "past" ? pastPlayers : pendingPaymentPlayers;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* === GAMING HEADER === */}
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={styles.gamingHeader}
      >
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gamingHeaderTopLine}
        />
        <View style={styles.gamingHeaderContent}>
          <View style={styles.gamingHeaderLeft}>
            <Text style={styles.gamingTitle}>PLAYERS</Text>
            <View style={styles.gamingCountBadge}>
              <View style={styles.gamingCountGlow} />
              <Text style={styles.gamingCountText}>{rosterTab === "active" ? players.length : rosterTab === "past" ? pastPlayers.length : pendingPaymentPlayers.length}</Text>
              <Text style={styles.gamingCountLabel}>{rosterTab === "active" ? "ACTIVE" : rosterTab === "past" ? "PAST" : "PENDING PAYMENT"}</Text>
            </View>
          </View>
          {rosterTab === "active" ? (
            <Pressable
              style={({ pressed }) => [
                styles.headerAddButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAddModal(true);
              }}
            >
              <LinearGradient
                colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerAddButtonGradient}
              >
                <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
                <Text style={styles.headerAddButtonText}>Add Player</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>

        {/* Active / Past / Pending Payment Tab Switcher */}
        <View style={styles.rosterTabSwitcher}>
          {(["active", "past", "pending_payment"] as const).map((tab) => {
            const isActive = rosterTab === tab;
            const tabIcon = tab === "active" ? "people" : tab === "past" ? "archive" : "wallet-outline";
            const tabLabel = tab === "active" ? "Active" : tab === "past" ? "Past" : "Pending Payment";
            const pendingCount = pendingPaymentPlayers.length;
            return (
              <Pressable
                key={tab}
                style={[styles.rosterTabButton, isActive && styles.rosterTabButtonActive, tab === "pending_payment" && isActive && { backgroundColor: "#f59e0b" }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRosterTab(tab);
                  setSearchQuery("");
                  setFilterLevel(null);
                  setFilterSubLevel(null);
                  setFilterPlayerIds(null);
                }}
              >
                <Ionicons
                  name={tabIcon}
                  size={13}
                  color={isActive ? Colors.dark.buttonText : tab === "pending_payment" ? "#f59e0b" : Colors.dark.tabIconDefault}
                />
                <Text style={[styles.rosterTabText, isActive && styles.rosterTabTextActive]}>
                  {tabLabel}
                </Text>
                {tab === "pending_payment" && pendingCount > 0 ? (
                  <View style={{ backgroundColor: isActive ? "rgba(0,0,0,0.3)" : "#f59e0b", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: "center" }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: Colors.dark.buttonText }}>
                      {pendingCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      {/* === GAMING SEARCH BAR === */}
      
      <View style={styles.gamingSearchContainer}>
        <View style={styles.gamingSearchBar}>
          <View style={styles.searchIconBg}>
            <Ionicons name="search" size={16} color={GlowColors.primary} />
          </View>
          <TextInput
            style={styles.gamingSearchInput}
            placeholder="Search roster..."
            placeholderTextColor={Colors.dark.tabIconDefault + "80"}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.dark.xpCyan} />
            </Pressable>
          ) : null}
        </View>
        
        {/* Sort Button */}
        <Pressable 
          style={styles.sortButton}
          onPress={() => setShowSortDropdown(true)}
        >
          <Ionicons 
            name={
              sortBy === "name" || sortBy === "nameDesc" ? "text" :
              sortBy === "credits" || sortBy === "creditsDesc" ? "ticket-outline" :
              sortBy === "negative" || sortBy === "nonDebt" ? "alert-circle" :
              sortBy === "lastLesson" || sortBy === "oldestLesson" ? "time-outline" :
              sortBy === "newest" || sortBy === "oldest" ? "calendar-outline" :
              sortBy === "notActivated" || sortBy === "appActive" ? "person-add-outline" :
              "text"
            } 
            size={16} 
            color={Colors.dark.xpCyan} 
          />
          <Ionicons
            name={
              sortBy === "nameDesc" || sortBy === "creditsDesc" || sortBy === "nonDebt" || sortBy === "oldestLesson" || sortBy === "oldest" || sortBy === "appActive"
                ? "arrow-down"
                : "arrow-up"
            }
            size={12}
            color={Colors.dark.xpCyan}
          />
        </Pressable>
      </View>
      

      {/* Sort Modal */}
      <Modal visible={showSortDropdown} animationType="fade" transparent>
        <Pressable style={styles.sortModalOverlay} onPress={() => setShowSortDropdown(false)}>
          <View style={styles.sortModalContent}>
            <Text style={styles.sortModalTitle}>Sort Players</Text>

            {/* Name */}
            {(() => {
              const isActive = sortBy === "name" || sortBy === "nameDesc";
              const isReversed = sortBy === "nameDesc";
              const color = Colors.dark.xpCyan;
              return (
                <Pressable
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy(isActive ? (isReversed ? "name" : "nameDesc") : "name");
                    setShowSortDropdown(false);
                  }}
                >
                  <Ionicons name="text" size={18} color={isActive ? color : Colors.dark.tabIconDefault} />
                  <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                    {isReversed ? "Name Z-A" : "Name A-Z"}
                  </Text>
                  {isActive ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                      <Ionicons name={isReversed ? "arrow-down" : "arrow-up"} size={14} color={color} />
                      <Ionicons name="checkmark" size={18} color={color} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })()}

            {/* Credits */}
            {(() => {
              const isActive = sortBy === "credits" || sortBy === "creditsDesc";
              const isReversed = sortBy === "creditsDesc";
              const color = Colors.dark.warning;
              return (
                <Pressable
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy(isActive ? (isReversed ? "credits" : "creditsDesc") : "credits");
                    setShowSortDropdown(false);
                  }}
                >
                  <Ionicons name="ticket-outline" size={18} color={isActive ? color : Colors.dark.tabIconDefault} />
                  <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                    {isReversed ? "Credits High → Low" : "Credits Low → High"}
                  </Text>
                  {isActive ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                      <Ionicons name={isReversed ? "arrow-down" : "arrow-up"} size={14} color={color} />
                      <Ionicons name="checkmark" size={18} color={color} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })()}

            {/* Debt */}
            {(() => {
              const isActive = sortBy === "negative" || sortBy === "nonDebt";
              const isReversed = sortBy === "nonDebt";
              const color = Colors.dark.error;
              return (
                <Pressable
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy(isActive ? (isReversed ? "negative" : "nonDebt") : "negative");
                    setShowSortDropdown(false);
                  }}
                >
                  <Ionicons name="alert-circle" size={18} color={isActive ? color : Colors.dark.tabIconDefault} />
                  <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                    {isReversed ? "Non-Debt First" : "Debt First"}
                  </Text>
                  {isActive ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                      <Ionicons name={isReversed ? "arrow-down" : "arrow-up"} size={14} color={color} />
                      <Ionicons name="checkmark" size={18} color={color} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })()}

            {/* Last Lesson */}
            {(() => {
              const isActive = sortBy === "lastLesson" || sortBy === "oldestLesson";
              const isReversed = sortBy === "oldestLesson";
              const color = Colors.dark.primary;
              return (
                <Pressable
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy(isActive ? (isReversed ? "lastLesson" : "oldestLesson") : "lastLesson");
                    setShowSortDropdown(false);
                  }}
                >
                  <Ionicons name="time-outline" size={18} color={isActive ? color : Colors.dark.tabIconDefault} />
                  <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                    {isReversed ? "Oldest Lesson" : "Recent Lesson"}
                  </Text>
                  {isActive ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                      <Ionicons name={isReversed ? "arrow-up" : "arrow-down"} size={14} color={color} />
                      <Ionicons name="checkmark" size={18} color={color} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })()}

            {/* Join Date */}
            {(() => {
              const isActive = sortBy === "newest" || sortBy === "oldest";
              const isReversed = sortBy === "oldest";
              const color = Colors.dark.xpCyan;
              return (
                <Pressable
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy(isActive ? (isReversed ? "newest" : "oldest") : "newest");
                    setShowSortDropdown(false);
                  }}
                >
                  <Ionicons name="calendar-outline" size={18} color={isActive ? color : Colors.dark.tabIconDefault} />
                  <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                    {isReversed ? "Oldest First" : "Newest First"}
                  </Text>
                  {isActive ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                      <Ionicons name={isReversed ? "arrow-up" : "arrow-down"} size={14} color={color} />
                      <Ionicons name="checkmark" size={18} color={color} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })()}

            {/* Activation */}
            {(() => {
              const isActive = sortBy === "notActivated" || sortBy === "appActive";
              const isReversed = sortBy === "appActive";
              const color = Colors.dark.orange;
              return (
                <Pressable
                  style={[styles.sortOption, isActive && styles.sortOptionActive]}
                  onPress={() => {
                    setSortBy(isActive ? (isReversed ? "notActivated" : "appActive") : "notActivated");
                    setShowSortDropdown(false);
                  }}
                >
                  <Ionicons name="person-add-outline" size={18} color={isActive ? color : Colors.dark.tabIconDefault} />
                  <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                    {isReversed ? "App Active First" : "Awaiting Signup First"}
                  </Text>
                  {isActive ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                      <Ionicons name={isReversed ? "arrow-down" : "arrow-up"} size={14} color={color} />
                      <Ionicons name="checkmark" size={18} color={color} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* === ROSTER INSIGHTS FILTER BANNER === */}
      {filterPlayerIds !== null ? (
        <Pressable
          style={styles.rosterFilterBanner}
          onPress={() => setFilterPlayerIds(null)}
        >
          <Ionicons name="people-circle-outline" size={16} color={Colors.dark.primary} />
          <Text style={styles.rosterFilterBannerText}>
            Showing {filterPlayerIds.length} players from Roster Insights
          </Text>
          <Ionicons name="close-circle" size={16} color={Colors.dark.primary} />
        </Pressable>
      ) : null}

      {/* === GAMING FILTER PILLS === */}
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.gamingFilterScroll}
        contentContainerStyle={styles.gamingFilterContent}
      >
        <Pressable
          style={[styles.gamingFilterPill, !filterLevel && styles.gamingFilterPillActive]}
          onPress={() => setFilterLevel(null)}
        >
          {!filterLevel ? (
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <Text style={[styles.gamingFilterText, !filterLevel && styles.gamingFilterTextActive]}>
            ALL
          </Text>
          <View style={[styles.gamingFilterCount, !filterLevel && styles.gamingFilterCountActive]}>
            <Text style={[styles.gamingFilterCountText, !filterLevel && styles.gamingFilterCountTextActive]}>
              {currentPlayers.length}
            </Text>
          </View>
        </Pressable>
        {ballLevels.map((level) => {
          const isActive = filterLevel === level;
          const levelColor = getPlayerLevelColor(level);
          const count = currentPlayers.filter(p => getEffectiveBallLevel(p.ballLevel) === level).length;
          const isKidsLevel = ["blue", "red", "orange", "green", "yellow"].includes(level);
          return (
            <Pressable
              key={level}
              style={[
                styles.gamingFilterPill,
                isActive && styles.gamingFilterPillActive,
                isActive && Platform.select({
                  ios: {
                    shadowColor: levelColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 10,
                  },
                  android: { elevation: 8 },
                }),
              ]}
              onPress={() => {
                if (filterLevel === level) {
                  setFilterLevel(null);
                  setFilterSubLevel(null);
                } else {
                  setFilterLevel(level);
                  setFilterSubLevel(null);
                }
              }}
            >
              {isActive ? (
                <LinearGradient
                  colors={[levelColor, levelColor + "80"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <View style={[styles.gamingLevelDot, { backgroundColor: levelColor }]} />
              <Text style={[
                styles.gamingFilterText,
                isActive && styles.gamingFilterTextActive,
              ]}>
                {level.toUpperCase()}
              </Text>
              <View style={[styles.gamingFilterCount, isActive && { backgroundColor: "rgba(0,0,0,0.3)" }]}>
                <Text style={[styles.gamingFilterCountText, isActive && styles.gamingFilterCountTextActive]}>
                  {count}
                </Text>
              </View>
              {isActive && isKidsLevel ? (
                <Ionicons name="chevron-down" size={14} color="#FFFFFF" style={{ marginLeft: 2 }} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      

      {/* Sublevel filter for kids ball stages */}
      {filterLevel && ["blue", "red", "orange", "green", "yellow"].includes(filterLevel) ? (
        <View style={styles.subLevelFilterRow}>
          <Text style={styles.subLevelLabel}>{filterLevel.toUpperCase()} Level:</Text>
          {[3, 2, 1].map((subLevel) => {
            const levelColor = getPlayerLevelColor(filterLevel);
            const isActive = filterSubLevel === subLevel;
            const subLevelCount = currentPlayers.filter(p => 
              getEffectiveBallLevel(p.ballLevel) === filterLevel && 
              (p.skillLevel ? parseInt(p.skillLevel) : null) === subLevel
            ).length;
            return (
              <Pressable
                key={subLevel}
                style={[
                  styles.subLevelPill,
                  isActive && { backgroundColor: levelColor + "30", borderColor: levelColor },
                ]}
                onPress={() => setFilterSubLevel(filterSubLevel === subLevel ? null : subLevel)}
              >
                <Text style={[
                  styles.subLevelPillText,
                  isActive && { color: getPlayerLevelTextColor(filterLevel) },
                ]}>
                  {filterLevel.toUpperCase()} {subLevel}
                </Text>
                <View style={[styles.subLevelCount, isActive && { backgroundColor: levelColor + "40" }]}>
                  <Text style={[styles.subLevelCountText, isActive && { color: getPlayerLevelTextColor(filterLevel) }]}>
                    {subLevelCount}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {currentIsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        </View>
      ) : filteredPlayers.length === 0 ? (
        searchQuery ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={Colors.dark.xpCyan + "60"} />
            <Text style={styles.emptyText}>No players found</Text>
            <Text style={styles.emptySubtext}>Try a different search</Text>
          </View>
        ) : rosterTab === "past" ? (
          <GuidedEmptyState
            icon="archive-outline"
            title="No Past Players"
            description="Archived players will appear here. Move a player to Past from the Active tab using the archive option."
            tips={[
              "Open a player card and use the archive option",
              "Past players keep all their history intact",
            ]}
          />
        ) : rosterTab === "pending_payment" ? (
          <GuidedEmptyState
            icon="wallet-outline"
            title="No Pending Payments"
            description="Players flagged for pending payment will appear here. Use the wallet icon on active player cards to flag them."
            tips={[
              "Tap the wallet icon on any active player card",
              "Restore them to Active once payment is received",
            ]}
          />
        ) : (
          <GuidedEmptyState
            icon="people-outline"
            title="No Players Yet"
            description="Players will appear here once they're assigned to your sessions by the academy admin."
            tips={[
              "Contact your academy admin to get players assigned",
              "Players are automatically linked when added to your sessions",
            ]}
          />
        )
      ) : (
        <ScrollView style={styles.playerList} showsVerticalScrollIndicator={false}>
          {filteredPlayers.map((player) => (
            <View key={player.id}>
              <GamingPlayerCard 
                player={player} 
                onPress={() => handleSelectPlayer(player)}
                getStatusBadge={getStatusBadge}
                needsBaseline={rosterTab === "active" && playerIdsWithoutBaseline.has(player.id)}
                onStartBaseline={() => {
                  setBaselinePlayer(player);
                  setShowBaselineDrawer(true);
                }}
                isPast={rosterTab === "past"}
                isPendingPayment={rosterTab === "pending_payment"}
                juniorAssessmentBadge={assessmentBadges[player.id] ?? null}
                onArchive={rosterTab === "active" ? () => {
                  Alert.alert(
                    "Move to Past",
                    `Move ${player.name} to Past Players? Their history will be preserved.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Move to Past",
                        style: "destructive",
                        onPress: () => archivePlayerMutation.mutate(player.id),
                      },
                    ]
                  );
                } : rosterTab === "pending_payment" ? () => {
                  Alert.alert(
                    "Move to Past",
                    `Move ${player.name} to Past Players? Their history will be preserved.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Move to Past",
                        style: "destructive",
                        onPress: () => archivePendingPaymentMutation.mutate(player.id),
                      },
                    ]
                  );
                } : undefined}
                onRestore={rosterTab === "past" ? () => {
                  Alert.alert(
                    "Restore Player",
                    `Restore ${player.name} to Active Players?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Restore",
                        onPress: () => restorePlayerMutation.mutate(player.id),
                      },
                    ]
                  );
                } : rosterTab === "pending_payment" ? () => {
                  Alert.alert(
                    "Restore to Active",
                    `Restore ${player.name} to Active Players?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Restore",
                        onPress: () => restoreFromPendingPaymentMutation.mutate(player.id),
                      },
                    ]
                  );
                } : undefined}
                onPendingPayment={rosterTab === "active" ? () => {
                  Alert.alert(
                    "Mark as Pending Payment",
                    `Flag ${player.name} as awaiting payment? They will be moved to the Pending Payment tab.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Mark Pending",
                        onPress: () => markPendingPaymentMutation.mutate(player.id),
                      },
                    ]
                  );
                } : undefined}
              />
            </View>
          ))}
          <View style={{ height: TAB_BAR_HEIGHT + insets.bottom + Spacing.xl }} />
        </ScrollView>
        
      )}

      <PremiumAddPlayerFlow
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onComplete={(player) => {
          if (player?.inviteCode) {
            setCreatedPlayerInvite({ name: player.name, inviteCode: player.inviteCode });
            setShowInviteModal(true);
          }
          queryClient.invalidateQueries({ queryKey: ["/api/players"] });
          queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
        }}
      />

      {/* Player Invite Success Modal — Full-screen */}
      <Modal visible={showInviteModal} transparent={false} animationType="slide">
        <View style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot }}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: Spacing.xl,
              paddingTop: insets.top + Spacing.xl,
              paddingBottom: insets.bottom + Spacing.xl,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ alignItems: "center", marginBottom: Spacing.xl }}>
              <View style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: Colors.dark.primary + "20",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: Spacing.lg,
                borderWidth: 2,
                borderColor: Colors.dark.primary + "50",
              }}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.dark.primary} />
              </View>
              <Text style={{ fontSize: 28, fontWeight: "800", color: Colors.dark.text, marginBottom: Spacing.sm, textAlign: "center" }}>
                Player Added!
              </Text>
              <Text style={{ fontSize: 16, color: Colors.dark.tabIconDefault, textAlign: "center", lineHeight: 22 }}>
                Share this code with {createdPlayerInvite?.name} so they can sign up in the app
              </Text>
            </View>

            <View style={{
              width: "100%",
              backgroundColor: Colors.dark.backgroundSecondary,
              borderRadius: BorderRadius.xl,
              padding: Spacing.xl,
              marginBottom: Spacing.xl,
              borderWidth: 2,
              borderColor: Colors.dark.primary + "40",
              alignItems: "center",
            }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.dark.primary, letterSpacing: 2, textTransform: "uppercase", marginBottom: Spacing.md }}>
                Invite Code
              </Text>
              <Text style={styles.inviteCodeText} selectable>
                {createdPlayerInvite?.inviteCode}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.dark.tabIconDefault, textAlign: "center", marginTop: Spacing.sm, marginBottom: Spacing.lg, lineHeight: 18 }}>
                {createdPlayerInvite?.name} enters this code when signing up in the app
              </Text>
              <Pressable
                style={[styles.copyButton, { width: "100%" }]}
                onPress={async () => {
                  if (createdPlayerInvite?.inviteCode) {
                    await Clipboard.setStringAsync(createdPlayerInvite.inviteCode);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Copied!', 'Invite code copied to clipboard.');
                  }
                }}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.copyButtonGradient}
                >
                  <Ionicons name="copy-outline" size={20} color={Colors.dark.buttonText} />
                  <Text style={[styles.copyButtonText, { fontSize: 18 }]}>Copy Code</Text>
                </LinearGradient>
              </Pressable>
              {Platform.OS !== "web" ? (
                <Pressable
                  style={[styles.inviteShareButton, { width: "100%" }]}
                  onPress={async () => {
                    if (createdPlayerInvite?.inviteCode) {
                      try {
                        const { Share } = await import("react-native");
                        await Share.share({
                          message: `Hi ${createdPlayerInvite.name}! Use invite code ${createdPlayerInvite.inviteCode} to sign up on the Glow Up Sports app.`,
                          title: "Invite Code",
                        });
                      } catch {}
                    }
                  }}
                >
                  <Ionicons name="share-outline" size={18} color={Colors.dark.primary} />
                  <Text style={styles.inviteShareButtonText}>Share via...</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[styles.inviteDoneButton, { width: "100%" }]}
              onPress={() => {
                setShowInviteModal(false);
                setCreatedPlayerInvite(null);
              }}
            >
              <Text style={styles.inviteDoneButtonText}>Done</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <PremiumBaselineFlow
        visible={showBaselineDrawer}
        player={baselinePlayer}
        onClose={() => {
          setShowBaselineDrawer(false);
          setBaselinePlayer(null);
        }}
        onComplete={() => {
          setShowBaselineDrawer(false);
          setBaselinePlayer(null);
          queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
        }}
      />
    </View>
  );
}


