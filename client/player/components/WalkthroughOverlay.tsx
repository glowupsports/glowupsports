import React from "react";
import { View, Text, StyleSheet, Pressable, Modal, Dimensions } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, Easing } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useWalkthrough } from "../context/WalkthroughContext";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width } = Dimensions.get("window");

export function WalkthroughOverlay() {
  const { 
    isWalkthroughActive, 
    currentStep, 
    currentStepIndex, 
    totalSteps, 
    nextStep, 
    skipWalkthrough 
  } = useWalkthrough();

  if (!isWalkthroughActive || !currentStep) {
    return null;
  }

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    nextStep();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skipWalkthrough();
  };

  const isLastStep = currentStepIndex === totalSteps - 1;

  return (
    <Modal visible transparent animationType="none">
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.overlay}>
        <Pressable style={styles.overlayBackground} onPress={handleNext} />
        
        <Animated.View entering={SlideInDown.duration(350).easing(Easing.out(Easing.cubic))} style={styles.tooltipCard}>
          <View style={styles.iconContainer}>
            <Ionicons name="bulb" size={28} color={Colors.dark.accentText} />
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{currentStep.title}</Text>
            <Text style={styles.message}>{currentStep.message}</Text>
          </View>

          <View style={styles.progressContainer}>
            {Array.from({ length: totalSteps }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index === currentStepIndex ? styles.progressDotActive : null,
                  index < currentStepIndex ? styles.progressDotCompleted : null,
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </Pressable>

            <Pressable style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>
                {isLastStep ? "Got it!" : "Next"}
              </Text>
              {!isLastStep ? (
                <Ionicons name="chevron-forward" size={18} color={Colors.dark.buttonText} />
              ) : null}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 120,
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.modalScrim,
  },
  tooltipCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginHorizontal: Spacing.lg,
    width: width - Spacing.lg * 2,
    maxWidth: 400,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextBorder,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.accentTextSoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    alignSelf: "center",
  },
  content: {
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  message: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.border,
  },
  progressDotActive: {
    backgroundColor: GlowColors.primary,
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: `${GlowColors.primary}60`,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  skipButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  nextButtonText: {
    ...Typography.h4,
    color: Colors.dark.buttonText,
  },
}));
