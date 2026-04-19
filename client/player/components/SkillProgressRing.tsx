import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Colors, Typography } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface SkillProgressRingProps {
  currentXp: number;
  xpForNextLevel: number;
  level: number;
  size?: number;
  strokeWidth?: number;
}

export function SkillProgressRing({
  currentXp,
  xpForNextLevel,
  level,
  size = 44,
  strokeWidth = 4,
}: SkillProgressRingProps) {
  const progress = useSharedValue(0);
  
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  
  const progressPercent = Math.min((currentXp / xpForNextLevel) * 100, 100);

  useEffect(() => {
    progress.value = withTiming(progressPercent / 100, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [progressPercent]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const getProgressColor = () => {
    if (progressPercent >= 90) return Colors.dark.gold;
    if (progressPercent >= 70) return Colors.dark.primary;
    if (progressPercent >= 40) return Colors.dark.primary;
    return Colors.dark.primary;
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={Colors.dark.border}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={getProgressColor()}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        <Text style={styles.levelText}>{level}</Text>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  svg: {
    position: "absolute",
  },
  labelContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  levelText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    fontSize: 14,
  },
}));
