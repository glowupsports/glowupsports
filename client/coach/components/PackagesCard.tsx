import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { Card } from "@/components/Card";

type CreditType = "group" | "private" | "semi_private";

interface Package {
  id: string;
  playerId: string;
  creditType?: CreditType;
  totalCredits: number;
  remainingCredits: number;
  price?: string;
  pricePerCredit?: string;
  currency?: string;
  purchaseDate?: string;
  expiryDate: string | null;
}

interface AcademyPricing {
  id: string;
  sessionType: string;
  pricePerSession: string;
  currency: string;
}

interface PackagesCardProps {
  playerId: string;
  playerName: string;
}

const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  group: "Group",
  private: "Private",
  semi_private: "Semi-Private",
};

export default function PackagesCard({ playerId, playerName }: PackagesCardProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [totalCredits, setTotalCredits] = useState("10");
  const [expiryMonths, setExpiryMonths] = useState("12");
  const [creditType, setCreditType] = useState<CreditType>("group");
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { data: packages = [], isLoading } = useQuery<Package[]>({
    queryKey: [`/api/players/${playerId}/packages`],
  });

  const { data: pricing = [] } = useQuery<AcademyPricing[]>({
    queryKey: ["/api/owner/academy/pricing"],
  });

  const pricePerCredit = useMemo(() => {
    const found = pricing.find((p) => p.sessionType === creditType);
    return found ? Number(found.pricePerSession) : 0;
  }, [pricing, creditType]);

  const currency = useMemo(() => {
    const found = pricing.find((p) => p.sessionType === creditType);
    return found?.currency || "AED";
  }, [pricing, creditType]);

  const calculatedTotal = useMemo(() => {
    const credits = parseInt(totalCredits, 10);
    if (isNaN(credits) || credits <= 0) return 0;
    return pricePerCredit * credits;
  }, [totalCredits, pricePerCredit]);

  const activePackages = packages.filter(
    (p) => p.remainingCredits > 0 && (!p.expiryDate || new Date(p.expiryDate) >= new Date())
  );

  const totalRemaining = activePackages.reduce((sum, p) => sum + p.remainingCredits, 0);

  const creditsByType = useMemo(() => {
    const byType: Record<CreditType, number> = { group: 0, private: 0, semi_private: 0 };
    activePackages.forEach((p) => {
      const type = (p.creditType || "group") as CreditType;
      byType[type] += p.remainingCredits;
    });
    return byType;
  }, [activePackages]);

  const createMutation = useMutation({
    mutationFn: async (data: { 
      playerId: string; 
      totalCredits: number; 
      creditType: CreditType;
      purchasedAt: string;
      expiryMonths: number;
    }) => {
      const response = await apiRequest("POST", "/api/packages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      setShowAddModal(false);
      setTotalCredits("10");
      setExpiryMonths("12");
      setCreditType("group");
      setPurchaseDate(new Date());
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
    mutationFn: async ({ packageId, force }: { packageId: string; force?: boolean }): Promise<{ success: boolean; error?: string; creditsUsed?: number }> => {
      const url = force ? `/api/packages/${packageId}?force=true` : `/api/packages/${packageId}`;
      const response = await apiRequest("DELETE", url);
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error, creditsUsed: data.creditsUsed };
      }
      return { success: true };
    },
    onSuccess: (data, variables) => {
      if (!data.success && data.creditsUsed) {
        Alert.alert(
          "Credits Already Used",
          `${data.creditsUsed} credit(s) from this package have been used. Delete anyway?`,
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Delete Anyway", 
              style: "destructive", 
              onPress: () => deleteMutation.mutate({ packageId: variables.packageId, force: true }) 
            },
          ]
        );
        return;
      }
      
      if (!data.success) {
        Alert.alert("Error", data.error || "Failed to delete package");
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete package");
    },
  });

  const handleAddPackage = () => {
    const credits = parseInt(totalCredits, 10);
    if (isNaN(credits) || credits <= 0) {
      Alert.alert("Error", "Please enter a valid number of credits");
      return;
    }

    const months = parseInt(expiryMonths, 10);
    createMutation.mutate({ 
      playerId, 
      totalCredits: credits, 
      creditType,
      purchasedAt: purchaseDate.toISOString(),
      expiryMonths: isNaN(months) || months <= 0 ? 12 : months,
    });
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setPurchaseDate(selectedDate);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleDeletePackage = (pkg: Package) => {
    const creditsUsed = pkg.totalCredits - pkg.remainingCredits;
    const message = creditsUsed > 0 
      ? `This package has ${creditsUsed} used and ${pkg.remainingCredits} remaining credits. Delete it?`
      : `Delete this package with ${pkg.remainingCredits} credits?`;
    
    Alert.alert(
      "Delete Package",
      message,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ packageId: pkg.id }) },
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
          <Text style={styles.summaryLabel}>Total Credits</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activePackages.length}</Text>
          <Text style={styles.summaryLabel}>Active Packages</Text>
        </View>
      </View>

      <View style={styles.creditTypeRow}>
        {(["group", "private", "semi_private"] as CreditType[]).map((type) => (
          <View key={type} style={styles.creditTypeItem}>
            <Text style={styles.creditTypeValue}>{creditsByType[type]}</Text>
            <Text style={styles.creditTypeLabel}>{CREDIT_TYPE_LABELS[type]}</Text>
          </View>
        ))}
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
                  <View style={styles.packageTypeBadge}>
                    <Text style={styles.packageTypeText}>
                      {CREDIT_TYPE_LABELS[(pkg.creditType || "group") as CreditType]}
                    </Text>
                  </View>
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
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Package for {playerName}</Text>

              <Text style={styles.inputLabel}>Credit Type</Text>
              <View style={styles.creditTypeSelector}>
                {(["group", "private", "semi_private"] as CreditType[]).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.creditTypeOption,
                      creditType === type && styles.creditTypeOptionActive,
                    ]}
                    onPress={() => setCreditType(type)}
                  >
                    <Text
                      style={[
                        styles.creditTypeOptionText,
                        creditType === type && styles.creditTypeOptionTextActive,
                      ]}
                    >
                      {CREDIT_TYPE_LABELS[type]}
                    </Text>
                    {pricePerCredit > 0 && creditType === type ? (
                      <Text style={styles.creditTypePrice}>
                        {currency} {pricing.find((p) => p.sessionType === type)?.pricePerSession}/credit
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>

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

              <Text style={styles.inputLabel}>Payment Date</Text>
              {Platform.OS === "web" ? (
                <TextInput
                  style={styles.input}
                  value={purchaseDate.toISOString().split("T")[0]}
                  onChangeText={(text) => {
                    const date = new Date(text);
                    if (!isNaN(date.getTime()) && date <= new Date()) {
                      setPurchaseDate(date);
                    }
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                />
              ) : (
                <>
                  <Pressable 
                    style={styles.datePickerButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color={Colors.dark.primary} />
                    <Text style={styles.datePickerText}>{formatDate(purchaseDate)}</Text>
                  </Pressable>
                  {showDatePicker ? (
                    <DateTimePicker
                      value={purchaseDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={handleDateChange}
                      maximumDate={new Date()}
                      themeVariant="dark"
                    />
                  ) : null}
                </>
              )}

              {calculatedTotal > 0 ? (
                <View style={styles.totalSection}>
                  <Text style={styles.totalLabel}>Invoice Total</Text>
                  <Text style={styles.totalValue}>
                    {currency} {calculatedTotal.toFixed(2)}
                  </Text>
                </View>
              ) : null}

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
          </ScrollView>
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
    padding: Spacing.sm,
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
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
  creditTypeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  creditTypeItem: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
  },
  creditTypeValue: {
    ...Typography.h4,
    color: Colors.dark.xpCyan,
  },
  creditTypeLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontSize: 10,
  },
  packageTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.xs,
  },
  packageTypeText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 10,
  },
  modalScroll: {
    flex: 1,
    width: "100%",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  creditTypeSelector: {
    gap: Spacing.sm,
  },
  creditTypeOption: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  creditTypeOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  creditTypeOptionText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  creditTypeOptionTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  creditTypePrice: {
    ...Typography.caption,
    color: Colors.dark.gold,
    marginTop: Spacing.xs,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  datePickerText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  totalSection: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  totalLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  totalValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
    marginTop: Spacing.xs,
  },
});
