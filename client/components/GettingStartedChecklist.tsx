import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getApiUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
Backgrounds, } from "@/constants/theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface ChecklistStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  isCompleted?: boolean;
}

interface GettingStartedChecklistProps {
  role: string;
  steps: ChecklistStep[];
  onDismiss?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GettingStartedChecklist({
  role,
  steps,
  onDismiss,
}: GettingStartedChecklistProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isDismissed, setIsDismissed] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const stateKey = `getting_started_${role}`;
  const dismissStateKey = `getting_started_${role}_dismissed`;
  const localDismissKey = `@glow_getting_started_dismissed_${role}`;
  const localCollapseKey = `@glow_getting_started_collapsed_${role}`;

  const chevronRotation = useSharedValue(0);

  useEffect(() => {
    loadState();
  }, [role]);

  const loadState = async () => {
    try {
      const localDismissed = await AsyncStorage.getItem(localDismissKey);
      if (localDismissed === "true") {
        setIsDismissed(true);
        setIsLoading(false);
        return;
      }

      const savedCollapse = await AsyncStorage.getItem(localCollapseKey);
      if (savedCollapse !== null) {
        setIsCollapsed(savedCollapse === "true");
      }

      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        setIsLoading(false);
        return;
      }
      const apiUrl = getApiUrl();
      const response = await fetch(new URL('/api/user/onboarding-state', apiUrl).toString(), {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.state) {
          if (Array.isArray(data.state[stateKey])) {
            setCompletedSteps(new Set(data.state[stateKey]));
          }
          if (data.state[dismissStateKey] === true) {
            setIsDismissed(true);
            await AsyncStorage.setItem(localDismissKey, "true").catch(() => {});
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load getting started state:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCompletedSteps = async (newCompleted: Set<string>) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      const apiUrl = getApiUrl();
      await fetch(new URL('/api/user/onboarding-state', apiUrl).toString(), {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: stateKey, value: [...newCompleted] }),
      });
    } catch (error) {
      console.warn("Failed to save getting started state:", error);
    }
  };

  const toggleStep = useCallback(
    (stepId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newCompleted = new Set(completedSteps);
      if (newCompleted.has(stepId)) {
        newCompleted.delete(stepId);
      } else {
        newCompleted.add(stepId);
      }
      setCompletedSteps(newCompleted);
      saveCompletedSteps(newCompleted);
    },
    [completedSteps]
  );

