import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";

interface LevelThreshold {
  id?: number;
  level: number;
  xpRequired: number;
  title: string | null;
  badgeUnlock: string | null;
  titleUnlock: string | null;
}

const LEVEL_COLORS: Record<number, string> = {
  1: "#E74C3C",
  2: "#E67E22",
  3: "#F1C40F",
  4: "#2ECC71",
  5: "#1ABC9C",
  6: "#3498DB",
  7: "#9B59B6",
  8: "#E91E63",
  9: "#FF5722",
  10: "#00BCD4",
  11: "#4CAF50",
  12: "#CDDC39",
  13: "#FFC107",
  14: "#FF9800",
  15: "#795548",
  16: "#607D8B",
  17: "#9C27B0",
  18: "#673AB7",
  19: "#3F51B5",
  20: "#FFD700",
};

export default function LevelThresholdsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [localThresholds, setLocalThresholds] = useState<LevelThreshold[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [savingLevel, setSavingLevel] = useState<number | null>(null);

  const { data: thresholds = [], isLoading } = useQuery<LevelThreshold[]>({
    queryKey: ["/api/player-level/config/thresholds"],
  });

  useEffect(() => {
    if (thresholds.length > 0) {
      setLocalThresholds(thresholds);
    }
  }, [thresholds]);

  const updateMutation = useMutation({
    mutationFn: async ({ level, xpRequired }: { level: number; xpRequired: number }) => {
      const existing = localThresholds.find(t => t.level === level);
      if (!existing) throw new Error("Threshold not found");
      return apiRequest("PUT", `/api/player-level/config/thresholds/${level}`, {
        xpRequired,
        title: existing.title ?? null,
        badgeUnlock: existing.badgeUnlock ?? null,
        titleUnlock: existing.titleUnlock ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-level/config/thresholds"] });
    },
  });

  const handleValueChange = (level: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setLocalThresholds(prev => prev.map(t => t.level === level ? { ...t, xpRequired: numValue } : t));
    setHasChanges(true);
  };

  const handleSave = async () => {
    const changedThresholds = localThresholds.filter(local => {
      const original = thresholds.find(o => o.level === local.level);
      return original && original.xpRequired !== local.xpRequired;
    });

    if (changedThresholds.length === 0) {
      setHasChanges(false);
      return;
    }

    try {
      for (const threshold of changedThresholds) {
        setSavingLevel(threshold.level);
        await updateMutation.mutateAsync({
          level: threshold.level,
          xpRequired: threshold.xpRequired,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasChanges(false);
      setSavingLevel(null);

      if (Platform.OS === "web") {
        window.alert("Level thresholds saved successfully!");
      } else {
        Alert.alert("Success", "Level thresholds saved successfully!");
      }
    } catch (error) {
      setSavingLevel(null);
      if (Platform.OS === "web") {
        window.alert("Failed to save level thresholds");
      } else {
        Alert.alert("Error", "Failed to save level thresholds");
      }
    }
  };

  const getLevelColor = (level: number) => LEVEL_COLORS[level] || PLATFORM_COLOR;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading level thresholds...</Text>
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
        <Text style={styles.topBarTitle}>Level Thresholds</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure XP required for each player level</Text>

        <View style={[styles.card, CardStyles.elevated]}>
          {localThresholds.map((threshold, index) => (
            <View key={threshold.level} style={styles.row}>
              <View style={[styles.levelBadge, { backgroundColor: `${getLevelColor(threshold.level)}20` }]}>
                <View style={[styles.levelDot, { backgroundColor: getLevelColor(threshold.level) }]} />
                <Text style={[styles.levelText, { color: getLevelColor(threshold.level) }]}>
                  {threshold.title || `Level ${threshold.level}`}
                </Text>
              </View>
              <View style={styles.inputContainer}>
                {savingLevel === threshold.level ? (
                  <ActivityIndicator size="small" color={PLATFORM_COLOR} />
                ) : (
                  <>
                    <TextInput
                      style={[styles.input, threshold.level === 1 && styles.inputDisabled]}
                      value={String(threshold.xpRequired)}
                      onChangeText={(value) => handleValueChange(threshold.level, value)}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={Colors.dark.textMuted}
                      editable={threshold.level !== 1}
                    />
                    <Text style={styles.inputSuffix}>XP</Text>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>

        {localThresholds.length === 0 ? (
          <Text style={[styles.subtitle, { textAlign: "center", marginTop: Spacing.xl }]}>
            No level thresholds configured. Seed defaults from system settings.
          </Text>
        ) : null}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>
            Players start at Level 1 (0 XP). Each subsequent level requires more XP to achieve.
          </Text>
        </View>

        {hasChanges ? (
          <Pressable
            style={[styles.saveButton, updateMutation.isPending && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </Pressable>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  topBarTitle: {
    ...Typography.h2,
    color: PLATFORM_COLOR,
    flex: 1,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  levelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  levelText: {
    ...Typography.body,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    minWidth: 100,
    justifyContent: "center",
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    width: 70,
    textAlign: "right",
    paddingVertical: Spacing.sm,
  },
  inputDisabled: {
    color: Colors.dark.textMuted,
  },
  inputSuffix: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginLeft: Spacing.xs,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  infoText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  saveButton: {
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
