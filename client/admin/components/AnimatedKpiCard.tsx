import React, { useEffect, useRef, useState } from "react";
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
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

function useCountUp(target: number, duration = 1000): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const startTime = Date.now();
    const startVal = 0;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(startVal + (target - startVal) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return current;
}

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
  const glowAnim = useSharedValue(0);
  const scaleAnim = useSharedValue(0.9);
  const opacityAnim = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const count = useCountUp(value, 900);

  useEffect(() => {
    scaleAnim.value = withSpring(1, { damping: 18, stiffness: 200 });
    opacityAnim.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });

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
    opacity: interpolate(glowAnim.value, [0, 1], [0.15, 0.45]),
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }, { scale: pressScale.value }],
    opacity: opacityAnim.value,
  }));

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={() => { pressScale.value = withSpring(0.95, { damping: 15 }); }}
      onPressOut={() => { pressScale.value = withSpring(1, { damping: 15 }); }}
      disabled={!onPress}
    >
      <Animated.View style={[styles.container, containerStyle]}>
        {isPrimary && (
          <Animated.View style={[styles.glowOverlay, glowStyle]}>
            <LinearGradient
              colors={[color + "50", "transparent"]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}

        <LinearGradient
          colors={[`${color}10`, Colors.dark.backgroundSecondary]}
          style={[styles.card, isPrimary && styles.primaryCard]}
        >
          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
              <Ionicons name={icon} size={isPrimary ? 24 : 20} color={color} />
            </View>

            <Text style={[styles.value, isPrimary && styles.primaryValue, { color }]}>
              {displayValue || count}
            </Text>

            <Text style={[styles.label, isPrimary && styles.primaryLabel]}>{label}</Text>

            {trend && (
              <View style={[styles.trendBadge, {
                backgroundColor: trend.direction === "up"
                  ? Colors.dark.primary + "20"
                  : Colors.dark.error + "20"
              }]}>
                <Ionicons
                  name={trend.direction === "up" ? "arrow-up" : "arrow-down"}
                  size={10}
                  color={trend.direction === "up" ? Colors.dark.primary : Colors.dark.error}
                />
                <Text style={[styles.trendText, {
                  color: trend.direction === "up" ? Colors.dark.primary : Colors.dark.error
                }]}>
                  {trend.value}%
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.borderGlow, { backgroundColor: color + "50" }]} />
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
