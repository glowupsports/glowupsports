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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface Player {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  ballLevel?: string;
  level?: number;
  totalXp?: number;
}

const BALL_LEVELS = ["red", "orange", "green", "yellow"];

export default function AdminPlayersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    ballLevel: "green",
  });

  const { data: players = [], isLoading, error, refetch } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", ballLevel: "green" });
    setEditingPlayer(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const handleDelete = (player: Player) => {
    const confirmDelete = () => {
      deletePlayerMutation.mutate(player.id);
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${player.name}?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Delete Player",
        `Are you sure you want to delete ${player.name}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
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

  const renderPlayer = ({ item }: { item: Player }) => (
    <Pressable
      style={[styles.playerCard, CardStyles.elevated]}
      onPress={() => {
        setEditingPlayer(item);
        setFormData({
          name: item.name || "",
          email: item.email || "",
          phone: item.phone || "",
          ballLevel: item.ballLevel || "green",
        });
        setShowAddModal(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onLongPress={() => handleDelete(item)}
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
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
    </Pressable>
  );

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

      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        renderItem={renderPlayer}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No players yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first player</Text>
          </View>
        }
      />

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
                placeholder="+1 234 567 8900"
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
          </KeyboardAwareScrollViewCompat>
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
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
  list: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
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
    backgroundColor: `${Colors.dark.backgroundSecondary}`,
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
});
