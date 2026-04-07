import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type RouteParams = {
  TrainingDetail: {
    sessionId: string;
  };
};

interface DomainImpact {
  domain: string;
  xp: number;
  skillsAffected: { name: string; change: number }[];
}

interface TrainingDetail {
  id: string;
  date: string;
  type: string;
  duration: number;
  coachName: string;
  coachAvatar?: string;
  xpEarned: number;
  feedback: {
    focus: number;
    effort: number;
    message?: string;
  };
  domainImpacts: DomainImpact[];
  focusArea?: string;
}

interface SessionReflection {
  id: string;
  energyLevel: number | null;
  overallFeeling: number | null;
  hardestPart: string | null;
  keyLearning: string | null;
  nextFocus: string | null;
  aiSummary: string | null;
}

const DOMAIN_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  technical: { icon: "construct", color: Colors.dark.primary, label: "Technical" },
  mental: { icon: "brain", color: "#9B59B6", label: "Mental" },
  physical: { icon: "fitness", color: Colors.dark.orange, label: "Physical" },
  tactical: { icon: "compass", color: Colors.dark.gold, label: "Tactical" },
  social: { icon: "people", color: Colors.dark.xpCyan, label: "Social" },
};

const ENERGY_LABELS = ["", "Low", "Tired", "Okay", "Good", "Great"];
const FEELING_LABELS = ["", "Tough", "Okay-ish", "Solid", "Strong", "Excellent"];
const MIRROR_ACCENT = "#A78BFA"; // purple for Glow Mirror

function StarPicker({
  value,
  onChange,
  color = MIRROR_ACCENT,
}: {
  value: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  return (
    <View style={starPickerStyles.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(i);
          }}
          style={starPickerStyles.star}
        >
          <Ionicons
            name={i <= value ? "star" : "star-outline"}
            size={32}
            color={i <= value ? color : Colors.dark.backgroundTertiary}
          />
        </Pressable>
      ))}
    </View>
  );
}

const starPickerStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "center" },
  star: { padding: 4 },
});

