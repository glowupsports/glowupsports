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
  const [isPaid, setIsPaid] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<Package | null>(null);

  const { data: packages = [], isLoading } = useQuery<Package[]>({
    queryKey: [`/api/players/${playerId}/packages`],
  });

  const { data: creditBalance } = useQuery<{
    group: number;
    semi_private: number;
    private: number;
    totalDebt: number;
    hasDebt: boolean;
  }>({
    queryKey: [`/api/players/${playerId}/credit-balance`],
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
      purchasedAt?: string;
      expiryMonths: number;
    }) => {
      const response = await apiRequest("POST", "/api/packages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/packages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
      setShowAddModal(false);
      setTotalCredits("10");
      setExpiryMonths("12");
      setCreditType("group");
      setIsPaid(false);
      setPurchaseDate(new Date());
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to add package");
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
      queryClient.invalidateQueries({ queryKey: [`/api/players/${playerId}/credit-balance`] });
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
      purchasedAt: isPaid ? purchaseDate.toISOString() : undefined,
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
    setPackageToDelete(pkg);
    setShowDeleteConfirm(true);
  };

  const confirmDeletePackage = () => {
    if (packageToDelete) {
      deleteMutation.mutate({ packageId: packageToDelete.id });
      setShowDeleteConfirm(false);
      setPackageToDelete(null);
    }
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
          <Text style={[
            styles.summaryValue,
            creditBalance && (creditBalance.group + creditBalance.semi_private + creditBalance.private) < 0 && styles.debtValue
          ]}>
            {creditBalance ? creditBalance.group + creditBalance.semi_private + creditBalance.private : totalRemaining}
          </Text>
          <Text style={styles.summaryLabel}>Total Credits</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activePackages.length}</Text>
          <Text style={styles.summaryLabel}>Active Packages</Text>
        </View>
      </View>

      <View style={styles.creditTypeRow}>
        {(["group", "private", "semi_private"] as CreditType[]).map((type) => {
          const balance = creditBalance ? creditBalance[type] : creditsByType[type];
          return (
            <View key={type} style={styles.creditTypeItem}>
              <Text style={[styles.creditTypeValue, balance < 0 && styles.debtValue]}>{balance}</Text>
              <Text style={styles.creditTypeLabel}>{CREDIT_TYPE_LABELS[type]}</Text>
            </View>
          );
        })}
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
          {packages.map((pkg) => {
            const creditType = (pkg.creditType || "group") as CreditType;
            const progressPercent = pkg.totalCredits > 0 ? (pkg.remainingCredits / pkg.totalCredits) * 100 : 0;
            const isDepleted = pkg.remainingCredits === 0;
            const expired = isExpired(pkg.expiryDate);
            const typeColor = creditType === "private" ? Colors.dark.sessionPrivate 
              : creditType === "semi_private" ? Colors.dark.sessionSemiPrivate 
              : Colors.dark.sessionGroup;
            
            return (
              <View
                key={pkg.id}
                style={[
                  styles.packageItem,
                  isDepleted && styles.packageItemDepleted,
                  expired && styles.packageItemExpired,
                ]}
              >
                <View style={styles.packageHeader}>
                  <View style={styles.packageTitleRow}>
                    <View style={[styles.packageTypeBadge, { backgroundColor: typeColor + "20" }]}>
                      <Text style={[styles.packageTypeText, { color: typeColor }]}>
                        {CREDIT_TYPE_LABELS[creditType]}
                      </Text>
                    </View>
                    {expired ? (
                      <View style={styles.expiredBadge}>
                        <Text style={styles.expiredBadgeText}>Expired</Text>
                      </View>
                    ) : null}
                  </View>
                  <Pressable 
                    onPress={() => handleDeletePackage(pkg)} 
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.buttonPressed]}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  </Pressable>
                </View>
                
                <View style={styles.packageCreditsSection}>
                  <Text style={styles.creditsLabel}>Credits</Text>
                  <View style={styles.creditsDisplay}>
                    <Text style={[styles.creditsRemaining, isDepleted && styles.creditsDepleted]}>
                      {pkg.remainingCredits}
                    </Text>
                    <Text style={styles.creditsTotal}>/ {pkg.totalCredits}</Text>
                  </View>
                </View>
                
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarBackground}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { 
                          width: `${progressPercent}%`,
                          backgroundColor: isDepleted || expired ? Colors.dark.disabled : typeColor,
                        }
                      ]} 
                    />
                  </View>
                </View>
                
                <View style={styles.packageFooter}>
                  <Ionicons name="calendar-outline" size={12} color={Colors.dark.tabIconDefault} />
                  <Text style={[styles.expiryText, expired && styles.expiryTextExpired]}>
                    {expired ? "Expired " : "Valid until "}
                    {formatExpiryDate(pkg.expiryDate)}
                  </Text>
                </View>
              </View>
            );
          })}
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

              <Pressable 
                style={styles.paidToggleRow}
                onPress={() => setIsPaid(!isPaid)}
              >
                <View style={[styles.checkbox, isPaid && styles.checkboxChecked]}>
                  {isPaid ? <Ionicons name="checkmark" size={14} color={Colors.dark.backgroundRoot} /> : null}
                </View>
                <Text style={styles.paidToggleText}>Payment already received</Text>
              </Pressable>
              
              {isPaid ? (
                <>
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
                </>
              ) : (
                <Text style={styles.pendingInvoiceNote}>
                  A pending invoice will be created for the player to pay
                </Text>
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

      <Modal visible={showDeleteConfirm} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalContent}>
            <Text style={styles.modalTitle}>Delete Package</Text>
            {packageToDelete && (
              <Text style={styles.deleteMessage}>
                {packageToDelete.totalCredits - packageToDelete.remainingCredits > 0
                  ? `This package has ${packageToDelete.totalCredits - packageToDelete.remainingCredits} used and ${packageToDelete.remainingCredits} remaining credits. Delete it?`
                  : `Delete this package with ${packageToDelete.remainingCredits} credits?`}
              </Text>
            )}
            <View style={styles.modalButtons}>
              <Pressable 
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setPackageToDelete(null);
                }} 
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeletePackage}
                disabled={deleteMutation.isPending}
                style={styles.deleteConfirmButton}
              >
                <Text style={styles.deleteConfirmButtonText}>
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Text>
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
  debtValue: {
    color: Colors.dark.error,
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
    gap: Spacing.md,
  },
  packageItem: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  packageItemDepleted: {
    opacity: 0.6,
    borderColor: Colors.dark.disabled,
  },
  packageItemExpired: {
    opacity: 0.6,
    borderColor: Colors.dark.error + "40",
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  packageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  packageCreditsSection: {
    marginBottom: Spacing.md,
  },
  creditsLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  creditsDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  creditsRemaining: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  creditsDepleted: {
    color: Colors.dark.disabled,
  },
  creditsTotal: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    marginLeft: Spacing.xs,
  },
  progressBarContainer: {
    marginBottom: Spacing.md,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  packageFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  expiryText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  expiryTextExpired: {
    color: Colors.dark.error,
  },
  expiredBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.dark.error + "20",
    borderRadius: BorderRadius.xs,
  },
  expiredBadgeText: {
    ...Typography.caption,
    color: Colors.dark.error,
    fontSize: 10,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  deleteButton: {
    padding: Spacing.sm,
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.error + "15",
    borderRadius: BorderRadius.md,
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
  deleteModalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "90%",
    maxWidth: 360,
  },
  deleteMessage: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  deleteConfirmButton: {
    flex: 1,
    backgroundColor: Colors.dark.error,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteConfirmButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
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
  paidToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.primary,
  },
  paidToggleText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  pendingInvoiceNote: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontStyle: "italic",
    marginBottom: Spacing.sm,
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
