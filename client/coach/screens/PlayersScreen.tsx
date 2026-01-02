import React, { useState, useMemo } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, getPlayerLevelColor } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useCoach } from "@/coach/context/CoachContext";
import PackagesCard from "@/coach/components/PackagesCard";

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

export default function PlayersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [newPlayerPhone, setNewPlayerPhone] = useState("");
  const [newPlayerBallLevel, setNewPlayerBallLevel] = useState<string>("green");

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const createPlayerMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string; phone?: string; ballLevel?: string; coachId?: string }) => {
      return apiRequest("POST", "/api/players", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setShowAddModal(false);
      setNewPlayerName("");
      setNewPlayerEmail("");
      setNewPlayerPhone("");
      setNewPlayerBallLevel("green");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to create player");
    },
  });

  const getEffectiveBallLevel = (level: string | null) => level || "green";

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
    if (filterLevel) {
      result = result.filter((p) => getEffectiveBallLevel(p.ballLevel) === filterLevel);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [players, searchQuery, filterLevel]);

  const ballLevels = ["red", "orange", "green", "yellow", "glow"];



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
      {/* === CALM HEADER (like Calendar/Settings) === */}
      <View style={styles.calmHeader}>
        <View style={styles.calmHeaderLeft}>
          <Text style={styles.calmTitle}>Players</Text>
          <Text style={styles.calmSubtitle}>{players.length} active</Text>
        </View>
        <Pressable
          style={styles.calmAddButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={22} color={Colors.dark.text} />
        </Pressable>
      </View>

      {/* === CALM SEARCH BAR === */}
      <View style={styles.calmSearchContainer}>
        <View style={styles.calmSearchBar}>
          <Ionicons name="search" size={18} color={Colors.dark.tabIconDefault} />
          <TextInput
            style={styles.calmSearchInput}
            placeholder="Search players..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={Colors.dark.tabIconDefault} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* === CALM FILTER PILLS === */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.calmFilterScroll}
        contentContainerStyle={styles.calmFilterContent}
      >
        <Pressable
          style={[styles.calmFilterPill, !filterLevel && styles.calmFilterPillActive]}
          onPress={() => setFilterLevel(null)}
        >
          <Text style={[styles.calmFilterText, !filterLevel && styles.calmFilterTextActive]}>
            All ({players.length})
          </Text>
        </Pressable>
        {ballLevels.map((level) => {
          const isActive = filterLevel === level;
          const levelColor = getPlayerLevelColor(level);
          const count = players.filter(p => getEffectiveBallLevel(p.ballLevel) === level).length;
          return (
            <Pressable
              key={level}
              style={[
                styles.calmFilterPill,
                isActive && { backgroundColor: levelColor + "20", borderColor: levelColor },
              ]}
              onPress={() => setFilterLevel(filterLevel === level ? null : level)}
            >
              <View style={[styles.calmLevelDot, { backgroundColor: levelColor }]} />
              <Text style={[
                styles.calmFilterText,
                isActive && { color: levelColor },
              ]}>
                {level.charAt(0).toUpperCase() + level.slice(1)} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : filteredPlayers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={48} color={Colors.dark.disabled} />
          <Text style={styles.emptyText}>
            {searchQuery ? "No players found" : "No players yet"}
          </Text>
          <Text style={styles.emptySubtext}>
            {searchQuery ? "Try a different search" : "Add your first player to get started"}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.playerList} showsVerticalScrollIndicator={false}>
          {filteredPlayers.map((player) => {
            const statusBadge = getStatusBadge(player.status);
            const levelColor = getPlayerLevelColor(player.ballLevel ?? "green");
            return (
              <Pressable
                key={player.id}
                style={styles.calmPlayerCard}
                onPress={() => handleSelectPlayer(player)}
              >
                {/* Simple Avatar */}
                <View style={[styles.calmAvatar, { backgroundColor: levelColor + "20" }]}>
                  <Text style={[styles.calmAvatarText, { color: levelColor }]}>
                    {player.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Player Info */}
                <View style={styles.calmPlayerInfo}>
                  <View style={styles.calmPlayerNameRow}>
                    <Text style={styles.calmPlayerName} numberOfLines={1}>
                      {player.name}
                    </Text>
                    {statusBadge ? (
                      <View style={[styles.calmStatusBadge, { backgroundColor: statusBadge.color + "20" }]}>
                        <Text style={[styles.calmStatusText, { color: statusBadge.color }]}>
                          {statusBadge.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.calmPlayerMeta}>
                    <View style={[styles.calmLevelBadge, { borderColor: levelColor }]}>
                      <View style={[styles.calmLevelDotSmall, { backgroundColor: levelColor }]} />
                      <Text style={[styles.calmLevelText, { color: levelColor }]}>
                        {(player.ballLevel ?? "green").charAt(0).toUpperCase() + (player.ballLevel ?? "green").slice(1)}
                      </Text>
                    </View>
                    <Text style={styles.calmMetaText}>
                      {formatDate(player.lastLessonDate)}
                    </Text>
                  </View>
                </View>

                {/* Chevron */}
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
              </Pressable>
            );
          })}
          <View style={{ height: insets.bottom + Spacing.xl }} />
        </ScrollView>
      )}

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Player</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.tabIconDefault} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Player name"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={newPlayerName}
                onChangeText={setNewPlayerName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Email address"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={newPlayerEmail}
                onChangeText={setNewPlayerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Phone number"
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={newPlayerPhone}
                onChangeText={setNewPlayerPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Ball Level</Text>
              <View style={styles.levelPicker}>
                {ballLevels.map((level) => (
                  <Pressable
                    key={level}
                    style={[
                      styles.levelOption,
                      newPlayerBallLevel === level && styles.levelOptionSelected,
                    ]}
                    onPress={() => setNewPlayerBallLevel(level)}
                  >
                    <View style={[styles.levelDot, { backgroundColor: getPlayerLevelColor(level) }]} />
                    <Text
                      style={[
                        styles.levelOptionText,
                        newPlayerBallLevel === level && styles.levelOptionTextSelected,
                      ]}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.addCancelButton}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.addSaveButton,
                  !newPlayerName.trim() && styles.addSaveButtonDisabled,
                ]}
                onPress={() => {
                  if (newPlayerName.trim()) {
                    createPlayerMutation.mutate({
                      name: newPlayerName.trim(),
                      email: newPlayerEmail.trim() || undefined,
                      phone: newPlayerPhone.trim() || undefined,
                      ballLevel: newPlayerBallLevel,
                      coachId: coach?.id,
                    });
                  }
                }}
                disabled={!newPlayerName.trim() || createPlayerMutation.isPending}
              >
                {createPlayerMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.backgroundDefault} />
                ) : (
                  <Text style={styles.addSaveButtonText}>Add Player</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
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
  const { coach } = useCoach();
  const queryClient = useQueryClient();
  
  const tabBarHeight = useBottomTabBarHeight();
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("general");

  const { data: notes = [], isLoading: notesLoading } = useQuery<PlayerNote[]>({
    queryKey: [`/api/players/${player.id}/notes`],
  });

  const { data: xpData } = useQuery<PlayerXpData>({
    queryKey: [`/api/players/${player.id}/xp`],
  });

  // Calculate level readiness (returns null for max level or invalid level)
  const levelReadiness = getLevelReadiness(player.ballLevel, xpData?.totalXp || 0);

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.detailHeader}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.detailTitle}>Player Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.detailContent}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <View style={[styles.largeAvatar, { backgroundColor: getPlayerLevelColor(player.ballLevel ?? "green") + "30" }]}>
            <Text style={[styles.largeInitial, { color: getPlayerLevelColor(player.ballLevel ?? "green") }]}>{player.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileName}>{player.name}</Text>
          {player.ballLevel ? (
            <View style={styles.profileLevel}>
              <View style={[styles.levelDot, { backgroundColor: getPlayerLevelColor(player.ballLevel) }]} />
              <Text style={styles.profileLevelText}>
                {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)} Ball
              </Text>
            </View>
          ) : null}
        </View>

        {player.ballLevel && levelReadiness ? (
          <View style={styles.levelReadinessCard}>
            <View style={styles.levelReadinessHeader}>
              <View style={styles.levelReadinessIcon}>
                <Ionicons name="trending-up" size={18} color={Colors.dark.primary} />
              </View>
              <Text style={styles.levelReadinessTitle}>Level Readiness</Text>
              {xpData ? (
                <View style={styles.xpBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                  <Text style={styles.xpBadgeText}>{xpData.totalXp} XP</Text>
                </View>
              ) : null}
            </View>
            
            <View style={styles.progressContainer}>
              <View style={styles.levelLabels}>
                <View style={styles.currentLevelLabel}>
                  <View style={[styles.levelDotSmall, { backgroundColor: getPlayerLevelColor(player.ballLevel) }]} />
                  <Text style={styles.levelLabelText}>
                    {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={Colors.dark.tabIconDefault} />
                <View style={styles.nextLevelLabel}>
                  <View style={[styles.levelDotSmall, { backgroundColor: getPlayerLevelColor(levelReadiness.nextLevel) }]} />
                  <Text style={styles.levelLabelText}>
                    {levelReadiness.nextLevel.charAt(0).toUpperCase() + levelReadiness.nextLevel.slice(1)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarBackground}>
                  <LinearGradient
                    colors={[getPlayerLevelColor(player.ballLevel), getPlayerLevelColor(levelReadiness.nextLevel)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.progressBarFill, { width: `${levelReadiness.progress}%` }]}
                  />
                </View>
                <Text style={styles.progressPercent}>{Math.round(levelReadiness.progress)}%</Text>
              </View>
              
              <Text style={styles.xpRemainingText}>
                {levelReadiness.xpRemaining > 0 
                  ? `${levelReadiness.xpRemaining} XP to ${levelReadiness.nextLevel.charAt(0).toUpperCase() + levelReadiness.nextLevel.slice(1)} Ball`
                  : "Ready for level up!"}
              </Text>
            </View>
          </View>
        ) : null}

        <PackagesCard playerId={player.id} playerName={player.name} />

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

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Attendance Pattern</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>-</Text>
              <Text style={styles.statLabel}>Total lessons</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>-</Text>
              <Text style={styles.statLabel}>Attendance %</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>-</Text>
              <Text style={styles.statLabel}>Late</Text>
            </View>
          </View>
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
                    <ActivityIndicator size="small" color="#FFF" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
    color: Colors.dark.disabled,
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
    backgroundColor: "rgba(0, 0, 0, 0.6)",
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
    color: "#000",
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
    color: "#000",
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
    backgroundColor: "rgba(20, 20, 20, 0.95)",
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.dark.primary + "60",
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
  },
  sectionLabel: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
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
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  addNoteText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
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
  },
  addNoteForm: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
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
    color: "#FFF",
  },
  emptyNotesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  notesList: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  noteCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  pinnedNoteCard: {
    borderWidth: 1,
    borderColor: Colors.dark.gold + "50",
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
  levelOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  levelOptionSelected: {
    backgroundColor: Colors.dark.primary + "30",
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  levelReadinessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  levelReadinessIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  levelReadinessTitle: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
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
  onboardingCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.xpCyan,
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
});
