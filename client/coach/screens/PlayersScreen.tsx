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
import CreateInvoiceModal from "@/admin/components/CreateInvoiceModal";
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

function GamingPlayerCard({ 
  player, 
  onPress, 
  getStatusBadge,
  needsBaseline,
  onStartBaseline,
}: { 
  player: Player; 
  onPress: () => void;
  getStatusBadge: (status: string | null) => { color: string; icon: "airplane" | "bandage" | "sparkles"; label: string } | null;
  needsBaseline?: boolean;
  onStartBaseline?: () => void;
}) {
  const levelColor = getPlayerLevelColor(player.ballLevel ?? "green");
  const levelTextColor = getPlayerLevelTextColor(player.ballLevel ?? "green");
  // Use onHoliday from server as source of truth for holiday badge
  const effectiveStatus = player.onHoliday ? "holiday" : player.status;
  const statusBadge = getStatusBadge(effectiveStatus);
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const xpProgress = Math.random() * 100;

  return (
    <AnimatedPressable
      style={[styles.gamingCardContainer, animatedStyle]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <LinearGradient
        colors={[levelColor + "40", levelColor + "10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gamingCardBorder}
      >
        <View style={styles.gamingCardInner}>
          <View style={styles.gamingAvatarContainer}>
            <View style={[styles.gamingAvatarGlow, { backgroundColor: levelColor + "30" }]} />
            <View style={[styles.gamingAvatarRing, { borderColor: levelColor }]} />
            {player.profilePhotoUrl ? (
              Platform.OS === 'web' ? (
                <RNImage
                  source={{ uri: `${getStaticAssetsUrl()}${player.profilePhotoUrl}` }}
                  style={styles.gamingAvatarPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: `${getStaticAssetsUrl()}${player.profilePhotoUrl}` }}
                  style={styles.gamingAvatarPhoto}
                  contentFit="cover"
                />
              )
            ) : (
              <LinearGradient
                colors={[levelColor, levelColor + "80"]}
                style={styles.gamingAvatar}
              >
                <Text style={styles.gamingAvatarText}>
                  {player.name.charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            )}
          </View>

          <View style={styles.gamingCardInfo}>
            <View style={styles.gamingCardNameRow}>
              <Text style={styles.gamingCardName} numberOfLines={1}>
                {player.name}
              </Text>
              {player.auditVerifiedAt ? (
                <View style={styles.auditVerifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
                </View>
              ) : null}
              {needsBaseline && (
                <Pressable 
                  style={styles.baselineNeededBadge}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onStartBaseline?.();
                  }}
                >
                  <Ionicons name="flag" size={10} color={Colors.dark.orange} />
                  <Text style={styles.baselineNeededText}>Baseline</Text>
                </Pressable>
              )}
              {statusBadge ? (
                <View style={[styles.gamingStatusBadge, { backgroundColor: statusBadge.color + "25", borderColor: statusBadge.color }]}>
                  <Ionicons name={statusBadge.icon} size={10} color={statusBadge.color} />
                  <Text style={[styles.gamingStatusBadgeText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.gamingXpContainer}>
              <View style={styles.gamingXpBarBg}>
                <LinearGradient
                  colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.gamingXpBarFill, { width: `${xpProgress}%` }]}
                />
              </View>
              <Text style={styles.gamingXpText}>
                {Math.round(xpProgress)}%
              </Text>
            </View>

            <View style={styles.gamingCardMeta}>
              <View style={[styles.gamingLevelBadge, { borderColor: levelColor + "60" }]}>
                <View style={[styles.gamingLevelDotSmall, { backgroundColor: levelColor }]} />
                <Text style={[styles.gamingLevelText, { color: levelTextColor }]}>
                  {(player.ballLevel ?? "green").toUpperCase()}
                </Text>
              </View>
              {(() => {
                const credits = player.remainingCredits;
                const byType = player.creditsByType;

                const getCreditColor = (val: number) =>
                  val < 0 ? Colors.dark.error
                  : val === 0 ? Colors.dark.error
                  : val <= 2 ? Colors.dark.gold
                  : "#22c55e";

                const overallColor = credits === undefined
                  ? Colors.dark.tabIconDefault
                  : getCreditColor(credits);

                const formatCreditParts = () => {
                  if (credits === undefined) return [{ text: "No pkg", color: Colors.dark.tabIconDefault }];
                  if (!byType) return [{ text: credits === 0 ? "0 credits" : `${formatCredits(credits)}`, color: getCreditColor(credits) }];

                  const parts: { text: string; color: string }[] = [];
                  if (byType.private !== 0) parts.push({ text: `${formatCredits(byType.private)} Prv`, color: getCreditColor(byType.private) });
                  if (byType.group !== 0) parts.push({ text: `${formatCredits(byType.group)} Grp`, color: getCreditColor(byType.group) });
                  if (byType.semiPrivate !== 0) parts.push({ text: `${formatCredits(byType.semiPrivate)} Semi`, color: getCreditColor(byType.semiPrivate) });
                  return parts.length > 0 ? parts : [{ text: "0 credits", color: Colors.dark.error }];
                };

                const parts = formatCreditParts();

                return (
                  <View style={[styles.creditsBadge, { backgroundColor: overallColor + "20" }]}>
                    <Ionicons name="ticket-outline" size={12} color={overallColor} />
                    {parts.map((p, i) => (
                      <Text key={i} style={[styles.creditsText, { color: p.color }]}>
                        {i > 0 ? " | " : ""}{p.text}
                      </Text>
                    ))}
                  </View>
                );
              })()}
            </View>
          </View>

          <View style={styles.gamingChevron}>
            <Ionicons name="chevron-forward" size={18} color={Colors.dark.tabIconDefault + "80"} />
          </View>
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
}

export default function PlayersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const { registerTabCallback } = useTabNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const pendingPlayerIdRef = useRef<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "no-lessons" | "holiday">("all");
  const [sortBy, setSortBy] = useState<"name" | "credits" | "negative" | "lastLesson">("name");
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
  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true"],
  });

  const { data: playersWithoutBaseline = [] } = useQuery<Player[]>({
    queryKey: ["/api/academy/players-without-baseline"],
  });
  
  const playerIdsWithoutBaseline = useMemo(() => {
    return new Set(playersWithoutBaseline.map(p => p.id));
  }, [playersWithoutBaseline]);

  useEffect(() => {
    const unregister = registerTabCallback("Players", (_screen: string, params?: any) => {
      if (params?.playerId) {
        if (players.length > 0) {
          const player = players.find((p) => p.id === params.playerId || p.id === String(params.playerId));
          if (player) {
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
    if (pendingPlayerIdRef.current && players.length > 0) {
      const player = players.find((p) => p.id === pendingPlayerIdRef.current || p.id === String(pendingPlayerIdRef.current));
      if (player) {
        setSelectedPlayer(player);
      }
      pendingPlayerIdRef.current = null;
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
    let result = players;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.email && p.email.toLowerCase().includes(query))
      );
    }
    if (filterStatus === "active") {
      result = result.filter((p) => (p.activeGroupsCount ?? 0) > 0);
    } else if (filterStatus === "no-lessons") {
      result = result.filter((p) => (p.activeGroupsCount ?? 0) === 0 && (p.pausedGroupsCount ?? 0) === 0);
    } else if (filterStatus === "holiday") {
      result = result.filter((p) => p.onHoliday === true);
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
          // Low to high - urgent players first
          return aCredits - bCredits;
        case "negative":
          // Negative credits first, then by amount ascending
          if (aCredits < 0 && bCredits >= 0) return -1;
          if (bCredits < 0 && aCredits >= 0) return 1;
          if (aCredits < 0 && bCredits < 0) return aCredits - bCredits;
          return aCredits - bCredits;
        case "lastLesson":
          // Most recent first
          const aDate = a.lastLessonDate ? new Date(a.lastLessonDate).getTime() : 0;
          const bDate = b.lastLessonDate ? new Date(b.lastLessonDate).getTime() : 0;
          return bDate - aDate;
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [players, searchQuery, filterStatus, filterLevel, filterSubLevel, sortBy]);

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
    setSelectedPlayer(player);
  };

  if (selectedPlayer) {
    return (
      <PlayerDetailView
        player={selectedPlayer}
        onBack={() => setSelectedPlayer(null)}
        insets={insets}
      />
    );
  }

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
              <Text style={styles.gamingCountText}>{players.length}</Text>
              <Text style={styles.gamingCountLabel}>ACTIVE</Text>
            </View>
          </View>
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
              <Ionicons name="add" size={20} color={Colors.dark.backgroundRoot} />
              <Text style={styles.headerAddButtonText}>Add Player</Text>
            </LinearGradient>
          </Pressable>
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
            name={sortBy === "name" ? "text" : sortBy === "credits" || sortBy === "negative" ? "ticket-outline" : "time-outline"} 
            size={16} 
            color={Colors.dark.xpCyan} 
          />
          <Ionicons name="chevron-down" size={14} color={Colors.dark.tabIconDefault} />
        </Pressable>
      </View>
      

      {/* Sort Modal */}
      <Modal visible={showSortDropdown} animationType="fade" transparent>
        <Pressable style={styles.sortModalOverlay} onPress={() => setShowSortDropdown(false)}>
          <View style={styles.sortModalContent}>
            <Text style={styles.sortModalTitle}>Sort Players</Text>
            <Pressable 
              style={[styles.sortOption, sortBy === "name" && styles.sortOptionActive]}
              onPress={() => { setSortBy("name"); setShowSortDropdown(false); }}
            >
              <Ionicons name="text" size={18} color={sortBy === "name" ? Colors.dark.xpCyan : Colors.dark.tabIconDefault} />
              <Text style={[styles.sortOptionText, sortBy === "name" && styles.sortOptionTextActive]}>Name A-Z</Text>
              {sortBy === "name" ? <Ionicons name="checkmark" size={18} color={Colors.dark.xpCyan} style={{ marginLeft: "auto" }} /> : null}
            </Pressable>
            <Pressable 
              style={[styles.sortOption, sortBy === "credits" && styles.sortOptionActive]}
              onPress={() => { setSortBy("credits"); setShowSortDropdown(false); }}
            >
              <Ionicons name="ticket-outline" size={18} color={sortBy === "credits" ? Colors.dark.warning : Colors.dark.tabIconDefault} />
              <Text style={[styles.sortOptionText, sortBy === "credits" && styles.sortOptionTextActive]}>Credits Low → High</Text>
              {sortBy === "credits" ? <Ionicons name="checkmark" size={18} color={Colors.dark.warning} style={{ marginLeft: "auto" }} /> : null}
            </Pressable>
            <Pressable 
              style={[styles.sortOption, sortBy === "negative" && styles.sortOptionActive]}
              onPress={() => { setSortBy("negative"); setShowSortDropdown(false); }}
            >
              <Ionicons name="alert-circle" size={18} color={sortBy === "negative" ? Colors.dark.error : Colors.dark.tabIconDefault} />
              <Text style={[styles.sortOptionText, sortBy === "negative" && styles.sortOptionTextActive]}>Debt First</Text>
              {sortBy === "negative" ? <Ionicons name="checkmark" size={18} color={Colors.dark.error} style={{ marginLeft: "auto" }} /> : null}
            </Pressable>
            <Pressable 
              style={[styles.sortOption, sortBy === "lastLesson" && styles.sortOptionActive]}
              onPress={() => { setSortBy("lastLesson"); setShowSortDropdown(false); }}
            >
              <Ionicons name="time-outline" size={18} color={sortBy === "lastLesson" ? Colors.dark.primary : Colors.dark.tabIconDefault} />
              <Text style={[styles.sortOptionText, sortBy === "lastLesson" && styles.sortOptionTextActive]}>Recent Lesson</Text>
              {sortBy === "lastLesson" ? <Ionicons name="checkmark" size={18} color={Colors.dark.primary} style={{ marginLeft: "auto" }} /> : null}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* === LESSON STATUS FILTER === */}
      <View style={styles.statusFilterRow}>
        {(["all", "active", "no-lessons", "holiday"] as const).map((status) => {
          const isActive = filterStatus === status;
          const countAll = players.length;
          const countActive = players.filter((p) => (p.activeGroupsCount ?? 0) > 0).length;
          const countNoLessons = players.filter((p) => (p.activeGroupsCount ?? 0) === 0 && (p.pausedGroupsCount ?? 0) === 0).length;
          const countHoliday = players.filter((p) => p.onHoliday === true).length;
          const countMap = { all: countAll, active: countActive, "no-lessons": countNoLessons, holiday: countHoliday };
          const labelMap = { all: "All", active: "Active", "no-lessons": "No Lessons", holiday: "Holiday" };
          const iconMap = {
            all: "people-outline" as const,
            active: "tennisball-outline" as const,
            "no-lessons": "remove-circle-outline" as const,
            holiday: "airplane-outline" as const,
          };
          const colorMap = {
            all: Colors.dark.primary,
            active: "#22c55e",
            "no-lessons": Colors.dark.error,
            holiday: Colors.dark.xpCyan,
          };
          const activeColor = colorMap[status];
          return (
            <Pressable
              key={status}
              style={[
                styles.statusFilterPill,
                isActive && { backgroundColor: activeColor + "20", borderColor: activeColor },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterStatus(status);
              }}
            >
              <Ionicons
                name={iconMap[status]}
                size={12}
                color={isActive ? activeColor : Colors.dark.tabIconDefault}
              />
              <Text style={[styles.statusFilterText, isActive && { color: activeColor }]}>
                {labelMap[status]}
              </Text>
              <View style={[styles.statusFilterCount, isActive && { backgroundColor: activeColor + "30" }]}>
                <Text style={[styles.statusFilterCountText, isActive && { color: activeColor }]}>
                  {countMap[status]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

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
              {players.length}
            </Text>
          </View>
        </Pressable>
        {ballLevels.map((level) => {
          const isActive = filterLevel === level;
          const levelColor = getPlayerLevelColor(level);
          const count = players.filter(p => getEffectiveBallLevel(p.ballLevel) === level).length;
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
            const subLevelCount = players.filter(p => 
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

      {isLoading ? (
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
            <GamingPlayerCard 
              key={player.id} 
              player={player} 
              onPress={() => handleSelectPlayer(player)}
              getStatusBadge={getStatusBadge}
              needsBaseline={playerIdsWithoutBaseline.has(player.id)}
              onStartBaseline={() => {
                setBaselinePlayer(player);
                setShowBaselineDrawer(true);
              }}
            />
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

      {/* Player Invite Success Modal */}
      <Modal visible={showInviteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.inviteModalContent}>
            <View style={styles.inviteModalHeader}>
              <View style={styles.inviteSuccessIcon}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
              </View>
              <Text style={styles.inviteModalTitle}>Player Added</Text>
              <Text style={styles.inviteModalSubtitle}>
                {createdPlayerInvite?.name} has been added to your roster
              </Text>
            </View>

            <View style={styles.inviteCodeSection}>
              <Text style={styles.inviteCodeLabel}>Share this code with the player or parent:</Text>
              <View style={styles.inviteCodeBox}>
                <Text style={styles.inviteCodeText} selectable>
                  {createdPlayerInvite?.inviteCode}
                </Text>
              </View>
              <Pressable 
                style={styles.copyButton}
                onPress={async () => {
                  if (createdPlayerInvite?.inviteCode) {
                    await Clipboard.setStringAsync(createdPlayerInvite.inviteCode);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Copied', 'Invite code copied to clipboard!');
                  }
                }}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.copyButtonGradient}
                >
                  <Ionicons name="copy-outline" size={18} color={Colors.dark.backgroundRoot} />
                  <Text style={styles.copyButtonText}>Copy Code</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <Pressable 
              style={styles.inviteDoneButton}
              onPress={() => {
                setShowInviteModal(false);
                setCreatedPlayerInvite(null);
              }}
            >
              <Text style={styles.inviteDoneButtonText}>Done</Text>
            </Pressable>
          </View>
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

interface AttendanceHistoryRecord {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: string | null;
  lateMinutes: number | null;
  sessionStatus: string | null;
  seriesId?: string | null;
  seriesDayOfWeek?: number | null;
  seriesTitle?: string | null;
}

interface SeriesAttendanceSummary {
  seriesId: string;
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  title: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}

interface AttendanceHistoryResponse {
  history: AttendanceHistoryRecord[];
  seriesSummaries: SeriesAttendanceSummary[];
}

function PlayerDetailView({
  player,
  onBack,
  insets,
}: {
  player: Player;
  onBack: () => void;
  insets: { top: number; bottom: number };
}) {
  const { coach, academy } = useCoach();
  const queryClient = useQueryClient();
  const tz = academy?.timezone || "Asia/Dubai";
  
  const tabBarHeight = TAB_BAR_HEIGHT;
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("general");
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [isExportingAttendanceReport, setIsExportingAttendanceReport] = useState(false);
  const [isSharingAttendanceLink, setIsSharingAttendanceLink] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<Set<string>>(new Set());
  const [pillarProgressExpanded, setPillarProgressExpanded] = useState(false);
  const [showDeepAssessment, setShowDeepAssessment] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<AttendanceHistoryRecord | null>(null);
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);

  const [showEditPlayer, setShowEditPlayer] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [editName, setEditName] = useState(player.name);
  const [editEmail, setEditEmail] = useState(player.email ?? "");
  const [editPhone, setEditPhone] = useState(player.phone ?? "");
  const [editBallLevel, setEditBallLevel] = useState(player.ballLevel ?? "");


  const [localPlayer, setLocalPlayer] = useState(player);

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

  const updatePlayerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/players/${player.id}`, {
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        ballLevel: editBallLevel || null,
      });
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLocalPlayer((prev) => ({
        ...prev,
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        ballLevel: editBallLevel || null,
      }));
      queryClient.setQueryData<Player[]>(["/api/players?withCredits=true"], (old) =>
        old?.map((p) =>
          p.id === player.id
            ? { ...p, name: editName.trim(), email: editEmail.trim() || null, phone: editPhone.trim() || null, ballLevel: editBallLevel || null }
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

  const [localAuditVerified, setLocalAuditVerified] = useState<boolean>(!!player.auditVerifiedAt);
  const [verifyFlashText, setVerifyFlashText] = useState<string | null>(null);
  const verifyFlashOpacity = useSharedValue(0);
  const verifyButtonScale = useSharedValue(1);

  const verifyFlashStyle = useAnimatedStyle(() => ({
    opacity: verifyFlashOpacity.value,
    transform: [{ translateY: interpolate(verifyFlashOpacity.value, [0, 1], [8, 0]) }],
  }));

  const verifyButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: verifyButtonScale.value }],
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
      verifyButtonScale.value = withSequence(
        withSpring(1.3, { damping: 8 }),
        withSpring(1, { damping: 12 })
      );
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

  const handleExportAttendanceReport = async () => {
    try {
      setIsExportingAttendanceReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const response = await fetch(new URL(`/api/players/${player.id}/attendance-report`, getApiUrl()).toString(), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate attendance report");
      }
      
      const html = await response.text();
      
      const safeName = player.name.replace(/[^a-zA-Z0-9]/g, "_");
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeName}_Attendance_Report.html`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const newUri = `${FileSystem.cacheDirectory}${safeName}_Attendance_Report_${Date.now()}.pdf`;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, {
            mimeType: "application/pdf",
            dialogTitle: `${player.name} Attendance Report`,
            UTI: "com.adobe.pdf",
          });
        } else {
          await Print.printAsync({ uri: newUri });
        }
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error exporting attendance report:", error);
      Alert.alert("Error", "Failed to generate attendance report. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExportingAttendanceReport(false);
    }
  };

  const handleShareAttendanceLink = async () => {
    try {
      setIsSharingAttendanceLink(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const response = await fetch(
        new URL(`/api/players/${player.id}/attendance-share-token`, getApiUrl()).toString(),
        { method: "POST", credentials: "include", headers: getAuthHeaders() },
      );

      if (!response.ok) throw new Error("Failed to generate share link");

      const { shareUrl } = await response.json();

      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(shareUrl);
        Alert.alert("Link Copied", "Attendance link copied to clipboard. Share it with the player or parent.");
      } else {
        const { Share } = await import("react-native");
        await Share.share({
          message: `${player.name}'s attendance report: ${shareUrl}`,
          url: shareUrl,
          title: `${player.name} Attendance`,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error sharing attendance link:", error);
      Alert.alert("Error", "Failed to generate share link. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSharingAttendanceLink(false);
    }
  };

  const [isSendingMonthlyReport, setIsSendingMonthlyReport] = useState(false);

  const handleSendMonthlyReport = async () => {
    try {
      setIsSendingMonthlyReport(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const response = await fetch(new URL(`/api/player/${player.id}/monthly-report`, getApiUrl()).toString(), {
        method: "POST",
        credentials: "include",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}), // Uses previous month by default
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to send monthly report");
      }
      
      Alert.alert(
        "Monthly Report Sent",
        `${data.month} report has been emailed to this player.`,
        [{ text: "OK" }]
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error("Error sending monthly report:", error);
      Alert.alert("Error", error.message || "Failed to send monthly report. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSendingMonthlyReport(false);
    }
  };

  const { data: notes = [], isLoading: notesLoading } = useQuery<PlayerNote[]>({
    queryKey: [`/api/players/${player.id}/notes`],
  });

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

  const getPaymentStatusColor = (status?: string) => {
    switch (status) {
      case "paid": return Colors.dark.successNeon;
      case "partial": return Colors.dark.orange;
      case "overdue": return Colors.dark.error;
      default: return Colors.dark.textMuted;
    }
  };

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
  const { data: baselineData } = useQuery<BaselineData>({
    queryKey: [`/api/players/${player.id}/baseline`],
  });
  const [showResetBaselineConfirm, setShowResetBaselineConfirm] = useState(false);

  const resetBaselineMutation = useMutation({
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
    pillars: Array<{
      name: string;
      score: number;
      trend: string;
      skillsTotal: number;
      skillsMeetsOrAbove: number;
      lastUpdated: string | null;
    }>;
    overallReadiness: number;
    trialGateReady: boolean;
    recentFeedbackCount: number;
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

  // Fetch full attendance history with series summaries
  const { data: attendanceData } = useQuery<AttendanceHistoryResponse>({
    queryKey: [`/api/coach/players/${player.id}/attendance-history`],
  });
  const attendanceHistory = attendanceData?.history || [];
  const seriesAttendanceSummaries = attendanceData?.seriesSummaries || [];

  // Format attendance date for display
  const formatAttendanceDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
  };

  // Format time for attendance history (ISO string to HH:MM)
  const formatAttendanceTime = (timeStr: string | null) => {
    if (!timeStr) return "";
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
    } catch {
      return "";
    }
  };

  // Convert UTC time string (HH:MM) to local academy timezone
  const formatSeriesTime = (utcTime: string) => {
    return convertUTCTimeToLocal(utcTime, tz);
  };

  // Calculate level readiness (returns null for max level or invalid level)
  const levelReadiness = getLevelReadiness(localPlayer.ballLevel, xpData?.totalXp || 0);

  const addNoteMutation = useMutation({
    mutationFn: async (data: { content: string; category: string }) => {
      return apiRequest("POST", `/api/players/${player.id}/notes`, {
        ...data,
        coachId: coach?.id,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/notes`] });
      setNewNoteContent("");
      setNewNoteCategory("general");
      setShowAddNote(false);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to save note");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/players/${player.id}/notes/${noteId}`);
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/notes`] });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ noteId, isPinned }: { noteId: string; isPinned: boolean }) => {
      return apiRequest("PATCH", `/api/players/${player.id}/notes/${noteId}/pin`, { isPinned });
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/notes`] });
    },
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ sessionId, newStatus }: { sessionId: string; newStatus: string }) => {
      const response = await fetch(
        new URL(`/api/coach/players/${player.id}/sessions/${sessionId}/attendance`, getApiUrl()).toString(),
        {
          method: "PATCH",
          credentials: "include",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ newStatus }),
        }
      );
      if (!response.ok) throw new Error("Failed to update attendance");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/players/${player.id}/attendance-history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/coach/players/${player.id}/attendance-summary`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${player.id}/credit-balance`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingAttendance(null);
      setIsUpdatingAttendance(false);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsUpdatingAttendance(false);
      Alert.alert("Error", "Failed to update attendance");
    },
  });

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addNoteMutation.mutate({ content: newNoteContent.trim(), category: newNoteCategory });
  };

  const handleDeleteNote = (noteId: string) => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteNoteMutation.mutate(noteId) },
    ]);
  };

  const getCategoryInfo = (category: string | null) => {
    return NOTE_CATEGORIES.find(c => c.value === category) || NOTE_CATEGORIES[4];
  };

  const formatNoteDate = (date: string | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const pinnedNotes = notes.filter(n => n.isPinned);
  const regularNotes = notes.filter(n => !n.isPinned);
  const nextLessonNotes = notes.filter(n => n.category === "next-lesson");

  const displayedHistory = showAllHistory ? attendanceHistory : attendanceHistory.slice(0, 5);

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
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <Pressable
              style={styles.premiumExportButton}
              onPress={handleDeletePlayer}
              disabled={deletePlayerMutation.isPending}
            >
              {deletePlayerMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.error} />
              ) : (
                <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
              )}
            </Pressable>
            <Pressable
              style={styles.premiumExportButton}
              onPress={() => {
                setEditName(localPlayer.name);
                setEditEmail(localPlayer.email ?? "");
                setEditPhone(localPlayer.phone ?? "");
                setEditBallLevel(localPlayer.ballLevel ?? "");
                setShowEditPlayer(true);
              }}
            >
              <Ionicons name="pencil-outline" size={22} color={Colors.dark.tabIconDefault} />
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Animated.View style={verifyButtonAnimStyle}>
                <Pressable 
                  style={[
                    styles.premiumExportButton,
                    localAuditVerified ? { backgroundColor: Colors.dark.primary + "30", borderColor: Colors.dark.primary, borderWidth: 1 } : null,
                  ]} 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    auditVerifyMutation.mutate();
                  }}
                  disabled={auditVerifyMutation.isPending}
                >
                  {auditVerifyMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                  ) : (
                    <Ionicons 
                      name={localAuditVerified ? "checkmark-circle" : "checkmark-circle-outline"} 
                      size={22} 
                      color={localAuditVerified ? Colors.dark.primary : Colors.dark.tabIconDefault} 
                    />
                  )}
                </Pressable>
              </Animated.View>
              {verifyFlashText ? (
                <Animated.Text style={[{
                  position: "absolute",
                  top: 44,
                  fontSize: 11,
                  fontWeight: "700",
                  color: verifyFlashText === "Error" ? Colors.dark.error : 
                         verifyFlashText === "Unverified" ? Colors.dark.warning : Colors.dark.primary,
                  textAlign: "center",
                  width: 80,
                }, verifyFlashStyle]}>
                  {verifyFlashText}
                </Animated.Text>
              ) : null}
            </View>
            <Pressable 
              style={styles.premiumExportButton} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowDeepAssessment(true);
              }}
            >
              <Ionicons name="analytics" size={22} color={Colors.dark.xpCyan} />
            </Pressable>
            <Pressable 
              style={styles.premiumExportButton} 
              onPress={handleExportProgressReport}
              disabled={isExportingReport}
            >
              {isExportingReport ? (
                <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
              ) : (
                <Ionicons name="document-text-outline" size={22} color={Colors.dark.xpCyan} />
              )}
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.detailContent}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl, paddingTop: Spacing.md }}
        showsVerticalScrollIndicator={false}
      >
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
                  source={{ uri: `${getStaticAssetsUrl()}${localPlayer.profilePhotoUrl}` }}
                  style={styles.premiumAvatarPhoto}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={{ uri: `${getStaticAssetsUrl()}${localPlayer.profilePhotoUrl}` }}
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
                const pillarIcons: Record<string, string> = {
                  TECHNIQUE: "tennisball",
                  TACTICAL: "bulb",
                  PHYSICAL: "fitness",
                  MENTAL: "brain",
                  SOCIAL: "people",
                  MATCH: "trophy",
                };
                const color = pillarColors[pillar.name] || Colors.dark.primary;
                const icon = pillarIcons[pillar.name] || "ellipse";
                const progressPercent = Math.round((pillar.score / 2) * 100);
                const trendIcon = pillar.trend === "improving" ? "trending-up" : 
                                  pillar.trend === "declining" ? "trending-down" : "remove";
                const trendColor = pillar.trend === "improving" ? Colors.dark.primary : 
                                   pillar.trend === "declining" ? Colors.dark.error : Colors.dark.tabIconDefault;
                
                return (
                  <View key={pillar.name} style={styles.pillarItem}>
                    <View style={[styles.pillarIconContainer, { backgroundColor: color + "20" }]}>
                      <Ionicons name={icon as any} size={14} color={color} />
                    </View>
                    <View style={styles.pillarInfo}>
                      <View style={styles.pillarNameRow}>
                        <Text style={styles.pillarName}>{pillar.name.charAt(0) + pillar.name.slice(1).toLowerCase()}</Text>
                        <Ionicons name={trendIcon as any} size={12} color={trendColor} />
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
            
            {pillarProgress.recentFeedbackCount > 0 ? (
              <View style={styles.feedbackSummaryRow}>
                <Ionicons name="chatbubble-outline" size={12} color={Colors.dark.tabIconDefault} />
                <Text style={styles.feedbackSummaryText}>
                  {pillarProgress.recentFeedbackCount} feedback{pillarProgress.recentFeedbackCount !== 1 ? "s" : ""} last 30 days
                </Text>
              </View>
            ) : null}
            </> : null}
          </View>
        ) : null}

        <PackagesCard playerId={player.id} playerName={localPlayer.name} />

        {/* Payments Section */}
        {playerStats?.payments ? (
          <View style={styles.paymentsSection}>
            <Text style={styles.paymentsSectionTitle}>Payments</Text>
            <View style={styles.paymentsSummary}>
              <View style={[
                styles.paymentsStatusBadge, 
                { backgroundColor: `${getPaymentStatusColor(playerStats.payments.status)}20` }
              ]}>
                <Text style={[styles.paymentsStatusText, { color: getPaymentStatusColor(playerStats.payments.status) }]}>
                  {playerStats.payments.status?.toUpperCase() || "N/A"}
                </Text>
              </View>
            </View>
            <View style={styles.paymentsFinanceRow}>
              <Text style={styles.paymentsFinanceLabel}>Total Owed</Text>
              <Text style={[styles.paymentsFinanceValue, { color: Colors.dark.error }]}>
                {playerStats.payments.currency} {playerStats.payments.totalOwed}
              </Text>
            </View>
            <View style={styles.paymentsFinanceRow}>
              <Text style={styles.paymentsFinanceLabel}>Total Paid</Text>
              <Text style={[styles.paymentsFinanceValue, { color: Colors.dark.successNeon }]}>
                {playerStats.payments.currency} {playerStats.payments.totalPaid}
              </Text>
            </View>
            {playerStats.payments.lastPaymentDate ? (
              <View style={styles.paymentsFinanceRow}>
                <Text style={styles.paymentsFinanceLabel}>Last Payment</Text>
                <Text style={styles.paymentsFinanceValue}>{playerStats.payments.lastPaymentDate}</Text>
              </View>
            ) : null}
            <View style={styles.paymentsActions}>
              <Pressable 
                style={styles.paymentsRecordButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowRecordPaymentModal(true);
                }}
              >
                <Ionicons name="card-outline" size={16} color="#000" />
                <Text style={styles.paymentsRecordText}>Record Payment</Text>
              </Pressable>
              <Pressable 
                style={styles.paymentsCreateInvoiceButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowInvoiceModal(true);
                }}
              >
                <Ionicons name="document-text-outline" size={16} color={Colors.dark.successNeon} />
                <Text style={styles.paymentsCreateInvoiceText}>Create Invoice</Text>
              </Pressable>
            </View>

            {playerStats.payments.invoices && playerStats.payments.invoices.length > 0 ? (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={{ ...Typography.caption, color: Colors.dark.textMuted, fontWeight: "700" as const, letterSpacing: 1, marginBottom: Spacing.sm }}>
                  INVOICES ({playerStats.payments.invoices.length})
                </Text>
                {playerStats.payments.invoices.map((inv: any) => {
                  const isOverdue = inv.isOverdue;
                  const isPaid = inv.status === "paid";
                  const statusColor = isPaid ? Colors.dark.successNeon : isOverdue ? Colors.dark.error : "#FFD700";
                  const statusLabel = isPaid ? "PAID" : isOverdue ? "OVERDUE" : "PENDING";
                  return (
                    <View key={inv.id} style={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: BorderRadius.sm,
                      padding: Spacing.sm,
                      marginBottom: 6,
                      borderLeftWidth: 3,
                      borderLeftColor: statusColor,
                    }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, color: Colors.dark.text, fontWeight: "600" as const }}>
                            #{inv.invoiceNumber}
                          </Text>
                          <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>
                            Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "No date"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: "700" as const, color: statusColor }}>
                          {inv.currency} {inv.amount.toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                        <View style={{
                          backgroundColor: `${statusColor}20`,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: BorderRadius.xs,
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: "700" as const, color: statusColor }}>{statusLabel}</Text>
                        </View>
                        {!isPaid ? (
                          <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
                            <Pressable
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                backgroundColor: `${Colors.dark.successNeon}20`,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: BorderRadius.sm,
                                borderWidth: 1,
                                borderColor: `${Colors.dark.successNeon}40`,
                              }}
                              onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                try {
                                  await apiRequest("PATCH", `/api/billing/invoices/${inv.id}`, { status: "paid", paidAt: new Date().toISOString() });
                                  queryClient.invalidateQueries({ queryKey: ["/api/admin/players", player.id, "stats"] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                                  queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  Alert.alert("Invoice Paid", `Invoice #${inv.invoiceNumber} has been marked as paid.`);
                                } catch (error) {
                                  Alert.alert("Error", "Failed to mark invoice as paid. Please try again.");
                                }
                              }}
                            >
                              <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                              <Text style={{ fontSize: 12, color: Colors.dark.successNeon, fontWeight: "700" as const }}>Paid</Text>
                            </Pressable>
                            <Pressable
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                backgroundColor: `${isOverdue ? Colors.dark.error : "#FFD700"}15`,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: BorderRadius.sm,
                                borderWidth: 1,
                                borderColor: `${isOverdue ? Colors.dark.error : "#FFD700"}30`,
                              }}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                setShowInvoiceModal(true);
                              }}
                            >
                              <Ionicons name="mail-outline" size={14} color={isOverdue ? Colors.dark.error : "#FFD700"} />
                              <Text style={{ fontSize: 12, color: isOverdue ? Colors.dark.error : "#FFD700", fontWeight: "700" as const }}>Reminder</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Baseline Management Card */}
        <View style={styles.baselineManagementCard}>
          <View style={styles.baselineManagementHeader}>
            <View style={styles.baselineIconContainer}>
              <Ionicons name="flag" size={18} color={baselineData ? Colors.dark.primary : Colors.dark.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.baselineManagementTitle}>Start Baseline</Text>
              <Text style={styles.baselineManagementStatus}>
                {baselineData 
                  ? `Current: ${(baselineData.ballLevel || "Unknown").toUpperCase()} ${baselineData.skillLevel || ""} (${baselineData.status})`
                  : "No baseline set"
                }
              </Text>
            </View>
          </View>
          <Pressable
            style={[
              styles.baselineActionButton,
              baselineData ? styles.baselineResetButton : styles.baselineStartButton,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (baselineData) {
                setShowResetBaselineConfirm(true);
              } else {
                onBack();
              }
            }}
          >
            <Ionicons 
              name={baselineData ? "refresh" : "play"} 
              size={16} 
              color={baselineData ? Colors.dark.gold : Colors.dark.backgroundRoot} 
            />
            <Text style={[
              styles.baselineActionButtonText,
              baselineData && styles.baselineResetButtonText,
            ]}>
              {baselineData ? "Reopen Baseline" : "Start Baseline"}
            </Text>
          </Pressable>
        </View>

        {/* Reset Baseline Confirmation Modal */}
        <Modal visible={showResetBaselineConfirm} transparent animationType="fade">
          <View style={styles.confirmModalOverlay}>
            <View style={styles.confirmModalContent}>
              <View style={styles.confirmModalIcon}>
                <Ionicons name="warning" size={32} color={Colors.dark.gold} />
              </View>
              <Text style={styles.confirmModalTitle}>Reopen Baseline?</Text>
              <Text style={styles.confirmModalText}>
                This will delete the current baseline assessment for {player.name}. 
                You can then set a new baseline from scratch.
              </Text>
              <View style={styles.confirmModalActions}>
                <Pressable
                  style={styles.confirmModalCancelButton}
                  onPress={() => setShowResetBaselineConfirm(false)}
                >
                  <Text style={styles.confirmModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.confirmModalConfirmButton}
                  onPress={() => resetBaselineMutation.mutate()}
                  disabled={resetBaselineMutation.isPending}
                >
                  {resetBaselineMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <Text style={styles.confirmModalConfirmText}>Reopen</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {player.onboardingCompleted ? (
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingHeader}>
              <Ionicons name="person-circle-outline" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.onboardingTitle}>Player Profile (Self-Reported)</Text>
            </View>
            
            <View style={styles.onboardingGrid}>
              {player.motivationType ? (
                <View style={styles.onboardingItem}>
                  <Text style={styles.onboardingLabel}>Motivation</Text>
                  <Text style={styles.onboardingValue}>
                    {player.motivationType === "fun" ? "Plays for fun" :
                     player.motivationType === "improve" ? "Wants to improve" :
                     player.motivationType === "compete" ? "Wants to compete" : "Not sure yet"}
                  </Text>
                </View>
              ) : null}
              
              {player.experienceLevel ? (
                <View style={styles.onboardingItem}>
                  <Text style={styles.onboardingLabel}>Experience</Text>
                  <Text style={styles.onboardingValue}>
                    {player.experienceLevel === "new" ? "New to tennis" :
                     player.experienceLevel === "6-12months" ? "6-12 months" :
                     player.experienceLevel === "1-3years" ? "1-3 years" : "3+ years"}
                  </Text>
                </View>
              ) : null}
              
              {player.dominantHand ? (
                <View style={styles.onboardingItem}>
                  <Text style={styles.onboardingLabel}>Dominant Hand</Text>
                  <Text style={styles.onboardingValue}>
                    {player.dominantHand === "left" ? "Left-handed" : "Right-handed"}
                  </Text>
                </View>
              ) : null}
            </View>

            {player.enjoymentTags && player.enjoymentTags.length > 0 ? (
              <View style={styles.onboardingTagSection}>
                <Text style={styles.onboardingLabel}>Enjoys</Text>
                <View style={styles.onboardingTags}>
                  {player.enjoymentTags.map((tag) => (
                    <View key={tag} style={styles.onboardingTag}>
                      <Text style={styles.onboardingTagText}>
                        {tag === "rallies" ? "Hitting rallies" :
                         tag === "winning" ? "Winning points" :
                         tag === "technique" ? "Learning technique" :
                         tag === "social" ? "Playing with others" :
                         tag === "active" ? "Being active" : "Competing"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            
            {player.focusGoals && player.focusGoals.length > 0 ? (
              <View style={styles.onboardingTagSection}>
                <Text style={styles.onboardingLabel}>Wants to work on</Text>
                <View style={styles.onboardingTags}>
                  {player.focusGoals.map((goal) => (
                    <View key={goal} style={[styles.onboardingTag, styles.onboardingTagGoal]}>
                      <Text style={[styles.onboardingTagText, styles.onboardingTagGoalText]}>
                        {goal === "technique" ? "Technique" :
                         goal === "confidence" ? "Confidence" :
                         goal === "fitness" ? "Fitness" :
                         goal === "focus" ? "Focus" :
                         goal === "strategy" ? "Playing smarter" : "Social/Teamwork"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {player.selfConfidenceFlags && player.selfConfidenceFlags.length > 0 ? (
              <View style={styles.onboardingTagSection}>
                <Text style={styles.onboardingLabel}>Self-assessment</Text>
                <View style={styles.onboardingTags}>
                  {player.selfConfidenceFlags.map((flag) => (
                    <View key={flag} style={[styles.onboardingTag, styles.onboardingTagNeutral]}>
                      <Text style={styles.onboardingTagText}>
                        {flag === "confident" ? "Feels confident" :
                         flag === "basics" ? "Knows basics" :
                         flag === "nervous" ? "Gets nervous in matches" : "Still learning fundamentals"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {nextLessonNotes.length > 0 ? (
          <View style={styles.nextLessonSection}>
            <View style={styles.nextLessonHeader}>
              <Ionicons name="arrow-forward-circle" size={20} color={Colors.dark.primary} />
              <Text style={styles.nextLessonTitle}>Next Lesson Suggestion</Text>
            </View>
            <Text style={styles.nextLessonText}>{nextLessonNotes[0].content}</Text>
          </View>
        ) : null}

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Basic Info</Text>
          <View style={styles.infoCard}>
            {player.email ? (
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>{player.email}</Text>
              </View>
            ) : null}
            {player.phone ? (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>{player.phone}</Text>
              </View>
            ) : null}
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
            <Text style={styles.sectionLabel}>Medical Notes</Text>
            <View style={[styles.infoCard, styles.warningCard]}>
              <Ionicons name="medical-outline" size={20} color={Colors.dark.error} />
              <Text style={styles.medicalText}>{player.medicalNotes}</Text>
            </View>
          </View>
        ) : null}

        {/* Attendance History Section */}
        <View style={styles.infoSection}>
          <View style={styles.attendanceHistoryHeader}>
            <View style={styles.attendanceHistoryTitleRow}>
              <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.sectionLabel}>ATTENDANCE HISTORY</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                style={[styles.reportButton, isExportingAttendanceReport && { opacity: 0.5 }]}
                onPress={handleExportAttendanceReport}
                disabled={isExportingAttendanceReport}
              >
                {isExportingAttendanceReport ? (
                  <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={14} color={Colors.dark.xpCyan} />
                    <Text style={styles.reportButtonText}>PDF</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.reportButton, isSharingAttendanceLink && { opacity: 0.5 }]}
                onPress={handleShareAttendanceLink}
                disabled={isSharingAttendanceLink}
              >
                {isSharingAttendanceLink ? (
                  <ActivityIndicator size="small" color="#A78BFA" />
                ) : (
                  <>
                    <Ionicons name="link-outline" size={14} color="#A78BFA" />
                    <Text style={[styles.reportButtonText, { color: "#A78BFA" }]}>Share Link</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.reportButton, isSendingMonthlyReport && { opacity: 0.5 }]}
                onPress={handleSendMonthlyReport}
                disabled={isSendingMonthlyReport}
              >
                {isSendingMonthlyReport ? (
                  <ActivityIndicator size="small" color={Colors.dark.primary} />
                ) : (
                  <>
                    <Ionicons name="mail-outline" size={14} color={Colors.dark.primary} />
                    <Text style={[styles.reportButtonText, { color: Colors.dark.primary }]}>Email</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {attendanceHistory.length === 0 ? (
            <View style={styles.emptyAttendanceCard}>
              <Ionicons name="calendar-outline" size={40} color={Colors.dark.disabled} />
              <Text style={styles.emptyAttendanceText}>No sessions yet</Text>
              <Text style={styles.emptyAttendanceSubtext}>Sessions will appear here once attended</Text>
            </View>
          ) : (
            <View style={styles.attendanceHistoryList}>
              {/* Series Summary Cards - show when player has multiple lesson groups */}
              {seriesAttendanceSummaries.length > 1 && (
                <View style={styles.seriesSummaryContainer}>
                  <Text style={styles.seriesSummaryTitle}>Per Lesson Group</Text>
                  <View style={styles.seriesSummaryGrid}>
                    {seriesAttendanceSummaries.map((summary) => (
                      <View key={summary.seriesId} style={styles.seriesSummaryCard}>
                        <View style={styles.seriesSummaryHeader}>
                          <Text style={styles.seriesSummaryDay}>{summary.dayName}</Text>
                          <Text style={styles.seriesSummaryTime}>{formatSeriesTime(summary.startTime)}</Text>
                        </View>
                        <View style={styles.seriesSummaryStats}>
                          <View style={styles.seriesSummaryStat}>
                            <Text style={[styles.seriesSummaryStatValue, { color: Colors.dark.primary }]}>
                              {summary.presentCount}
                            </Text>
                            <Text style={styles.seriesSummaryStatLabel}>Present</Text>
                          </View>
                          <View style={styles.seriesSummaryStat}>
                            <Text style={[styles.seriesSummaryStatValue, { color: Colors.dark.error }]}>
                              {summary.absentCount}
                            </Text>
                            <Text style={styles.seriesSummaryStatLabel}>Absent</Text>
                          </View>
                          <View style={styles.seriesSummaryStat}>
                            <Text style={[
                              styles.seriesSummaryStatValue,
                              { color: summary.attendanceRate >= 80 ? Colors.dark.primary : 
                                       summary.attendanceRate >= 60 ? Colors.dark.gold : Colors.dark.error }
                            ]}>
                              {summary.attendanceRate}%
                            </Text>
                            <Text style={styles.seriesSummaryStatLabel}>Rate</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Group sessions by series if multiple groups exist */}
              {seriesAttendanceSummaries.length > 1 ? (
                seriesAttendanceSummaries.map((summary) => {
                  const seriesRecords = displayedHistory
                    .filter(r => r.seriesId === summary.seriesId)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  if (seriesRecords.length === 0) return null;
                  
                  const isExpanded = expandedSeriesIds.has(summary.seriesId);
                  const toggleExpanded = () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedSeriesIds(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(summary.seriesId)) {
                        newSet.delete(summary.seriesId);
                      } else {
                        newSet.add(summary.seriesId);
                      }
                      return newSet;
                    });
                  };
                  
                  return (
                    <View key={summary.seriesId} style={styles.seriesGroupSection}>
                      <Pressable style={styles.seriesGroupHeader} onPress={toggleExpanded}>
                        <View style={styles.seriesGroupHeaderLeft}>
                          <Text style={styles.seriesGroupDay}>{summary.dayName}</Text>
                          <Text style={styles.seriesGroupTime}>{formatSeriesTime(summary.startTime)}</Text>
                          <View style={styles.seriesGroupCount}>
                            <Text style={styles.seriesGroupCountText}>{seriesRecords.length}</Text>
                          </View>
                        </View>
                        <Ionicons 
                          name={isExpanded ? "chevron-up" : "chevron-down"} 
                          size={20} 
                          color={Colors.dark.xpCyan} 
                        />
                      </Pressable>
                      {isExpanded && seriesRecords.map((record) => (
                        <View key={record.sessionId} style={styles.attendanceHistoryRow}>
                          <View style={styles.attendanceHistoryDate}>
                            <Text style={styles.attendanceHistoryDateText}>
                              {formatAttendanceDate(record.date)}
                            </Text>
                          </View>
                          <View style={styles.attendanceHistoryDetails}>
                            <View style={styles.attendanceHistoryType}>
                              <Text style={styles.attendanceHistoryTypeText}>
                                {record.sessionType === "private" ? "Private" : 
                                 record.sessionType === "group" ? "Group" : 
                                 record.sessionType === "semi-private" ? "Semi" : record.sessionType}
                              </Text>
                            </View>
                            <View style={[
                              styles.attendanceStatusBadge,
                              record.status === "present" ? styles.attendanceStatusPresent :
                              record.status === "absent" ? styles.attendanceStatusAbsent :
                              (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusCancelled :
                              styles.attendanceStatusPending
                            ]}>
                              <Ionicons 
                                name={record.status === "present" ? "checkmark-circle" : 
                                      record.status === "absent" ? "close-circle" : 
                                      (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? "calendar-outline" : "time"} 
                                size={14} 
                                color={record.status === "present" ? Colors.dark.primary : 
                                       record.status === "absent" ? Colors.dark.error : 
                                       (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? Colors.dark.textSecondary : Colors.dark.gold}
                              />
                              <Text style={[
                                styles.attendanceStatusText,
                                record.status === "present" ? styles.attendanceStatusTextPresent :
                                record.status === "absent" ? styles.attendanceStatusTextAbsent :
                                (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusTextCancelled :
                                styles.attendanceStatusTextPending
                              ]}>
                                {record.status === "present" ? "Present" : 
                                 record.status === "absent" ? "Absent" : 
                                 record.status === "holiday" ? "Holiday" :
                                 record.status === "vacation" ? "Vacation" :
                                 record.status === "cancelled" ? "Cancelled" : "Pending"}
                              </Text>
                            </View>
                            <Pressable
                              style={styles.attendanceEditButton}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setEditingAttendance(record);
                              }}
                            >
                              <Ionicons name="pencil" size={16} color={Colors.dark.xpCyan} />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })
              ) : (
                /* Original layout for single lesson group - sorted by date (newest first) */
                [...displayedHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((record, index) => (
                  <View key={record.sessionId} style={styles.attendanceHistoryRow}>
                    <View style={styles.attendanceHistoryDate}>
                      <Text style={styles.attendanceHistoryDateText}>
                        {formatAttendanceDate(record.date)}
                      </Text>
                      <Text style={styles.attendanceHistoryTime}>
                        {formatAttendanceTime(record.startTime)} - {formatAttendanceTime(record.endTime)}
                      </Text>
                    </View>
                    <View style={styles.attendanceHistoryDetails}>
                      <View style={styles.attendanceHistoryType}>
                        <Text style={styles.attendanceHistoryTypeText}>
                          {record.sessionType === "private" ? "Private" : 
                           record.sessionType === "group" ? "Group" : 
                           record.sessionType === "semi-private" ? "Semi" : record.sessionType}
                        </Text>
                      </View>
                      <View style={[
                        styles.attendanceStatusBadge,
                        record.status === "present" ? styles.attendanceStatusPresent :
                        record.status === "absent" ? styles.attendanceStatusAbsent :
                        (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusCancelled :
                        styles.attendanceStatusPending
                      ]}>
                        <Ionicons 
                          name={record.status === "present" ? "checkmark-circle" : 
                                record.status === "absent" ? "close-circle" : 
                                (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? "calendar-outline" : "time"} 
                          size={14} 
                          color={record.status === "present" ? Colors.dark.primary : 
                                 record.status === "absent" ? Colors.dark.error : 
                                 (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? Colors.dark.textSecondary : Colors.dark.gold}
                        />
                        <Text style={[
                          styles.attendanceStatusText,
                          record.status === "present" ? styles.attendanceStatusTextPresent :
                          record.status === "absent" ? styles.attendanceStatusTextAbsent :
                          (record.status === "holiday" || record.status === "cancelled" || record.status === "vacation") ? styles.attendanceStatusTextCancelled :
                          styles.attendanceStatusTextPending
                        ]}>
                          {record.status === "present" ? "Present" : 
                           record.status === "absent" ? "Absent" : 
                           record.status === "holiday" ? "Holiday" :
                           record.status === "vacation" ? "Vacation" :
                           record.status === "cancelled" ? "Cancelled" : "Pending"}
                          {record.lateMinutes && record.lateMinutes > 0 ? ` (+${record.lateMinutes}m late)` : ""}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.attendanceEditButton}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setEditingAttendance(record);
                        }}
                      >
                        <Ionicons name="pencil" size={16} color={Colors.dark.xpCyan} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}

              {attendanceHistory.length > 5 ? (
                <Pressable
                  style={styles.showMoreHistoryButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAllHistory(!showAllHistory);
                  }}
                >
                  <Text style={styles.showMoreHistoryText}>
                    {showAllHistory ? "Show Less" : `Show All (${attendanceHistory.length} sessions)`}
                  </Text>
                  <Ionicons 
                    name={showAllHistory ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color={Colors.dark.xpCyan} 
                  />
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.notesSectionHeader}>
            <Text style={styles.sectionLabel}>Coach Notes</Text>
            <Text style={styles.notesCount}>{notes.length} notes</Text>
          </View>

          {showAddNote ? (
            <View style={styles.addNoteForm}>
              <View style={styles.categoryPicker}>
                {NOTE_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.value}
                    style={[
                      styles.categoryChip,
                      newNoteCategory === cat.value && styles.categoryChipActive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setNewNoteCategory(cat.value);
                    }}
                  >
                    <Ionicons
                      name={cat.icon}
                      size={14}
                      color={newNoteCategory === cat.value ? Colors.dark.primary : Colors.dark.tabIconDefault}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        newNoteCategory === cat.value && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.noteInput}
                placeholder="Write a note..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={newNoteContent}
                onChangeText={setNewNoteContent}
                multiline
                maxLength={500}
              />
              <View style={styles.noteActions}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddNote(false);
                    setNewNoteContent("");
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveNoteButton, addNoteMutation.isPending && styles.saveNoteButtonDisabled]}
                  onPress={handleAddNote}
                  disabled={addNoteMutation.isPending || !newNoteContent.trim()}
                >
                  {addNoteMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Text style={styles.saveNoteButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.addNoteButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAddNote(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
              <Text style={styles.addNoteText}>Add note</Text>
            </Pressable>
          )}

          {notesLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: Spacing.md }} />
          ) : notes.length === 0 ? (
            <View style={styles.emptyNotesCard}>
              <Ionicons name="document-text-outline" size={32} color={Colors.dark.disabled} />
              <Text style={styles.noNotesText}>No notes yet</Text>
            </View>
          ) : (
            <View style={styles.notesList}>
              {pinnedNotes.map((note) => {
                const catInfo = getCategoryInfo(note.category);
                return (
                  <View key={note.id} style={[styles.noteCard, styles.pinnedNoteCard]}>
                    <View style={styles.noteHeader}>
                      <View style={styles.noteCategoryBadge}>
                        <Ionicons name={catInfo.icon} size={12} color={Colors.dark.primary} />
                        <Text style={styles.noteCategoryText}>{catInfo.label}</Text>
                      </View>
                      <Ionicons name="pin" size={14} color={Colors.dark.gold} />
                    </View>
                    <Text style={styles.noteContent}>{note.content}</Text>
                    <View style={styles.noteFooter}>
                      <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
                      <View style={styles.noteFooterActions}>
                        <Pressable onPress={() => togglePinMutation.mutate({ noteId: note.id, isPinned: false })}>
                          <Ionicons name="pin-outline" size={18} color={Colors.dark.tabIconDefault} />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteNote(note.id)}>
                          <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
              {regularNotes.map((note) => {
                const catInfo = getCategoryInfo(note.category);
                return (
                  <View key={note.id} style={styles.noteCard}>
                    <View style={styles.noteHeader}>
                      <View style={styles.noteCategoryBadge}>
                        <Ionicons name={catInfo.icon} size={12} color={Colors.dark.tabIconDefault} />
                        <Text style={styles.noteCategoryText}>{catInfo.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.noteContent}>{note.content}</Text>
                    <View style={styles.noteFooter}>
                      <Text style={styles.noteDate}>{formatNoteDate(note.createdAt)}</Text>
                      <View style={styles.noteFooterActions}>
                        <Pressable onPress={() => togglePinMutation.mutate({ noteId: note.id, isPinned: true })}>
                          <Ionicons name="pin-outline" size={18} color={Colors.dark.tabIconDefault} />
                        </Pressable>
                        <Pressable onPress={() => handleDeleteNote(note.id)}>
                          <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <DeepAssessmentDrawer
        visible={showDeepAssessment}
        player={player}
        onClose={() => setShowDeepAssessment(false)}
      />

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
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Attendance Modal */}
      <Modal visible={!!editingAttendance} transparent animationType="fade">
        <Pressable style={styles.editAttendanceModalOverlay} onPress={() => setEditingAttendance(null)}>
          <View style={styles.editAttendanceModalContent}>
            <Text style={styles.editAttendanceModalTitle}>Edit Attendance</Text>
            <Text style={styles.editAttendanceModalSubtitle}>
              {editingAttendance ? formatAttendanceDate(editingAttendance.date) : ""}
            </Text>
            
            {["present", "absent", "late", "holiday"].map((status) => (
              <Pressable
                key={status}
                style={[
                  styles.editAttendanceOption,
                  editingAttendance?.status === status && styles.editAttendanceOptionSelected,
                ]}
                onPress={() => {
                  if (editingAttendance && editingAttendance.status !== status) {
                    setIsUpdatingAttendance(true);
                    updateAttendanceMutation.mutate({
                      sessionId: editingAttendance.sessionId,
                      newStatus: status,
                    });
                  } else {
                    setEditingAttendance(null);
                  }
                }}
                disabled={isUpdatingAttendance}
              >
                <Ionicons
                  name={status === "present" ? "checkmark-circle" : 
                        status === "absent" ? "close-circle" : 
                        status === "late" ? "time" : "calendar-outline"}
                  size={20}
                  color={status === "present" ? Colors.dark.primary : 
                         status === "absent" ? Colors.dark.error : 
                         status === "late" ? Colors.dark.gold : Colors.dark.textSecondary}
                />
                <Text style={styles.editAttendanceOptionText}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
                {editingAttendance?.status === status && (
                  <Ionicons name="checkmark" size={20} color={Colors.dark.primary} style={{ marginLeft: "auto" }} />
                )}
              </Pressable>
            ))}
            
            {isUpdatingAttendance && (
              <ActivityIndicator size="small" color={Colors.dark.xpCyan} style={{ marginTop: 16 }} />
            )}
            
            <Text style={styles.editAttendanceNote}>
              Changing attendance will automatically adjust credits
            </Text>
          </View>
        </Pressable>
      </Modal>

      <CreateInvoiceModal
        visible={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        player={playerStats?.player ? {
          id: playerStats.player.id,
          name: playerStats.player.name,
          email: playerStats.player.email,
          phone: playerStats.player.phone,
          parentName: playerStats.player.parentName,
          parentEmail: undefined,
          parentPhone: playerStats.player.parentPhone,
        } : null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/players", player.id, "stats"] });
        }}
      />

      {/* Record Payment Modal */}
      <Modal
        visible={showRecordPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRecordPaymentModal(false)}
      >
        <View style={styles.recordPaymentOverlay}>
          <View style={styles.recordPaymentContainer}>
            <View style={styles.recordPaymentHeader}>
              <Text style={styles.recordPaymentTitle}>Record Payment</Text>
              <Pressable 
                style={styles.recordPaymentClose}
                onPress={() => setShowRecordPaymentModal(false)}
              >
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.recordPaymentContent}>
              {playerStats?.packages?.filter((p: any) => !p.isPaid).length === 0 ? (
                <View style={styles.noUnpaidBox}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.dark.successNeon} />
                  <Text style={styles.noUnpaidTitleText}>All Paid!</Text>
                  <Text style={styles.noUnpaidSubText}>
                    This player has no outstanding payments.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.unpaidTitle}>Unpaid Packages</Text>
                  {playerStats?.packages?.filter((p: any) => !p.isPaid).map((pkg: any) => (
                    <View key={pkg.id} style={styles.unpaidCard}>
                      <View style={styles.unpaidInfo}>
                        <View style={styles.unpaidRow}>
                          <Ionicons 
                            name={pkg.creditType === "private" ? "person" : pkg.creditType === "semi_private" ? "people" : "people-circle"} 
                            size={20} 
                            color={Colors.dark.primary} 
                          />
                          <Text style={styles.unpaidType}>
                            {pkg.creditType === "private" ? "Private" : pkg.creditType === "semi_private" ? "Semi-Private" : "Group"}
                          </Text>
                        </View>
                        <Text style={styles.unpaidCredits}>
                          {formatCredits(pkg.remainingCredits)} / {formatCredits(pkg.totalCredits)} credits
                        </Text>
                        <Text style={styles.unpaidPrice}>
                          AED {Number(pkg.price || 0).toLocaleString()}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.markPaidBtn}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          try {
                            await apiRequest("PATCH", `/api/packages/${pkg.id}`, { isPaid: true, paidAt: new Date().toISOString() });
                            queryClient.invalidateQueries({ queryKey: ["/api/admin/players", player.id, "stats"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
                            queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert("Payment Recorded", `Package marked as paid.`);
                          } catch (error) {
                            console.error("Failed to record payment:", error);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            Alert.alert("Error", "Failed to record payment. Please try again.");
                          }
                        }}
                      >
                        <Ionicons name="checkmark" size={18} color="#000" />
                        <Text style={styles.markPaidBtnText}>Mark Paid</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
            
            <Pressable
              style={styles.recordPaymentDone}
              onPress={() => setShowRecordPaymentModal(false)}
            >
              <Text style={styles.recordPaymentDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },

  // === GAMING AESTHETIC STYLES ===
  gamingHeader: {
    paddingBottom: Spacing.md,
  },
  gamingHeaderTopLine: {
    height: 3,
    width: "100%",
  },
  gamingHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  gamingHeaderLeft: {
    gap: Spacing.sm,
  },
  gamingTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  gamingCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: GlowColors.primary + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
    position: "relative",
    overflow: "hidden",
  },
  gamingCountGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dark.xpCyan + "10",
  },
  gamingCountText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  gamingCountLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.xpCyan + "80",
    letterSpacing: 1,
  },
  gamingSearchContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  gamingSearchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.xpCyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  gamingSearchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  searchIconBg: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: GlowColors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  sortModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  sortModalContent: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    width: "100%",
    maxWidth: 320,
    overflow: "hidden",
  },
  sortModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  sortOptionActive: {
    backgroundColor: Colors.dark.xpCyan + "15",
  },
  sortOptionText: {
    fontSize: 15,
    color: Colors.dark.tabIconDefault,
  },
  sortOptionTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statusFilterRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statusFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    flex: 1,
    justifyContent: "center",
  },
  statusFilterText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  statusFilterCount: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  statusFilterCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
  },
  gamingFilterScroll: {
    marginBottom: Spacing.md,
    maxHeight: 50,
  },
  gamingFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  gamingFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  gamingFilterPillActive: {
    borderWidth: 0,
  },
  gamingFilterText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
  },
  gamingFilterTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  gamingLevelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gamingFilterCount: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 20,
    alignItems: "center",
  },
  gamingFilterCountActive: {
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  gamingFilterCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
  },
  gamingFilterCountTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  subLevelFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  subLevelLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginRight: Spacing.xs,
  },
  subLevelPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  subLevelPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
  },
  subLevelCount: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    minWidth: 18,
    alignItems: "center",
  },
  subLevelCountText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
  },
  gamingCardContainer: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  gamingCardBorder: {
    padding: 2,
    borderRadius: BorderRadius.lg,
  },
  gamingCardInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg - 2,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingAvatarContainer: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  gamingAvatarGlow: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
      },
      android: {},
    }),
  },
  gamingAvatarRing: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
      },
      android: {},
    }),
  },
  gamingAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  gamingAvatarPhoto: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  gamingAvatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
  },
  gamingCardInfo: {
    flex: 1,
    gap: 6,
  },
  gamingCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingCardName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
    letterSpacing: 0.3,
  },
  gamingStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  gamingStatusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  auditVerifiedBadge: {
    marginLeft: 2,
  },
  baselineNeededBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.dark.orange + "20",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
  },
  baselineNeededText: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
    color: Colors.dark.orange,
  },
  gamingXpContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingXpBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  gamingXpBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  gamingXpText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    minWidth: 30,
    textAlign: "right",
  },
  gamingCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  gamingLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  gamingLevelDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gamingLevelText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  gamingMetaText: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault + "80",
  },
  creditsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  creditsText: {
    fontSize: 10,
    fontWeight: "600",
  },
  gamingChevron: {
    padding: Spacing.xs,
  },
  gamingFab: {
    position: "absolute",
    bottom: 100,
    right: Spacing.lg,
    borderRadius: 28,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.xpCyan,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  gamingFabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
  gamingFabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAddButton: {
    borderRadius: 20,
    overflow: "hidden",
  },
  headerAddButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  headerAddButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
    letterSpacing: 0.5,
  },

  // === CALM STYLES (60% - Gold Standard like Calendar/Settings) ===
  calmHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  calmHeaderLeft: {
    gap: 2,
  },
  calmTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  calmSubtitle: {
    fontSize: 14,
    color: Colors.dark.tabIconDefault,
  },
  calmAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  calmSearchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  calmSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  calmSearchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
  },
  calmFilterScroll: {
    marginBottom: Spacing.md,
    maxHeight: 50,
  },
  calmFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  calmFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    height: 36,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  calmFilterPillActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  calmFilterText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.tabIconDefault,
  },
  calmFilterTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  calmLevelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  calmPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  calmAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  calmAvatarText: {
    fontSize: 18,
    fontWeight: "600",
  },
  calmAvatarPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  calmPlayerInfo: {
    flex: 1,
    gap: 4,
  },
  calmPlayerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  calmPlayerName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  calmStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  calmStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  calmPlayerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  calmLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  calmLevelDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  calmLevelText: {
    fontSize: 12,
    fontWeight: "500",
  },
  calmMetaText: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
  },
  
  // === HUD COMMAND HEADER (keeping for reference) ===
  hudHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.primary + "30",
    position: "relative",
    overflow: "hidden",
  },
  hudHeaderBg: {
    ...StyleSheet.absoluteFillObject,
  },
  scanlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03,
    backgroundColor: "transparent",
  },
  hudLeft: {
    flex: 1,
  },
  hudLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  hudDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  hudLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.primary,
    letterSpacing: 1.5,
  },
  hudTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  hudStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  hudStatValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  hudStatLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
  },
  hudCenter: {
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  hudIconOuter: {
    position: "absolute",
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
    borderColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 20,
      },
      android: {},
    }),
  },
  hudIconGlow: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Colors.dark.primary + "40",
  },
  hudIconInner: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.primary + "70",
  },
  hudRight: {
    flex: 1,
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  hudXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  hudXpValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  hudXpLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Colors.dark.gold,
    opacity: 0.7,
  },
  hudAddButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  hudAddButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // === TACTICAL COMMAND STRIP ===
  commandStrip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    position: "relative",
  },
  commandStripBg: {
    ...StyleSheet.absoluteFillObject,
  },
  tacticalSearch: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.overlay,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    overflow: "hidden",
  },
  tacticalSearchIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary + "15",
    borderRightWidth: 1,
    borderRightColor: Colors.dark.primary + "30",
  },
  tacticalSearchInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: Spacing.md,
    fontSize: 12,
    fontWeight: "500",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  tacticalSearchClear: {
    width: 32,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  // === TACTICAL FILTER STRIP ===
  filterStrip: {
    paddingVertical: Spacing.sm,
  },
  filterStripContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  tacticalChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  tacticalChipActive: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tacticalChipGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  tacticalChipGlowActive: {
    backgroundColor: Colors.dark.primary + "35",
  },
  tacticalChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1.5,
  },
  tacticalChipTextActive: {
    color: Colors.dark.primary,
    textShadowColor: Colors.dark.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  tacticalChipCount: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 20,
    alignItems: "center",
  },
  tacticalChipCountActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  tacticalChipCountText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
  },
  tacticalLevelIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // === LOADOUT CARDS ===
  loadoutCard: {
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.md,
    borderRadius: 16,
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  loadoutGlowFrame: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 19,
    borderWidth: 3,
  },
  loadoutGlowFrameInner: {
    position: "absolute",
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: 17,
    borderWidth: 2,
  },
  loadoutCardBg: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "50",
    overflow: "hidden",
  },
  loadoutTopStrip: {
    height: 5,
    width: "100%",
  },
  loadoutContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  loadoutAvatarContainer: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  loadoutAvatarGlowOuter: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  loadoutAvatarGlow: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  loadoutAvatarRing: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
  },
  loadoutAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  loadoutAvatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  loadoutTierBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0a0a0a",
  },
  loadoutTierText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
  loadoutInfo: {
    flex: 1,
    gap: 4,
  },
  loadoutNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  loadoutName: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
    flex: 1,
  },
  loadoutStatusBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  loadoutXpContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  loadoutXpBar: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  loadoutXpFill: {
    height: "100%",
    borderRadius: 2,
  },
  loadoutXpText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    minWidth: 45,
    textAlign: "right",
  },
  loadoutStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  loadoutStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  loadoutStatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  loadoutStatText: {
    fontSize: 9,
    fontWeight: "500",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.3,
  },
  loadoutStatDivider: {
    width: 1,
    height: 10,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  loadoutAction: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadoutActionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },

  // === LEGACY STYLES (keeping for compatibility) ===
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "60",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  filterContainer: {
    paddingLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  filterChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  levelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  playerList: {
    flex: 1,
  },
  playerCardContainer: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  playerCardGlow: {
    position: "absolute" as const,
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: BorderRadius.lg + 2,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    opacity: 0.6,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: {},
    }),
  },
  playerCardTopLine: {
    height: 3,
    width: "100%",
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitial: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  playerInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  playerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  playerDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: 4,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  levelText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  lastLesson: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  exportButton: {
    padding: Spacing.xs,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  detailContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  largeInitial: {
    fontSize: 32,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  largeAvatarPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginBottom: Spacing.md,
  },
  profileName: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  profileLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  profileLevelText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  infoSection: {
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  warningCard: {
    flexDirection: "row",
    gap: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.error,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  infoText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  medicalText: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  notesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.md,
  },
  noNotesText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  addNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary + "15",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  addNoteText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  nextLessonSection: {
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.primary,
  },
  nextLessonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  nextLessonTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  nextLessonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  notesSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  notesCount: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  addNoteForm: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  categoryPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  categoryChipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  categoryChipText: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  categoryChipTextActive: {
    color: Colors.dark.primary,
  },
  noteInput: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 80,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    textAlignVertical: "top",
  },
  noteActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  cancelButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  saveNoteButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 80,
    alignItems: "center",
  },
  saveNoteButtonDisabled: {
    opacity: 0.5,
  },
  saveNoteButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  emptyNotesCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  notesList: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  noteCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  pinnedNoteCard: {
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    backgroundColor: Colors.dark.gold + "08",
  },
  noteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  noteCategoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  noteCategoryText: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  noteContent: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  noteFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.headerBorder,
  },
  noteDate: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  noteFooterActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  formInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  levelPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  formHint: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
    marginBottom: Spacing.sm,
    fontWeight: "500",
  },
  skillLevelPicker: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  skillLevelOption: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 2,
    borderColor: Colors.dark.tabIconDefault + "40",
    justifyContent: "center",
    alignItems: "center",
  },
  skillLevelText: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  levelOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  levelOptionWrapper: {
    borderRadius: BorderRadius.full,
  },
  levelOptionGlowOuter: {
    borderRadius: BorderRadius.full,
    padding: 2,
  },
  levelOptionGradient: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  levelOptionInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  levelOptionUnselected: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  levelOptionText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  levelOptionTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  addCancelButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  addSaveButton: {
    flex: 1,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  addSaveButtonDisabled: {
    opacity: 0.5,
  },
  addSaveButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.backgroundDefault,
    fontWeight: "600",
  },
  levelReadinessCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: GlowColors.primary + "30",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  levelReadinessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  levelReadinessIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  levelReadinessTitle: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  xpBadgeText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  progressContainer: {
    gap: Spacing.sm,
  },
  levelLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  currentLevelLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  nextLevelLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  levelDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  levelLabelText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  progressBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: BorderRadius.full,
  },
  progressPercent: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    minWidth: 36,
    textAlign: "right",
  },
  xpRemainingText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  pillarGrid: {
    gap: Spacing.sm,
  },
  pillarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIconContainer: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarInfo: {
    flex: 1,
  },
  pillarNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  pillarName: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  pillarProgressBar: {
    height: 4,
    backgroundColor: Colors.dark.tabIconDefault + "30",
    borderRadius: 2,
    overflow: "hidden",
  },
  pillarProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  pillarPercent: {
    fontSize: Typography.small.fontSize,
    fontWeight: "700",
    minWidth: 36,
    textAlign: "right",
  },
  feedbackSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.tabIconDefault + "20",
  },
  feedbackSummaryText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  baselineManagementCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  baselineManagementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  baselineIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  baselineManagementTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  baselineManagementStatus: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  baselineActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  baselineStartButton: {
    backgroundColor: Colors.dark.primary,
  },
  baselineResetButton: {
    backgroundColor: Colors.dark.gold + "20",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  baselineActionButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  baselineResetButtonText: {
    color: Colors.dark.gold,
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  confirmModalContent: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  confirmModalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  confirmModalTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  confirmModalText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  confirmModalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  confirmModalCancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  confirmModalCancelText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  confirmModalConfirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  confirmModalConfirmText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  onboardingCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.xpCyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  onboardingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  onboardingTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  onboardingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  onboardingItem: {
    minWidth: 100,
  },
  onboardingLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  onboardingValue: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  onboardingTagSection: {
    marginTop: Spacing.sm,
  },
  onboardingTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  onboardingTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan + "20",
    borderRadius: BorderRadius.md,
  },
  onboardingTagGoal: {
    backgroundColor: Colors.dark.primary + "20",
  },
  onboardingTagNeutral: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  onboardingTagText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.xpCyan,
  },
  onboardingTagGoalText: {
    color: Colors.dark.primary,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  inviteModalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  inviteModalHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  inviteSuccessIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  inviteModalTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  inviteModalSubtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  inviteCodeSection: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  inviteCodeLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  inviteCodeBox: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  inviteCodeText: {
    fontSize: 13,
    color: Colors.dark.text,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  copyButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  copyButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  copyButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  inviteDoneButton: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  inviteDoneButtonText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },

  // === PREMIUM PLAYER PROFILE STYLES ===
  premiumDetailHeader: {
    paddingBottom: Spacing.lg,
  },
  premiumHeaderTopLine: {
    height: 3,
    width: "100%",
  },
  premiumHeaderNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  premiumBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  premiumExportButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  premiumProfileCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  premiumAvatarContainer: {
    alignItems: "center",
    marginBottom: Spacing.sm,
    position: "relative",
  },
  premiumAvatarGlow: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    opacity: 0.3,
  },
  premiumAvatarPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan,
  },
  premiumAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan + "50",
  },
  premiumInitial: {
    fontSize: 26,
    fontWeight: "700",
  },
  premiumProfileInfo: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  premiumProfileName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  premiumLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  premiumLevelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  premiumLevelText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  premiumXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  premiumXpText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  premiumQuickStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  premiumQuickStat: {
    flex: 1,
    alignItems: "center",
  },
  premiumQuickStatValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  premiumQuickStatLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  premiumQuickStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },

  // === ATTENDANCE HISTORY STYLES ===
  attendanceHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  attendanceHistoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  attendanceHistoryCount: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
    backgroundColor: Colors.dark.xpCyan + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF0000",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: "#FF0000",
  },
  reportButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyAttendanceCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  emptyAttendanceText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  emptyAttendanceSubtext: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
  },
  attendanceHistoryList: {
    gap: Spacing.sm,
  },
  attendanceHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderLeftWidth: 3,
    borderLeftColor: GlowColors.primary,
  },
  attendanceHistoryDate: {
    flex: 1,
  },
  attendanceHistoryDateText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  attendanceHistoryTime: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  attendanceHistoryDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  attendanceHistoryType: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  attendanceHistoryTypeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  attendanceStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  attendanceStatusPresent: {
    backgroundColor: Colors.dark.primary + "20",
  },
  attendanceStatusAbsent: {
    backgroundColor: Colors.dark.error + "20",
  },
  attendanceStatusPending: {
    backgroundColor: Colors.dark.gold + "20",
  },
  attendanceStatusCancelled: {
    backgroundColor: "#E53935" + "30",  // Red background for cancelled
  },
  attendanceStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  attendanceStatusTextPresent: {
    color: Colors.dark.primary,
  },
  attendanceStatusTextAbsent: {
    color: Colors.dark.error,
  },
  attendanceStatusTextPending: {
    color: Colors.dark.gold,
  },
  attendanceStatusTextCancelled: {
    color: "#E53935",  // Red text for cancelled
  },
  showMoreHistoryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan + "10",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  showMoreHistoryText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 0.5,
  },
  
  // Series attendance summary styles
  seriesSummaryContainer: {
    marginBottom: Spacing.lg,
  },
  seriesSummaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  seriesSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  seriesSummaryCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.dark.xpCyan + "10",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  seriesSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  seriesSummaryDay: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  seriesSummaryTime: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  seriesSummaryStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  seriesSummaryStat: {
    alignItems: "center",
  },
  seriesSummaryStatValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  seriesSummaryStatLabel: {
    fontSize: 9,
    color: Colors.dark.tabIconDefault,
    textTransform: "uppercase",
  },
  
  // Series group section styles
  seriesGroupSection: {
    marginBottom: Spacing.md,
  },
  seriesGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.xpCyan + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.xpCyan,
  },
  seriesGroupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  seriesGroupDay: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  seriesGroupTime: {
    fontSize: 12,
    color: Colors.dark.tabIconDefault,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  seriesGroupCount: {
    backgroundColor: Colors.dark.xpCyan + "30",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  seriesGroupCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },

  // === EDIT ATTENDANCE MODAL STYLES ===
  attendanceEditButton: {
    padding: 8,
    marginLeft: 8,
  },
  editAttendanceModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  editAttendanceModalContent: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 340,
  },
  editAttendanceModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 4,
  },
  editAttendanceModalSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  editAttendanceOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: Backgrounds.card,
    marginBottom: 8,
    gap: 12,
  },
  editAttendanceOptionSelected: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  editAttendanceOptionText: {
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  editAttendanceNote: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginTop: 16,
    fontStyle: "italic",
  },
  paymentsSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  paymentsSectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  paymentsSummary: {
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  paymentsStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  paymentsStatusText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  paymentsFinanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  paymentsFinanceLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  paymentsFinanceValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  paymentsActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  paymentsRecordButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.dark.orange,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  paymentsRecordText: {
    ...Typography.body,
    color: "#000",
    fontWeight: "700",
  },
  paymentsCreateInvoiceButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.successNeon + "20",
    borderWidth: 1,
    borderColor: Colors.dark.successNeon + "40",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  paymentsCreateInvoiceText: {
    ...Typography.body,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  recordPaymentOverlay: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "flex-end",
  },
  recordPaymentContainer: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
    paddingBottom: 34,
  },
  recordPaymentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  recordPaymentTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  recordPaymentClose: {
    padding: Spacing.xs,
  },
  recordPaymentContent: {
    padding: Spacing.lg,
  },
  noUnpaidBox: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  noUnpaidTitleText: {
    ...Typography.h3,
    color: Colors.dark.successNeon,
    fontWeight: "700",
  },
  noUnpaidSubText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  unpaidTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  unpaidCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${Colors.dark.error}40`,
  },
  unpaidInfo: {
    flex: 1,
    gap: 4,
  },
  unpaidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  unpaidType: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  unpaidCredits: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  unpaidPrice: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "700",
  },
  markPaidBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.successNeon,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  markPaidBtnText: {
    ...Typography.caption,
    color: "#000",
    fontWeight: "700",
  },
  recordPaymentDone: {
    backgroundColor: Colors.dark.primary,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  recordPaymentDoneText: {
    ...Typography.body,
    color: "#000",
    fontWeight: "700",
  },
});
