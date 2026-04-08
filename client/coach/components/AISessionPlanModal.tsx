import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface SessionPlan {
  theme: string;
  rationale: string;
  playerBreakdown: { name: string; focus: string; flag?: string }[];
  drills: { title: string; description: string }[];
  flags: string[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  sessionId: string;
  sessionType: string;
}

export function AISessionPlanModal({ visible, onClose, sessionId, sessionType }: Props) {
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const planMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/ai-plan`, {});
      const data = await res.json() as { plan: SessionPlan; generatedAt: string };
      if (!data.plan) throw new Error("No plan returned");
      return data;
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPlan(data.plan);
      setGeneratedAt(data.generatedAt);
      setSaved(false);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (planToSave: SessionPlan) => {
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/ai-plan`, {
        save: true,
        plan: planToSave,
      });
      const data = await res.json() as { saved: boolean };
      return data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleOpen = () => {
    if (!plan && !planMutation.isPending) {
      planMutation.mutate();
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setPlan(null);
      setGeneratedAt(null);
      setSaved(false);
      planMutation.reset();
      saveMutation.reset();
    }, 300);
  };

  const handleRegenerate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlan(null);
    setSaved(false);
    planMutation.mutate();
  };

  const handleCopy = async () => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines: string[] = [
      `SESSION PLAN — ${plan.theme}`,
      ``,
      `Theme: ${plan.theme}`,
      `Rationale: ${plan.rationale}`,
      ``,
      `PLAYER FOCUS:`,
      ...plan.playerBreakdown.map((p) =>
        `${p.name}: ${p.focus}${p.flag ? ` [${p.flag}]` : ""}`
      ),
      ``,
      `DRILLS:`,
      ...plan.drills.map((d, i) => `${i + 1}. ${d.title} — ${d.description}`),
      ``,
      ...(plan.flags.length > 0
        ? [`NOTES:`, ...plan.flags.map((f) => `• ${f}`)]
        : []),
    ];
    await Clipboard.setStringAsync(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      onShow={handleOpen}
    >
      <View style={[styles.container, { paddingTop: insets.top + Spacing.sm }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={16} color={Colors.dark.buttonText} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Plan with AI</Text>
              <Text style={styles.headerSubtitle}>
                {sessionType === "semi_private" ? "Semi-Private" : "Group"} Session Plan
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {plan && !planMutation.isPending ? (
              <>
                <Pressable
                  style={styles.iconButton}
                  onPress={handleCopy}
                >
                  <Ionicons
                    name={copied ? "checkmark" : "copy-outline"}
                    size={18}
                    color={copied ? GlowColors.primary : Colors.dark.textMuted}
                  />
                </Pressable>
                <Pressable style={styles.iconButton} onPress={handleRegenerate}>
                  <Ionicons name="refresh" size={18} color={Colors.dark.textMuted} />
                </Pressable>
              </>
            ) : null}
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        {planMutation.isPending ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GlowColors.primary} />
            <Text style={styles.loadingTitle}>Analysing your group...</Text>
            <Text style={styles.loadingSubtitle}>
              Reviewing player skill scores, recent feedback, and attendance to build a personalised session plan.
            </Text>
          </View>
        ) : planMutation.isError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.dark.error} />
            <Text style={styles.errorTitle}>Plan generation failed</Text>
            <Text style={styles.errorSubtitle}>
              {(planMutation.error as Error)?.message || "Check that at least 2 registered players are in the session."}
            </Text>
            <Pressable style={styles.retryButton} onPress={() => planMutation.mutate()}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : plan ? (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Theme card */}
            <View style={styles.themeCard}>
              <View style={styles.themeIconRow}>
                <Ionicons name="bulb-outline" size={18} color={GlowColors.primary} />
                <Text style={styles.themeLabel}>SESSION THEME</Text>
              </View>
              <Text style={styles.themeText}>{plan.theme}</Text>
              <Text style={styles.rationaleText}>{plan.rationale}</Text>
            </View>

            {/* Player breakdown */}
            {plan.playerBreakdown.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>PLAYER FOCUS</Text>
                {plan.playerBreakdown.map((p, i) => (
                  <View key={i} style={styles.playerCard}>
                    <View style={styles.playerAvatar}>
                      <Text style={styles.playerAvatarText}>
                        {p.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.playerCardContent}>
                      <Text style={styles.playerName}>{p.name}</Text>
                      <Text style={styles.playerFocus}>{p.focus}</Text>
                      {p.flag ? (
                        <View style={styles.flagBadge}>
                          <Ionicons name="alert-circle" size={11} color={Colors.dark.gold} />
                          <Text style={styles.flagBadgeText}>{p.flag}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Drills */}
            {plan.drills.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>DRILLS</Text>
                {plan.drills.map((drill, i) => (
                  <View key={i} style={styles.drillCard}>
                    <View style={styles.drillNumber}>
                      <Text style={styles.drillNumberText}>{i + 1}</Text>
                    </View>
                    <View style={styles.drillContent}>
                      <Text style={styles.drillTitle}>{drill.title}</Text>
                      <Text style={styles.drillDesc}>{drill.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Flags / Group notes */}
            {plan.flags && plan.flags.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>GROUP NOTES</Text>
                <View style={styles.flagsCard}>
                  {plan.flags.map((flag, i) => (
                    <View key={i} style={styles.flagRow}>
                      <View style={styles.flagDot} />
                      <Text style={styles.flagText}>{flag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Save as session note */}
            <Pressable
              style={[
                styles.saveNoteButton,
                saved && styles.saveNoteButtonSaved,
                saveMutation.isPending && { opacity: 0.6 },
              ]}
              onPress={() => {
                if (saved || saveMutation.isPending || !plan) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                saveMutation.mutate(plan);
              }}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Ionicons
                  name={saved ? "checkmark-circle" : "bookmark-outline"}
                  size={18}
                  color={saved ? GlowColors.primary : Colors.dark.backgroundRoot}
                />
              )}
              <Text style={[styles.saveNoteButtonText, saved && { color: GlowColors.primary }]}>
                {saveMutation.isPending ? "Saving..." : saved ? "Saved as session note" : "Save as session note"}
              </Text>
            </Pressable>

            {generatedAt ? (
              <Text style={styles.timestamp}>
                Generated {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundTertiary,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  headerSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl * 2,
    gap: Spacing.lg,
  },
  loadingTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
  },
  loadingSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl * 2,
    gap: Spacing.lg,
  },
  errorTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
  },
  errorSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: GlowColors.primary,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  themeCard: {
    backgroundColor: GlowColors.primary + "12",
    borderWidth: 1,
    borderColor: GlowColors.primary + "30",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  themeIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  themeLabel: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  themeText: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  rationaleText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GlowColors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  playerAvatarText: {
    ...Typography.body,
    color: GlowColors.primary,
    fontWeight: "700",
  },
  playerCardContent: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  playerFocus: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  flagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  flagBadgeText: {
    ...Typography.caption,
    color: Colors.dark.gold,
  },
  drillCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  drillNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#38BDF820",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  drillNumberText: {
    ...Typography.small,
    color: "#38BDF8",
    fontWeight: "700",
  },
  drillContent: {
    flex: 1,
    gap: 4,
  },
  drillTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  drillDesc: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  flagsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  flagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.gold,
    marginTop: 7,
    flexShrink: 0,
  },
  flagText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  timestamp: {
    ...Typography.caption,
    color: Colors.dark.disabled,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  saveNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  saveNoteButtonSaved: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  saveNoteButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
});
