import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface CoachInsight {
  id: string;
  type: "level_up" | "attendance" | "streak" | "earnings" | "alert";
  title: string;
  description: string;
  playerId?: string;
}

interface CoachInsightsPanelProps {
  insights: CoachInsight[];
  onInsightPress?: (insight: CoachInsight) => void;
}

export function CoachInsightsPanel({ insights, onInsightPress }: CoachInsightsPanelProps) {
  if (insights.length === 0) return null;

  const getInsightStyle = (type: CoachInsight["type"]) => {
    switch (type) {
      case "level_up":
        return { icon: "trending-up" as const, color: Colors.dark.primary, bg: Colors.dark.primary + "15" };
      case "attendance":
        return { icon: "calendar" as const, color: Colors.dark.xpCyan, bg: Colors.dark.xpCyan + "15" };
      case "streak":
        return { icon: "flame" as const, color: Colors.dark.orange, bg: Colors.dark.orange + "15" };
      case "earnings":
        return { icon: "cash" as const, color: Colors.dark.gold, bg: Colors.dark.gold + "15" };
      case "alert":
        return { icon: "alert-circle" as const, color: Colors.dark.error, bg: Colors.dark.error + "15" };
      default:
        return { icon: "bulb" as const, color: Colors.dark.primary, bg: Colors.dark.primary + "15" };
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconBg}>
          <Ionicons name="sparkles" size={14} color={Colors.dark.primary} />
        </View>
        <Text style={styles.title}>Smart Insights</Text>
      </View>
      
      <View style={styles.insightsContainer}>
        {insights.slice(0, 3).map((insight) => {
          const style = getInsightStyle(insight.type);
          return (
            <Pressable
              key={insight.id}
              style={styles.insightRow}
              onPress={() => onInsightPress?.(insight)}
            >
              <View style={[styles.insightIcon, { backgroundColor: style.bg }]}>
                <Ionicons name={style.icon} size={14} color={style.color} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle} numberOfLines={1}>{insight.title}</Text>
                <Text style={styles.insightDesc} numberOfLines={1}>{insight.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  iconBg: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  insightsContainer: {
    gap: Spacing.xs,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "500",
    fontSize: 12,
  },
  insightDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
});
