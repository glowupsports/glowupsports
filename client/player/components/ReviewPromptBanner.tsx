import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { CoachReviewModal } from "./CoachReviewModal";
import { apiRequest } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface ReviewPrompt {
  id: string;
  coachId: string;
  triggerType: string;
  coach: {
    id: string;
    name: string;
  } | null;
}

export function ReviewPromptBanner() {
  const queryClient = useQueryClient();
  const [selectedCoach, setSelectedCoach] = useState<{ id: string; name: string } | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const { data: prompts = [] } = useQuery<ReviewPrompt[]>({
    queryKey: ["/api/player/review-prompts"],
    staleTime: 5 * 60 * 1000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (promptId: string) => {
      return apiRequest("POST", `/api/player/review-prompts/${promptId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/review-prompts"] });
    },
  });

  const handleReviewPress = (prompt: ReviewPrompt) => {
    if (!prompt.coach) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedCoach(prompt.coach);
    setShowReviewModal(true);
  };

  const handleDismiss = (promptId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissMutation.mutate(promptId);
  };

  const handleReviewSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/player/review-prompts"] });
  };

  if (!prompts || prompts.length === 0) return null;

  const prompt = prompts[0];
  if (!prompt.coach) return null;

  return (
    <>
      <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
        <View style={styles.iconContainer}>
          <Feather name="star" size={24} color={Colors.dark.gold} />
        </View>
        <View style={styles.content}>
          <ThemedText style={styles.title}>Rate your coach</ThemedText>
          <ThemedText style={styles.message}>
            Share your experience with {prompt.coach.name} to help other players
          </ThemedText>
          <View style={styles.actions}>
            <Pressable 
              onPress={() => handleReviewPress(prompt)}
              style={({ pressed }) => [styles.reviewButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Feather name="edit-3" size={14} color={Colors.dark.buttonText} />
              <ThemedText style={styles.reviewButtonText}>Write Review</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => handleDismiss(prompt.id)}
              style={({ pressed }) => [styles.laterButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <ThemedText style={styles.laterButtonText}>Maybe Later</ThemedText>
            </Pressable>
          </View>
        </View>
        <Pressable 
          onPress={() => handleDismiss(prompt.id)} 
          style={styles.closeButton}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Feather name="x" size={18} color={Colors.dark.textMuted} />
        </Pressable>
      </Animated.View>

      <CoachReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        coach={selectedCoach}
        onSuccess={handleReviewSuccess}
      />
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: `${Colors.dark.gold}30`,
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.dark.gold}15`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  reviewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.gold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  reviewButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  laterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  laterButtonText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  closeButton: {
    padding: Spacing.xs,
    marginLeft: Spacing.sm,
  },
}));
