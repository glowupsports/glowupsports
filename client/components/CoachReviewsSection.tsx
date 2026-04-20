import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface ReviewStats {
  totalReviews: number;
  averageOverall: number | null;
  categories: {
    coachingQuality: number | null;
    communication: number | null;
    withKidsBeginners: number | null;
    reliability: number | null;
    feedbackMotivation: number | null;
  };
  reviewerBreakdown: {
    kids: number;
    teens: number;
    adults: number;
  };
  levelBreakdown: {
    red: number;
    orange: number;
    green: number;
    yellow: number;
  };
  bestForTags: string[];
}

interface ReviewSnippet {
  id: string;
  overallScore: number;
  whatDoesWell: string | null;
  bestForPlayerType: string | null;
  reviewerAgeCategory: string | null;
  reviewerLevel: string | null;
  createdAt: string;
  response: {
    text: string;
    createdAt: string;
  } | null;
}

interface CoachReviewsResponse {
  stats: ReviewStats | null;
  reviews: ReviewSnippet[];
  isVisible: boolean;
}

interface CoachReviewsSectionProps {
  coachId: string;
  compact?: boolean;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  coachingQuality: { label: "Coaching", icon: "award" },
  communication: { label: "Communication", icon: "message-circle" },
  withKidsBeginners: { label: "With Beginners", icon: "heart" },
  reliability: { label: "Reliability", icon: "clock" },
  feedbackMotivation: { label: "Motivation", icon: "trending-up" },
};

function RatingBar({ label, icon, score }: { label: string; icon: string; score: number | null }) {
  if (score === null) return null;
  
  const percentage = (score / 5) * 100;
  const getColor = () => {
    if (score >= 4) return Colors.dark.primary;
    if (score >= 3) return Colors.dark.orange;
    return Colors.dark.error;
  };

  return (
    <View style={styles.ratingBar}>
      <View style={styles.ratingBarLeft}>
        <Feather name={icon as keyof typeof Feather.glyphMap} size={14} color={Colors.dark.textMuted} />
        <ThemedText style={styles.ratingBarLabel}>{label}</ThemedText>
      </View>
      <View style={styles.ratingBarContainer}>
        <View style={[styles.ratingBarFill, { width: `${percentage}%`, backgroundColor: getColor() }]} />
      </View>
      <ThemedText style={[styles.ratingBarScore, { color: getColor() }]}>{score.toFixed(1)}</ThemedText>
    </View>
  );
}

