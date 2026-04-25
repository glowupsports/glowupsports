import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

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
  aces?: number;
  doubleFaults?: number;
  winners?: number;
  unforcedErrors?: number;
  glowRankBefore?: number;
  glowRankAfter?: number;
  glowRankChange?: number;
  trustLevel: string;
  player?: {
    id: string;
    name: string;
  };
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
    whatWorked?: string[];
    whatDidntWork?: string[];
    biggestChallenge?: string;
    postMatchEnergy?: string;
    postMatchMood?: string;
    keyTakeaway?: string;
  };
  pillarScores?: {
    technicalScore?: number;
    tacticalScore?: number;
    physicalScore?: number;
    mentalScore?: number;
    socialScore?: number;
    matchScore?: number;
  };
  coachReview?: {
    id: string;
    technicalFeedback?: string;
    tacticalFeedback?: string;
    strengthToReinforce?: string;
    topImprovements?: string[];
    comment?: string;
  };
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
  technical: Colors.dark.xpCyan,
  tactical: Colors.dark.gold,
  physical: Colors.dark.successNeon,
  mental: Colors.dark.ballGlow,
  social: Colors.dark.primary,
  match: Colors.dark.orange,
};

const FEEDBACK_OPTIONS: Record<string, { label: string; options: string[] }> = {
  technical: {
    label: "Technical",
    options: ["Solid technique", "Need work on fundamentals", "Good progress", "Focus on consistency"],
  },
  tactical: {
    label: "Tactical",
    options: ["Good game plan", "Need better shot selection", "Smart tactics", "Improve decision making"],
  },
  physical: {
    label: "Physical",
    options: ["Good fitness", "Need more endurance", "Strong movement", "Work on recovery"],
  },
  mental: {
    label: "Mental",
    options: ["Mentally strong", "Need to stay calm", "Good focus", "Work on pressure handling"],
  },
};

