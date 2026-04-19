import React, { useState } from "react";
import { View, StyleSheet, Modal, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface CoachReviewModalProps {
  visible: boolean;
  onClose: () => void;
  coach: {
    id: string;
    name: string;
  } | null;
  onSuccess?: () => void;
}

interface ReviewRating {
  category: string;
  label: string;
  description: string;
  value: number;
  icon: string;
}

const INITIAL_RATINGS: ReviewRating[] = [
  { category: "coachingQuality", label: "Coaching Quality", description: "Technical skills and training methods", value: 3, icon: "award" },
  { category: "communication", label: "Communication", description: "Clear explanations and feedback", value: 3, icon: "message-circle" },
  { category: "withKidsBeginners", label: "With Kids/Beginners", description: "Patient and encouraging with new players", value: 3, icon: "heart" },
  { category: "reliability", label: "Reliability", description: "Punctual and consistent", value: 3, icon: "clock" },
  { category: "feedbackMotivation", label: "Feedback & Motivation", description: "Constructive guidance and encouragement", value: 3, icon: "trending-up" },
];

function RatingSlider({ rating, onChange }: { rating: ReviewRating; onChange: (value: number) => void }) {
  const getScoreColor = (value: number) => {
    if (value <= 2) return Colors.dark.error;
    if (value <= 3) return Colors.dark.orange;
    return Colors.dark.primary;
  };

  const handleSelect = (value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(value);
  };

  return (
    <View style={styles.ratingItem}>
      <View style={styles.ratingHeader}>
        <View style={styles.ratingLeft}>
          <View style={[styles.ratingIcon, { backgroundColor: `${getScoreColor(rating.value)}20` }]}>
            <Feather name={rating.icon as keyof typeof Feather.glyphMap} size={18} color={getScoreColor(rating.value)} />
          </View>
          <View>
            <ThemedText style={styles.ratingLabel}>{rating.label}</ThemedText>
            <ThemedText style={styles.ratingDescription}>{rating.description}</ThemedText>
          </View>
        </View>
        <ThemedText style={[styles.ratingValue, { color: getScoreColor(rating.value) }]}>{rating.value}</ThemedText>
      </View>
      <View style={styles.scoreButtons}>
        {[1, 2, 3, 4, 5].map((score) => (
          <Pressable
            key={score}
            onPress={() => handleSelect(score)}
            style={[
              styles.scoreButton,
              rating.value === score && { backgroundColor: getScoreColor(score), borderColor: getScoreColor(score) }
            ]}
          >
            <ThemedText style={[
              styles.scoreButtonText,
              rating.value === score && { color: Colors.dark.buttonText, fontWeight: "700" }
            ]}>
              {score}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function CoachReviewModal({ visible, onClose, coach, onSuccess }: CoachReviewModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [ratings, setRatings] = useState<ReviewRating[]>(INITIAL_RATINGS);
  const [whatDoesWell, setWhatDoesWell] = useState("");
  const [bestForPlayerType, setBestForPlayerType] = useState("");
  const [step, setStep] = useState<"ratings" | "text">("ratings");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/player/reviews", data);
    },
    onSuccess: () => {
      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/review-prompts"] });
      if (coach?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach.id, "reviews"] });
      }
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 2000);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleClose = () => {
    setRatings(INITIAL_RATINGS);
    setWhatDoesWell("");
    setBestForPlayerType("");
    setStep("ratings");
    setSubmitted(false);
    onClose();
  };

  const handleRatingChange = (category: string, value: number) => {
    setRatings(prev => prev.map(r => r.category === category ? { ...r, value } : r));
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("text");
  };

  const handleSubmit = () => {
    if (!coach) return;

    const reviewData: any = {
      coachId: coach.id,
    };
    
    ratings.forEach(r => {
      reviewData[r.category] = r.value;
    });

    if (whatDoesWell.trim()) {
      reviewData.whatDoesWell = whatDoesWell.trim();
    }
    if (bestForPlayerType.trim()) {
      reviewData.bestForPlayerType = bestForPlayerType.trim();
    }

    submitMutation.mutate(reviewData);
  };

  const overallScore = (ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length).toFixed(1);

  if (!coach) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.modalContainer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.handle} />
          
          {submitted ? (
            <Animated.View entering={FadeIn} style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Feather name="check-circle" size={64} color={Colors.dark.primary} />
              </View>
              <ThemedText style={styles.successTitle}>Review Submitted</ThemedText>
              <ThemedText style={styles.successSubtitle}>
                Thank you for your feedback! It helps other players find the right coach.
              </ThemedText>
            </Animated.View>
          ) : step === "ratings" ? (
            <>
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.coachAvatar}>
                    <ThemedText style={styles.avatarText}>{coach.name.charAt(0).toUpperCase()}</ThemedText>
                  </View>
                  <View>
                    <ThemedText style={styles.title}>Rate {coach.name}</ThemedText>
                    <ThemedText style={styles.subtitle}>Share your experience</ThemedText>
                  </View>
                </View>
                <View style={styles.overallScore}>
                  <ThemedText style={styles.overallValue}>{overallScore}</ThemedText>
                  <ThemedText style={styles.overallLabel}>Overall</ThemedText>
                </View>
              </View>

              <View style={styles.divider} />

              <ScrollView 
                style={styles.ratingsList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: Spacing.xl }}
              >
                {ratings.map((rating) => (
                  <RatingSlider 
                    key={rating.category}
                    rating={rating}
                    onChange={(value) => handleRatingChange(rating.category, value)}
                  />
                ))}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable onPress={handleClose} style={styles.cancelButton}>
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </Pressable>
                <Pressable 
                  onPress={handleContinue}
                  style={({ pressed }) => [styles.continueButton, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <ThemedText style={styles.continueButtonText}>Continue</ThemedText>
                  <Feather name="arrow-right" size={18} color={Colors.dark.buttonText} />
                </Pressable>
              </View>
            </>
          ) : (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1 }}>
              <View style={styles.header}>
                <Pressable onPress={() => setStep("ratings")} style={styles.backButton}>
                  <Feather name="arrow-left" size={20} color={Colors.dark.text} />
                </Pressable>
                <View>
                  <ThemedText style={styles.title}>Add Details</ThemedText>
                  <ThemedText style={styles.subtitle}>Optional feedback for {coach.name}</ThemedText>
                </View>
              </View>

              <View style={styles.divider} />

              <ScrollView 
                style={styles.textInputSection}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: Spacing.xl }}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>What does this coach do well?</ThemedText>
                  <ThemedText style={styles.inputHint}>Help other players understand this coach's strengths</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    value={whatDoesWell}
                    onChangeText={setWhatDoesWell}
                    placeholder="e.g., Great at explaining technique, very patient..."
                    placeholderTextColor={Colors.dark.textSubtle}
                    multiline
                    maxLength={300}
                    textAlignVertical="top"
                  />
                  <ThemedText style={styles.charCount}>{whatDoesWell.length}/300</ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Best for what type of player?</ThemedText>
                  <ThemedText style={styles.inputHint}>Who would benefit most from this coach?</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    value={bestForPlayerType}
                    onChangeText={setBestForPlayerType}
                    placeholder="e.g., Beginners, kids, competitive players..."
                    placeholderTextColor={Colors.dark.textSubtle}
                    multiline
                    maxLength={200}
                    textAlignVertical="top"
                  />
                  <ThemedText style={styles.charCount}>{bestForPlayerType.length}/200</ThemedText>
                </View>

                <View style={styles.privacyNote}>
                  <Feather name="shield" size={16} color={Colors.dark.textMuted} />
                  <ThemedText style={styles.privacyText}>
                    Your review is semi-anonymous. Only your skill level and age category will be shown, not your name.
                  </ThemedText>
                </View>
              </ScrollView>

              <View style={styles.footer}>
                <Pressable onPress={() => setStep("ratings")} style={styles.cancelButton}>
                  <ThemedText style={styles.cancelButtonText}>Back</ThemedText>
                </Pressable>
                <Pressable 
                  onPress={handleSubmit}
                  disabled={submitMutation.isPending}
                  style={({ pressed }) => [
                    styles.submitButton, 
                    { opacity: submitMutation.isPending ? 0.6 : pressed ? 0.8 : 1 }
                  ]}
                >
                  {submitMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <>
                      <Feather name="send" size={18} color={Colors.dark.buttonText} />
                      <ThemedText style={styles.submitButtonText}>Submit Review</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>

              {submitMutation.isError && (
                <View style={styles.errorContainer}>
                  <Feather name="alert-circle" size={16} color={Colors.dark.error} />
                  <ThemedText style={styles.errorText}>Failed to submit review. Please try again.</ThemedText>
                </View>
              )}
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  modalContainer: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    maxHeight: "90%",
    minHeight: "60%",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.dark.chipBackground,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
    marginRight: Spacing.sm,
  },
  coachAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  overallScore: {
    alignItems: "center",
  },
  overallValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  overallLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginVertical: Spacing.lg,
  },
  ratingsList: {
    flex: 1,
  },
  ratingItem: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  ratingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  ratingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  ratingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  ratingDescription: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  ratingValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  scoreButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  scoreButton: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  scoreButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  continueButton: {
    flex: 2,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: GlowColors.primary,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  submitButton: {
    flex: 2,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: GlowColors.primary,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  textInputSection: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  inputHint: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    minHeight: 80,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  charCount: {
    fontSize: 12,
    color: Colors.dark.textSubtle,
    textAlign: "right",
    marginTop: 4,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${Colors.dark.error}15`,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  errorText: {
    fontSize: 13,
    color: Colors.dark.error,
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl * 2,
  },
  successIcon: {
    marginBottom: Spacing.xl,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  successSubtitle: {
    fontSize: 15,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
}));
