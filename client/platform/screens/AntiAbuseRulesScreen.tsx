import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Modal, Alert, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const PLATFORM_COLOR = "#9B59B6";

const MAX_PER_DAY_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 50, 100];
const COOLDOWN_OPTIONS = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];

type PickerType = { actionSource: string; field: "maxPerDay" | "cooldown" } | null;

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

export default function AntiAbuseRulesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [localRules, setLocalRules] = useState<XPRule[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPicker, setShowPicker] = useState<PickerType>(null);
  const [savingRule, setSavingRule] = useState<string | null>(null);

  const { data: rules = [], isLoading } = useQuery<XPRule[]>({
    queryKey: ["/api/player-level/config/xp-rules"],
  });

  useEffect(() => {
    if (rules.length > 0) {
      setLocalRules(rules);
    }
  }, [rules]);

  const updateMutation = useMutation({
    mutationFn: async (rule: XPRule) => {
      return apiRequest("PUT", `/api/player-level/config/xp-rules/${rule.actionSource}`, {
        xpAmount: rule.xpAmount,
        description: rule.description ?? null,
        isOneTime: rule.isOneTime ?? false,
        cooldownMinutes: rule.cooldownMinutes ?? null,
        maxPerDay: rule.maxPerDay ?? null,
        isActive: rule.isActive ?? true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-level/config/xp-rules"] });
    },
  });

  const handleToggleOneTime = (actionSource: string) => {
    setLocalRules(prev => prev.map(r => 
      r.actionSource === actionSource ? { ...r, isOneTime: !r.isOneTime } : r
    ));
    setHasChanges(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleToggleActive = (actionSource: string) => {
    setLocalRules(prev => prev.map(r => 
      r.actionSource === actionSource ? { ...r, isActive: !r.isActive } : r
    ));
    setHasChanges(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOpenPicker = (actionSource: string, field: "maxPerDay" | "cooldown") => {
    setShowPicker({ actionSource, field });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSelectValue = (value: number) => {
    if (showPicker) {
      const field = showPicker.field === "maxPerDay" ? "maxPerDay" : "cooldownMinutes";
      setLocalRules(prev => prev.map(r => 
        r.actionSource === showPicker.actionSource ? { ...r, [field]: value } : r
      ));
      setHasChanges(true);
    }
    setShowPicker(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    const changedRules = localRules.filter(local => {
      const original = rules.find(o => o.actionSource === local.actionSource);
      return original && (
        original.isOneTime !== local.isOneTime ||
        original.cooldownMinutes !== local.cooldownMinutes ||
        original.maxPerDay !== local.maxPerDay ||
        original.isActive !== local.isActive
      );
    });

    if (changedRules.length === 0) {
      setHasChanges(false);
      return;
    }

    try {
      for (const rule of changedRules) {
        setSavingRule(rule.actionSource);
        await updateMutation.mutateAsync(rule);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasChanges(false);
      setSavingRule(null);

      if (Platform.OS === "web") {
        window.alert("Anti-abuse rules saved successfully!");
      } else {
        Alert.alert("Success", "Anti-abuse rules saved successfully!");
      }
    } catch (error) {
      setSavingRule(null);
      if (Platform.OS === "web") {
        window.alert("Failed to save anti-abuse rules");
      } else {
        Alert.alert("Error", "Failed to save anti-abuse rules");
      }
    }
  };

  const getPickerOptions = () => {
    if (!showPicker) return [];
    return showPicker.field === "maxPerDay" ? MAX_PER_DAY_OPTIONS : COOLDOWN_OPTIONS;
  };

  const getPickerTitle = () => {
    if (!showPicker) return "";
    return showPicker.field === "maxPerDay" ? "Max Per Day" : "Cooldown (minutes)";
  };

  const getCurrentPickerValue = () => {
    if (!showPicker) return 0;
    const rule = localRules.find(r => r.actionSource === showPicker.actionSource);
    return showPicker.field === "maxPerDay" ? (rule?.maxPerDay || 0) : (rule?.cooldownMinutes || 0);
  };

  const formatCooldown = (minutes: number | null) => {
    if (!minutes) return "None";
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading anti-abuse rules...</Text>
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
        <Text style={styles.topBarTitle}>Anti-Abuse Rules</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Configure XP abuse prevention rules per action type</Text>

        {localRules.map((rule) => (
          <View key={rule.actionSource} style={[styles.card, CardStyles.elevated, { marginBottom: Spacing.md }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>
                  {ACTION_SOURCE_LABELS[rule.actionSource] || rule.actionSource}
                </Text>
                {savingRule === rule.actionSource ? (
                  <ActivityIndicator size="small" color={PLATFORM_COLOR} />
                ) : null}
              </View>
              <View style={styles.activeToggle}>
                <Text style={styles.toggleLabel}>Active</Text>
                <Switch
                  value={rule.isActive ?? true}
                  onValueChange={() => handleToggleActive(rule.actionSource)}
                  trackColor={{ false: Colors.dark.backgroundRoot, true: PLATFORM_COLOR + "60" }}
                  thumbColor={rule.isActive ? PLATFORM_COLOR : Colors.dark.textMuted}
                />
              </View>
            </View>

            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleLabel}>One-Time Bonus</Text>
                <Text style={styles.ruleDescription}>XP can only be earned once</Text>
              </View>
              <Switch
                value={rule.isOneTime ?? false}
                onValueChange={() => handleToggleOneTime(rule.actionSource)}
                trackColor={{ false: Colors.dark.backgroundRoot, true: PLATFORM_COLOR + "60" }}
                thumbColor={rule.isOneTime ? PLATFORM_COLOR : Colors.dark.textMuted}
              />
            </View>

            <Pressable 
              style={styles.ruleRow}
              onPress={() => handleOpenPicker(rule.actionSource, "maxPerDay")}
            >
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleLabel}>Daily Cap</Text>
                <Text style={styles.ruleDescription}>Max times per day</Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{rule.maxPerDay || "None"}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
              </View>
            </Pressable>

            <Pressable 
              style={[styles.ruleRow, { borderBottomWidth: 0 }]}
              onPress={() => handleOpenPicker(rule.actionSource, "cooldown")}
            >
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleLabel}>Cooldown</Text>
                <Text style={styles.ruleDescription}>Minimum time between awards</Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>{formatCooldown(rule.cooldownMinutes)}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.dark.textMuted} />
              </View>
            </Pressable>
          </View>
        ))}

        {localRules.length === 0 ? (
          <Text style={[styles.subtitle, { textAlign: "center", marginTop: Spacing.xl }]}>
            No XP rules configured. Add rules from the XP Multipliers screen first.
          </Text>
        ) : null}

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
      </ScrollView>

      <Modal
        visible={!!showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getPickerTitle()}</Text>
            </View>
            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
              <Pressable
                style={[styles.optionItem, getCurrentPickerValue() === 0 && styles.optionItemSelected]}
                onPress={() => handleSelectValue(0)}
              >
                <Text style={[styles.optionText, getCurrentPickerValue() === 0 && styles.optionTextSelected]}>
                  None
                </Text>
                {getCurrentPickerValue() === 0 ? (
                  <Ionicons name="checkmark" size={20} color={PLATFORM_COLOR} />
                ) : null}
              </Pressable>
              {getPickerOptions().map((value) => (
                <Pressable
                  key={value}
                  style={[styles.optionItem, getCurrentPickerValue() === value && styles.optionItemSelected]}
                  onPress={() => handleSelectValue(value)}
                >
                  <Text style={[styles.optionText, getCurrentPickerValue() === value && styles.optionTextSelected]}>
                    {showPicker?.field === "cooldown" ? formatCooldown(value) : value}
                  </Text>
                  {getCurrentPickerValue() === value ? (
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
    backgroundColor: PLATFORM_COLOR + "10",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  cardTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  activeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  toggleLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  ruleInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  ruleLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  ruleDescription: {
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
  },
  valueText: {
    ...Typography.body,
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
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