export default function MatchReviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const queryClient = useQueryClient();
  const { matchId } = route.params as { matchId: string };

  const [pillarRatings, setPillarRatings] = useState<Record<string, "good" | "neutral" | "poor">>({});
  const [strengthToReinforce, setStrengthToReinforce] = useState("");
  const [topImprovements, setTopImprovements] = useState<string[]>([]);
  const [newImprovement, setNewImprovement] = useState("");
  const [comment, setComment] = useState("");

  const { data: match, isLoading } = useQuery<MatchDetail>({
    queryKey: [`/api/match-intelligence/matches/${matchId}`],
    enabled: !!matchId,
  });

  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/match-intelligence/matches/${matchId}/review`, {
        method: "POST",
        body: JSON.stringify({
          pillarRatings,
          strengthToReinforce,
          topImprovements,
          comment,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/match-intelligence/matches/${matchId}`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
  });

  const addImprovement = () => {
    if (newImprovement.trim() && topImprovements.length < 3) {
      setTopImprovements([...topImprovements, newImprovement.trim()]);
      setNewImprovement("");
    }
  };

  const removeImprovement = (index: number) => {
    setTopImprovements(topImprovements.filter((_, i) => i !== index));
  };

  const togglePillarRating = (pillar: string, rating: "good" | "neutral" | "poor") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPillarRatings((prev) => ({
      ...prev,
      [pillar]: prev[pillar] === rating ? undefined : rating,
    }));
  };

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
        <Text style={styles.headerTitle}>Coach Review</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollViewCompat style={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={match.result === "win" 
            ? [Colors.success + "20", "transparent"] 
            : [Colors.error + "20", "transparent"]}
          style={styles.matchSummary}
        >
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.playerName}>{match.player?.name || "Player"}</Text>
              <Text style={styles.matchOpponent}>vs {match.opponent?.name || "Unknown"}</Text>
            </View>
            <View style={[
              styles.resultBadge,
              match.result === "win" ? styles.winBadge : styles.lossBadge,
            ]}>
              <Text style={[
                styles.resultText,
                match.result === "win" ? styles.winText : styles.lossText,
              ]}>
                {match.result === "win" ? "WIN" : "LOSS"}
              </Text>
              <Text style={styles.scoreText}>{match.score}</Text>
            </View>
          </View>
          <Text style={styles.matchDate}>
            {new Date(match.matchDate).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </LinearGradient>

        {match.plan && (match.plan.primaryTactic || match.plan.mentalCue) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Player&apos;s Game Plan</Text>
            <View style={styles.planCard}>
              {match.plan.primaryTactic && (
                <Text style={styles.planText}>{match.plan.primaryTactic}</Text>
              )}
              {match.plan.mentalCue && (
                <Text style={styles.planCue}>{match.plan.mentalCue}</Text>
              )}
            </View>
          </View>
        )}

        {match.reflection && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Player&apos;s Reflection</Text>
            <View style={styles.reflectionCard}>
              {match.reflection.whatWorked && match.reflection.whatWorked.length > 0 && (
                <View style={styles.reflectionRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={styles.reflectionLabel}>Worked:</Text>
                  <Text style={styles.reflectionValue}>
                    {match.reflection.whatWorked.join(", ")}
                  </Text>
                </View>
              )}
              {match.reflection.whatDidntWork && match.reflection.whatDidntWork.length > 0 && (
                <View style={styles.reflectionRow}>
                  <Ionicons name="close-circle" size={16} color={Colors.error} />
                  <Text style={styles.reflectionLabel}>Needs work:</Text>
                  <Text style={styles.reflectionValue}>
                    {match.reflection.whatDidntWork.join(", ")}
                  </Text>
                </View>
              )}
              {match.reflection.biggestChallenge && (
                <View style={styles.reflectionRow}>
                  <Ionicons name="alert-circle" size={16} color={Colors.warning} />
                  <Text style={styles.reflectionLabel}>Challenge:</Text>
                  <Text style={styles.reflectionValue}>
                    {match.reflection.biggestChallenge.replace(/_/g, " ")}
                  </Text>
                </View>
              )}
              {match.reflection.keyTakeaway && (
                <View style={styles.takeawayRow}>
                  <Text style={styles.takeawayText}>&quot;{match.reflection.keyTakeaway}&quot;</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Rating</Text>
          <Text style={styles.sectionSubtitle}>
            Tap thumbs to rate each pillar
          </Text>
          
          {Object.entries(PILLAR_ICONS).slice(0, 4).map(([pillar, icon]) => (
            <View key={pillar} style={styles.pillarRow}>
              <View style={styles.pillarInfo}>
                <View style={[styles.pillarIconBg, { backgroundColor: PILLAR_COLORS[pillar] + "20" }]}>
                  <Ionicons name={icon as any} size={18} color={PILLAR_COLORS[pillar]} />
                </View>
                <Text style={styles.pillarLabel}>
                  {pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                </Text>
              </View>
              <View style={styles.ratingButtons}>
                <Pressable
                  style={[
                    styles.ratingButton,
                    pillarRatings[pillar] === "good" && styles.goodRating,
                  ]}
                  onPress={() => togglePillarRating(pillar, "good")}
                >
                  <Ionicons 
                    name="thumbs-up" 
                    size={18} 
                    color={pillarRatings[pillar] === "good" ? Colors.success : Colors.textSecondary} 
                  />
                </Pressable>
                <Pressable
                  style={[
                    styles.ratingButton,
                    pillarRatings[pillar] === "neutral" && styles.neutralRating,
                  ]}
                  onPress={() => togglePillarRating(pillar, "neutral")}
                >
                  <Ionicons 
                    name="remove" 
                    size={18} 
                    color={pillarRatings[pillar] === "neutral" ? Colors.warning : Colors.textSecondary} 
                  />
                </Pressable>
                <Pressable
                  style={[
                    styles.ratingButton,
                    pillarRatings[pillar] === "poor" && styles.poorRating,
                  ]}
                  onPress={() => togglePillarRating(pillar, "poor")}
                >
                  <Ionicons 
                    name="thumbs-down" 
                    size={18} 
                    color={pillarRatings[pillar] === "poor" ? Colors.error : Colors.textSecondary} 
                  />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Strength to Reinforce</Text>
          <TextInput
            style={styles.textInput}
            placeholder="What did the player do well?"
            placeholderTextColor={Colors.textSecondary}
            value={strengthToReinforce}
            onChangeText={setStrengthToReinforce}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Improvements (max 3)</Text>
          {topImprovements.map((improvement, index) => (
            <View key={index} style={styles.improvementItem}>
              <Text style={styles.improvementNumber}>{index + 1}</Text>
              <Text style={styles.improvementText}>{improvement}</Text>
              <Pressable onPress={() => removeImprovement(index)}>
                <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          ))}
          {topImprovements.length < 3 && (
            <View style={styles.addImprovementRow}>
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                placeholder="Add improvement area..."
                placeholderTextColor={Colors.textSecondary}
                value={newImprovement}
                onChangeText={setNewImprovement}
                onSubmitEditing={addImprovement}
              />
              <Pressable
                style={styles.addButton}
                onPress={addImprovement}
              >
                <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coach Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Any additional comments for the player..."
            placeholderTextColor={Colors.textSecondary}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={{ height: insets.bottom + 100 }} />
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={[
            styles.submitButton,
            submitReviewMutation.isPending && styles.disabledButton,
          ]}
          disabled={submitReviewMutation.isPending}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            submitReviewMutation.mutate();
          }}
        >
          <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
          <Text style={styles.submitButtonText}>
            {submitReviewMutation.isPending ? "Saving..." : "Submit Review"}
          </Text>
        </Pressable>
      </View>
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
  matchSummary: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  playerName: {
    ...Typography.title,
    color: Colors.text,
  },
  matchOpponent: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  resultBadge: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  winBadge: {
    backgroundColor: Colors.success + "20",
  },
  lossBadge: {
    backgroundColor: Colors.error + "20",
  },
  resultText: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 1,
  },
  winText: {
    color: Colors.success,
  },
  lossText: {
    color: Colors.error,
  },
  scoreText: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
  },
  matchDate: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.subtitle,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  planCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  planText: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: "600",
  },
  planCue: {
    ...Typography.caption,
    color: Colors.primary,
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
  reflectionCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  reflectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  reflectionLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  reflectionValue: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
  },
  takeawayRow: {
    backgroundColor: Colors.surfaceLight,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  takeawayText: {
    ...Typography.caption,
    color: Colors.text,
    fontStyle: "italic",
  },
  pillarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  pillarInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  pillarLabel: {
    ...Typography.body,
    color: Colors.text,
  },
  ratingButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ratingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
  },
  goodRating: {
    backgroundColor: Colors.success + "20",
    borderWidth: 2,
    borderColor: Colors.success,
  },
  neutralRating: {
    backgroundColor: Colors.warning + "20",
    borderWidth: 2,
    borderColor: Colors.warning,
  },
  poorRating: {
    backgroundColor: Colors.error + "20",
    borderWidth: 2,
    borderColor: Colors.error,
  },
  textInput: {
    backgroundColor: Colors.surfaceLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    color: Colors.text,
    ...Typography.body,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  improvementItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  improvementNumber: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: "700",
    width: 20,
    textAlign: "center",
  },
  improvementText: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
  },
  addImprovementRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
    backgroundColor: Colors.background,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
