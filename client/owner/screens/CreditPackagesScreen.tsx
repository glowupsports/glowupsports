import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface PackageTemplate {
  id: string;
  academyId: string;
  name: string;
  creditType: string;
  credits: number;
  pricePerCredit: string;
  currency: string;
  validityDays: number;
  isActive: boolean;
  createdAt: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedButton({ onPress, style, children, disabled }: any) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.95, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 400 }); }}
      style={[animatedStyle, style]}
      disabled={disabled}
    >
      {children}
    </AnimatedPressable>
  );
}

export default function CreditPackagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [newPackageName, setNewPackageName] = useState("");
  const [newPackageCredits, setNewPackageCredits] = useState("");
  const [newPackagePrice, setNewPackagePrice] = useState("");
  const [newPackageCreditType, setNewPackageCreditType] = useState<"group" | "private" | "semi_private">("private");
  const [newPackageValidityDays, setNewPackageValidityDays] = useState("90");

  const { data: packageTemplates = [], isLoading: packagesLoading } = useQuery<PackageTemplate[]>({
    queryKey: ["/api/billing/package-templates"],
  });

  const createPackageMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      creditType: string;
      credits: number;
      pricePerCredit: string;
      validityDays: number;
    }) => {
      return apiRequest("POST", "/api/billing/package-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      setShowPackageModal(false);
      setNewPackageName("");
      setNewPackageCredits("");
      setNewPackagePrice("");
      setNewPackageCreditType("private");
      setNewPackageValidityDays("90");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Credit package created!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to create package");
    },
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/billing/package-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/package-templates"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleCreatePackage = () => {
    if (!newPackageName.trim()) {
      Alert.alert("Error", "Please enter a package name");
      return;
    }
    const credits = parseInt(newPackageCredits);
    if (isNaN(credits) || credits <= 0) {
      Alert.alert("Error", "Please enter a valid number of credits");
      return;
    }
    const price = parseFloat(newPackagePrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert("Error", "Please enter a valid price per credit");
      return;
    }
    const validityDays = parseInt(newPackageValidityDays) || 90;

    createPackageMutation.mutate({
      name: newPackageName.trim(),
      creditType: newPackageCreditType,
      credits,
      pricePerCredit: newPackagePrice,
      validityDays,
    });
  };

  const handleDeletePackage = (pkg: PackageTemplate) => {
    Alert.alert(
      "Delete Package",
      `Are you sure you want to delete "${pkg.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePackageMutation.mutate(pkg.id),
        },
      ]
    );
  };

  const getCreditTypeColor = (type: string) => {
    switch (type) {
      case "private": return Colors.dark.primary;
      case "group": return Colors.dark.orange;
      case "semi_private": return Colors.dark.xpCyan;
      default: return Colors.dark.textMuted;
    }
  };

  const getCreditTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "group": return "Group";
      case "semi_private": return "Semi-Private";
      default: return type;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={styles.gamingHeader}
      >
        <LinearGradient
          colors={[Colors.dark.gold, Colors.dark.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerTopLine}
        />
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>CREDIT PACKAGES</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tabContent}>
          <Text style={styles.description}>
            Create credit packages that players can purchase in the Credit Store
          </Text>

          <AnimatedButton style={styles.createButton} onPress={() => setShowPackageModal(true)}>
            <LinearGradient
              colors={[Colors.dark.gold, Colors.dark.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.createButtonGradient}
            >
              <Ionicons name="add" size={20} color={Colors.dark.backgroundRoot} />
              <Text style={styles.createButtonText}>New Credit Package</Text>
            </LinearGradient>
          </AnimatedButton>

          {packagesLoading ? (
            <ActivityIndicator color={Colors.dark.gold} style={{ marginTop: Spacing.xl }} />
          ) : packageTemplates.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="gift-outline" size={60} color={Colors.dark.gold} />
              </View>
              <Text style={styles.emptyStateTitle}>No credit packages yet</Text>
              <Text style={styles.emptyStateText}>Create packages that players can purchase in the Credit Store</Text>
            </View>
          ) : (
            packageTemplates.map((pkg) => (
              <View key={pkg.id} style={styles.packageCard}>
                <View style={styles.packageHeader}>
                  <View style={styles.packageTitleRow}>
                    <Text style={styles.packageName}>{pkg.name}</Text>
                    <View style={[styles.creditTypeBadge, { backgroundColor: `${getCreditTypeColor(pkg.creditType)}20`, borderColor: getCreditTypeColor(pkg.creditType) }]}>
                      <Text style={[styles.creditTypeText, { color: getCreditTypeColor(pkg.creditType) }]}>
                        {getCreditTypeLabel(pkg.creditType)}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => handleDeletePackage(pkg)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  </Pressable>
                </View>
                <View style={styles.packageDetails}>
                  <View style={styles.packageDetailItem}>
                    <Text style={styles.packageDetailLabel}>Credits</Text>
                    <Text style={styles.packageDetailValue}>{pkg.credits}</Text>
                  </View>
                  <View style={styles.packageDetailItem}>
                    <Text style={styles.packageDetailLabel}>Price/Credit</Text>
                    <Text style={styles.packageDetailValue}>{pkg.currency} {pkg.pricePerCredit || '0'}</Text>
                  </View>
                  <View style={styles.packageDetailItem}>
                    <Text style={styles.packageDetailLabel}>Total</Text>
                    <Text style={[styles.packageDetailValue, { color: Colors.dark.gold }]}>
                      {pkg.currency} {((parseFloat(pkg.pricePerCredit) || 0) * (pkg.credits || 0)).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.packageDetailItem}>
                    <Text style={styles.packageDetailLabel}>Valid</Text>
                    <Text style={styles.packageDetailValue}>{pkg.validityDays || 90} days</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      <Modal
        visible={showPackageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPackageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Credit Package</Text>
              <Pressable onPress={() => setShowPackageModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <KeyboardAwareScrollViewCompat style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>PACKAGE NAME</Text>
                <TextInput
                  style={styles.input}
                  value={newPackageName}
                  onChangeText={setNewPackageName}
                  placeholder="e.g., 10 Private Lessons"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>CREDIT TYPE</Text>
                <View style={styles.creditTypeRow}>
                  {(["group", "private", "semi_private"] as const).map((type) => (
                    <Pressable
                      key={type}
                      style={[
                        styles.creditTypeOption,
                        newPackageCreditType === type && { 
                          backgroundColor: `${getCreditTypeColor(type)}20`,
                          borderColor: getCreditTypeColor(type)
                        }
                      ]}
                      onPress={() => setNewPackageCreditType(type)}
                    >
                      <Text style={[
                        styles.creditTypeOptionText,
                        newPackageCreditType === type && { color: getCreditTypeColor(type) }
                      ]}>
                        {getCreditTypeLabel(type)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>NUMBER OF CREDITS</Text>
                <TextInput
                  style={styles.input}
                  value={newPackageCredits}
                  onChangeText={setNewPackageCredits}
                  placeholder="10"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>PRICE PER CREDIT (AED)</Text>
                <TextInput
                  style={styles.input}
                  value={newPackagePrice}
                  onChangeText={setNewPackagePrice}
                  placeholder="250.00"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>VALIDITY (DAYS)</Text>
                <TextInput
                  style={styles.input}
                  value={newPackageValidityDays}
                  onChangeText={setNewPackageValidityDays}
                  placeholder="90"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                />
              </View>

              {newPackageCredits && newPackagePrice ? (
                <View style={styles.totalPreview}>
                  <Text style={styles.totalPreviewLabel}>Total Package Price:</Text>
                  <Text style={styles.totalPreviewValue}>
                    AED {(parseInt(newPackageCredits) * parseFloat(newPackagePrice) || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </KeyboardAwareScrollViewCompat>

            <AnimatedButton
              style={[styles.modalButton, createPackageMutation.isPending && styles.buttonDisabled]}
              onPress={handleCreatePackage}
              disabled={createPackageMutation.isPending}
            >
              <LinearGradient
                colors={[Colors.dark.gold, Colors.dark.orange]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalButtonGradient}
              >
                {createPackageMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.backgroundRoot} />
                ) : (
                  <Text style={styles.modalButtonText}>Create Package</Text>
                )}
              </LinearGradient>
            </AnimatedButton>
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
  gamingHeader: {
    paddingBottom: Spacing.md,
  },
  headerTopLine: {
    height: 3,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  tabContent: {
    paddingTop: Spacing.lg,
  },
  description: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  createButton: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  createButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  createButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: Spacing["3xl"],
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${Colors.dark.gold}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyStateTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptyStateText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  packageCard: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.gold}20`,
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  packageTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  packageName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  creditTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  creditTypeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  packageDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  packageDetailItem: {
    minWidth: 70,
  },
  packageDetailLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  packageDetailValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.dark.gold}30`,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  modalBody: {
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.gold,
    marginBottom: Spacing.sm,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "rgba(30, 30, 35, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: `${Colors.dark.gold}30`,
  },
  creditTypeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  creditTypeOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(30, 30, 35, 0.9)",
    borderWidth: 1,
    borderColor: `${Colors.dark.gold}30`,
    alignItems: "center",
  },
  creditTypeOptionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  totalPreview: {
    backgroundColor: `${Colors.dark.gold}15`,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.gold}30`,
  },
  totalPreviewLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  totalPreviewValue: {
    ...Typography.h3,
    color: Colors.dark.gold,
  },
  modalButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  modalButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    ...Typography.h4,
    color: Colors.dark.backgroundRoot,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
