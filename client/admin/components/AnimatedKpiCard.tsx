import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface AnimatedKpiCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  displayValue?: string;
  color: string;
  trend?: { value: number; direction: "up" | "down" };
  isPrimary?: boolean;
  onPress?: () => void;
}

export function AnimatedKpiCard({
  icon,
  label,
  value,
  displayValue,
  color,
  trend,
  isPrimary = false,
  onPress,
}: AnimatedKpiCardProps) {
  const animatedValue = useSharedValue(0);
  const glowAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(1);

  useEffect(() => {
    animatedValue.value = withTiming(value, { 
      duration: 1200, 
      easing: Easing.out(Easing.cubic) 
    });

    if (isPrimary) {
      glowAnim.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000 }),
          withTiming(0, { duration: 2000 })
        ),
        -1,
        false
      );
    }
  }, [value, isPrimary]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowAnim.value, [0, 1], [0.2, 0.5]),
  }));

  const handlePressIn = () => {
    scaleAnim.value = withSpring(0.95, { damping: 15 });
  };

  const handlePressOut = () => {
    scaleAnim.value = withSpring(1, { damping: 15 });
  };

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
    >
      <Animated.View style={[styles.container, cardAnimatedStyle]}>
        {isPrimary && (
          <Animated.View style={[styles.glowOverlay, glowStyle]}>
            <LinearGradient
              colors={[color + "40", "transparent"]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}

        <LinearGradient
          colors={[`${color}08`, Colors.dark.backgroundSecondary]}
          style={[styles.card, isPrimary && styles.primaryCard]}
        >
          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
              <Ionicons name={icon} size={isPrimary ? 24 : 20} color={color} />
            </View>

            <Text style={[styles.value, isPrimary && styles.primaryValue, { color }]}>
              {displayValue || value}
            </Text>
            
            <Text style={[styles.label, isPrimary && styles.primaryLabel]}>{label}</Text>

            {trend && (
              <View style={[styles.trendBadge, { backgroundColor: trend.direction === "up" ? Colors.dark.primary + "20" : Colors.dark.error + "20" }]}>
                <Ionicons 
                  name={trend.direction === "up" ? "arrow-up" : "arrow-down"} 
                  size={10} 
                  color={trend.direction === "up" ? Colors.dark.primary : Colors.dark.error} 
                />
                <Text style={[styles.trendText, { color: trend.direction === "up" ? Colors.dark.primary : Colors.dark.error }]}>
                  {trend.value}%
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.borderGlow, { backgroundColor: color + "40" }]} />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  primaryCard: {
    padding: Spacing.lg,
  },
  content: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  value: {
    ...Typography.h2,
    fontSize: 24,
  },
  primaryValue: {
    fontSize: 32,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  primaryLabel: {
    fontSize: 11,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: Spacing.xs,
  },
  trendText: {
    fontSize: 10,
    fontWeight: "700",
  },
  borderGlow: {
    position: "absolute",
    bottom: 0,
    left: Spacing.lg,
    right: Spacing.lg,
    height: 2,
    borderRadius: 1,
  },
});
