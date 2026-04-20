import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import {
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
Backgrounds, } from "@/constants/theme";


interface GuidedEmptyStateProps {
  icon: string;
  iconColor?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tips?: string[];
  compact?: boolean;
}

export function GuidedEmptyState({
  icon,
  iconColor = GlowColors.primary,
  title,
  description,
  actionLabel,
  onAction,
  tips,
  compact = false,
}: GuidedEmptyStateProps) {
  const bounceY = useSharedValue(0);
  const glowOpacity = useSharedValue(0.2);

  useEffect(() => {
    bounceY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1200 }),
        withTiming(0, { duration: 1200 })
      ),
      -1,
      true
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 1500 }),
        withTiming(0.2, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);

  const iconBounce = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify()}
      style={[styles.container, compact ? styles.containerCompact : null]}
    >
      <View style={styles.iconArea}>
        <Animated.View style={[styles.iconGlow, { backgroundColor: iconColor }, glowStyle]} />
        <Animated.View style={iconBounce}>
          <View style={[styles.iconCircle, { borderColor: `${iconColor}30` }]}>
            <Ionicons
              name={icon as keyof typeof Ionicons.glyphMap}
              size={compact ? 28 : 36}
              color={iconColor}
            />
          </View>
        </Animated.View>
      </View>

      <Text style={[styles.title, compact ? styles.titleCompact : null]}>{title}</Text>
      <Text style={[styles.description, compact ? styles.descriptionCompact : null]}>{description}</Text>

      {tips && tips.length > 0 ? (
        <View style={styles.tipsContainer}>
          {tips.map((tip, i) => (
            <Animated.View
              key={i}
              entering={FadeInDown.delay(200 + i * 100).duration(300)}
              style={styles.tipRow}
            >
              <View style={[styles.tipDot, { backgroundColor: iconColor }]} />
              <Text style={styles.tipText}>{tip}</Text>
            </Animated.View>
          ))}
        </View>
      ) : null}

      {actionLabel && onAction ? (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAction();
          }}
          style={[styles.actionButton, { backgroundColor: iconColor }]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.xl,
  },
  containerCompact: {
    paddingVertical: Spacing.xl,
  },
  iconArea: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  iconGlow: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.h2,
    color: TextColors.primary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  titleCompact: {
    fontSize: 18,
  },
  description: {
    ...Typography.body,
    color: TextColors.secondary,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: "80%",
    marginBottom: Spacing.lg,
  },
  descriptionCompact: {
    fontSize: 13,
    marginBottom: Spacing.md,
  },
  tipsContainer: {
    width: "100%",
    maxWidth: "80%",
    marginBottom: Spacing.lg,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  tipText: {
    ...Typography.body,
    color: TextColors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  actionButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.md,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  actionText: {
    ...Typography.h4,
    color: "#000000",
    textAlign: "center",
  },
}));
