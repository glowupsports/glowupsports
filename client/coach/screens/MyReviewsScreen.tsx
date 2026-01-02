import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface ReviewStats {
  totalReviews: number;
  visibleReviews: number;
  averageOverall: number | null;
}

interface Review {
  id: string;
  coachingQuality: number;
  communication: number;
  withKidsBeginners: number;
  reliability: number;
  feedbackMotivation: number;
  overallScore: number;
  whatDoesWell: string | null;
  bestForPlayerType: string | null;
  reviewerAgeCategory: string | null;
  reviewerLevel: string | null;
  isVisible: boolean;
  createdAt: string;
  response: {
    id: string;
    responseText: string;
    createdAt: string;
  } | null;
}

interface ReviewsData {
  stats: ReviewStats | null;
  reviews: Review[];
}

function StatsHeader({ stats }: { stats: ReviewStats | null }) {
  if (!stats) {
    return (
      <View style={styles.statsEmpty}>
        <Feather name="star" size={28} color={Colors.dark.textSubtle} />
        <ThemedText style={styles.statsEmptyTitle}>No Reviews Yet</ThemedText>
        <ThemedText style={styles.statsEmptyText}>
          When players review you, their feedback will appear here
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.statsContainer}>
      <View style={styles.mainStat}>
        <ThemedText style={styles.mainStatValue}>
          {stats.averageOverall?.toFixed(1) || "N/A"}
        </ThemedText>
        <ThemedText style={styles.mainStatLabel}>Overall Rating</ThemedText>
      </View>
      <View style={styles.statsDivider} />
      <View style={styles.secondaryStats}>
        <View style={styles.secondaryStat}>
          <ThemedText style={styles.secondaryStatValue}>{stats.totalReviews}</ThemedText>
          <ThemedText style={styles.secondaryStatLabel}>Total</ThemedText>
        </View>
        <View style={styles.secondaryStat}>
          <ThemedText style={styles.secondaryStatValue}>{stats.visibleReviews}</ThemedText>
          <ThemedText style={styles.secondaryStatLabel}>Visible</ThemedText>
        </View>
      </View>
    </View>
  );
}

