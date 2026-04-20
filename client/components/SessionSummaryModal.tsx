import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
  FadeIn,
  SlideInUp,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
Backgrounds, } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SessionSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  onContinue?: () => void;
  sessionData: {
    duration: number; // in minutes
    skillsPracticed: number;
    xpEarned: number;
    currentLevel: number;
    currentXP: number;
    xpToNextLevel: number;
    nextFocus?: {
      skill: string;
      recommendation: string;
    };
  };
}

export function SessionSummaryModal({
  visible,
  onClose,
  onContinue,
  sessionData,
}: SessionSummaryModalProps) {
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.8);
  const progressWidth = useSharedValue(0);
  const xpCounterValue = useSharedValue(0);
  const checkScale = useSharedValue(0);

  const xpProgress =
    (sessionData.currentXP / (sessionData.currentXP + sessionData.xpToNextLevel)) * 100;

  useEffect(() => {
    if (visible) {
      // Animate in
      backdropOpacity.value = withTiming(1, { duration: 300 });
      cardScale.value = withSpring(1, { damping: 15, stiffness: 120 });

      // Animate check
      checkScale.value = withDelay(
        300,
        withSequence(
          withSpring(1.2, { damping: 8 }),
          withSpring(1, { damping: 12 })
        )
      );

      // Animate XP counter
      xpCounterValue.value = withDelay(
        400,
        withTiming(sessionData.xpEarned, {
          duration: 800,
          easing: Easing.out(Easing.cubic),
        })
      );

      // Animate progress bar
      progressWidth.value = withDelay(
        600,
        withSpring(xpProgress, { damping: 15 })
      );

      // Haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      backdropOpacity.value = 0;
      cardScale.value = 0.8;
      progressWidth.value = 0;
      xpCounterValue.value = 0;
      checkScale.value = 0;
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    backdropOpacity.value = withTiming(0, { duration: 200 });
    cardScale.value = withTiming(0.8, { duration: 200 });
    setTimeout(onClose, 200);
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onContinue) {
      onContinue();
    } else {
      handleClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <BlurView intensity={20} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <Animated.View style={[styles.card, cardStyle]}>
          {/* Success Header */}
          <View style={styles.header}>
            <Animated.View style={[styles.checkCircle, checkStyle]}>
              <Ionicons name="checkmark" size={32} color={Colors.dark.buttonText} />
            </Animated.View>
            <Text style={styles.title}>Great Work!</Text>
            <Text style={styles.subtitle}>Session Complete</Text>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={20} color={TextColors.muted} />
              <Text style={styles.statValue}>{sessionData.duration} min</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="fitness-outline" size={20} color={TextColors.muted} />
              <Text style={styles.statValue}>{sessionData.skillsPracticed}</Text>
              <Text style={styles.statLabel}>Skills</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="flash" size={20} color={GlowColors.primary} />
              <Text style={[styles.statValue, { color: GlowColors.primary }]}>
                +{sessionData.xpEarned}
              </Text>
              <Text style={styles.statLabel}>XP Earned</Text>
            </View>
          </View>

          {/* XP Progress */}
          <View style={styles.xpSection}>
            <View style={styles.xpHeader}>
              <Text style={styles.levelText}>Level {sessionData.currentLevel}</Text>
              <Text style={styles.xpText}>
                {sessionData.xpToNextLevel} XP to next level
              </Text>
            </View>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, progressStyle]} />
            </View>
          </View>

          {/* Next Focus */}
          {sessionData.nextFocus && (
            <View style={styles.nextFocusSection}>
              <View style={styles.nextFocusHeader}>
                <Ionicons name="bulb-outline" size={18} color={Colors.dark.xpCyan} />
                <Text style={styles.nextFocusTitle}>Next Focus</Text>
              </View>
              <Text style={styles.nextFocusSkill}>{sessionData.nextFocus.skill}</Text>
              <Text style={styles.nextFocusRec}>
                "{sessionData.nextFocus.recommendation}"
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.continueButton} onPress={handleContinue}>
              <Text style={styles.continueText}>
                {onContinue ? "Continue Training" : "Done"}
              </Text>
            </Pressable>
            {onContinue && (
              <Pressable style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneText}>I'm Done</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GlowColors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  title: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  subtitle: {
    ...Typography.body,
    color: TextColors.muted,
    marginTop: Spacing.xs,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Backgrounds.surface,
  },
  statValue: {
    ...Typography.h3,
    color: TextColors.primary,
    marginTop: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: Spacing.xs,
  },
  xpSection: {
    marginBottom: Spacing.lg,
  },
  xpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  levelText: {
    ...Typography.body,
    fontWeight: "600",
    color: TextColors.primary,
  },
  xpText: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  progressBar: {
    height: 8,
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.full,
  },
  nextFocusSection: {
    backgroundColor: `${Colors.dark.xpCyan}10`,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  nextFocusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  nextFocusTitle: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  nextFocusSkill: {
    ...Typography.h4,
    color: TextColors.primary,
    marginBottom: Spacing.xs,
  },
  nextFocusRec: {
    ...Typography.small,
    color: TextColors.muted,
    fontStyle: "italic",
  },
  actions: {
    gap: Spacing.md,
  },
  continueButton: {
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  continueText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  doneButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  doneText: {
    ...Typography.body,
    color: TextColors.muted,
  },
}));

export default SessionSummaryModal;
