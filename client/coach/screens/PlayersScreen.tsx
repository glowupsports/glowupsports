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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
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
      result = result.filter((p) => p.ballLevel === filterLevel);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [players, searchQuery, filterLevel]);

  const ballLevels = ["red", "orange", "green", "yellow", "glow"];

  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red":
        return "#FF4444";
      case "orange":
        return "#FF851B";
      case "green":
        return "#2ECC40";
      case "yellow":
        return "#FFDC00";
      case "glow":
        return "#00D4FF";
      default:
        return Colors.dark.disabled;
    }
  };

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
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Players</Text>
          <Text style={styles.subtitle}>{players.length} players</Text>
        </View>
        <Pressable
          style={styles.addButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={24} color={Colors.dark.backgroundDefault} />
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color={Colors.dark.tabIconDefault} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color={Colors.dark.tabIconDefault} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[styles.filterChip, !filterLevel && styles.filterChipActive]}
            onPress={() => setFilterLevel(null)}
          >
            <Text style={[styles.filterChipText, !filterLevel && styles.filterChipTextActive]}>
              All
            </Text>
          </Pressable>
          {ballLevels.map((level) => (
            <Pressable
              key={level}
              style={[
                styles.filterChip,
                filterLevel === level && { backgroundColor: getLevelColor(level) + "30" },
              ]}
              onPress={() => setFilterLevel(filterLevel === level ? null : level)}
            >
              <View style={[styles.levelDot, { backgroundColor: getLevelColor(level) }]} />
              <Text
                style={[
                  styles.filterChipText,
                  filterLevel === level && { color: getLevelColor(level) },
                ]}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : filteredPlayers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={Colors.dark.disabled} />
          <Text style={styles.emptyText}>
            {searchQuery ? "No players found" : "No players"}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.playerList} showsVerticalScrollIndicator={false}>
          {filteredPlayers.map((player) => {
            const statusBadge = getStatusBadge(player.status);
            return (
              <Pressable
                key={player.id}
                style={styles.playerCard}
                onPress={() => handleSelectPlayer(player)}
              >
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerInitial}>
                    {player.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.playerInfo}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    {statusBadge ? (
                      <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + "20" }]}>
                        <Ionicons name={statusBadge.icon} size={12} color={statusBadge.color} />
                        <Text style={[styles.statusText, { color: statusBadge.color }]}>
                          {statusBadge.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.playerDetails}>
                    {player.ballLevel ? (
                      <View style={styles.levelBadge}>
                        <View
                          style={[styles.levelDot, { backgroundColor: getLevelColor(player.ballLevel) }]}
                        />
                        <Text style={styles.levelText}>
                          {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.lastLesson}>{formatDate(player.lastLessonDate)}</Text>
                  </View>
                </View>
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
                    <View style={[styles.levelDot, { backgroundColor: getLevelColor(level) }]} />
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

  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red":
        return "#FF4444";
      case "orange":
        return "#FF851B";
      case "green":
        return "#2ECC40";
      case "yellow":
        return "#FFDC00";
      case "glow":
        return "#00D4FF";
      default:
        return Colors.dark.disabled;
    }
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
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <View style={styles.largeAvatar}>
            <Text style={styles.largeInitial}>{player.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileName}>{player.name}</Text>
          {player.ballLevel ? (
            <View style={styles.profileLevel}>
              <View style={[styles.levelDot, { backgroundColor: getLevelColor(player.ballLevel) }]} />
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
                  <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(player.ballLevel) }]} />
                  <Text style={styles.levelLabelText}>
                    {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={14} color={Colors.dark.tabIconDefault} />
                <View style={styles.nextLevelLabel}>
                  <View style={[styles.levelDotSmall, { backgroundColor: getLevelColor(levelReadiness.nextLevel) }]} />
                  <Text style={styles.levelLabelText}>
                    {levelReadiness.nextLevel.charAt(0).toUpperCase() + levelReadiness.nextLevel.slice(1)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarBackground}>
                  <LinearGradient
                    colors={[getLevelColor(player.ballLevel), getLevelColor(levelReadiness.nextLevel)]}
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
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginRight: Spacing.sm,
    gap: Spacing.xs,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  filterChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  filterChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
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
    paddingHorizontal: Spacing.lg,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
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
});
