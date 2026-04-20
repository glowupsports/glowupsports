import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
  FadeIn,
  SlideInUp,
} from "react-native-reanimated";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
Backgrounds, } from "@/constants/theme";

interface EmptyStateCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  ctaText: string;
  onPress: () => void;
  variant?: "default" | "success" | "info" | "warning";
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function EmptyStateCard({
  icon,
  title,
  description,
  ctaText,
  onPress,
  variant = "default",
  style,
}: EmptyStateCardProps) {
  const scale = useSharedValue(1);
  const iconScale = useSharedValue(1);

  const getVariantColors = () => {
    switch (variant) {
      case "success":
        return { accent: GlowColors.primary, bg: `${GlowColors.primary}15` };
      case "info":
        return { accent: Colors.dark.xpCyan, bg: `${Colors.dark.xpCyan}15` };
      case "warning":
        return { accent: Colors.dark.orange, bg: `${Colors.dark.orange}15` };
      default:
        return { accent: GlowColors.primary, bg: "rgba(255, 255, 255, 0.08)" };
    }
  };

  const colors = getVariantColors();

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
    iconScale.value = withSequence(
      withSpring(1.1, { damping: 10 }),
      withSpring(1, { damping: 15 })
    );
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <AnimatedPressable
      entering={FadeIn.duration(400).delay(100)}
      style={[styles.container, containerStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      <Animated.View
        entering={SlideInUp.duration(500).delay(200)}
        style={[styles.iconContainer, { backgroundColor: colors.bg }]}
      >
        <Animated.View style={iconAnimatedStyle}>
          <Ionicons name={icon} size={32} color={colors.accent} />
        </Animated.View>
      </Animated.View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={[styles.ctaButton, { backgroundColor: colors.accent }]}>
        <Text style={styles.ctaText}>{ctaText}</Text>
        <Ionicons name="arrow-forward" size={16} color={"rgba(255, 255, 255, 0.06)"} />
      </View>
    </AnimatedPressable>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h3,
    color: TextColors.primary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    ...Typography.body,
    color: TextColors.muted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  ctaText: {
    ...Typography.body,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.06)",
  },
}));

export default EmptyStateCard;
