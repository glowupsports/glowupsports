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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const MIRROR_ACCENT = "#A78BFA";

interface MatchDetail {
  id: string;
  matchDate: string;
  result: string;
  score: string;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  durationMinutes?: number;
  matchType: string;
  venue?: string;
  surface?: string;
  aces?: number;
  doubleFaults?: number;
  winners?: number;
  unforcedErrors?: number;
  glowRankBefore?: number;
  glowRankAfter?: number;
  glowRankChange?: number;
  trustLevel: string;
  opponent?: {
    id: string;
    name: string;
    club?: string;
    playstyleTags?: string[];
  };
  plan?: {
    primaryTactic?: string;
    mentalCue?: string;
    energyFocus?: string;
  };
  reflection?: {
    preMatchMood?: string;
    preMatchConfidence?: number;
    preMatchGoal?: string;
    whatWorked?: string[];
    whatDidntWork?: string[];
    biggestChallenge?: string;
    postMatchEnergy?: string;
    postMatchMood?: string;
    postMatchConfidence?: number;
    keyTakeaway?: string;
  };
  pillarScores?: {
    technicalScore?: number;
    tacticalScore?: number;
    physicalScore?: number;
    mentalScore?: number;
    socialScore?: number;
    matchScore?: number;
    technicalStatus?: string;
    tacticalStatus?: string;
    physicalStatus?: string;
    mentalStatus?: string;
    socialStatus?: string;
    matchStatus?: string;
    technicalInsight?: string;
    tacticalInsight?: string;
    physicalInsight?: string;
    mentalInsight?: string;
    socialInsight?: string;
    matchInsight?: string;
  };
  trainingSuggestions?: Array<{
    focusArea: string;
    pillar: string;
    priority: number;
    suggestedWeeks: number;
  }>;
  coachReview?: {
    technicalFeedback?: string;
    tacticalFeedback?: string;
    physicalFeedback?: string;
    mentalFeedback?: string;
    topImprovements?: string[];
    strengthToReinforce?: string;
    comment?: string;
  };
}

interface MatchReflectionData {
  id?: string;
  preMatchMood?: string | null;
  preMatchConfidence?: number | null;
  preMatchGoal?: string | null;
  whatWorked?: string[];
  whatDidntWork?: string[];
  biggestChallenge?: string | null;
  postMatchEnergy?: string | null;
  postMatchMood?: string | null;
  postMatchConfidence?: number | null;
  keyTakeaway?: string | null;
}

const PILLAR_ICONS: Record<string, string> = {
  technical: "hammer-outline",
  tactical: "bulb-outline",
  physical: "fitness-outline",
  mental: "brain-outline",
  social: "people-outline",
  match: "trophy-outline",
};

const PILLAR_COLORS: Record<string, string> = {
  technical: Colors.dark?.xpCyan || "#00D4FF",
  tactical: Colors.dark?.gold || "#FFD700",
  physical: Colors.dark?.successNeon || "#39FF14",
  mental: Colors.dark?.ballGlow || "#A78BFA",
  social: Colors.dark?.primary || "#C8FF3D",
  match: Colors.dark?.orange || "#FF6B00",
};

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  good: { icon: "checkmark-circle", color: Colors.success },
  warning: { icon: "alert-circle", color: Colors.warning },
  poor: { icon: "close-circle", color: Colors.error },
};

const WHAT_WORKED_OPTIONS = ["serve", "return", "forehand", "backhand", "volleys", "movement", "tactics", "mental"];
const CHALLENGE_OPTIONS = ["errors", "nerves", "fitness", "opponent_strength", "tactics", "concentration"];

function ChipSelector({
  options,
  selected,
  onToggle,
  single = false,
  color = MIRROR_ACCENT,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  single?: boolean;
  color?: string;
}) {
  return (
    <View style={chipStyles.row}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggle(opt);
            }}
            style={[chipStyles.chip, active && { backgroundColor: color + "30", borderColor: color }]}
          >
            <Text style={[chipStyles.chipText, active && { color }]}>
              {opt.replace(/_/g, " ")}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark?.backgroundTertiary || "#333",
  },
  chipText: { ...Typography.small, color: Colors.dark?.textMuted || "#888" },
});

