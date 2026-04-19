import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { SPORTS, getSportConfig, getSportDisplayName } from "@shared/sportConfig";
import { SportBadge, SportSingleSelector } from "@/components/SportBadge";

interface Court {
  id: string;
  name: string;
  surface?: string;
  capacity?: number;
  indoor?: boolean;
  status?: string;
  sport?: string;
}

export default function CourtsManagementScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  
  const [showModal, setShowModal] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    surface: "hard",
    capacity: "4",
    indoor: false,
    sport: "tennis",
  });

  const { data: courts = [], isLoading } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Court>) => {
      return apiRequest("/api/courts", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      setShowModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Court> }) => {
      return apiRequest(`/api/courts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      setShowModal(false);
      setEditingCourt(null);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  type DeleteCourtResponse = {
    success: boolean;
    archived?: boolean;
    dependents?: Record<string, number>;
    totalReferences?: number;
    message?: string;
  };

  const deleteMutation = useMutation<DeleteCourtResponse, Error, string>({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/courts/${id}`);
      try {
        return (await res.json()) as DeleteCourtResponse;
      } catch {
        return { success: true };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/courts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data?.archived) {
        const msg =
          data?.message ||
          "Court has past sessions or bookings, so it was archived instead of deleted.";
        if (Platform.OS === "web") window.alert(msg);
        else Alert.alert("Court archived", msg);
      }
    },
    onError: (error) => {
      const msg = error?.message || "Failed to delete court";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  const resetForm = () => {
    setFormData({ name: "", surface: "hard", capacity: "4", indoor: false, sport: "tennis" });
  };

  const handleAdd = () => {
    setEditingCourt(null);
    resetForm();
    setShowModal(true);
  };

  const handleEdit = (court: Court) => {
    setEditingCourt(court);
    setFormData({
      name: court.name,
      surface: court.surface || "hard",
      capacity: String(court.capacity || 4),
      indoor: court.indoor || false,
      sport: court.sport || "tennis",
    });
    setShowModal(true);
  };

  const handleDelete = async (court: Court) => {
    const doDelete = () => deleteMutation.mutate(court.id);

    let willArchive = false;
    let totalRefs = 0;
    try {
      const res = await apiRequest("GET", `/api/courts/${court.id}/delete-preview`);
      const preview = (await res.json()) as { willArchive?: boolean; totalReferences?: number };
      willArchive = !!preview?.willArchive;
      totalRefs = Number(preview?.totalReferences ?? 0);
    } catch {
      // Preview is best-effort; fall back to a generic confirm
    }

    const title = willArchive ? "Archive Court" : "Delete Court";
    const body = willArchive
      ? `${court.name} is used by ${totalRefs} record${totalRefs === 1 ? "" : "s"} (sessions, bookings or schedules). It will be archived and hidden from active lists, but kept for history. Continue?`
      : `Delete ${court.name}? This action cannot be undone.`;
    const action = willArchive ? "Archive" : "Delete";

    if (Platform.OS === "web") {
      if (window.confirm(body)) doDelete();
    } else {
      Alert.alert(
        title,
        body,
        [
          { text: "Cancel", style: "cancel" },
          { text: action, style: "destructive", onPress: doDelete },
        ]
      );
    }
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter a court name");
      } else {
        Alert.alert("Error", "Please enter a court name");
      }
      return;
    }

    const data = {
      name: formData.name.trim(),
      surface: formData.surface,
      capacity: parseInt(formData.capacity) || 4,
      indoor: formData.indoor,
      sport: formData.sport || "tennis",
    };

    if (editingCourt) {
      updateMutation.mutate({ id: editingCourt.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const surfaces = ["hard", "clay", "grass", "carpet", "synthetic"];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Courts</Text>
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Ionicons name="add" size={24} color={Colors.dark.gold} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {courts.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="location-outline" size={48} color={Colors.dark.textMuted} />
            </View>
            <Text style={styles.emptyText}>No courts yet</Text>
            <Text style={styles.emptySubtext}>Add your first court to get started</Text>
            <Pressable style={styles.emptyButton} onPress={handleAdd}>
              <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.emptyButtonText}>Add Court</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {courts.map((court) => (
              <View key={court.id} style={[styles.courtCard, CardStyles.elevated]}>
                <View style={styles.courtHeader}>
                  <View style={styles.courtIcon}>
                    <Ionicons 
                      name={court.indoor ? "home" : "sunny"} 
                      size={24} 
                      color={Colors.dark.gold} 
                    />
                  </View>
                  <View style={styles.courtInfo}>
                    <Text style={styles.courtName}>{court.name}</Text>
                    <Text style={styles.courtSurface}>
                      {court.surface ? court.surface.charAt(0).toUpperCase() + court.surface.slice(1) : "Hard"} court
                    </Text>
                  </View>
                  <View style={styles.courtActions}>
                    <Pressable style={styles.iconButton} onPress={() => handleEdit(court)}>
                      <Ionicons name="pencil" size={18} color={Colors.dark.gold} />
                    </Pressable>
                    <Pressable style={styles.iconButton} onPress={() => handleDelete(court)}>
                      <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.courtStats}>
                  <View style={styles.courtStat}>
                    <Ionicons name="people-outline" size={16} color={Colors.dark.textMuted} />
                    <Text style={styles.courtStatText}>Capacity: {court.capacity || 4}</Text>
                  </View>
                  <View style={styles.courtStat}>
                    <Ionicons name={court.indoor ? "home-outline" : "sunny-outline"} size={16} color={Colors.dark.textMuted} />
                    <Text style={styles.courtStatText}>{court.indoor ? "Indoor" : "Outdoor"}</Text>
                  </View>
                  <SportBadge sport={court.sport || "tennis"} size="sm" />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowModal(false)} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCourt ? "Edit Court" : "Add Court"}
              </Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Court Name</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="e.g., Court 1, Main Court"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Surface Type</Text>
              <View style={styles.surfaceOptions}>
                {surfaces.map((surface) => (
                  <Pressable
                    key={surface}
                    style={[
                      styles.surfaceOption,
                      formData.surface === surface && styles.surfaceOptionActive,
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, surface }))}
                  >
                    <Text style={[
                      styles.surfaceOptionText,
                      formData.surface === surface && styles.surfaceOptionTextActive,
                    ]}>
                      {surface.charAt(0).toUpperCase() + surface.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Capacity (players)</Text>
              <TextInput
                style={styles.input}
                value={formData.capacity}
                onChangeText={(text) => setFormData(prev => ({ ...prev, capacity: text }))}
                placeholder="4"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Pressable
                style={styles.toggleRow}
                onPress={() => setFormData(prev => ({ ...prev, indoor: !prev.indoor }))}
              >
                <Text style={styles.label}>Indoor Court</Text>
                <View style={[styles.toggle, formData.indoor && styles.toggleActive]}>
                  <View style={[styles.toggleKnob, formData.indoor && styles.toggleKnobActive]} />
                </View>
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <SportSingleSelector
                selectedSport={formData.sport}
                onSelect={(sport) => setFormData(prev => ({ ...prev, sport }))}
                label="Sport"
                includeMulti
              />
            </View>

            <Pressable
              style={[styles.saveButton, (createMutation.isPending || updateMutation.isPending) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.saveButtonText}>
                  {editingCourt ? "Update Court" : "Add Court"}
                </Text>
              )}
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  addButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyText: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  emptySubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  emptyButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  list: {
    gap: Spacing.md,
  },
  courtCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  courtHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  courtIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.gold}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  courtInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  courtName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  courtSurface: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  courtActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  courtStats: {
    flexDirection: "row",
    gap: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  courtStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  courtStatText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  surfaceOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  surfaceOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  surfaceOptionActive: {
    backgroundColor: Colors.dark.gold,
  },
  surfaceOptionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  surfaceOptionTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: Colors.dark.gold,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.textMuted,
  },
  toggleKnobActive: {
    backgroundColor: Colors.dark.backgroundRoot,
    marginLeft: "auto",
  },
  saveButton: {
    backgroundColor: Colors.dark.gold,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
