import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ReportIssueModal } from "@/components/ReportIssueModal";

interface Player {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  ballLevel?: string;
  level?: number;
  totalXp?: number;
  coachName?: string;
  remainingCredits?: number;
  totalCredits?: number;
}

interface PlayerStats {
  player: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    ballLevel?: string;
    level?: number;
    totalXp?: number;
    glowScore?: number;
    coachName?: string;
    parentName?: string;
    parentPhone?: string;
    medicalNotes?: string;
  };
  attendance: {
    totalSessions: number;
    attended: number;
    missed: number;
    rate: number;
    streak: number;
  };
  progress: {
    level: number;
    xp: number;
    xpToNextLevel: number;
    skills: {
      technical: number;
      tactical: number;
      physical: number;
      mental: number;
      social: number;
    };
    recentMilestones: string[];
  };
  payments: {
    totalOwed: number;
    totalPaid: number;
    lastPaymentDate?: string;
    status: "paid" | "partial" | "overdue";
    currency: string;
  };
}

const BALL_LEVELS = ["red", "orange", "green", "yellow"];

interface StatItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
}

function StatItem({ icon, label, value, color = Colors.dark.primary }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function SkillBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.skillRow}>
      <Text style={styles.skillLabel}>{label}</Text>
      <View style={styles.skillBarContainer}>
        <View style={[styles.skillBarFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.skillValue}>{value}</Text>
    </View>
  );
}