function GlowMirrorCard({
  sessionId,
  existingReflection,
  onSaved,
}: {
  sessionId: string;
  existingReflection: SessionReflection | null;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [energyLevel, setEnergyLevel] = useState(existingReflection?.energyLevel ?? 0);
  const [overallFeeling, setOverallFeeling] = useState(existingReflection?.overallFeeling ?? 0);
  const [hardestPart, setHardestPart] = useState(existingReflection?.hardestPart ?? "");
  const [keyLearning, setKeyLearning] = useState(existingReflection?.keyLearning ?? "");
  const [nextFocus, setNextFocus] = useState(existingReflection?.nextFocus ?? "");
  const [saved, setSaved] = useState(!!existingReflection);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/player/sessions/${sessionId}/reflection`, {
        energyLevel: energyLevel || null,
        overallFeeling: overallFeeling || null,
        hardestPart: hardestPart.trim() || null,
        keyLearning: keyLearning.trim() || null,
        nextFocus: nextFocus.trim() || null,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/player/sessions/${sessionId}/reflection`] });
      setSaved(true);
      onSaved();
    },
    onError: () => {
      Alert.alert("Could not save", "Please try again in a moment.");
    },
  });

  if (saved && existingReflection) {
    return (
      <View style={mirrorStyles.card}>
        <View style={mirrorStyles.header}>
          <View style={[mirrorStyles.iconBg, { backgroundColor: MIRROR_ACCENT + "20" }]}>
            <Ionicons name="mic" size={18} color={MIRROR_ACCENT} />
          </View>
          <Text style={mirrorStyles.title}>Your Reflection</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={mirrorStyles.savedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={GlowColors.primary} />
              <Text style={mirrorStyles.savedText}>Saved</Text>
            </View>
            <Pressable
              onPress={() => setSaved(false)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: MIRROR_ACCENT + "60",
              }}
            >
              <Ionicons name="pencil" size={12} color={MIRROR_ACCENT} />
              <Text style={{ fontSize: 12, color: MIRROR_ACCENT }}>Edit</Text>
            </Pressable>
          </View>
        </View>
        {existingReflection.aiSummary ? (
          <Text style={mirrorStyles.summaryText}>{existingReflection.aiSummary}</Text>
        ) : null}
        <View style={mirrorStyles.savedRows}>
          {existingReflection.energyLevel ? (
            <View style={mirrorStyles.savedRow}>
              <Ionicons name="flash-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={mirrorStyles.savedRowLabel}>Energy</Text>
              <Text style={mirrorStyles.savedRowValue}>{ENERGY_LABELS[existingReflection.energyLevel]}</Text>
            </View>
          ) : null}
          {existingReflection.overallFeeling ? (
            <View style={mirrorStyles.savedRow}>
              <Ionicons name="happy-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={mirrorStyles.savedRowLabel}>Overall</Text>
              <Text style={mirrorStyles.savedRowValue}>{FEELING_LABELS[existingReflection.overallFeeling]}</Text>
            </View>
          ) : null}
          {existingReflection.hardestPart ? (
            <View style={mirrorStyles.savedRow}>
              <Ionicons name="flame-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={mirrorStyles.savedRowLabel}>Hardest</Text>
              <Text style={mirrorStyles.savedRowValue}>{existingReflection.hardestPart}</Text>
            </View>
          ) : null}
          {existingReflection.keyLearning ? (
            <View style={mirrorStyles.savedRow}>
              <Ionicons name="bulb-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={mirrorStyles.savedRowLabel}>Learned</Text>
              <Text style={mirrorStyles.savedRowValue}>{existingReflection.keyLearning}</Text>
            </View>
          ) : null}
          {existingReflection.nextFocus ? (
            <View style={mirrorStyles.savedRow}>
              <Ionicons name="flag-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={mirrorStyles.savedRowLabel}>Next focus</Text>
              <Text style={mirrorStyles.savedRowValue}>{existingReflection.nextFocus}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={mirrorStyles.card}>
      <View style={mirrorStyles.header}>
        <View style={[mirrorStyles.iconBg, { backgroundColor: MIRROR_ACCENT + "20" }]}>
          <Ionicons name="mic" size={18} color={MIRROR_ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mirrorStyles.title}>Your Reflection</Text>
          <Text style={mirrorStyles.subtitle}>How did this session feel? Your coach uses this to personalise future training.</Text>
        </View>
      </View>

      <Text style={mirrorStyles.sectionLabel}>Energy during session</Text>
      <StarPicker value={energyLevel} onChange={setEnergyLevel} color="#F59E0B" />
      {energyLevel > 0 ? (
        <Text style={mirrorStyles.ratingLabel}>{ENERGY_LABELS[energyLevel]}</Text>
      ) : null}

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.lg }]}>Overall feeling</Text>
      <StarPicker value={overallFeeling} onChange={setOverallFeeling} color={MIRROR_ACCENT} />
      {overallFeeling > 0 ? (
        <Text style={mirrorStyles.ratingLabel}>{FEELING_LABELS[overallFeeling]}</Text>
      ) : null}

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.lg }]}>What was hardest? <Text style={mirrorStyles.optionalLabel}>(optional)</Text></Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={hardestPart}
        onChangeText={setHardestPart}
        placeholder="e.g. staying focused after making errors"
        placeholderTextColor={Colors.dark.textMuted}
        maxLength={120}
        multiline
      />

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.md }]}>Key learning from today <Text style={mirrorStyles.optionalLabel}>(optional)</Text></Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={keyLearning}
        onChangeText={setKeyLearning}
        placeholder="e.g. short backswing on volleys"
        placeholderTextColor={Colors.dark.textMuted}
        maxLength={120}
        multiline
      />

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.md }]}>What will you focus on next? <Text style={mirrorStyles.optionalLabel}>(optional)</Text></Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={nextFocus}
        onChangeText={setNextFocus}
        placeholder="e.g. serve consistency in the warm-up"
        placeholderTextColor={Colors.dark.textMuted}
        maxLength={120}
        multiline
      />

      <Pressable
        style={[
          mirrorStyles.saveButton,
          saveMutation.isPending && mirrorStyles.saveButtonDisabled,
        ]}
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? (
          <ActivityIndicator size="small" color={Colors.dark.background} />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={18} color={Colors.dark.background} />
            <Text style={mirrorStyles.saveButtonText}>Save Reflection</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const mirrorStyles = StyleSheet.create({
  card: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: MIRROR_ACCENT,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    flex: 1,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
    lineHeight: 18,
    flex: 1,
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  savedText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  summaryText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  savedRows: {
    gap: 8,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  savedRowLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 70,
  },
  savedRowValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "500",
    flex: 1,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  optionalLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "none",
    fontStyle: "italic",
  },
  ratingLabel: {
    ...Typography.small,
    color: MIRROR_ACCENT,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.small,
    color: Colors.dark.text,
    minHeight: 60,
    textAlignVertical: "top",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...Typography.body,
    color: Colors.dark.background,
    fontWeight: "700",
  },
});

