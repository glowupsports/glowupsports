import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Alert, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles, Backgrounds, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";

const XP_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500];

interface XPRule {
  id?: number;
  actionSource: string;
  xpAmount: number;
  description: string | null;
  isOneTime: boolean | null;
  cooldownMinutes: number | null;
  maxPerDay: number | null;
  isActive: boolean | null;
}

const ACTION_SOURCE_LABELS: Record<string, string> = {
  session_attendance: "Session Attendance",
  positive_feedback: "Positive Feedback",
  level_up: "Level Up",
  attendance_streak: "Attendance Streak",
  badge_earned: "Badge Earned",
  skill_validation: "Skill Validation",
  match_played: "Match Played",
  match_won: "Match Won",
  match_reflection: "Match Reflection",
};

export default function XPMultipliersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [localRules, setLocalRules] = useState<XPRule[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedRule, setSelectedRule] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState<string | null>(null);

  const { data: rules = [], isLoading } = useQuery<XPRule[]>({
    queryKey: ["/api/player-level/config/xp-rules"],
  });

  useEffect(() => {
    if (rules.length > 0) {
      setLocalRules(rules);
    }
  }, [rules]);

  const updateRuleMutation = useMutation({
    mutationFn: async ({ actionSource, xpAmount }: { actionSource: string; xpAmount: number }) => {
      const existingRule = localRules.find(r => r.actionSource === actionSource);
      if (!existingRule) throw new Error("Rule not found");
      return apiRequest("PUT", `/api/player-level/config/xp-rules/${actionSource}`, {
        xpAmount,
        description: existingRule.description ?? null,
        isOneTime: existingRule.isOneTime ?? false,
        cooldownMinutes: existingRule.cooldownMinutes ?? null,
        maxPerDay: existingRule.maxPerDay ?? null,
        isActive: existingRule.isActive ?? true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-level/config/xp-rules"] });
    },
  });

  const handleOpenPicker = (actionSource: string) => {
    setSelectedRule(actionSource);
    setShowPicker(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectValue = (value: number) => {
    if (selectedRule) {
      setLocalRules(prev => prev.map(r => 
        r.actionSource === selectedRule ? { ...r, xpAmount: value } : r
      ));
      setHasChanges(true);
    }
    setShowPicker(false);
    setSelectedRule(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    const originalRules = rules;
    const changedRules = localRules.filter(local => {
      const original = originalRules.find(o => o.actionSource === local.actionSource);
      return original && original.xpAmount !== local.xpAmount;
    });

    if (changedRules.length === 0) {
      setHasChanges(false);
      return;
    }

    try {
      for (const rule of changedRules) {
        setSavingRule(rule.actionSource);
        await updateRuleMutation.mutateAsync({
          actionSource: rule.actionSource,
          xpAmount: rule.xpAmount,
        });
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasChanges(false);
      setSavingRule(null);
      
      if (Platform.OS === "web") {
        window.alert("XP multipliers saved successfully!");
      } else {
        Alert.alert("Success", "XP multipliers saved successfully!");
      }
    } catch (error) {
      setSavingRule(null);
      if (Platform.OS === "web") {
        window.alert("Failed to save XP multipliers");
      } else {
        Alert.alert("Error", "Failed to save XP multipliers");
      }
    }
  };

  const currentRule = localRules.find(r => r.actionSource === selectedRule);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={[styles.subtitle, { marginTop: Spacing.md }]}>Loading XP rules...</Text>
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
        <Text style={styles.topBarTitle}>XP Multipliers</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure base XP values for different actions</Text>

        <View style={[styles.card, CardStyles.elevated]}>
          {localRules.map((rule) => (
            <Pressable 
              key={rule.actionSource} 
              style={styles.row}
              onPress={() => handleOpenPicker(rule.actionSource)}
            >
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>
                  {ACTION_SOURCE_LABELS[rule.actionSource] || rule.actionSource}
                </Text>
                <Text style={styles.rowDescription}>
                  {rule.description || `XP awarded for ${rule.actionSource.replace(/_/g, " ")}`}
                </Text>
              </View>
              <View style={styles.valueContainer}>
                {savingRule === rule.actionSource ? (
                  <ActivityIndicator size="small" color={PLATFORM_COLOR} />
                ) : (
                  <>
                    <Text style={styles.valueText}>{rule.xpAmount}</Text>
                    <Text style={styles.valueSuffix}>XP</Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
                  </>
                )}
              </View>
            </Pressable>
          ))}
        </View>

        {localRules.length === 0 ? (
          <Text style={[styles.subtitle, { textAlign: "center", marginTop: Spacing.xl }]}>
            No XP rules configured. Add rules from the database.
          </Text>
        ) : null}

        {hasChanges ? (
          <Pressable 
            style={[styles.saveButton, updateRuleMutation.isPending && styles.saveButtonDisabled]} 
            onPress={handleSave}
            disabled={updateRuleMutation.isPending}
          >
            {updateRuleMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </Pressable>
        ) : null}
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
              <Text style={styles.modalTitle}>Select XP Value</Text>
              {currentRule ? (
                <Text style={styles.modalSubtitle}>
                  {ACTION_SOURCE_LABELS[currentRule.actionSource] || currentRule.actionSource}
                </Text>
              ) : null}
            </View>
            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
              {XP_OPTIONS.map((value) => (
                <Pressable
                  key={value}
                  style={[
                    styles.optionItem,
                    currentRule?.xpAmount === value && styles.optionItemSelected,
                  ]}
                  onPress={() => handleSelectValue(value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      currentRule?.xpAmount === value && styles.optionTextSelected,
                    ]}
                  >
                    {value} XP
                  </Text>
                  {currentRule?.xpAmount === value ? (
                    <Ionicons name="checkmark" size={20} color={PLATFORM_COLOR} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  rowInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  rowLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  rowDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    minWidth: 80,
    justifyContent: "center",
  },
  valueText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  valueSuffix: {
    ...Typography.small,
    color: Colors.dark.textMuted,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxHeight: "70%",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  modalHeader: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
    alignItems: "center",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  modalSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  optionsList: {
    maxHeight: 400,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  optionItemSelected: {
    backgroundColor: PLATFORM_COLOR + "20",
  },
  optionText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  optionTextSelected: {
    color: PLATFORM_COLOR,
    fontWeight: "600",
  },
});
