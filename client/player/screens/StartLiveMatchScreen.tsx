import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type StartLiveMatchParams = {
  opponentId: string;
  opponentName: string;
  challengeId?: string;
};

const SPORTS = [
  { value: "tennis", label: "Tennis" },
  { value: "padel", label: "Padel" },
  { value: "pickleball", label: "Pickleball" },
];

const FORMATS = [
  { value: "best_of_3", label: "Best of 3 Sets" },
  { value: "best_of_1", label: "1 Set" },
  { value: "best_of_5", label: "Best of 5 Sets" },
  { value: "tiebreak_only", label: "Tiebreak Only" },
];

const SCORING_MODES = [
  { value: "standard", label: "Standard (Deuce/Ad)" },
  { value: "no_ad", label: "No-Ad (Sudden Death)" },
];

type PickerRowProps = {
  label: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (v: string) => void;
};

function PickerRow({ label, options, selected, onSelect }: PickerRowProps) {
  return (
    <View style={styles.pickerSection}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.chip, selected === opt.value && styles.chipSelected]}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(opt.value);
            }}
          >
            <Text
              style={[
                styles.chipText,
                selected === opt.value && styles.chipTextSelected,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function StartLiveMatchScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ StartLiveMatch: StartLiveMatchParams }, "StartLiveMatch">>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();

  const { opponentId, opponentName, challengeId } = route.params;

  const [sport, setSport] = useState("tennis");
  const [matchFormat, setMatchFormat] = useState("best_of_3");
  const [scoringMode, setScoringMode] = useState("standard");

  const createMatch = useMutation({
    mutationFn: async () => {
      const result = await apiRequest<{ match: { id: string } }>(
        "POST",
        "/api/live-scoring/matches",
        {
          opponentIds: [opponentId],
          sport,
          matchType: "singles",
          matchFormat,
          scoringMode,
          challengeId: challengeId || undefined,
        },
      );
      return result;
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace("MatchLive", {
        matchId: data.match.id,
        opponentName,
        opponentId,
        sport,
        matchFormat,
        scoringMode,
      });
    },
    onError: () => {
      Alert.alert("Error", "Could not start match. Please try again.");
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: Backgrounds.root }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing["2xl"] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.opponentCard}>
          <View style={styles.opponentAvatar}>
            <Text style={styles.opponentInitial}>
              {opponentName?.charAt(0)?.toUpperCase() || "?"}
            </Text>
          </View>
          <View style={styles.opponentInfo}>
            <Text style={styles.vs}>vs</Text>
            <Text style={styles.opponentName}>{opponentName}</Text>
          </View>
        </View>

        <PickerRow
          label="Sport"
          options={SPORTS}
          selected={sport}
          onSelect={setSport}
        />

        <PickerRow
          label="Match Format"
          options={FORMATS}
          selected={matchFormat}
          onSelect={setMatchFormat}
        />

        <PickerRow
          label="Scoring Mode"
          options={SCORING_MODES}
          selected={scoringMode}
          onSelect={setScoringMode}
        />

        <View style={styles.noteCard}>
          <Feather name="info" size={15} color={Colors.dark.textMuted} />
          <Text style={styles.noteText}>
            Scores are saved in real time. Friends and coaches can follow along live.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.8 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            createMatch.mutate();
          }}
          disabled={createMatch.isPending}
        >
          {createMatch.isPending ? (
            <ActivityIndicator color={Colors.dark.buttonText} />
          ) : (
            <>
              <Feather name="play-circle" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.startButtonText}>Start Live Match</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  opponentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: Spacing.xs,
  },
  opponentAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(204,255,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(204,255,0,0.25)",
  },
  opponentInitial: {
    fontSize: 24,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  opponentInfo: {
    flex: 1,
    gap: 2,
  },
  vs: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  opponentName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  pickerSection: {
    gap: Spacing.sm,
  },
  pickerLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipSelected: {
    backgroundColor: "rgba(204,255,0,0.12)",
    borderColor: GlowColors.primary,
  },
  chipText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: GlowColors.primary,
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  noteText: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
}));