export default function AdminPlayersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    ballLevel: "green",
    parentName: "",
    parentPhone: "",
  });

  const { data: players = [], isLoading, error, refetch } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true"],
  });

  const { data: playerStats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery<PlayerStats>({
    queryKey: ["/api/admin/players", selectedPlayerId, "stats"],
    enabled: !!selectedPlayerId && showDetailModal,
  });

  const selectedPlayer = players.find(p => p.id === selectedPlayerId);

  const addPlayerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/players", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("DELETE", `/api/players/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setShowDeleteModal(false);
      closeDetailModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Failed to delete player: ${err.message}`);
      } else {
        Alert.alert("Error", `Failed to delete player: ${err.message}`);
      }
    },
  });

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", ballLevel: "green", parentName: "", parentPhone: "" });
    setEditingPlayer(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openDetailModal = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setShowDetailModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedPlayerId(null);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter player name");
      } else {
        Alert.alert("Error", "Please enter player name");
      }
      return;
    }
    addPlayerMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (!selectedPlayerId) return;
    setShowDeleteModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmDelete = () => {
    if (!selectedPlayerId) return;
    deletePlayerMutation.mutate(selectedPlayerId);
  };

  const getBallLevelColor = (level?: string) => {
    switch (level) {
      case "red": return "#EF4444";
      case "orange": return "#F97316";
      case "green": return "#22C55E";
      case "yellow": return "#EAB308";
      default: return Colors.dark.textMuted;
    }
  };

  const getPaymentStatusColor = (status?: string) => {
    switch (status) {
      case "paid": return Colors.dark.successNeon;
      case "partial": return Colors.dark.orange;
      case "overdue": return Colors.dark.error;
      default: return Colors.dark.textMuted;
    }
  };

  const filteredPlayers = players.filter((player) =>
    player.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    player.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCreditsColor = (remaining?: number, total?: number) => {
    if (!remaining || !total || total === 0) return Colors.dark.textMuted;
    const ratio = remaining / total;
    if (ratio <= 0.2) return Colors.dark.error;
    if (ratio <= 0.5) return Colors.dark.orange;
    return Colors.dark.successNeon;
  };

  const renderPlayer = ({ item }: { item: Player }) => (
    <Pressable
      style={[styles.playerCard, CardStyles.elevated]}
      onPress={() => openDetailModal(item.id)}
    >
      <View style={[styles.playerAvatar, { borderColor: getBallLevelColor(item.ballLevel) }]}>
        <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase() || "?"}</Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{item.name}</Text>
        <Text style={styles.playerEmail}>{item.email || "No email"}</Text>
        <View style={styles.playerMeta}>
          <View style={[styles.ballBadge, { backgroundColor: `${getBallLevelColor(item.ballLevel)}20` }]}>
            <View style={[styles.ballDot, { backgroundColor: getBallLevelColor(item.ballLevel) }]} />
            <Text style={[styles.ballText, { color: getBallLevelColor(item.ballLevel) }]}>
              {item.ballLevel || "N/A"}
            </Text>
          </View>
          {item.level ? (
            <Text style={styles.levelText}>Level {item.level}</Text>
          ) : null}
          {item.coachName ? (
            <Text style={styles.coachText}>{item.coachName}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.creditsContainer}>
        {item.totalCredits && item.totalCredits > 0 ? (
          <View style={[styles.creditsBadge, { backgroundColor: `${getCreditsColor(item.remainingCredits, item.totalCredits)}15` }]}>
            <Ionicons 
              name="ticket-outline" 
              size={14} 
              color={getCreditsColor(item.remainingCredits, item.totalCredits)} 
            />
            <Text style={[styles.creditsText, { color: getCreditsColor(item.remainingCredits, item.totalCredits) }]}>
              {item.remainingCredits || 0}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );

  const renderDetailModal = () => {
    const stats = playerStats;
    
    return (
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDetailModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeDetailModal}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Player Details</Text>
            <Pressable onPress={() => {
              if (stats?.player) {
                setEditingPlayer({
                  id: stats.player.id,
                  name: stats.player.name,
                  email: stats.player.email,
                  phone: stats.player.phone,
                  ballLevel: stats.player.ballLevel,
                });
                setFormData({
                  name: stats.player.name || "",
                  email: stats.player.email || "",
                  phone: stats.player.phone || "",
                  ballLevel: stats.player.ballLevel || "green",
                  parentName: stats.player.parentName || "",
                  parentPhone: stats.player.parentPhone || "",
                });
                closeDetailModal();
                setShowAddModal(true);
              }
            }}>
              <Ionicons name="pencil" size={20} color={Colors.dark.orange} />
            </Pressable>
          </View>

          {statsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.orange} />
              <Text style={styles.loadingText}>Loading player details...</Text>
            </View>
          ) : statsError ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
              <Text style={styles.errorText}>Failed to load player details</Text>
              <Pressable style={styles.retryButton} onPress={() => refetchStats()}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
              <Pressable 
                style={[styles.retryButton, { backgroundColor: Colors.dark.surface, marginTop: Spacing.sm }]} 
                onPress={() => setShowReportIssueModal(true)}
              >
                <Ionicons name="warning-outline" size={16} color={Colors.dark.text} style={{ marginRight: Spacing.xs }} />
                <Text style={[styles.retryButtonText, { color: Colors.dark.text }]}>Report Issue</Text>
              </Pressable>
            </View>
          ) : stats ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(stats.player.ballLevel) }]}>
                  <Text style={styles.profileAvatarText}>
                    {stats.player.name?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <Text style={styles.profileName}>{stats.player.name}</Text>
                <View style={[styles.ballBadgeLarge, { backgroundColor: `${getBallLevelColor(stats.player.ballLevel)}20` }]}>
                  <View style={[styles.ballDotLarge, { backgroundColor: getBallLevelColor(stats.player.ballLevel) }]} />
                  <Text style={[styles.ballTextLarge, { color: getBallLevelColor(stats.player.ballLevel) }]}>
                    {stats.player.ballLevel || "N/A"} Ball
                  </Text>
                </View>
                {stats.player.coachName ? (
                  <Text style={styles.coachAssignment}>Coach: {stats.player.coachName}</Text>
                ) : null}
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Attendance</Text>
                <View style={styles.statsGrid}>
                  <StatItem 
                    icon="checkmark-circle" 
                    label="Attended" 
                    value={stats.attendance.attended}
                    color={Colors.dark.successNeon}
                  />
                  <StatItem 
                    icon="close-circle" 
                    label="Missed" 
                    value={stats.attendance.missed}
                    color={Colors.dark.error}
                  />
                  <StatItem 
                    icon="trending-up" 
                    label="Rate" 
                    value={`${stats.attendance.rate}%`}
                    color={Colors.dark.orange}
                  />
                  <StatItem 
                    icon="flame" 
                    label="Streak" 
                    value={stats.attendance.streak}
                    color={Colors.dark.gold}
                  />
                </View>
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Progress</Text>
                <View style={styles.progressHeader}>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelNumber}>{stats.progress.level}</Text>
                    <Text style={styles.levelLabel}>Level</Text>
                  </View>
                  <View style={styles.xpInfo}>
                    <Text style={styles.xpText}>{stats.progress.xp} / {stats.progress.xpToNextLevel} XP</Text>
                    <View style={styles.xpBar}>
                      <View 
                        style={[
                          styles.xpFill, 
                          { width: `${(stats.progress.xp / stats.progress.xpToNextLevel) * 100}%` }
                        ]} 
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.skillsSection}>
                  <SkillBar label="Technical" value={stats.progress.skills.technical} color={Colors.dark.xpCyan} />
                  <SkillBar label="Tactical" value={stats.progress.skills.tactical} color={Colors.dark.primary} />
                  <SkillBar label="Physical" value={stats.progress.skills.physical} color={Colors.dark.orange} />
                  <SkillBar label="Mental" value={stats.progress.skills.mental} color={Colors.dark.gold} />
                  <SkillBar label="Social" value={stats.progress.skills.social} color={Colors.dark.successNeon} />
                </View>
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Payments</Text>
                <View style={styles.paymentSummary}>
                  <View style={[
                    styles.paymentStatusBadge, 
                    { backgroundColor: `${getPaymentStatusColor(stats.payments.status)}20` }
                  ]}>
                    <Text style={[styles.paymentStatusText, { color: getPaymentStatusColor(stats.payments.status) }]}>
                      {stats.payments.status?.toUpperCase() || "N/A"}
                    </Text>
                  </View>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Total Owed</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.error }]}>
                    {stats.payments.currency} {stats.payments.totalOwed}
                  </Text>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Total Paid</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.successNeon }]}>
                    {stats.payments.currency} {stats.payments.totalPaid}
                  </Text>
                </View>
                {stats.payments.lastPaymentDate ? (
                  <View style={styles.financeRow}>
                    <Text style={styles.financeLabel}>Last Payment</Text>
                    <Text style={styles.financeValue}>{stats.payments.lastPaymentDate}</Text>
                  </View>
                ) : null}
                <Pressable style={styles.recordPaymentButton}>
                  <Text style={styles.recordPaymentText}>Record Payment</Text>
                </Pressable>
              </View>

              {stats.player.parentName || stats.player.parentPhone ? (
                <View style={[styles.section, CardStyles.elevated]}>
                  <Text style={styles.sectionTitle}>Parent/Guardian</Text>
                  {stats.player.parentName ? (
                    <View style={styles.contactRow}>
                      <Ionicons name="person" size={18} color={Colors.dark.textMuted} />
                      <Text style={styles.contactText}>{stats.player.parentName}</Text>
                    </View>
                  ) : null}
                  {stats.player.parentPhone ? (
                    <View style={styles.contactRow}>
                      <Ionicons name="call" size={18} color={Colors.dark.textMuted} />
                      <Text style={styles.contactText}>{stats.player.parentPhone}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {stats.player.medicalNotes ? (
                <View style={[styles.section, CardStyles.elevated, styles.medicalSection]}>
                  <Text style={styles.sectionTitle}>Medical Notes</Text>
                  <Text style={styles.medicalText}>{stats.player.medicalNotes}</Text>
                </View>
              ) : null}

              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteText}>Delete Player</Text>
              </Pressable>
            </ScrollView>
          ) : selectedPlayer ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(selectedPlayer.ballLevel) }]}>
                  <Text style={styles.profileAvatarText}>
                    {selectedPlayer.name?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <Text style={styles.profileName}>{selectedPlayer.name}</Text>
                <View style={[styles.levelBadge, { backgroundColor: `${getBallLevelColor(selectedPlayer.ballLevel)}20` }]}>
                  <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(selectedPlayer.ballLevel) }]} />
                  <Text style={[styles.levelText, { color: getBallLevelColor(selectedPlayer.ballLevel) }]}>
                    {selectedPlayer.ballLevel || "Unknown"} Ball
                  </Text>
                </View>
                {selectedPlayer.email ? (
                  <Text style={styles.profileEmail}>{selectedPlayer.email}</Text>
                ) : null}
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Basic Info</Text>
                <View style={styles.contactRow}>
                  <Ionicons name="call" size={18} color={Colors.dark.textMuted} />
                  <Text style={styles.contactText}>{selectedPlayer.phone || "No phone"}</Text>
                </View>
              </View>

              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.dark.orange} />
                <Text style={styles.loadingText}>Loading full stats...</Text>
              </View>

              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteText}>Delete Player</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <View style={styles.loadingContainer}>
              <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.errorText}>No player selected</Text>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load players</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Manage Players</Text>
        <Pressable style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.dark.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search players..."
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filteredPlayers}
        keyExtractor={(item) => item.id}
        renderItem={renderPlayer}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>
              {searchQuery ? "No players found" : "No players yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? "Try a different search" : "Tap + to add your first player"}
            </Text>
          </View>
        }
      />

      {renderDetailModal()}

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingPlayer ? "Edit Player" : "Add Player"}
            </Text>
            <Pressable 
              onPress={handleSubmit}
              disabled={addPlayerMutation.isPending}
            >
              <Text style={[styles.saveButton, addPlayerMutation.isPending && styles.disabledButton]}>
                {addPlayerMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                placeholder="Player name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                placeholder="player@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
                placeholder="+971 50 123 4567"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Ball Level</Text>
              <View style={styles.ballLevelSelector}>
                {BALL_LEVELS.map((level) => (
                  <Pressable
                    key={level}
                    style={[
                      styles.ballLevelOption,
                      formData.ballLevel === level && styles.ballLevelSelected,
                      { borderColor: getBallLevelColor(level) },
                    ]}
                    onPress={() => {
                      setFormData((prev) => ({ ...prev, ballLevel: level }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <View style={[styles.ballLevelDot, { backgroundColor: getBallLevelColor(level) }]} />
                    <Text style={[styles.ballLevelText, { color: getBallLevelColor(level) }]}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formDivider}>
              <Text style={styles.formDividerText}>Parent/Guardian</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Parent Name</Text>
              <TextInput
                style={styles.input}
                value={formData.parentName}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, parentName: text }))}
                placeholder="Parent name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Parent Phone</Text>
              <TextInput
                style={styles.input}
                value={formData.parentPhone}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, parentPhone: text }))}
                placeholder="+971 50 123 4567"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable 
          style={styles.deleteModalOverlay} 
          onPress={() => setShowDeleteModal(false)}
        >
          <Pressable style={styles.deleteModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.deleteModalHeader}>
              <View style={styles.deleteModalIconContainer}>
                <Ionicons name="trash" size={32} color={Colors.dark.error} />
              </View>
              <Text style={styles.deleteModalTitle}>Delete Player</Text>
              <Text style={styles.deleteModalSubtitle}>
                {playerStats?.player?.name || selectedPlayer?.name || "Player"}
              </Text>
            </View>

            <Text style={styles.deleteOptionsLabel}>This will permanently delete:</Text>
            
            <ScrollView style={styles.deleteOptionsContainer}>
              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color="#000" />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Progress & XP Data</Text>
                  <Text style={styles.deleteOptionDesc}>Skills, levels, XP transactions, assessments</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color="#000" />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Feedback & Notes</Text>
                  <Text style={styles.deleteOptionDesc}>Session feedback, coach notes</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color="#000" />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Billing & Payments</Text>
                  <Text style={styles.deleteOptionDesc}>Invoices, payments, packages, subscriptions</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color="#000" />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Chat Messages</Text>
                  <Text style={styles.deleteOptionDesc}>Conversations and message history</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color="#000" />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Coach Reviews</Text>
                  <Text style={styles.deleteOptionDesc}>Reviews given by the player</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color="#000" />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Booking Requests</Text>
                  <Text style={styles.deleteOptionDesc}>Pending and past booking requests</Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.warningInfo}>
              <Ionicons name="warning" size={16} color={Colors.dark.warning} />
              <Text style={styles.warningText}>
                This action cannot be undone
              </Text>
            </View>

            <View style={styles.deleteModalActions}>
              <Pressable 
                style={styles.cancelDeleteBtn}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.cancelDeleteBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.confirmDeleteBtn, deletePlayerMutation.isPending && styles.btnDisabled]}
                onPress={confirmDelete}
                disabled={deletePlayerMutation.isPending}
              >
                {deletePlayerMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="trash" size={16} color="#FFF" />
                    <Text style={styles.confirmDeleteBtnText}>Delete Player</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ReportIssueModal
        visible={showReportIssueModal}
        onClose={() => setShowReportIssueModal(false)}
        currentScreen="AdminPlayersScreen - Player Details"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.body.fontSize,
    marginTop: Spacing.sm,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    paddingVertical: Spacing.md,
  },
  list: {
    padding: Spacing.lg,
    paddingTop: 0,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  playerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  playerEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  ballDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ballText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  levelText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
  },
  creditsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  creditsBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  creditsText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  cancelButton: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  saveButton: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  formScroll: {
    flex: 1,
  },
  form: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
  },
  formDivider: {
    marginVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.lg,
  },
  formDividerText: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
  },
  ballLevelSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ballLevelOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: Spacing.xs,
  },
  ballLevelSelected: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  ballLevelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ballLevelText: {
    ...Typography.small,
    fontWeight: "600",
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: Spacing.lg,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  profileAvatarText: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  profileName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  profileEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ballBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  ballDotLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ballTextLarge: {
    ...Typography.body,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  coachAssignment: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: "45%",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  levelBadge: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.gold}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  levelNumber: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  levelLabel: {
    ...Typography.caption,
    color: Colors.dark.gold,
  },
  xpInfo: {
    flex: 1,
  },
  xpText: {
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  xpBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    overflow: "hidden",
  },
  xpFill: {
    height: "100%",
    backgroundColor: Colors.dark.gold,
    borderRadius: 4,
  },
  skillsSection: {
    gap: Spacing.sm,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  skillLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 70,
  },
  skillBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  skillBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  skillValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    width: 30,
    textAlign: "right",
  },
  paymentSummary: {
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  paymentStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  paymentStatusText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  financeLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  financeValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  recordPaymentButton: {
    backgroundColor: Colors.dark.orange,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  recordPaymentText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  contactText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  medicalSection: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.error,
  },
  medicalText: {
    ...Typography.body,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.lg,
  },
  deleteText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  deleteModalContent: {
    ...CardStyles.card,
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    padding: Spacing.xl,
  },
  deleteModalHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  deleteModalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.dark.error}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  deleteModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  deleteModalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  deleteOptionsLabel: {
    ...Typography.bodySmall,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  deleteOptionsContainer: {
    maxHeight: 280,
  },
  deleteOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
  deleteOptionContent: {
    flex: 1,
  },
  deleteOptionLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  deleteOptionDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  warningInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.warning}15`,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  warningText: {
    ...Typography.caption,
    color: Colors.dark.warning,
    flex: 1,
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelDeleteBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  cancelDeleteBtnText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  confirmDeleteBtn: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteBtnText: {
    ...Typography.body,
    color: "#FFF",
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