function ReviewCard({ review, onRespond }: { review: Review; onRespond: (id: string) => void }) {
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <View style={[styles.reviewCard, !review.isVisible && styles.reviewCardHidden]}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerInfo}>
          <View style={[styles.levelDot, { backgroundColor: getLevelColor(review.reviewerLevel) }]} />
          <ThemedText style={styles.reviewerLabel}>{getReviewerLabel()}</ThemedText>
        </View>
        <View style={styles.reviewMeta}>
          <View style={styles.scoreChip}>
            <Feather name="star" size={12} color={Colors.dark.gold} />
            <ThemedText style={styles.scoreChipText}>{review.overallScore.toFixed(1)}</ThemedText>
          </View>
          <ThemedText style={styles.reviewDate}>{formatDate(review.createdAt)}</ThemedText>
        </View>
      </View>

      {!review.isVisible ? (
        <View style={styles.hiddenBadge}>
          <Feather name="eye-off" size={12} color={Colors.dark.textMuted} />
          <ThemedText style={styles.hiddenBadgeText}>Not visible yet (needs 3+ reviews)</ThemedText>
        </View>
      ) : null}

      <View style={styles.ratingsGrid}>
        <View style={styles.ratingItem}>
          <ThemedText style={styles.ratingLabel}>Coaching</ThemedText>
          <ThemedText style={[styles.ratingValue, { color: review.coachingQuality >= 4 ? Colors.dark.primary : Colors.dark.text }]}>
            {review.coachingQuality}
          </ThemedText>
        </View>
        <View style={styles.ratingItem}>
          <ThemedText style={styles.ratingLabel}>Communication</ThemedText>
          <ThemedText style={[styles.ratingValue, { color: review.communication >= 4 ? Colors.dark.primary : Colors.dark.text }]}>
            {review.communication}
          </ThemedText>
        </View>
        <View style={styles.ratingItem}>
          <ThemedText style={styles.ratingLabel}>With Beginners</ThemedText>
          <ThemedText style={[styles.ratingValue, { color: review.withKidsBeginners >= 4 ? Colors.dark.primary : Colors.dark.text }]}>
            {review.withKidsBeginners}
          </ThemedText>
        </View>
        <View style={styles.ratingItem}>
          <ThemedText style={styles.ratingLabel}>Reliability</ThemedText>
          <ThemedText style={[styles.ratingValue, { color: review.reliability >= 4 ? Colors.dark.primary : Colors.dark.text }]}>
            {review.reliability}
          </ThemedText>
        </View>
        <View style={styles.ratingItem}>
          <ThemedText style={styles.ratingLabel}>Motivation</ThemedText>
          <ThemedText style={[styles.ratingValue, { color: review.feedbackMotivation >= 4 ? Colors.dark.primary : Colors.dark.text }]}>
            {review.feedbackMotivation}
          </ThemedText>
        </View>
      </View>

      {review.whatDoesWell ? (
        <View style={styles.feedbackSection}>
          <ThemedText style={styles.feedbackLabel}>What you do well</ThemedText>
          <ThemedText style={styles.feedbackText}>"{review.whatDoesWell}"</ThemedText>
        </View>
      ) : null}

      {review.bestForPlayerType ? (
        <View style={styles.bestForSection}>
          <Feather name="users" size={14} color={Colors.dark.xpCyan} />
          <ThemedText style={styles.bestForText}>Best for: {review.bestForPlayerType}</ThemedText>
        </View>
      ) : null}

      {review.response ? (
        <View style={styles.responseSection}>
          <View style={styles.responseHeader}>
            <Feather name="corner-down-right" size={14} color={Colors.dark.primary} />
            <ThemedText style={styles.responseLabel}>Your reply</ThemedText>
          </View>
          <ThemedText style={styles.responseText}>{review.response.responseText}</ThemedText>
        </View>
      ) : (
        <Pressable 
          style={({ pressed }) => [styles.replyButton, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => onRespond(review.id)}
        >
          <Feather name="message-square" size={14} color={Colors.dark.primary} />
          <ThemedText style={styles.replyButtonText}>Reply to this review</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function ResponseModal({ 
  visible, 
  reviewId, 
  onClose, 
  onSuccess 
}: { 
  visible: boolean; 
  reviewId: string | null; 
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [text, setText] = useState("");
  
  const submitMutation = useMutation({
    mutationFn: async (data: { reviewId: string; responseText: string }) => {
      return apiRequest("POST", `/api/coach/reviews/${data.reviewId}/respond`, { responseText: data.responseText });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setText("");
      onSuccess();
      onClose();
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleSubmit = () => {
    if (!reviewId || !text.trim()) return;
    submitMutation.mutate({ reviewId, responseText: text.trim() });
  };

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalBackdrop} />
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <ThemedText style={styles.modalTitle}>Reply to Review</ThemedText>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <Feather name="x" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        <ThemedText style={styles.modalHint}>
          Your response will be publicly visible. Keep it professional and constructive.
        </ThemedText>

        <TextInput
          style={styles.responseInput}
          value={text}
          onChangeText={setText}
          placeholder="Thank you for your feedback..."
          placeholderTextColor={Colors.dark.textSubtle}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        <ThemedText style={styles.charCount}>{text.length}/500</ThemedText>

        <View style={styles.modalActions}>
          <Pressable onPress={onClose} style={styles.cancelButton}>
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </Pressable>
          <Pressable 
            onPress={handleSubmit}
            disabled={!text.trim() || submitMutation.isPending}
            style={[styles.submitButton, (!text.trim() || submitMutation.isPending) && { opacity: 0.5 }]}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <>
                <Feather name="send" size={16} color={Colors.dark.backgroundRoot} />
                <ThemedText style={styles.submitButtonText}>Send Reply</ThemedText>
              </>
            )}
          </Pressable>
        </View>

        {submitMutation.isError ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={Colors.dark.error} />
            <ThemedText style={styles.errorText}>Failed to send. Please try again.</ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function MyReviewsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [showResponseModal, setShowResponseModal] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<ReviewsData>({
    queryKey: ["/api/coach/my-reviews"],
  });

  const handleRespond = (reviewId: string) => {
    setSelectedReviewId(reviewId);
    setShowResponseModal(true);
  };

  const handleResponseSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/coach/my-reviews"] });
  };

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.dark.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <ThemedText style={styles.loadingText}>Loading reviews...</ThemedText>
          </View>
        ) : (
          <>
            <StatsHeader stats={data?.stats || null} />

            {data?.reviews && data.reviews.length > 0 ? (
              <View style={styles.reviewsList}>
                <ThemedText style={styles.sectionTitle}>All Reviews</ThemedText>
                {data.reviews.map((review) => (
                  <ReviewCard 
                    key={review.id} 
                    review={review}
                    onRespond={handleRespond}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <ThemedText style={styles.emptyStateText}>
                  Reviews from players will appear here once they submit feedback about their sessions with you.
                </ThemedText>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ResponseModal
        visible={showResponseModal}
        reviewId={selectedReviewId}
        onClose={() => setShowResponseModal(false)}
        onSuccess={handleResponseSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    padding: Spacing.xl * 2,
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.dark.textMuted,
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: "center",
  },
  mainStat: {
    alignItems: "center",
    flex: 1,
  },
  mainStatValue: {
    fontSize: 42,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  mainStatLabel: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  statsDivider: {
    width: 1,
    height: 50,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
  },
  secondaryStats: {
    alignItems: "center",
    gap: Spacing.md,
  },
  secondaryStat: {
    alignItems: "center",
  },
  secondaryStatValue: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  secondaryStatLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  statsEmpty: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  statsEmptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  statsEmptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  reviewsList: {
    gap: Spacing.md,
  },
  reviewCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  reviewCardHidden: {
    opacity: 0.8,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
    borderStyle: "dashed",
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
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  reviewMeta: {
    alignItems: "flex-end",
    gap: 4,
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
  reviewDate: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  hiddenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  hiddenBadgeText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  ratingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  ratingItem: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    minWidth: 80,
  },
  ratingLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  ratingValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  feedbackSection: {
    marginBottom: Spacing.sm,
  },
  feedbackLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontStyle: "italic",
    lineHeight: 20,
  },
  bestForSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  bestForText: {
    fontSize: 13,
    color: Colors.dark.xpCyan,
  },
  responseSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  responseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  responseLabel: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  responseText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  replyButtonText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  emptyState: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalHint: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  responseInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    minHeight: 100,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  charCount: {
    fontSize: 12,
    color: Colors.dark.textSubtle,
    textAlign: "right",
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  submitButton: {
    flex: 2,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.backgroundRoot,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: `${Colors.dark.error}15`,
    borderRadius: BorderRadius.xs,
  },
  errorText: {
    fontSize: 13,
    color: Colors.dark.error,
  },
});
