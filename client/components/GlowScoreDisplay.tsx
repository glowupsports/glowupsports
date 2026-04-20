import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface GlowScoreDisplayProps {
  score: number;
  size?: "small" | "large";
  onPress?: () => void;
}

export function GlowScoreDisplay({ score, size = "small", onPress }: GlowScoreDisplayProps) {
  const isLarge = size === "large";
  const isTappable = !!onPress;

  const content = (
    <View style={[styles.container, isTappable && styles.tappable]}>
      <Ionicons
        name="sunny-outline"
        size={isLarge ? 24 : 16}
        color={Colors.dark.successNeon}
      />
      <ThemedText style={[styles.label, isLarge && styles.labelLarge]}>Glow Score</ThemedText>
      <ThemedText style={[styles.score, isLarge && styles.scoreLarge]}>{score}</ThemedText>
      {isTappable ? (
        <Ionicons name="chevron-forward-outline" size={16} color={Colors.dark.text} style={styles.chevron} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  tappable: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
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
  chevron: {
    opacity: 0.5,
    marginLeft: 2,
  },
}));
