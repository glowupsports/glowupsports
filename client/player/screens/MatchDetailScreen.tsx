import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
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
    // Pre-match (Glow Mirror)
    preMatchMood?: string;
    preMatchConfidence?: number;
    preMatchGoal?: string;
    // Post-match
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

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  good: { icon: "checkmark-circle", color: Colors.success },
  warning: { icon: "alert-circle", color: Colors.warning },
  poor: { icon: "close-circle", color: Colors.error },
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
          {statusInfo && (
            <Ionicons name={statusInfo.icon as any} size={20} color={statusInfo.color} />
          )}
        </View>
        {score !== undefined && (
          <View style={styles.scoreBar}>
            <View style={[styles.scoreProgress, { width: `${score}%`, backgroundColor: PILLAR_COLORS[pillar] }]} />
          </View>
        )}
        {insight && (
          <Text style={styles.pillarInsight}>{insight}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Match Review</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
          
          {match.opponent && (
            <Text style={styles.opponentText}>vs {match.opponent.name}</Text>
          )}
          
          <View style={styles.matchMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText}>
                {new Date(match.matchDate).toLocaleDateString()}
              </Text>
            </View>
            {match.durationMinutes && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{match.durationMinutes} min</Text>
              </View>
            )}
            {match.venue && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{match.venue}</Text>
              </View>
            )}
          </View>

          {match.glowRankChange !== undefined && match.glowRankChange !== 0 && (
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
          )}
        </LinearGradient>

        {match.plan && (match.plan.primaryTactic || match.plan.mentalCue) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tactical Reality Check</Text>
            <View style={styles.tacticalCard}>
              <Text style={styles.tacticalLabel}>Your Game Plan</Text>
              {match.plan.primaryTactic && (
                <Text style={styles.tacticalText}>{match.plan.primaryTactic}</Text>
              )}
              {match.plan.mentalCue && (
                <Text style={styles.tacticalCue}>{match.plan.mentalCue}</Text>
              )}
            </View>
          </View>
        )}

        {match.pillarScores && (
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
        )}

        {match.reflection && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Reflection</Text>
            {/* Pre-match Glow Mirror section */}
            {(match.reflection.preMatchMood || match.reflection.preMatchGoal || match.reflection.preMatchConfidence) ? (
              <View style={[styles.reflectionCard, styles.preMatchCard]}>
                <View style={styles.preMatchHeader}>
                  <Ionicons name="mic" size={16} color="#A78BFA" />
                  <Text style={styles.preMatchTitle}>Before the Match</Text>
                </View>
                {match.reflection.preMatchMood ? (
                  <View style={styles.reflectionRow}>
                    <Ionicons name="happy-outline" size={16} color="#A78BFA" />
                    <Text style={styles.reflectionLabel}>Mood:</Text>
                    <Text style={styles.reflectionText}>
                      {match.reflection.preMatchMood.charAt(0).toUpperCase() + match.reflection.preMatchMood.slice(1)}
                    </Text>
                  </View>
                ) : null}
                {match.reflection.preMatchConfidence ? (
                  <View style={styles.reflectionRow}>
                    <Ionicons name="flash-outline" size={16} color="#A78BFA" />
                    <Text style={styles.reflectionLabel}>Confidence:</Text>
                    <Text style={styles.reflectionText}>{match.reflection.preMatchConfidence}/10</Text>
                  </View>
                ) : null}
                {match.reflection.preMatchGoal ? (
                  <View style={styles.reflectionRow}>
                    <Ionicons name="flag-outline" size={16} color="#A78BFA" />
                    <Text style={styles.reflectionLabel}>Goal:</Text>
                    <Text style={styles.reflectionText}>{match.reflection.preMatchGoal}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={styles.reflectionCard}>
              {match.reflection.whatWorked && match.reflection.whatWorked.length > 0 && (
                <View style={styles.reflectionRow}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  <Text style={styles.reflectionLabel}>What worked:</Text>
                  <Text style={styles.reflectionText}>
                    {match.reflection.whatWorked.join(", ")}
                  </Text>
                </View>
              )}
              {match.reflection.whatDidntWork && match.reflection.whatDidntWork.length > 0 && (
                <View style={styles.reflectionRow}>
                  <Ionicons name="close-circle" size={18} color={Colors.error} />
                  <Text style={styles.reflectionLabel}>Needs work:</Text>
                  <Text style={styles.reflectionText}>
                    {match.reflection.whatDidntWork.join(", ")}
                  </Text>
                </View>
              )}
              {match.reflection.biggestChallenge && (
                <View style={styles.reflectionRow}>
                  <Ionicons name="alert-circle" size={18} color={Colors.warning} />
                  <Text style={styles.reflectionLabel}>Biggest challenge:</Text>
                  <Text style={styles.reflectionText}>
                    {match.reflection.biggestChallenge.replace(/_/g, " ")}
                  </Text>
                </View>
              )}
              {match.reflection.keyTakeaway && (
                <View style={styles.takeawayBox}>
                  <Text style={styles.takeawayLabel}>Key Takeaway</Text>
                  <Text style={styles.takeawayText}>"{match.reflection.keyTakeaway}"</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {match.trainingSuggestions && match.trainingSuggestions.length > 0 && (
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
                    {suggestion.focusArea.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </Text>
                  <Text style={styles.suggestionMeta}>
                    {suggestion.pillar} - {suggestion.suggestedWeeks} weeks
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </View>
            ))}
          </View>
        )}

        {match.coachReview && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Coach Review</Text>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
            <View style={styles.coachReviewCard}>
              {match.coachReview.strengthToReinforce && (
                <View style={styles.coachSection}>
                  <Text style={styles.coachLabel}>Strength to Reinforce</Text>
                  <Text style={styles.coachStrength}>{match.coachReview.strengthToReinforce}</Text>
                </View>
              )}
              {match.coachReview.topImprovements && match.coachReview.topImprovements.length > 0 && (
                <View style={styles.coachSection}>
                  <Text style={styles.coachLabel}>Top Improvements</Text>
                  {match.coachReview.topImprovements.map((item, index) => (
                    <View key={index} style={styles.improvementRow}>
                      <Text style={styles.improvementNumber}>{index + 1}</Text>
                      <Text style={styles.improvementText}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
              {match.coachReview.comment && (
                <View style={styles.coachSection}>
                  <Text style={styles.coachLabel}>Coach Notes</Text>
                  <Text style={styles.coachComment}>"{match.coachReview.comment}"</Text>
                </View>
              )}
            </View>
          </View>
        )}

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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...Typography.subtitle,
    color: Colors.text,
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
    ...Typography.caption,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  pillarGrid: {
    gap: Spacing.sm,
  },
  pillarCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
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
    flex: 1,
  },
  scoreBar: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
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
    marginTop: Spacing.sm,
    fontStyle: "italic",
  },
  reflectionCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  preMatchCard: {
    borderLeftWidth: 3,
    borderLeftColor: "#A78BFA",
  },
  preMatchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  preMatchTitle: {
    ...Typography.caption,
    color: "#A78BFA",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reflectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  reflectionLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  reflectionText: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
  },
  takeawayBox: {
    backgroundColor: Colors.surfaceLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  takeawayLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  takeawayText: {
    ...Typography.body,
    color: Colors.text,
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
    textTransform: "capitalize",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  verifiedText: {
    ...Typography.small,
    color: Colors.success,
  },
  coachReviewCard: {
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.success + "40",
  },
  coachSection: {
    marginBottom: Spacing.md,
  },
  coachLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  coachStrength: {
    ...Typography.body,
    color: Colors.success,
    fontWeight: "600",
  },
  improvementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  improvementNumber: {
    ...Typography.caption,
    color: Colors.textSecondary,
    width: 20,
    textAlign: "center",
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