  const handleDismiss = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsDismissed(true);
    await AsyncStorage.setItem(localDismissKey, "true").catch(() => {});
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (token) {
        const apiUrl = getApiUrl();
        await fetch(new URL('/api/user/onboarding-state', apiUrl).toString(), {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ key: dismissStateKey, value: true }),
        });
      }
    } catch (error) {
      console.warn("Failed to save dismiss state:", error);
    }
    onDismiss?.();
  }, [dismissStateKey, localDismissKey, onDismiss]);

  const toggleCollapse = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsCollapsed((prev) => {
      const newVal = !prev;
      AsyncStorage.setItem(localCollapseKey, String(newVal)).catch(() => {});
      return newVal;
    });
    chevronRotation.value = withTiming(isCollapsed ? 0 : 1, { duration: 300 });
  }, [isCollapsed, localCollapseKey]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${chevronRotation.value * 180}deg` },
    ],
  }));

  const isStepCompleted = useCallback(
    (step: ChecklistStep) => {
      if (step.isCompleted !== undefined) return step.isCompleted;
      return completedSteps.has(step.id);
    },
    [completedSteps]
  );

  const completedCount = steps.filter((s) => isStepCompleted(s)).length;
  const totalCount = steps.length;
  const allCompleted = completedCount === totalCount;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  if (isLoading || isDismissed) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(300)}
      style={styles.container}
    >
      <Pressable onPress={toggleCollapse} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconContainer}>
            <Ionicons
              name={allCompleted ? "trophy" : "rocket"}
              size={20}
              color={GlowColors.primary}
            />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>
              {allCompleted ? "All Done!" : "Getting Started"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {completedCount}/{totalCount} completed
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={handleDismiss}
            hitSlop={8}
            style={styles.dismissButton}
          >
            <Ionicons name="close" size={18} color={TextColors.muted} />
          </Pressable>
          <Animated.View style={chevronStyle}>
            <Ionicons
              name="chevron-down"
              size={20}
              color={TextColors.secondary}
            />
          </Animated.View>
        </View>
      </Pressable>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarTrack}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: `${progress * 100}%`,
                backgroundColor: allCompleted
                  ? Colors.dark.xpCyan
                  : GlowColors.primary,
              },
            ]}
          />
        </View>
      </View>

      {!isCollapsed ? (
        <View style={styles.stepsContainer}>
          {allCompleted ? (
            <Animated.View
              entering={FadeIn.duration(400)}
              style={styles.celebrationContainer}
            >
              <View style={styles.celebrationIconContainer}>
                <Ionicons name="sparkles" size={32} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.celebrationTitle}>
                You're all set!
              </Text>
              <Text style={styles.celebrationDescription}>
                You've completed all the getting started steps. You're ready to make the most of Glow Up!
              </Text>
              <Pressable onPress={handleDismiss} style={styles.celebrationDismissButton}>
                <Text style={styles.celebrationDismissText}>Dismiss</Text>
              </Pressable>
            </Animated.View>
          ) : (
            steps.map((step, index) => {
              const completed = isStepCompleted(step);
              return (
                <Animated.View
                  key={step.id}
                  entering={FadeIn.duration(300).delay(index * 50)}
                >
                  <StepItem
                    step={step}
                    completed={completed}
                    onToggle={() => toggleStep(step.id)}
                  />
                </Animated.View>
              );
            })
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

function StepItem({
  step,
  completed,
  onToggle,
}: {
  step: ChecklistStep;
  completed: boolean;
  onToggle: () => void;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.stepItem, completed && styles.stepItemCompleted, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onToggle}
    >
      <View style={styles.stepLeft}>
        <View
          style={[
            styles.checkCircle,
            completed && styles.checkCircleCompleted,
          ]}
        >
          {completed ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Ionicons
                name="checkmark"
                size={14}
                color={Colors.dark.buttonText}
              />
            </Animated.View>
          ) : (
            <Ionicons
              name={step.icon as keyof typeof Ionicons.glyphMap}
              size={14}
              color={TextColors.muted}
            />
          )}
        </View>
        <View style={styles.stepTextContainer}>
          <Text
            style={[styles.stepTitle, completed && styles.stepTitleCompleted]}
          >
            {step.title}
          </Text>
          <Text style={styles.stepDescription}>{step.description}</Text>
        </View>
      </View>
      {step.actionLabel && step.onAction && !completed ? (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            step.onAction?.();
          }}
          style={styles.actionButton}
        >
          <Text style={styles.actionButtonText}>{step.actionLabel}</Text>
          <Ionicons
            name="arrow-forward"
            size={12}
            color={Colors.dark.buttonText}
          />
        </Pressable>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  headerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${GlowColors.primary}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.h4,
    color: TextColors.primary,
  },
  headerSubtitle: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dismissButton: {
    padding: Spacing.xs,
  },
  progressBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: Backgrounds.surface,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  stepsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    backgroundColor: Backgrounds.elevated,
  },
  stepItemCompleted: {
    opacity: 0.7,
  },
  stepLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.04)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkCircleCompleted: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  stepTextContainer: {
    flex: 1,
  },
  stepTitle: {
    ...Typography.small,
    fontWeight: "600",
    color: TextColors.primary,
  },
  stepTitleCompleted: {
    textDecorationLine: "line-through",
    color: TextColors.muted,
  },
  stepDescription: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  actionButtonText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  celebrationContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  celebrationIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  celebrationTitle: {
    ...Typography.h3,
    color: TextColors.primary,
    marginBottom: Spacing.sm,
  },
  celebrationDescription: {
    ...Typography.small,
    color: TextColors.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  celebrationDismissButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan,
  },
  celebrationDismissText: {
    ...Typography.small,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
}));

export default GettingStartedChecklist;
