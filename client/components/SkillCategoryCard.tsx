import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { SkillCategory } from "@/constants/playerData";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface SkillCategoryCardProps {
  skill: SkillCategory;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SkillCategoryCard({ skill, onPress }: SkillCategoryCardProps) {
  const scale = useSharedValue(1);
  const percentage = (skill.score / skill.maxScore) * 100;
  const ringSize = 60;
  const strokeWidth = 6;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.card, animatedStyle]}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={skill.icon as keyof typeof Ionicons.glyphMap}
          size={28}
          color={skill.color}
        />
      </View>
      <ThemedText style={styles.name}>{skill.name}</ThemedText>
      <View style={styles.progressContainer}>
        <Svg width={ringSize} height={ringSize} style={styles.ring}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={Colors.dark.backgroundSecondary}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={skill.color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${ringSize / 2}, ${ringSize / 2}`}
          />
        </Svg>
        <View style={styles.scoreOverlay}>
          <ThemedText style={[styles.score, { color: skill.color }]}>{skill.score}</ThemedText>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    alignItems: "center",
    minHeight: 160,
    flex: 1,
  },
  iconContainer: {
    marginBottom: Spacing.sm,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  progressContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    transform: [{ rotateZ: "0deg" }],
  },
  scoreOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  score: {
    fontSize: 16,
    fontWeight: "700",
  },
}));
