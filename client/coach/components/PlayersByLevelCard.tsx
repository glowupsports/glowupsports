import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";

interface LevelSummary {
  red: { total: number; levels: { 1: number; 2: number; 3: number } };
  orange: { total: number; levels: { 1: number; 2: number; 3: number } };
  green: { total: number; levels: { 1: number; 2: number; 3: number } };
  yellow: { total: number; levels: { 1: number; 2: number; 3: number } };
  adult: { total: number; byRank: Record<number, number> };
  unassigned: { total: number };
}

const BALL_COLORS = {
  red: "#EF4444",
  orange: "#F97316",
  green: "#22C55E",
  yellow: "#EAB308",
  adult: "#8B5CF6",
  unassigned: "#6B7280",
};

const BALL_LABELS = {
  red: "Red Ball",
  orange: "Orange Ball",
  green: "Green Ball",
  yellow: "Yellow Ball",
  adult: "Adult Players",
  unassigned: "Unassigned",
};

export function PlayersByLevelCard() {
  const { academy } = useCoach();

  const { data, isLoading } = useQuery<{ summary: LevelSummary }>({
    queryKey: [`/api/lesson-groups/players/by-level?academyId=${academy?.id}`],
    enabled: !!academy?.id,
  });

  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="people" size={20} color={Colors.primary} />
          <Text style={styles.title}>Players by Level</Text>
        </View>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  const summary = data?.summary;
  if (!summary) {
    return null;
  }

  const totalYouth = summary.red.total + summary.orange.total + summary.green.total + summary.yellow.total;
  const totalPlayers = totalYouth + summary.adult.total + summary.unassigned.total;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="people" size={20} color={Colors.primary} />
        <Text style={styles.title}>Players by Level</Text>
        <Text style={styles.totalBadge}>{totalPlayers}</Text>
      </View>

      <View style={styles.levelGrid}>
        {(["red", "orange", "green", "yellow"] as const).map((level) => (
          <View key={level} style={styles.levelCard}>
            <View style={[styles.levelDot, { backgroundColor: BALL_COLORS[level] }]} />
            <Text style={styles.levelLabel}>{BALL_LABELS[level]}</Text>
            <Text style={styles.levelCount}>{summary[level].total}</Text>
            <View style={styles.sublevelRow}>
              {[1, 2, 3].map((sub) => (
                <View key={sub} style={styles.sublevelBadge}>
                  <Text style={styles.sublevelText}>
                    {sub}: {summary[level].levels[sub as 1 | 2 | 3]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.adultCard}>
          <View style={[styles.levelDot, { backgroundColor: BALL_COLORS.adult }]} />
          <Text style={styles.levelLabel}>{BALL_LABELS.adult}</Text>
          <Text style={styles.levelCount}>{summary.adult.total}</Text>
        </View>
        
        {summary.unassigned.total > 0 && (
          <View style={styles.unassignedCard}>
            <Ionicons name="alert-circle" size={16} color={Colors.warning} />
            <Text style={styles.unassignedText}>
              {summary.unassigned.total} unassigned
            </Text>
          </View>
        )}
      </View>

      <View style={styles.progressBar}>
        {(["red", "orange", "green", "yellow", "adult"] as const).map((level) => {
          const count = level === "adult" ? summary.adult.total : summary[level].total;
          const width = totalPlayers > 0 ? (count / totalPlayers) * 100 : 0;
          if (width === 0) return null;
          return (
            <View
              key={level}
              style={[
                styles.progressSegment,
                { width: `${width}%`, backgroundColor: BALL_COLORS[level] },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    ...Typography.subtitle,
    color: Colors.text,
    flex: 1,
  },
  totalBadge: {
    ...Typography.caption,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  levelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  levelCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    width: "48%",
    minHeight: 80,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: Spacing.xs,
  },
  levelLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  levelCount: {
    ...Typography.title,
    color: Colors.text,
    marginVertical: 2,
  },
  sublevelRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: Spacing.xs,
  },
  sublevelBadge: {
    backgroundColor: Colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  sublevelText: {
    ...Typography.small,
    color: Colors.textSecondary,
    fontSize: 10,
  },
  bottomRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  adultCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  unassignedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  unassignedText: {
    ...Typography.caption,
    color: Colors.warning,
  },
  progressBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: Colors.surfaceLight,
  },
  progressSegment: {
    height: "100%",
  },
});