function ReviewCard({ review }: { review: ReviewSnippet }) {
  const getLevelColor = (level: string | null) => {
    switch (level) {
      case "red": return Colors.dark.ballRed;
      case "orange": return Colors.dark.ballOrange;
      case "green": return Colors.dark.ballGreen;
      case "yellow": return Colors.dark.ballYellow;
      default: return Colors.dark.textMuted;
    }
  };

  const getReviewerLabel = () => {
    const parts: string[] = [];
    if (review.reviewerAgeCategory) {
      parts.push(review.reviewerAgeCategory.charAt(0).toUpperCase() + review.reviewerAgeCategory.slice(1));
    }
    if (review.reviewerLevel) {
      parts.push(`${review.reviewerLevel.charAt(0).toUpperCase() + review.reviewerLevel.slice(1)} Level`);
    }
    return parts.length > 0 ? parts.join(" | ") : "Player";
  };

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerInfo}>
          <View style={[styles.levelDot, { backgroundColor: getLevelColor(review.reviewerLevel) }]} />
          <ThemedText style={styles.reviewerLabel}>{getReviewerLabel()}</ThemedText>
        </View>
        <View style={styles.scoreChip}>
          <Feather name="star" size={12} color={Colors.dark.gold} />
          <ThemedText style={styles.scoreChipText}>{review.overallScore.toFixed(1)}</ThemedText>
        </View>
      </View>
      
      {review.whatDoesWell ? (
        <ThemedText style={styles.reviewText}>"{review.whatDoesWell}"</ThemedText>
      ) : null}
      
      {review.bestForPlayerType ? (
        <View style={styles.bestForTag}>
          <Feather name="users" size={12} color={Colors.dark.xpCyan} />
          <ThemedText style={styles.bestForText}>Best for: {review.bestForPlayerType}</ThemedText>
        </View>
      ) : null}

      {review.response ? (
        <View style={styles.coachResponse}>
          <View style={styles.responseHeader}>
            <Feather name="corner-down-right" size={12} color={Colors.dark.primary} />
            <ThemedText style={styles.responseLabel}>Coach replied</ThemedText>
          </View>
          <ThemedText style={styles.responseText}>{review.response.text}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

export function CoachReviewsSection({ coachId, compact = false }: CoachReviewsSectionProps) {
  const { data, isLoading } = useQuery<CoachReviewsResponse>({
    queryKey: ["/api/coaches", coachId, "reviews"],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.loadingPlaceholder}>
          <ThemedText style={styles.loadingText}>Loading reviews...</ThemedText>
        </View>
      </View>
    );
  }

  if (!data?.isVisible || !data.stats) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.noReviews}>
          <Feather name="star" size={24} color={Colors.dark.textSubtle} />
          <ThemedText style={styles.noReviewsText}>
            Not enough reviews yet. Reviews become visible after 3 players have shared their experience.
          </ThemedText>
        </View>
      </View>
    );
  }

  const { stats, reviews } = data;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="star" size={20} color={Colors.dark.gold} />
          <ThemedText style={styles.title}>Player Reviews</ThemedText>
        </View>
        <View style={styles.overallBadge}>
          <ThemedText style={styles.overallScore}>{stats.averageOverall?.toFixed(1) || "N/A"}</ThemedText>
          <ThemedText style={styles.overallCount}>{stats.totalReviews} reviews</ThemedText>
        </View>
      </View>

      {stats.bestForTags.length > 0 ? (
        <View style={styles.tagsRow}>
          {stats.bestForTags.map((tag, i) => (
            <View key={i} style={styles.tag}>
              <Feather name="check-circle" size={12} color={Colors.dark.primary} />
              <ThemedText style={styles.tagText}>{tag}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      {!compact ? (
        <View style={styles.categoriesSection}>
          {Object.entries(CATEGORY_LABELS).map(([key, { label, icon }]) => (
            <RatingBar 
              key={key} 
              label={label} 
              icon={icon} 
              score={stats.categories[key as keyof typeof stats.categories]} 
            />
          ))}
        </View>
      ) : null}

      {reviews.length > 0 ? (
        <View style={styles.reviewsList}>
          {(compact ? reviews.slice(0, 2) : reviews).map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </View>
      ) : null}

      {compact && reviews.length > 2 ? (
        <Pressable style={styles.viewAllButton}>
          <ThemedText style={styles.viewAllText}>View all {stats.totalReviews} reviews</ThemedText>
          <Feather name="chevron-right" size={16} color={Colors.dark.xpCyan} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  containerCompact: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  overallBadge: {
    alignItems: "flex-end",
  },
  overallScore: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  overallCount: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Colors.dark.primary}15`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  tagText: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  categoriesSection: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  ratingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ratingBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 110,
  },
  ratingBarLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  ratingBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  ratingBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  ratingBarScore: {
    fontSize: 13,
    fontWeight: "600",
    width: 28,
    textAlign: "right",
  },
  reviewsList: {
    gap: Spacing.md,
  },
  reviewCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  reviewerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  levelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reviewerLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  scoreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Colors.dark.gold}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  scoreChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  reviewText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontStyle: "italic",
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  bestForTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bestForText: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
  },
  coachResponse: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  responseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  responseLabel: {
    fontSize: 11,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  responseText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  viewAllText: {
    fontSize: 14,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  loadingPlaceholder: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  noReviews: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  noReviewsText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
}));
