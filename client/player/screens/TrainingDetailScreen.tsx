import React, { useState, useEffect } from "react";
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
            size={i <= value ? 36 : 32}
            color={i <= value ? color : "rgba(255,255,255,0.35)"}
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

const ENERGY_CHIPS = [
  { label: "Low", color: "#EF4444" },
  { label: "Tired", color: "#F97316" },
  { label: "Okay", color: "#F59E0B" },
  { label: "Good", color: "#84CC16" },
  { label: "Great", color: "#F59E0B" },
];

const FEELING_CHIPS = [
  { label: "Tough", color: "#6366F1" },
  { label: "Okay-ish", color: "#8B5CF6" },
  { label: "Solid", color: "#A78BFA" },
  { label: "Strong", color: "#C084FC" },
  { label: "Excellent", color: "#A78BFA" },
];

function MoodChips({
  chips,
  value,
  onChange,
}: {
  chips: { label: string; color: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={moodChipStyles.row}>
      {chips.map((chip, idx) => {
        const selected = value === idx + 1;
        return (
          <Pressable
            key={chip.label}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(idx + 1);
            }}
            style={[
              moodChipStyles.chip,
              { borderColor: chip.color },
              selected ? { backgroundColor: chip.color } : null,
            ]}
          >
            <Text style={[moodChipStyles.chipText, { color: selected ? "#fff" : chip.color }]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const moodChipStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 11, fontWeight: "600" },
});

const SUGGESTION_CHIPS: Record<string, string[]> = {
  hardest: ["Staying focused", "Footwork", "Consistency", "Mental reset", "Pressure points"],
  learning: ["Backswing", "Positioning", "Stay patient", "Court coverage", "Net approach"],
  next: ["Footwork drills", "Serve warm-up", "Mental reset", "Backhand follow-through"],
};

function SuggestionChips({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: keyof typeof SUGGESTION_CHIPS;
  value: string;
  onChange: (v: string) => void;
}) {
  const chips = SUGGESTION_CHIPS[fieldKey].slice(0, 3);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={suggestionStyles.scroll} contentContainerStyle={suggestionStyles.row}>
      {chips.map((chip) => (
        <Pressable
          key={chip}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const trimmed = value.trim();
            onChange(trimmed ? `${trimmed}, ${chip}` : chip);
          }}
          style={suggestionStyles.chip}
        >
          <Text style={suggestionStyles.chipText}>{chip}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const suggestionStyles = StyleSheet.create({
  scroll: { marginTop: 6 },
  row: { gap: 6, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.45)",
  },
  chipText: { fontSize: 11, color: MIRROR_ACCENT, fontWeight: "500" },
});

function GlowMirrorCard({
  sessionId,
  onSaved,
}: {
  sessionId: string;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: existingReflection, isLoading: reflectionLoading } = useQuery<SessionReflection | null>({
    queryKey: [`/api/player/sessions/${sessionId}/reflection`],
    enabled: !!sessionId,
  });

  const [energyLevel, setEnergyLevel] = useState(0);
  const [overallFeeling, setOverallFeeling] = useState(0);
  const [hardestPart, setHardestPart] = useState("");
  const [keyLearning, setKeyLearning] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  const [saved, setSaved] = useState(false);

  // Sync state when fetched reflection arrives
  useEffect(() => {
    if (existingReflection) {
      setEnergyLevel(existingReflection.energyLevel ?? 0);
      setOverallFeeling(existingReflection.overallFeeling ?? 0);
      setHardestPart(existingReflection.hardestPart ?? "");
      setKeyLearning(existingReflection.keyLearning ?? "");
      setNextFocus(existingReflection.nextFocus ?? "");
      setSaved(true);
    }
  }, [existingReflection?.id]);

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

  if (reflectionLoading) {
    return (
      <View style={mirrorStyles.card}>
        <ActivityIndicator size="small" color={MIRROR_ACCENT} />
      </View>
    );
  }

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
          <View style={mirrorStyles.aiSummaryBlock}>
            <Ionicons name="sparkles-outline" size={14} color={MIRROR_ACCENT} />
            <Text style={mirrorStyles.summaryText}>{existingReflection.aiSummary}</Text>
          </View>
        ) : null}
        <View style={mirrorStyles.savedRows}>
          {existingReflection.energyLevel ? (
            <View style={[mirrorStyles.savedRow, mirrorStyles.savedRowBordered, { borderLeftColor: "#F59E0B" }]}>
              <Text style={mirrorStyles.savedRowLabel}>Energy</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {[1,2,3,4,5].map((s) => (
                  <Ionicons key={s} name="star" size={14} color={s <= (existingReflection.energyLevel ?? 0) ? "#F59E0B" : "rgba(255,255,255,0.2)"} />
                ))}
              </View>
              <Text style={mirrorStyles.savedRowValue}>{ENERGY_LABELS[existingReflection.energyLevel]}</Text>
            </View>
          ) : null}
          {existingReflection.overallFeeling ? (
            <View style={[mirrorStyles.savedRow, mirrorStyles.savedRowBordered, { borderLeftColor: MIRROR_ACCENT }]}>
              <Text style={mirrorStyles.savedRowLabel}>Overall</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {[1,2,3,4,5].map((s) => (
                  <Ionicons key={s} name="star" size={14} color={s <= (existingReflection.overallFeeling ?? 0) ? MIRROR_ACCENT : "rgba(255,255,255,0.2)"} />
                ))}
              </View>
              <Text style={mirrorStyles.savedRowValue}>{FEELING_LABELS[existingReflection.overallFeeling]}</Text>
            </View>
          ) : null}
          {existingReflection.hardestPart ? (
            <View style={[mirrorStyles.savedRow, mirrorStyles.savedRowBordered, { borderLeftColor: "#EF4444" }]}>
              <Ionicons name="flame-outline" size={14} color="#EF4444" />
              <Text style={mirrorStyles.savedRowLabel}>Hardest</Text>
              <Text style={mirrorStyles.savedRowValue}>{existingReflection.hardestPart}</Text>
            </View>
          ) : null}
          {existingReflection.keyLearning ? (
            <View style={[mirrorStyles.savedRow, mirrorStyles.savedRowBordered, { borderLeftColor: "#22C55E" }]}>
              <Ionicons name="bulb-outline" size={14} color="#22C55E" />
              <Text style={mirrorStyles.savedRowLabel}>Learned</Text>
              <Text style={mirrorStyles.savedRowValue}>{existingReflection.keyLearning}</Text>
            </View>
          ) : null}
          {existingReflection.nextFocus ? (
            <View style={[mirrorStyles.savedRow, mirrorStyles.savedRowBordered, { borderLeftColor: GlowColors.primary }]}>
              <Ionicons name="flag-outline" size={14} color={GlowColors.primary} />
              <Text style={mirrorStyles.savedRowLabel}>Next</Text>
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

      <Text style={mirrorStyles.sectionLabel}>
        <Text style={{ color: "#F59E0B" }}>&#9889; </Text>
        {"ENERGY DURING SESSION"}
      </Text>
      <StarPicker value={energyLevel} onChange={setEnergyLevel} color="#F59E0B" />
      <MoodChips chips={ENERGY_CHIPS} value={energyLevel} onChange={setEnergyLevel} />

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.lg }]}>
        <Text style={{ color: MIRROR_ACCENT }}>&#9679; </Text>
        {"OVERALL FEELING"}
      </Text>
      <StarPicker value={overallFeeling} onChange={setOverallFeeling} color={MIRROR_ACCENT} />
      <MoodChips chips={FEELING_CHIPS} value={overallFeeling} onChange={setOverallFeeling} />

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.lg }]}>
        {"WHAT WAS HARDEST? "}
        <Text style={mirrorStyles.optionalLabel}>(optional)</Text>
      </Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={hardestPart}
        onChangeText={setHardestPart}
        placeholder="e.g. staying focused after making errors"
        placeholderTextColor="rgba(255,255,255,0.4)"
        maxLength={120}
        multiline
      />
      <SuggestionChips fieldKey="hardest" value={hardestPart} onChange={setHardestPart} />

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.md }]}>
        {"KEY LEARNING FROM TODAY "}
        <Text style={mirrorStyles.optionalLabel}>(optional)</Text>
      </Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={keyLearning}
        onChangeText={setKeyLearning}
        placeholder="e.g. short backswing on volleys"
        placeholderTextColor="rgba(255,255,255,0.4)"
        maxLength={120}
        multiline
      />
      <SuggestionChips fieldKey="learning" value={keyLearning} onChange={setKeyLearning} />

      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.md }]}>
        {"WHAT WILL YOU FOCUS ON NEXT? "}
        <Text style={mirrorStyles.optionalLabel}>(optional)</Text>
      </Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={nextFocus}
        onChangeText={setNextFocus}
        placeholder="e.g. serve consistency in the warm-up"
        placeholderTextColor="rgba(255,255,255,0.4)"
        maxLength={120}
        multiline
      />
      <SuggestionChips fieldKey="next" value={nextFocus} onChange={setNextFocus} />

      <Pressable
        style={[
          mirrorStyles.saveButton,
          saveMutation.isPending && mirrorStyles.saveButtonDisabled,
        ]}
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? (
          <ActivityIndicator size="small" color={Colors.dark.buttonText} />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={18} color={Colors.dark.buttonText} />
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
  aiSummaryBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: MIRROR_ACCENT + "10",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: MIRROR_ACCENT,
  },
  summaryText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    lineHeight: 18,
    flex: 1,
  },
  savedRows: {
    gap: 8,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  savedRowBordered: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  savedRowLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 60,
  },
  savedRowValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "500",
    flex: 1,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
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
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
});

export default function TrainingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "TrainingDetail">>();
  const sessionId = route.params?.sessionId;
  const { data: training, isLoading } = useQuery<TrainingDetail>({
    queryKey: ["/api/player/training", sessionId],
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
        <GlowMirrorCard
          sessionId={sessionId}
          onSaved={() => {}}
        />
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
