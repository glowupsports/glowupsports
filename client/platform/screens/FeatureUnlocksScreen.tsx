import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Alert, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";
const LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

interface FeatureUnlock {
  id: string;
  featureKey: string;
  requiredLevel: number;
  featureName: string;
  featureDescription?: string;
  featureIcon?: string;
  onboardingTitle?: string;
  onboardingDescription?: string;
  isActive: boolean;
}

export default function FeatureUnlocksScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [showPicker, setShowPicker] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<FeatureUnlock | null>(null);
  const [localChanges, setLocalChanges] = useState<Record<string, number>>({});

  const { data: features = [], isLoading } = useQuery<FeatureUnlock[]>({
    queryKey: ["/api/player-level/config/feature-unlocks"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ featureKey, requiredLevel }: { featureKey: string; requiredLevel: number }) => {
      return apiRequest("PUT", `/api/player-level/config/feature-unlocks/${featureKey}`, {
        requiredLevel,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-level/config/feature-unlocks"] });
    },
  });

  const handleOpenPicker = (feature: FeatureUnlock) => {
    setSelectedFeature(feature);
    setShowPicker(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectLevel = async (level: number) => {
    if (selectedFeature) {
      setLocalChanges(prev => ({ ...prev, [selectedFeature.featureKey]: level }));
      
      try {
        await updateMutation.mutateAsync({
          featureKey: selectedFeature.featureKey,
          requiredLevel: level,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (Platform.OS === "web") {
          window.alert("Failed to update feature unlock level");
        } else {
          Alert.alert("Error", "Failed to update feature unlock level");
        }
      }
    }
    setShowPicker(false);
    setSelectedFeature(null);
  };

  const getDisplayLevel = (feature: FeatureUnlock) => {
    return localChanges[feature.featureKey] ?? feature.requiredLevel;
  };

  const groupedFeatures = features.reduce((acc, feature) => {
    const level = getDisplayLevel(feature);
    if (!acc[level]) acc[level] = [];
    acc[level].push(feature);
    return acc;
  }, {} as Record<number, FeatureUnlock[]>);

  const sortedLevels = Object.keys(groupedFeatures).map(Number).sort((a, b) => a - b);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading feature unlocks...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Feature Unlocks</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure which level unlocks each feature</Text>
        <Text style={styles.hint}>Tap on a feature to change its required level</Text>

        {sortedLevels.map((level) => (
          <View key={level} style={styles.levelSection}>
            <View style={styles.levelHeader}>
              <LinearGradient
                colors={[PLATFORM_COLOR, PLATFORM_COLOR + "80"]}
                style={styles.levelBadge}
              >
                <Text style={styles.levelBadgeText}>Lv {level}</Text>
              </LinearGradient>
              <Text style={styles.levelSubtext}>
                {level === 1 ? "Available from start" : `Unlocks at Level ${level}`}
              </Text>
            </View>

            <View style={[styles.card, CardStyles.elevated]}>
              {groupedFeatures[level].map((feature, index) => (
                <Pressable
                  key={feature.id}
                  style={[
                    styles.featureRow,
                    index < groupedFeatures[level].length - 1 && styles.featureRowBorder,
                  ]}
                  onPress={() => handleOpenPicker(feature)}
                >
                  <View style={styles.featureIconContainer}>
                    <Ionicons
                      name={(feature.featureIcon as any) || "cube-outline"}
                      size={20}
                      color={PLATFORM_COLOR}
                    />
                  </View>
                  <View style={styles.featureInfo}>
                    <Text style={styles.featureName}>{feature.featureName}</Text>
                    {feature.featureDescription && (
                      <Text style={styles.featureDescription} numberOfLines={1}>
                        {feature.featureDescription}
                      </Text>
                    )}
                  </View>
                  <View style={styles.levelIndicator}>
                    <Text style={styles.levelText}>Lv {getDisplayLevel(feature)}</Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {features.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No feature unlocks configured</Text>
            <Text style={styles.emptySubtext}>Features will appear here once seeded</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Required Level</Text>
              {selectedFeature && (
                <Text style={styles.modalSubtitle}>{selectedFeature.featureName}</Text>
              )}
            </View>
            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
              {LEVEL_OPTIONS.map((level) => {
                const isSelected = selectedFeature && getDisplayLevel(selectedFeature) === level;
                return (
                  <Pressable
                    key={level}
                    style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                    onPress={() => handleSelectLevel(level)}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      Level {level}
                    </Text>
                    {level === 1 && (
                      <Text style={styles.optionHint}>Always available</Text>
                    )}
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={PLATFORM_COLOR} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.cancelButton} onPress={() => setShowPicker(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.md,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold as any,
    color: Colors.dark.text,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  subtitle: {
    fontSize: Typography.sizes.md,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontSize: Typography.sizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xl,
  },
  levelSection: {
    marginBottom: Spacing.xl,
  },
  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  levelBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  levelBadgeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold as any,
    color: "#fff",
  },
  levelSubtext: {
    marginLeft: Spacing.sm,
    fontSize: Typography.sizes.sm,
    color: Colors.dark.textMuted,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  featureRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PLATFORM_COLOR + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  featureInfo: {
    flex: 1,
  },
  featureName: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium as any,
    color: Colors.dark.text,
  },
  featureDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  levelIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.background,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  levelText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium as any,
    color: PLATFORM_COLOR,
    marginRight: Spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.medium as any,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.sizes.sm,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxHeight: "70%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  modalHeader: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold as any,
    color: Colors.dark.text,
  },
  modalSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  optionsList: {
    maxHeight: 300,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  optionItemSelected: {
    backgroundColor: PLATFORM_COLOR + "15",
  },
  optionText: {
    fontSize: Typography.sizes.md,
    color: Colors.dark.text,
  },
  optionTextSelected: {
    fontWeight: Typography.weights.bold as any,
    color: PLATFORM_COLOR,
  },
  optionHint: {
    fontSize: Typography.sizes.sm,
    color: Colors.dark.textMuted,
    flex: 1,
    textAlign: "right",
    marginRight: Spacing.sm,
  },
  cancelButton: {
    padding: Spacing.lg,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  cancelButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium as any,
    color: Colors.dark.textSecondary,
  },
});
