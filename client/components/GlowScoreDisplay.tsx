import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing } from "@/constants/theme";

interface GlowScoreDisplayProps {
  score: number;
  size?: "small" | "large";
}

export function GlowScoreDisplay({ score, size = "small" }: GlowScoreDisplayProps) {
  const isLarge = size === "large";

  return (
    <View style={styles.container}>
      <Feather
        name="sun"
        size={isLarge ? 24 : 16}
        color={Colors.dark.successNeon}
      />
      <ThemedText style={[styles.label, isLarge && styles.labelLarge]}>Glow Score</ThemedText>
      <ThemedText style={[styles.score, isLarge && styles.scoreLarge]}>{score}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  label: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  labelLarge: {
    fontSize: 14,
  },
  score: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  scoreLarge: {
    fontSize: 20,
  },
});
