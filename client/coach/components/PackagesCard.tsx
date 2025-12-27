import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Card } from "@/components/Card";

interface Package {
  id: string;
  playerId: string;
  totalCredits: number;
  remainingCredits: number;
  expiryDate: string | null;
}

interface PackagesCardProps {
  playerId: string;
  playerName: string;
}

export default function PackagesCard({ playerId, playerName }: PackagesCardProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalCredits, setTotalCredits] = useState("10");
  const [expiryMonths, setExpiryMonths] = useState("12");

  const { data: packages = [], isLoading } = useQuery<Package[]>({
    queryKey: [`/api/players/${playerId}/packages`],
    queryFn: async () => {
      const url = new URL(`/api/players/${playerId}/packages`, getApiUrl());
      const res = await fetch(url.href);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const activePackages = packages.filter(
    (p) => p.remainingCredits > 0 && (!p.expiryDate || new Date(p.expiryDate) >= new Date())
  );

  const totalRemaining = activePackages.reduce((sum, p) => sum + p.remainingCredits, 0);

  const createMutation = useMutation({
    mutationFn: async (data: { playerId: string; totalCredits: number; expiryDate: string | null }) => {
      const response = await apiRequest("POST", "/api/packages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      setShowAddModal(false);
      setTotalCredits("10");
      setExpiryMonths("12");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add package");
    },
  });

  const useCreditMutation = useMutation({
    mutationFn: async (packageId: string) => {
      const response = await apiRequest("POST", `/api/packages/${packageId}/use`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to use credit");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (packageId: string) => {
      return apiRequest("DELETE", `/api/packages/${packageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to delete package");
    },
  });

  const handleAddPackage = () => {
    const credits = parseInt(totalCredits, 10);
    if (isNaN(credits) || credits <= 0) {
      Alert.alert("Error", "Please enter a valid number of credits");
      return;
    }

    let expiryDate: string | null = null;
    const months = parseInt(expiryMonths, 10);
    if (!isNaN(months) && months > 0) {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + months);
      expiryDate = expiry.toISOString().split("T")[0];
    }

    createMutation.mutate({ playerId, totalCredits: credits, expiryDate });
  };

  const handleDeletePackage = (pkg: Package) => {
    Alert.alert(
      "Delete Package",
      `Delete this package with ${pkg.remainingCredits}/${pkg.totalCredits} credits remaining?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(pkg.id) },
      ]
    );
  };

  const formatExpiryDate = (date: string | null) => {
    if (!date) return "No expiry";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="ticket-outline" size={20} color={Colors.dark.gold} />
          <Text style={styles.title}>Packages</Text>
        </View>
        <Pressable onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={20} color={Colors.dark.primary} />
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalRemaining}</Text>
          <Text style={styles.summaryLabel}>Credits Available</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activePackages.length}</Text>
          <Text style={styles.summaryLabel}>Active Packages</Text>
        </View>
      </View>

      {activePackages.length === 0 && !isLoading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No active packages</Text>
          <Pressable onPress={() => setShowAddModal(true)} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Add Package</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.packagesList}>
          {packages.map((pkg) => (
            <View
              key={pkg.id}
              style={[
                styles.packageItem,
                pkg.remainingCredits === 0 && styles.packageItemDepleted,
                isExpired(pkg.expiryDate) && styles.packageItemExpired,
              ]}
            >
              <View style={styles.packageInfo}>
                <View style={styles.creditsRow}>
                  <Text style={styles.creditsText}>
                    {pkg.remainingCredits}/{pkg.totalCredits}
                  </Text>
                  <View
                    style={[
                      styles.creditBar,
                      { width: `${(pkg.remainingCredits / pkg.totalCredits) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.expiryText}>{formatExpiryDate(pkg.expiryDate)}</Text>
              </View>
              <View style={styles.packageActions}>
                {pkg.remainingCredits > 0 && !isExpired(pkg.expiryDate) ? (
                  <Pressable
                    onPress={() => useCreditMutation.mutate(pkg.id)}
                    style={styles.useButton}
                    disabled={useCreditMutation.isPending}
                  >
                    <Text style={styles.useButtonText}>Use</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => handleDeletePackage(pkg)} style={styles.deleteButton}>
                  <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal visible={showAddModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Package for {playerName}</Text>

            <Text style={styles.inputLabel}>Number of Credits</Text>
            <TextInput
              style={styles.input}
              value={totalCredits}
              onChangeText={setTotalCredits}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={Colors.dark.tabIconDefault}
            />

            <Text style={styles.inputLabel}>Validity (months)</Text>
            <TextInput
              style={styles.input}
              value={expiryMonths}
              onChangeText={setExpiryMonths}
              keyboardType="number-pad"
              placeholder="12"
              placeholderTextColor={Colors.dark.tabIconDefault}
            />

            <View style={styles.modalButtons}>
              <Pressable onPress={() => setShowAddModal(false)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddPackage}
                disabled={createMutation.isPending}
                style={styles.confirmButton}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.primary]}
                  style={styles.confirmGradient}
                >
                  <Text style={styles.confirmButtonText}>
                    {createMutation.isPending ? "Adding..." : "Add Package"}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  addButton: {
    padding: Spacing.xs,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.sm,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
  },
  summaryValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    padding: Spacing.lg,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  emptyButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.sm,
  },
  emptyButtonText: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  packagesList: {
    gap: Spacing.sm,
  },
  packageItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.gold,
  },
  packageItemDepleted: {
    opacity: 0.5,
    borderLeftColor: Colors.dark.disabled,
  },
  packageItemExpired: {
    opacity: 0.5,
    borderLeftColor: Colors.dark.error,
  },
  packageInfo: {
    flex: 1,
  },
  creditsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  creditsText: {
    ...Typography.h4,
    color: Colors.dark.text,
    minWidth: 50,
  },
  creditBar: {
    height: 4,
    backgroundColor: Colors.dark.gold,
    borderRadius: 2,
  },
  expiryText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  packageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  useButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.sm,
  },
  useButtonText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  inputLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  cancelButtonText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  confirmButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  confirmGradient: {
    padding: Spacing.md,
    alignItems: "center",
  },
  confirmButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