function GlowMirrorMatchCard({ matchId, matchDate }: { matchId: string; matchDate: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: reflection, isLoading } = useQuery<MatchReflectionData | null>({
    queryKey: [`/api/player/me/matches/${matchId}/reflection`],
    enabled: !!matchId,
  });

  const [preMatchMood, setPreMatchMood] = useState<string>("");
  const [preMatchConfidence, setPreMatchConfidence] = useState<number>(0);
  const [preMatchGoal, setPreMatchGoal] = useState<string>("");
  const [whatWorked, setWhatWorked] = useState<string[]>([]);
  const [whatDidntWork, setWhatDidntWork] = useState<string[]>([]);
  const [biggestChallenge, setBiggestChallenge] = useState<string>("");
  const [keyTakeaway, setKeyTakeaway] = useState<string>("");

  const initForm = (r: MatchReflectionData) => {
    setPreMatchMood(r.preMatchMood || "");
    setPreMatchConfidence(r.preMatchConfidence || 0);
    setPreMatchGoal(r.preMatchGoal || "");
    setWhatWorked(r.whatWorked || []);
    setWhatDidntWork(r.whatDidntWork || []);
    setBiggestChallenge(r.biggestChallenge || "");
    setKeyTakeaway(r.keyTakeaway || "");
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/player/me/matches/${matchId}/reflection`, {
        preMatchMood: preMatchMood || null,
        preMatchConfidence: preMatchConfidence || null,
        preMatchGoal: preMatchGoal.trim() || null,
        whatWorked,
        whatDidntWork,
        biggestChallenge: biggestChallenge || null,
        keyTakeaway: keyTakeaway.trim() || null,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/player/me/matches/${matchId}/reflection`] });
      setEditing(false);
    },
    onError: () => {
      Alert.alert("Could not save", "Please try again in a moment.");
    },
  });

  const toggleChip = (arr: string[], setArr: (v: string[]) => void, val: string, single?: boolean) => {
    if (single) {
      setArr(arr.includes(val) ? [] : [val]);
    } else {
      setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
    }
  };

  if (isLoading) {
    return (
      <View style={mirrorStyles.card}>
        <ActivityIndicator size="small" color={MIRROR_ACCENT} />
      </View>
    );
  }

  const hasReflection = reflection && (
    reflection.preMatchMood || reflection.whatWorked?.length || reflection.keyTakeaway
  );

  if (hasReflection && !editing) {
    return (
      <View style={mirrorStyles.card}>
        <View style={mirrorStyles.header}>
          <View style={mirrorStyles.iconBg}>
            <Ionicons name="mic" size={16} color={MIRROR_ACCENT} />
          </View>
          <Text style={mirrorStyles.title}>Your Reflection</Text>
          <Pressable
            onPress={() => initForm(reflection)}
            style={mirrorStyles.editBtn}
          >
            <Ionicons name="pencil" size={14} color={MIRROR_ACCENT} />
            <Text style={mirrorStyles.editText}>Edit</Text>
          </Pressable>
        </View>

        {(reflection.preMatchMood || reflection.preMatchGoal) ? (
          <View style={[mirrorStyles.section, mirrorStyles.preSection]}>
            <Text style={mirrorStyles.sectionLabel}>Before the match</Text>
            {reflection.preMatchMood ? (
              <View style={mirrorStyles.dataRow}>
                <Ionicons name="happy-outline" size={14} color={MIRROR_ACCENT} />
                <Text style={mirrorStyles.dataLabel}>Mood:</Text>
                <Text style={mirrorStyles.dataValue}>{reflection.preMatchMood.charAt(0).toUpperCase() + reflection.preMatchMood.slice(1)}</Text>
              </View>
            ) : null}
            {reflection.preMatchConfidence ? (
              <View style={mirrorStyles.dataRow}>
                <Ionicons name="flash-outline" size={14} color={MIRROR_ACCENT} />
                <Text style={mirrorStyles.dataLabel}>Confidence:</Text>
                <Text style={mirrorStyles.dataValue}>{reflection.preMatchConfidence}/10</Text>
              </View>
            ) : null}
            {reflection.preMatchGoal ? (
              <View style={mirrorStyles.dataRow}>
                <Ionicons name="flag-outline" size={14} color={MIRROR_ACCENT} />
                <Text style={mirrorStyles.dataLabel}>Goal:</Text>
                <Text style={mirrorStyles.dataValue}>{reflection.preMatchGoal}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={mirrorStyles.section}>
          <Text style={mirrorStyles.sectionLabel}>After the match</Text>
          {reflection.whatWorked && reflection.whatWorked.length > 0 ? (
            <View style={mirrorStyles.dataRow}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={mirrorStyles.dataLabel}>Worked:</Text>
              <Text style={mirrorStyles.dataValue}>{reflection.whatWorked.join(", ")}</Text>
            </View>
          ) : null}
          {reflection.whatDidntWork && reflection.whatDidntWork.length > 0 ? (
            <View style={mirrorStyles.dataRow}>
              <Ionicons name="close-circle" size={14} color={Colors.error} />
              <Text style={mirrorStyles.dataLabel}>Struggled:</Text>
              <Text style={mirrorStyles.dataValue}>{reflection.whatDidntWork.join(", ")}</Text>
            </View>
          ) : null}
          {reflection.biggestChallenge ? (
            <View style={mirrorStyles.dataRow}>
              <Ionicons name="alert-circle" size={14} color={Colors.warning} />
              <Text style={mirrorStyles.dataLabel}>Challenge:</Text>
              <Text style={mirrorStyles.dataValue}>{reflection.biggestChallenge.replace(/_/g, " ")}</Text>
            </View>
          ) : null}
          {reflection.keyTakeaway ? (
            <Text style={mirrorStyles.takeaway}>"{reflection.keyTakeaway}"</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={mirrorStyles.card}>
      <View style={mirrorStyles.header}>
        <View style={mirrorStyles.iconBg}>
          <Ionicons name="mic" size={16} color={MIRROR_ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mirrorStyles.title}>Your Reflection</Text>
          <Text style={mirrorStyles.subtitle}>How did this match go? Coaches use this for next-session prep.</Text>
        </View>
      </View>

      {/* PRE-MATCH */}
      <Text style={mirrorStyles.sectionLabel}>Pre-match mindset</Text>
      <Text style={mirrorStyles.fieldLabel}>How were you feeling?</Text>
      <ChipSelector
        options={["nervous", "focused", "flat", "confident", "excited"]}
        selected={preMatchMood ? [preMatchMood] : []}
        onToggle={(v) => setPreMatchMood(preMatchMood === v ? "" : v)}
        single
        color={MIRROR_ACCENT}
      />

      <Text style={[mirrorStyles.fieldLabel, { marginTop: Spacing.md }]}>
        Confidence (1-10): {preMatchConfidence > 0 ? preMatchConfidence : "–"}
      </Text>
      <View style={mirrorStyles.confidenceRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPreMatchConfidence(n);
            }}
            style={[
              mirrorStyles.confidenceBtn,
              preMatchConfidence >= n && { backgroundColor: MIRROR_ACCENT },
            ]}
          >
            <Text style={[mirrorStyles.confidenceBtnText, preMatchConfidence >= n && { color: "#000" }]}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[mirrorStyles.fieldLabel, { marginTop: Spacing.md }]}>Match goal (optional)</Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={preMatchGoal}
        onChangeText={setPreMatchGoal}
        placeholder="e.g. stay aggressive on the first ball"
        placeholderTextColor={Colors.dark?.textMuted || "#888"}
        maxLength={80}
      />

      {/* POST-MATCH */}
      <Text style={[mirrorStyles.sectionLabel, { marginTop: Spacing.lg }]}>Post-match review</Text>

      <Text style={mirrorStyles.fieldLabel}>What worked?</Text>
      <ChipSelector
        options={WHAT_WORKED_OPTIONS}
        selected={whatWorked}
        onToggle={(v) => toggleChip(whatWorked, setWhatWorked, v)}
        color={Colors.success || "#22C55E"}
      />

      <Text style={[mirrorStyles.fieldLabel, { marginTop: Spacing.md }]}>What didn't work?</Text>
      <ChipSelector
        options={WHAT_WORKED_OPTIONS}
        selected={whatDidntWork}
        onToggle={(v) => toggleChip(whatDidntWork, setWhatDidntWork, v)}
        color={Colors.error || "#EF4444"}
      />

      <Text style={[mirrorStyles.fieldLabel, { marginTop: Spacing.md }]}>Biggest challenge</Text>
      <ChipSelector
        options={CHALLENGE_OPTIONS}
        selected={biggestChallenge ? [biggestChallenge] : []}
        onToggle={(v) => setBiggestChallenge(biggestChallenge === v ? "" : v)}
        single
        color={Colors.warning || "#F59E0B"}
      />

      <Text style={[mirrorStyles.fieldLabel, { marginTop: Spacing.md }]}>Key takeaway (optional)</Text>
      <TextInput
        style={mirrorStyles.textInput}
        value={keyTakeaway}
        onChangeText={setKeyTakeaway}
        placeholder="One thing you'll remember..."
        placeholderTextColor={Colors.dark?.textMuted || "#888"}
        maxLength={100}
        multiline
      />

      <View style={mirrorStyles.buttonRow}>
        {editing ? (
          <Pressable onPress={() => setEditing(false)} style={mirrorStyles.cancelBtn}>
            <Text style={mirrorStyles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[mirrorStyles.saveButton, saveMutation.isPending && { opacity: 0.6 }]}
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={16} color="#000" />
              <Text style={mirrorStyles.saveText}>Save Reflection</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const mirrorStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark?.backgroundSecondary || "#1A1A2E",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: MIRROR_ACCENT,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, marginBottom: Spacing.xs },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MIRROR_ACCENT + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { ...Typography.body, color: Colors.dark?.text || "#FFF", fontWeight: "700", flex: 1 },
  subtitle: { ...Typography.small, color: Colors.dark?.textMuted || "#888", lineHeight: 18, flex: 1 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: MIRROR_ACCENT + "60",
  },
  editText: { ...Typography.caption, color: MIRROR_ACCENT },
  section: { gap: 6 },
  preSection: {
    borderLeftWidth: 2,
    borderLeftColor: MIRROR_ACCENT + "40",
    paddingLeft: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.caption,
    color: MIRROR_ACCENT,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  fieldLabel: { ...Typography.caption, color: Colors.dark?.textMuted || "#888", marginBottom: 6 },
  dataRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dataLabel: { ...Typography.caption, color: Colors.dark?.textMuted || "#888", width: 70 },
  dataValue: { ...Typography.small, color: Colors.dark?.text || "#FFF", flex: 1 },
  takeaway: {
    ...Typography.small,
    color: Colors.dark?.text || "#FFF",
    fontStyle: "italic",
    marginTop: Spacing.xs,
    paddingLeft: Spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: MIRROR_ACCENT + "40",
  },
  confidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  confidenceBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.dark?.backgroundTertiary || "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  confidenceBtnText: { ...Typography.caption, color: Colors.dark?.textMuted || "#888", fontWeight: "600" },
  textInput: {
    backgroundColor: Colors.dark?.backgroundTertiary || "#333",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.small,
    color: Colors.dark?.text || "#FFF",
    minHeight: 44,
  },
  buttonRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark?.backgroundTertiary || "#333",
    alignItems: "center",
  },
  cancelText: { ...Typography.body, color: Colors.dark?.textMuted || "#888" },
  saveButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  saveText: { ...Typography.body, color: "#000", fontWeight: "700" },
});

const renderPillarCard = (pillar: string, score?: number, status?: string, insight?: string) => {
  const statusInfo = status ? STATUS_ICONS[status] : null;
  return (
    <View key={pillar} style={styles.pillarCard}>
      <View style={styles.pillarHeader}>
        <View style={[styles.pillarIcon, { backgroundColor: PILLAR_COLORS[pillar] + "20" }]}>
          <Ionicons
            name={PILLAR_ICONS[pillar] as any}
            size={20}
            color={PILLAR_COLORS[pillar]}
          />
        </View>
        <Text style={styles.pillarName}>{pillar.charAt(0).toUpperCase() + pillar.slice(1)}</Text>
        {statusInfo ? (
          <Ionicons name={statusInfo.icon as any} size={20} color={statusInfo.color} />
        ) : null}
      </View>
      {score !== undefined ? (
        <View style={styles.scoreBar}>
          <View style={[styles.scoreProgress, { width: `${score}%`, backgroundColor: PILLAR_COLORS[pillar] }]} />
        </View>
      ) : null}
      {insight ? (
        <Text style={styles.pillarInsight}>{insight}</Text>
      ) : null}
    </View>
  );
};

export default function MatchDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { matchId } = route.params as { matchId: string };

  const { data: match, isLoading } = useQuery<MatchDetail>({
    queryKey: [`/api/match-intelligence/matches/${matchId}`],
    enabled: !!matchId,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Match not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Match Review</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={match.result === "win"
            ? [Colors.success + "30", "transparent"]
            : [Colors.error + "30", "transparent"]}
          style={styles.resultCard}
        >
          <Text style={styles.resultLabel}>
            {match.result === "win" ? "VICTORY" : "DEFEAT"}
          </Text>
          <Text style={styles.scoreText}>{match.score}</Text>

          {match.opponent ? (
            <Text style={styles.opponentText}>vs {match.opponent.name}</Text>
          ) : null}

          <View style={styles.matchMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText}>
                {new Date(match.matchDate).toLocaleDateString()}
              </Text>
            </View>
            {match.durationMinutes ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{match.durationMinutes} min</Text>
              </View>
            ) : null}
            {match.venue ? (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{match.venue}</Text>
              </View>
            ) : null}
          </View>

          {match.glowRankChange !== undefined && match.glowRankChange !== 0 ? (
            <View style={[
              styles.rankChangeBadge,
              match.glowRankChange > 0 ? styles.positiveRankBadge : styles.negativeRankBadge,
            ]}>
              <Ionicons
                name={match.glowRankChange > 0 ? "trending-up" : "trending-down"}
                size={16}
                color={match.glowRankChange > 0 ? Colors.success : Colors.error}
              />
              <Text style={[
                styles.rankChangeText,
                match.glowRankChange > 0 ? styles.positiveRankText : styles.negativeRankText,
              ]}>
                {match.glowRankChange > 0 ? "+" : ""}{match.glowRankChange} Glow Rank
              </Text>
            </View>
          ) : null}
        </LinearGradient>

        {match.plan && (match.plan.primaryTactic || match.plan.mentalCue) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tactical Reality Check</Text>
            <View style={styles.tacticalCard}>
              <Text style={styles.tacticalLabel}>Your Game Plan</Text>
              {match.plan.primaryTactic ? (
                <Text style={styles.tacticalText}>{match.plan.primaryTactic}</Text>
              ) : null}
              {match.plan.mentalCue ? (
                <Text style={styles.tacticalCue}>{match.plan.mentalCue}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {match.pillarScores ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance Breakdown</Text>
            <View style={styles.pillarGrid}>
              {renderPillarCard("technical", match.pillarScores.technicalScore, match.pillarScores.technicalStatus, match.pillarScores.technicalInsight)}
              {renderPillarCard("tactical", match.pillarScores.tacticalScore, match.pillarScores.tacticalStatus, match.pillarScores.tacticalInsight)}
              {renderPillarCard("physical", match.pillarScores.physicalScore, match.pillarScores.physicalStatus, match.pillarScores.physicalInsight)}
              {renderPillarCard("mental", match.pillarScores.mentalScore, match.pillarScores.mentalStatus, match.pillarScores.mentalInsight)}
              {renderPillarCard("social", match.pillarScores.socialScore, match.pillarScores.socialStatus, match.pillarScores.socialInsight)}
              {renderPillarCard("match", match.pillarScores.matchScore, match.pillarScores.matchStatus, match.pillarScores.matchInsight)}
            </View>
          </View>
        ) : null}

        {match.trainingSuggestions && match.trainingSuggestions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommended Training Focus</Text>
            {match.trainingSuggestions.map((suggestion, index) => (
              <View key={index} style={styles.suggestionCard}>
                <View style={[styles.priorityBadge, { backgroundColor: PILLAR_COLORS[suggestion.pillar] + "20" }]}>
                  <Text style={[styles.priorityText, { color: PILLAR_COLORS[suggestion.pillar] }]}>
                    #{suggestion.priority}
                  </Text>
                </View>
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionArea}>
                    {suggestion.focusArea.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Text>
                  <Text style={styles.suggestionMeta}>
                    {suggestion.pillar} - {suggestion.suggestedWeeks} weeks
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </View>
            ))}
          </View>
        ) : null}

        {match.coachReview ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Coach Review</Text>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
            <View style={styles.coachReviewCard}>
              {match.coachReview.strengthToReinforce ? (
                <View style={styles.coachSection}>
                  <Text style={styles.coachLabel}>Strength to Reinforce</Text>
                  <Text style={styles.coachStrength}>{match.coachReview.strengthToReinforce}</Text>
                </View>
              ) : null}
              {match.coachReview.topImprovements && match.coachReview.topImprovements.length > 0 ? (
                <View style={styles.coachSection}>
                  <Text style={styles.coachLabel}>Top Improvements</Text>
                  {match.coachReview.topImprovements.map((item, index) => (
                    <View key={index} style={styles.improvementRow}>
                      <Text style={styles.improvementNumber}>{index + 1}</Text>
                      <Text style={styles.improvementText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {match.coachReview.comment ? (
                <View style={styles.coachSection}>
                  <Text style={styles.coachLabel}>Coach Notes</Text>
                  <Text style={styles.coachComment}>"{match.coachReview.comment}"</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Glow Mirror — Match Reflection */}
        <View style={styles.section}>
          <GlowMirrorMatchCard matchId={matchId} matchDate={match.matchDate} />
        </View>

        <View style={{ height: insets.bottom + Spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    padding: Spacing.sm,
  },
  headerTitle: {
    ...Typography.subtitle,
    color: Colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    ...Typography.body,
    color: Colors.error,
    textAlign: "center",
    marginTop: Spacing.xl,
  },
  resultCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  resultLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  scoreText: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.text,
  },
  opponentText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  matchMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    ...Typography.small,
    color: Colors.textSecondary,
  },
  rankChangeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  positiveRankBadge: {
    backgroundColor: Colors.success + "20",
  },
  negativeRankBadge: {
    backgroundColor: Colors.error + "20",
  },
  rankChangeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  positiveRankText: {
    color: Colors.success,
  },
  negativeRankText: {
    color: Colors.error,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.subtitle,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  tacticalCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  tacticalLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  tacticalText: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
  },
  tacticalCue: {
    ...Typography.body,
    color: GlowColors.primary,
    fontStyle: "italic",
    marginTop: Spacing.xs,
  },
  pillarGrid: {
    gap: Spacing.sm,
  },
  pillarCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  pillarName: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
    flex: 1,
  },
  scoreBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreProgress: {
    height: "100%",
    borderRadius: 3,
  },
  pillarInsight: {
    ...Typography.small,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  priorityBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  priorityText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionArea: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
  },
  suggestionMeta: {
    ...Typography.small,
    color: Colors.textSecondary,
    marginTop: 2,
    textTransform: "capitalize",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.success + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  verifiedText: {
    ...Typography.caption,
    color: Colors.success,
  },
  coachReviewCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  coachSection: {
    gap: Spacing.xs,
  },
  coachLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  coachStrength: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
  },
  improvementRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  improvementNumber: {
    ...Typography.body,
    color: GlowColors.primary,
    fontWeight: "700",
    width: 20,
  },
  improvementText: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
  },
  coachComment: {
    ...Typography.body,
    color: Colors.text,
    fontStyle: "italic",
  },
});
