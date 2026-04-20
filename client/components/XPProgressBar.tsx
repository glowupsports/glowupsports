import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface XPProgressBarProps {
  currentXP: number;
  xpToNextLevel: number;
  level: number;
}

export function XPProgressBar({ currentXP, xpToNextLevel, level }: XPProgressBarProps) {
  const progress = useSharedValue(0);
  const percentage = (currentXP / xpToNextLevel) * 100;

  useEffect(() => {
    progress.value = withTiming(percentage, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [percentage]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText style={styles.levelText}>Level {level}</ThemedText>
        <ThemedText style={styles.xpText}>
          {currentXP.toLocaleString()} / {xpToNextLevel.toLocaleString()} XP
        </ThemedText>
      </View>
      <View style={styles.trackContainer}>
        <View style={styles.track}>
          <Animated.View style={[styles.fillContainer, animatedStyle]}>
            <LinearGradient
              colors={[Colors.dark.xpCyan, GlowColors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fill}
            />
          </Animated.View>
        </View>
        <View style={styles.glowOverlay} />
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    width: "100%",
    gap: Spacing.xs,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  levelText: {
    fontSize: 14,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 0.5,
  },
  xpText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  trackContainer: {
    position: "relative",
  },
  track: {
    height: 8,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  fillContainer: {
    height: "100%",
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  fill: {
    flex: 1,
  },
  glowOverlay: {
    position: "absolute",
    top: -2,
    left: 0,
    right: 0,
    height: 10,
    opacity: 0.3,
  },
}));
