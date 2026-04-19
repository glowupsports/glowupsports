import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface LessonRatingModalProps {
  visible: boolean;
  sessionId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

const STAR_COLOR_ACTIVE = "#FFD700";
const STAR_COLOR_INACTIVE = "#2A2F3A";

function StarRow({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(star);
          }}
          style={styles.starButton}
          hitSlop={8}
        >
          <Feather
            name="star"
            size={38}
            color={star <= rating ? STAR_COLOR_ACTIVE : STAR_COLOR_INACTIVE}
            style={star <= rating ? styles.starActive : styles.starInactive}
          />
        </Pressable>
      ))}
    </View>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: "Not great",
  2: "Could be better",
  3: "It was okay",
  4: "Really good",
  5: "Amazing lesson!",
};

export default function LessonRatingModal({
  visible,
  sessionId,
  onClose,
  onSubmitted,
}: LessonRatingModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/player/sessions/${sessionId}/rate`, {
        rating,
        comment: comment.trim() || undefined,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit rating");
      }
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/player/sessions/${sessionId}/my-rating`] });
      onSubmitted?.();
      handleClose();
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleClose = () => {
    setRating(0);
    setComment("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardView}
        >
          <Animated.View
            entering={ZoomIn.springify().damping(18).stiffness(200)}
            exiting={FadeOut.duration(150)}
            style={styles.card}
          >
            <Pressable onPress={() => {}} style={{ flex: 1 }}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerIconWrapper}>
                  <Feather name="star" size={20} color={STAR_COLOR_ACTIVE} />
                </View>
                <ThemedText style={styles.title}>How was your lesson?</ThemedText>
                <Pressable style={styles.closeButton} onPress={handleClose} hitSlop={12}>
                  <Feather name="x" size={18} color={Colors.dark.tabIconDefault} />
                </Pressable>
              </View>

              <ThemedText style={styles.subtitle}>
                Your feedback helps improve coaching quality.
              </ThemedText>

              {/* Stars */}
              <StarRow rating={rating} onChange={setRating} />

              {/* Label under stars */}
              {rating > 0 ? (
                <Animated.View entering={FadeIn.duration(200)}>
                  <ThemedText style={styles.ratingLabel}>{RATING_LABELS[rating]}</ThemedText>
                </Animated.View>
              ) : (
                <ThemedText style={styles.ratingLabelPlaceholder}>Tap a star to rate</ThemedText>
              )}

              {/* Comment input */}
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment (optional)"
                placeholderTextColor={Colors.dark.tabIconDefault}
                multiline
                maxLength={300}
                value={comment}
                onChangeText={setComment}
                numberOfLines={3}
              />
              {comment.length > 0 ? (
                <ThemedText style={styles.charCount}>{comment.length}/300</ThemedText>
              ) : null}

              {/* Error */}
              {submitMutation.isError ? (
                <ThemedText style={styles.errorText}>
                  {(submitMutation.error as Error)?.message || "Something went wrong"}
                </ThemedText>
              ) : null}

              {/* Submit */}
              <Pressable
                style={[
                  styles.submitButton,
                  rating === 0 || submitMutation.isPending
                    ? styles.submitButtonDisabled
                    : styles.submitButtonEnabled,
                ]}
                onPress={() => {
                  if (rating > 0) {
                    submitMutation.mutate();
                  }
                }}
                disabled={rating === 0 || submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <ThemedText
                    style={[
                      styles.submitText,
                      rating === 0 ? styles.submitTextDisabled : styles.submitTextEnabled,
                    ]}
                  >
                    Submit Rating
                  </ThemedText>
                )}
              </Pressable>

              {/* Skip */}
              <Pressable onPress={handleClose} style={styles.skipButton} hitSlop={8}>
                <ThemedText style={styles.skipText}>Maybe later</ThemedText>
              </Pressable>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
  },
  keyboardView: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  card: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  headerIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: `${STAR_COLOR_ACTIVE}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.chipBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.lg,
    lineHeight: 18,
  },
  starRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  starButton: {
    padding: 4,
  },
  starActive: {
    opacity: 1,
  },
  starInactive: {
    opacity: 0.35,
  },
  ratingLabel: {
    textAlign: "center",
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: STAR_COLOR_ACTIVE,
    marginBottom: Spacing.lg,
    minHeight: 20,
  },
  ratingLabelPlaceholder: {
    textAlign: "center",
    fontSize: FontSizes.sm,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.lg,
    minHeight: 20,
  },
  commentInput: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    minHeight: 72,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    marginBottom: Spacing.xs,
  },
  charCount: {
    textAlign: "right",
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  submitButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
    minHeight: 48,
  },
  submitButtonEnabled: {
    backgroundColor: Colors.dark.primary,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.dark.chipBackgroundStrong,
  },
  submitText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  submitTextEnabled: {
    color: Colors.dark.buttonText,
  },
  submitTextDisabled: {
    color: Colors.dark.tabIconDefault,
  },
  skipButton: {
    alignItems: "center",
    paddingTop: Spacing.md,
  },
  skipText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.tabIconDefault,
  },
}));
