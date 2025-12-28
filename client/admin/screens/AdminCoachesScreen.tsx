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

interface Coach {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
  status?: string;
}

export default function AdminCoachesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    specialty: "",
  });

  const { data: coaches = [], isLoading, error, refetch } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const addCoachMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/coaches", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coaches"] });
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

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", specialty: "" });
    setEditingCoach(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter coach name");
      } else {
        Alert.alert("Error", "Please enter coach name");
      }
      return;
    }
    addCoachMutation.mutate(formData);
  };

  const renderCoach = ({ item }: { item: Coach }) => (
    <Pressable
      style={[styles.coachCard, CardStyles.elevated]}
      onPress={() => {
        setEditingCoach(item);
        setFormData({
          name: item.name || "",
          email: item.email || "",
          phone: item.phone || "",
          specialty: item.specialty || "",
        });
        setShowAddModal(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      <View style={styles.coachAvatar}>
        <Ionicons name="person" size={24} color={Colors.dark.primary} />
      </View>
      <View style={styles.coachInfo}>
        <Text style={styles.coachName}>{item.name}</Text>
        <Text style={styles.coachEmail}>{item.email || "No email"}</Text>
        {item.specialty ? (
          <Text style={styles.coachSpecialty}>{item.specialty}</Text>
        ) : null}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: `${Colors.dark.successNeon}20` }]}>
        <Text style={[styles.statusText, { color: Colors.dark.successNeon }]}>
          {item.status || "Active"}
        </Text>
      </View>
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
        <Text style={styles.errorText}>Failed to load coaches</Text>
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
        <Text style={styles.title}>Manage Coaches</Text>
        <Pressable style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <FlatList
        data={coaches}
        keyExtractor={(item) => item.id}
        renderItem={renderCoach}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No coaches yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first coach</Text>
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
              {editingCoach ? "Edit Coach" : "Add Coach"}
            </Text>
            <Pressable 
              onPress={handleSubmit}
              disabled={addCoachMutation.isPending}
            >
              <Text style={[styles.saveButton, addCoachMutation.isPending && styles.disabledButton]}>
                {addCoachMutation.isPending ? "Saving..." : "Save"}
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
                placeholder="Coach name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                placeholder="coach@example.com"
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
              <Text style={styles.label}>Specialty</Text>
              <TextInput
                style={styles.input}
                value={formData.specialty}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, specialty: text }))}
                placeholder="e.g., Junior Training, Advanced"
                placeholderTextColor={Colors.dark.textMuted}
              />
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
  coachCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  coachInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  coachSpecialty: {
    ...Typography.caption,
    color: Colors.dark.orange,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
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
});
