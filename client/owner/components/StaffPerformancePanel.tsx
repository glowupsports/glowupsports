import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface CoachStats {
  id: string;
  name: string;
  sessionsThisMonth: number;
  playersManaged: number;
  earnings: number;
  rating: number;
  trend: "up" | "down" | "stable";
}

interface StaffPerformancePanelProps {
  coaches: CoachStats[];
  currency: string;
  onCoachPress?: (id: string) => void;
  onViewAll?: () => void;
}

export function StaffPerformancePanel({
  coaches,
  currency,
  onCoachPress,
  onViewAll,
}: StaffPerformancePanelProps) {
  const sortedCoaches = [...coaches].sort((a, b) => b.earnings - a.earnings);

  const getTrendIcon = (trend: CoachStats["trend"]): keyof typeof Ionicons.glyphMap => {
    switch (trend) {
      case "up": return "trending-up";
      case "down": return "trending-down";
      default: return "remove";
    }
  };

  const getTrendColor = (trend: CoachStats["trend"]) => {
    switch (trend) {
      case "up": return Colors.dark.primary;
      case "down": return Colors.dark.error;
      default: return Colors.dark.textMuted;
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toLocaleString();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="people" size={18} color={Colors.dark.gold} />
          </View>
          <Text style={styles.title}>Staff Performance</Text>
        </View>
        <Pressable style={styles.viewAllBtn} onPress={onViewAll}>
          <Text style={styles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.dark.gold} />
        </Pressable>
      </View>

      {sortedCoaches.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={32} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No coaches yet</Text>
        </View>
      ) : (
        <View style={styles.coachList}>
          {sortedCoaches.slice(0, 4).map((coach, index) => (
            <Pressable 
              key={coach.id}
              style={[styles.coachRow, index === 0 && styles.topPerformer]}
              onPress={() => onCoachPress?.(coach.id)}
            >
              <View style={styles.rankContainer}>
                <Text style={[styles.rankText, index === 0 && { color: Colors.dark.gold }]}>{index + 1}</Text>
              </View>
              
              <View style={styles.coachInfo}>
                <Text style={styles.coachName} numberOfLines={1}>{coach.name}</Text>
                <View style={styles.coachStats}>
                  <Text style={styles.statText}>{coach.sessionsThisMonth} sessions</Text>
                  <View style={styles.statDot} />
                  <Text style={styles.statText}>{coach.playersManaged} players</Text>
                </View>
              </View>
              
              <View style={styles.earningsColumn}>
                <View style={styles.earningsRow}>
                  <Text style={styles.earningsValue}>{currency} {formatCurrency(coach.earnings)}</Text>
                  <Ionicons 
                    name={getTrendIcon(coach.trend)} 
                    size={14} 
                    color={getTrendColor(coach.trend)} 
                  />
                </View>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={10} color={Colors.dark.gold} />
                  <Text style={styles.ratingText}>{coach.rating.toFixed(1)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.dark.gold + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  coachList: {
    gap: Spacing.sm,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  topPerformer: {
    backgroundColor: Colors.dark.gold + "10",
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  rankContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  coachInfo: {
    flex: 1,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  coachStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.dark.textMuted,
  },
  earningsColumn: {
    alignItems: "flex-end",
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  earningsValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 13,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "600",
    fontSize: 11,
  },
});