export default function TrainingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "TrainingDetail">>();
  const sessionId = route.params?.sessionId;
  const [reflectionSaved, setReflectionSaved] = useState(false);

  const { data: training, isLoading } = useQuery<TrainingDetail>({
    queryKey: ["/api/player/training", sessionId],
    enabled: !!sessionId,
  });

  const { data: existingReflection, isLoading: reflectionLoading } = useQuery<SessionReflection | null>({
    queryKey: [`/api/player/sessions/${sessionId}/reflection`],
    enabled: !!sessionId,
  });

  if (!training && !isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Training Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="fitness-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>Training session not found</Text>
          <Text style={styles.emptySubtitle}>This session may have been removed or is no longer available</Text>
        </View>
      </View>
    );
  }

  if (!training) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  const data = training;
  const date = new Date(data.date);
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Training Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sessionHeader}>
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionDate}>{dateStr}</Text>
            <Text style={styles.sessionType}>
              {data.type === "private" ? "Private Session" :
               data.type === "group" ? "Group Training" : "Training Session"}
            </Text>
          </View>
          <View style={styles.totalXpBadge}>
            <Ionicons name="flash" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.totalXpText}>+{data.xpEarned} XP</Text>
          </View>
        </View>

        <View style={styles.coachCard}>
          <View style={styles.coachAvatar}>
            <Ionicons name="person" size={24} color={Colors.dark.text} />
          </View>
          <View style={styles.coachInfo}>
            <Text style={styles.coachName}>{data.coachName}</Text>
            <Text style={styles.coachRole}>Your Coach</Text>
          </View>
          <View style={styles.durationBadge}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.durationText}>{data.duration} min</Text>
          </View>
        </View>

        {data.focusArea ? (
          <View style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <Ionicons name="flag" size={18} color={Colors.dark.primary} />
              <Text style={styles.focusLabel}>Session Focus</Text>
            </View>
            <Text style={styles.focusValue}>{data.focusArea}</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbubble-ellipses" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>Coach Feedback</Text>
          </View>
          <Text style={styles.feedbackText}>
            "{data.feedback.message || "No written feedback for this session."}"
          </Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Focus</Text>
              <View style={styles.metricDots}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.metricDot,
                      i <= data.feedback.focus && styles.metricDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Effort</Text>
              <View style={styles.metricDots}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.metricDot,
                      i <= data.feedback.effort && styles.metricDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trending-up" size={18} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Skill Impact</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Skills affected by this training session
          </Text>
          {data.domainImpacts.map((impact) => {
            const config = DOMAIN_CONFIG[impact.domain] || DOMAIN_CONFIG.technical;
            return (
              <View key={impact.domain} style={styles.domainImpactCard}>
                <View style={styles.domainHeader}>
                  <View style={[styles.domainIcon, { backgroundColor: `${config.color}20` }]}>
                    <Ionicons name={config.icon as any} size={18} color={config.color} />
                  </View>
                  <Text style={styles.domainLabel}>{config.label}</Text>
                  <View style={styles.domainXpBadge}>
                    <Text style={[styles.domainXpText, { color: config.color }]}>+{impact.xp} XP</Text>
                  </View>
                </View>
                <View style={styles.skillsList}>
                  {impact.skillsAffected.map((skill, idx) => (
                    <View key={idx} style={styles.skillRow}>
                      <Text style={styles.skillName}>{skill.name}</Text>
                      <Text style={styles.skillChange}>+{skill.change}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash" size={18} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>XP Breakdown</Text>
          </View>
          <View style={styles.xpBreakdown}>
            {data.domainImpacts.map((impact) => {
              const config = DOMAIN_CONFIG[impact.domain] || DOMAIN_CONFIG.technical;
              const percentage = data.xpEarned > 0 ? Math.round((impact.xp / data.xpEarned) * 100) : 0;
              return (
                <View key={impact.domain} style={styles.xpBreakdownRow}>
                  <View style={styles.xpBreakdownLabel}>
                    <View style={[styles.xpDot, { backgroundColor: config.color }]} />
                    <Text style={styles.xpBreakdownDomain}>{config.label}</Text>
                  </View>
                  <View style={styles.xpBreakdownBar}>
                    <View
                      style={[
                        styles.xpBreakdownFill,
                        { width: `${percentage}%`, backgroundColor: config.color }
                      ]}
                    />
                  </View>
                  <Text style={styles.xpBreakdownValue}>+{impact.xp}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total XP Earned</Text>
            <Text style={styles.totalValue}>+{data.xpEarned} XP</Text>
          </View>
        </View>

        {/* Glow Mirror — Player Voice Check-in */}
        {!reflectionLoading ? (
          <GlowMirrorCard
            sessionId={sessionId}
            existingReflection={existingReflection ?? null}
            onSaved={() => setReflectionSaved(true)}
          />
        ) : (
          <View style={styles.sectionCard}>
            <ActivityIndicator size="small" color={MIRROR_ACCENT} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionDate: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  totalXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  totalXpText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  coachCard: {
    ...CardStyles.elevated,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  coachInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachRole: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  durationText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  focusCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: GlowColors.primary,
  },
  focusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  focusLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  focusValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  sectionCard: {
    ...CardStyles.elevated,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  feedbackText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontStyle: "italic",
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing["2xl"],
  },
  metricItem: {
    gap: 6,
  },
  metricLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  metricDots: {
    flexDirection: "row",
    gap: 4,
  },
  metricDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  metricDotActive: {
    backgroundColor: GlowColors.primary,
  },
  domainImpactCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  domainIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  domainLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginLeft: Spacing.sm,
    flex: 1,
  },
  domainXpBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  domainXpText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  skillsList: {
    marginLeft: 40,
  },
  skillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  skillName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  skillChange: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  xpBreakdown: {
    gap: Spacing.md,
  },
  xpBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  xpBreakdownLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: 90,
  },
  xpDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  xpBreakdownDomain: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  xpBreakdownBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  xpBreakdownFill: {
    height: "100%",
    borderRadius: 4,
  },
  xpBreakdownValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    width: 40,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  totalLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  totalValue: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  emptySubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
