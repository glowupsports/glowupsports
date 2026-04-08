import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface PlayerSubscription {
  id: string;
  playerId: string;
  playerName: string;
  planName: string;
  price: string;
  currency: string;
  billingPeriod: string;
  sessionsPerPeriod: number | null;
  status: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

interface Player {
  id: string;
  name: string;
}

export default function AdminSubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<PlayerSubscription | null>(null);
  const [formData, setFormData] = useState({
    playerId: "",
    planName: "",
    price: "",
    currency: "AED",
    billingPeriod: "monthly",
    sessionsPerPeriod: "",
    startDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const { data: subscriptions = [], isLoading } = useQuery<PlayerSubscription[]>({
    queryKey: ["/api/admin/player-subscriptions"],
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const invalidateSubscriptions = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && (
          key.includes("player-subscriptions") ||
          key.includes("owner/finance")
        );
      },
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/player-subscriptions", data),
    onSuccess: () => {
      invalidateSubscriptions();
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to create subscription");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PUT", `/api/admin/player-subscriptions/${id}`, data),
    onSuccess: () => {
      invalidateSubscriptions();
      setShowEditModal(false);
      setSelectedSubscription(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to update subscription");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/player-subscriptions/${id}`),
    onSuccess: () => {
      invalidateSubscriptions();
      setShowEditModal(false);
      setSelectedSubscription(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to delete subscription");
    },
  });

  const resetForm = () => {
    setFormData({
      playerId: "",
      planName: "",
      price: "",
      currency: "AED",
      billingPeriod: "monthly",
      sessionsPerPeriod: "",
      startDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
  };

  const handleCreate = () => {
    if (!formData.playerId || !formData.planName || !formData.price) {
      Alert.alert("Error", "Player, plan name, and price are required");
      return;
    }
    createMutation.mutate({
      playerId: formData.playerId,
      planName: formData.planName,
      price: parseFloat(formData.price),
      currency: formData.currency,
      billingPeriod: formData.billingPeriod,
      sessionsPerPeriod: formData.sessionsPerPeriod ? parseInt(formData.sessionsPerPeriod) : null,
      startDate: formData.startDate,
      notes: formData.notes || null,
    });
  };

  const handleUpdate = () => {
    if (!selectedSubscription || !formData.planName || !formData.price) {
      Alert.alert("Error", "Plan name and price are required");
      return;
    }
    updateMutation.mutate({
      id: selectedSubscription.id,
      data: {
        planName: formData.planName,
        price: parseFloat(formData.price),
        currency: formData.currency,
        billingPeriod: formData.billingPeriod,
        sessionsPerPeriod: formData.sessionsPerPeriod ? parseInt(formData.sessionsPerPeriod) : null,
        status: selectedSubscription.status,
        startDate: formData.startDate,
        notes: formData.notes || null,
      },
    });
  };

  const handleDelete = (sub: PlayerSubscription) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Cancel subscription for ${sub.playerName}? This action cannot be undone.`)) {
        deleteMutation.mutate(sub.id);
      }
    } else {
      Alert.alert(
        "Cancel Subscription",
        `Cancel subscription for ${sub.playerName}? This action cannot be undone.`,
        [
          { text: "No", style: "cancel" },
          { text: "Yes, Cancel", style: "destructive", onPress: () => deleteMutation.mutate(sub.id) },
        ]
      );
    }
  };

  const handlePause = (sub: PlayerSubscription) => {
    const newStatus = sub.status === "paused" ? "active" : "paused";
    updateMutation.mutate({
      id: sub.id,
      data: { status: newStatus },
    });
  };

  const openEditModal = (sub: PlayerSubscription) => {
    setSelectedSubscription(sub);
    setFormData({
      playerId: sub.playerId,
      planName: sub.planName,
      price: sub.price,
      currency: sub.currency,
      billingPeriod: sub.billingPeriod,
      sessionsPerPeriod: sub.sessionsPerPeriod?.toString() || "",
      startDate: sub.startDate,
      notes: sub.notes || "",
    });
    setShowEditModal(true);
  };

  const activeSubscriptions = subscriptions.filter(s => s.status === "active");
  const pausedSubscriptions = subscriptions.filter(s => s.status === "paused");
  const cancelledSubscriptions = subscriptions.filter(s => s.status === "cancelled");

  const totalMonthlyRevenue = activeSubscriptions.reduce((sum, sub) => {
    const price = parseFloat(sub.price);
    return sum + (sub.billingPeriod === "weekly" ? price * 4 : price);
  }, 0);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading subscriptions...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Player Subscriptions</Text>
          <Text style={styles.subtitle}>Manage billing contracts for players</Text>
        </View>

        <View style={[styles.summaryCard, CardStyles.elevated]}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{activeSubscriptions.length}</Text>
            <Text style={styles.summaryLabel}>Active</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: Colors.dark.gold }]}>
              {totalMonthlyRevenue.toLocaleString()} AED
            </Text>
            <Text style={styles.summaryLabel}>Est. Monthly</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{pausedSubscriptions.length}</Text>
            <Text style={styles.summaryLabel}>Paused</Text>
          </View>
        </View>

        <Pressable
          style={[styles.addButton, CardStyles.elevated]}
          onPress={() => {
            resetForm();
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add-circle" size={24} color={Colors.dark.gold} />
          <Text style={styles.addButtonText}>Create New Subscription</Text>
        </Pressable>

        {activeSubscriptions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Subscriptions ({activeSubscriptions.length})</Text>
            {activeSubscriptions.map((sub) => (
              <Pressable
                key={sub.id}
                style={[styles.subscriptionCard, CardStyles.elevated]}
                onPress={() => openEditModal(sub)}
              >
                <View style={styles.subscriptionHeader}>
                  <View style={styles.subscriptionInfo}>
                    <Text style={styles.playerName}>{sub.playerName}</Text>
                    <Text style={styles.planName}>{sub.planName}</Text>
                  </View>
                  <View style={styles.subscriptionPrice}>
                    <Text style={styles.priceAmount}>
                      {parseFloat(sub.price).toLocaleString()} {sub.currency}
                    </Text>
                    <Text style={styles.pricePeriod}>/{sub.billingPeriod}</Text>
                  </View>
                </View>
                <View style={styles.subscriptionFooter}>
                  <View style={[styles.statusBadge, { backgroundColor: `${Colors.dark.primary}20` }]}>
                    <Text style={[styles.statusText, { color: Colors.dark.primary }]}>Active</Text>
                  </View>
                  <Text style={styles.startDate}>Since {new Date(sub.startDate).toLocaleDateString()}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {pausedSubscriptions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paused Subscriptions ({pausedSubscriptions.length})</Text>
            {pausedSubscriptions.map((sub) => (
              <Pressable
                key={sub.id}
                style={[styles.subscriptionCard, CardStyles.elevated, { opacity: 0.7 }]}
                onPress={() => openEditModal(sub)}
              >
                <View style={styles.subscriptionHeader}>
                  <View style={styles.subscriptionInfo}>
                    <Text style={styles.playerName}>{sub.playerName}</Text>
                    <Text style={styles.planName}>{sub.planName}</Text>
                  </View>
                  <View style={styles.subscriptionPrice}>
                    <Text style={styles.priceAmount}>
                      {parseFloat(sub.price).toLocaleString()} {sub.currency}
                    </Text>
                    <Text style={styles.pricePeriod}>/{sub.billingPeriod}</Text>
                  </View>
                </View>
                <View style={styles.subscriptionFooter}>
                  <View style={[styles.statusBadge, { backgroundColor: `${Colors.dark.orange}20` }]}>
                    <Text style={[styles.statusText, { color: Colors.dark.orange }]}>Paused</Text>
                  </View>
                  <Pressable
                    style={styles.resumeButton}
                    onPress={() => handlePause(sub)}
                  >
                    <Text style={styles.resumeButtonText}>Resume</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {subscriptions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No Subscriptions Yet</Text>
            <Text style={styles.emptySubtitle}>
              Create subscription contracts to track expected player payments
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Subscription</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Player *</Text>
              <View style={styles.pickerContainer}>
                {players.map((player) => (
                  <Pressable
                    key={player.id}
                    style={[
                      styles.playerOption,
                      formData.playerId === player.id && styles.playerOptionSelected,
                    ]}
                    onPress={() => setFormData({ ...formData, playerId: player.id })}
                  >
                    <Text
                      style={[
                        styles.playerOptionText,
                        formData.playerId === player.id && styles.playerOptionTextSelected,
                      ]}
                    >
                      {player.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Plan Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.planName}
                onChangeText={(text) => setFormData({ ...formData, planName: text })}
                placeholder="e.g., Weekly Training, Monthly Unlimited"
                placeholderTextColor={Colors.dark.textMuted}
              />

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Price *</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.price}
                    onChangeText={(text) => setFormData({ ...formData, price: text })}
                    placeholder="500"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Currency</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.currency}
                    onChangeText={(text) => setFormData({ ...formData, currency: text })}
                    placeholder="AED"
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Billing Period</Text>
              <View style={styles.periodSelector}>
                <Pressable
                  style={[
                    styles.periodOption,
                    formData.billingPeriod === "weekly" && styles.periodOptionSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, billingPeriod: "weekly" })}
                >
                  <Text
                    style={[
                      styles.periodOptionText,
                      formData.billingPeriod === "weekly" && styles.periodOptionTextSelected,
                    ]}
                  >
                    Weekly
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.periodOption,
                    formData.billingPeriod === "monthly" && styles.periodOptionSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, billingPeriod: "monthly" })}
                >
                  <Text
                    style={[
                      styles.periodOptionText,
                      formData.billingPeriod === "monthly" && styles.periodOptionTextSelected,
                    ]}
                  >
                    Monthly
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Sessions Per Period (optional)</Text>
              <TextInput
                style={styles.input}
                value={formData.sessionsPerPeriod}
                onChangeText={(text) => setFormData({ ...formData, sessionsPerPeriod: text })}
                placeholder="e.g., 4"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Start Date</Text>
              <TextInput
                style={styles.input}
                value={formData.startDate}
                onChangeText={(text) => setFormData({ ...formData, startDate: text })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.dark.textMuted}
              />

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="Additional notes..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitButton, createMutation.isPending && styles.buttonDisabled]}
                onPress={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.submitButtonText}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Subscription</Text>
              <Pressable onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.playerDisplay}>
                <Ionicons name="person" size={20} color={Colors.dark.gold} />
                <Text style={styles.playerDisplayName}>{selectedSubscription?.playerName}</Text>
              </View>

              <Text style={styles.inputLabel}>Plan Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.planName}
                onChangeText={(text) => setFormData({ ...formData, planName: text })}
                placeholder="e.g., Weekly Training"
                placeholderTextColor={Colors.dark.textMuted}
              />

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Price *</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.price}
                    onChangeText={(text) => setFormData({ ...formData, price: text })}
                    placeholder="500"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Currency</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.currency}
                    onChangeText={(text) => setFormData({ ...formData, currency: text })}
                    placeholder="AED"
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Billing Period</Text>
              <View style={styles.periodSelector}>
                <Pressable
                  style={[
                    styles.periodOption,
                    formData.billingPeriod === "weekly" && styles.periodOptionSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, billingPeriod: "weekly" })}
                >
                  <Text
                    style={[
                      styles.periodOptionText,
                      formData.billingPeriod === "weekly" && styles.periodOptionTextSelected,
                    ]}
                  >
                    Weekly
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.periodOption,
                    formData.billingPeriod === "monthly" && styles.periodOptionSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, billingPeriod: "monthly" })}
                >
                  <Text
                    style={[
                      styles.periodOptionText,
                      formData.billingPeriod === "monthly" && styles.periodOptionTextSelected,
                    ]}
                  >
                    Monthly
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="Additional notes..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.deleteButton}
                onPress={() => selectedSubscription && handleDelete(selectedSubscription)}
              >
                <Ionicons name="trash-outline" size={20} color={Colors.dark.error} />
              </Pressable>
              <Pressable
                style={styles.pauseButton}
                onPress={() => selectedSubscription && handlePause(selectedSubscription)}
              >
                <Ionicons
                  name={selectedSubscription?.status === "paused" ? "play" : "pause"}
                  size={20}
                  color={Colors.dark.orange}
                />
              </Pressable>
              <Pressable
                style={[styles.submitButton, updateMutation.isPending && styles.buttonDisabled]}
                onPress={handleUpdate}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.submitButtonText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
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
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  summaryCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  summaryValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  summaryLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold,
    borderStyle: "dashed",
    marginBottom: Spacing.xl,
  },
  addButtonText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  subscriptionCard: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  subscriptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  subscriptionInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: 2,
  },
  planName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  subscriptionPrice: {
    alignItems: "flex-end",
  },
  priceAmount: {
    ...Typography.h3,
    color: Colors.dark.gold,
  },
  pricePeriod: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  subscriptionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.small,
    fontWeight: "600",
  },
  startDate: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  resumeButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: `${Colors.dark.primary}20`,
    borderRadius: BorderRadius.sm,
  },
  resumeButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  modalForm: {
    padding: Spacing.lg,
    maxHeight: 400,
  },
  inputLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  inputRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  inputHalf: {
    flex: 1,
  },
  pickerContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  playerOption: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
  },
  playerOptionSelected: {
    backgroundColor: Colors.dark.gold,
  },
  playerOptionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  playerOptionTextSelected: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  periodSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  periodOption: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  periodOptionSelected: {
    backgroundColor: Colors.dark.gold,
  },
  periodOptionText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  periodOptionTextSelected: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  playerDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  playerDisplayName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  deleteButton: {
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.error}20`,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseButton: {
    padding: Spacing.md,
    backgroundColor: `${Colors.dark.orange}20`,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButton: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  submitButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
