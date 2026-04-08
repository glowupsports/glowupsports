import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

export interface Insight {
  id: string;
  type: "trend_up" | "trend_down" | "alert" | "suggestion" | "achievement";
  title: string;
  description: string;
  metric?: string;
  change?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface SmartInsightsPanelProps {
  insights: Insight[];
}

function InsightCard({ insight }: { insight: Insight }) {
  const getConfig = () => {
    switch (insight.type) {
      case "trend_up":
        return { icon: "trending-up" as const, color: Colors.dark.primary, bg: Colors.dark.primary + "15" };
      case "trend_down":
        return { icon: "trending-down" as const, color: Colors.dark.error, bg: Colors.dark.error + "15" };
      case "alert":
        return { icon: "alert-circle" as const, color: Colors.dark.orange, bg: Colors.dark.orange + "15" };
      case "suggestion":
        return { icon: "bulb" as const, color: Colors.dark.xpCyan, bg: Colors.dark.xpCyan + "15" };
      case "achievement":
        return { icon: "trophy" as const, color: Colors.dark.gold, bg: Colors.dark.gold + "15" };
      default:
        return { icon: "information-circle" as const, color: Colors.dark.textMuted, bg: Colors.dark.textMuted + "15" };
    }
  };

  const config = getConfig();

  return (
    <View style={[styles.insightCard, { borderLeftColor: config.color }]}>
      <View style={[styles.insightIcon, { backgroundColor: config.bg }]}>
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      
      <View style={styles.insightContent}>
        <View style={styles.insightHeader}>
          <Text style={styles.insightTitle}>{insight.title}</Text>
          {insight.change !== undefined && (
            <View style={[styles.changeBadge, { backgroundColor: insight.change >= 0 ? Colors.dark.primary + "20" : Colors.dark.error + "20" }]}>
              <Ionicons 
                name={insight.change >= 0 ? "arrow-up" : "arrow-down"} 
                size={10} 
                color={insight.change >= 0 ? Colors.dark.primary : Colors.dark.error} 
              />
              <Text style={[styles.changeText, { color: insight.change >= 0 ? Colors.dark.primary : Colors.dark.error }]}>
                {Math.abs(insight.change)}%
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.insightDescription}>{insight.description}</Text>
        
        {insight.actionLabel && insight.onAction && (
          <Pressable 
            style={styles.actionButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              insight.onAction?.();
            }}
          >
            <Text style={[styles.actionText, { color: config.color }]}>{insight.actionLabel}</Text>
            <Ionicons name="arrow-forward" size={14} color={config.color} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function SmartInsightsPanel({ insights }: SmartInsightsPanelProps) {
  if (insights.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <LinearGradient
              colors={[Colors.dark.xpCyan, Colors.dark.primary]}
              style={styles.aiIcon}
            >
              <Ionicons name="sparkles" size={14} color={Colors.dark.buttonText} />
            </LinearGradient>
            <Text style={styles.title}>SMART INSIGHTS</Text>
          </View>
          <View style={styles.aiBadge}>
            <Text style={styles.aiText}>AI</Text>
          </View>
        </View>

        <View style={styles.insightsList}>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  aiIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 1.5,
  },
  aiBadge: {
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 1,
  },
  insightsList: {
    gap: Spacing.md,
  },
  insightCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderLeftWidth: 3,
    gap: Spacing.md,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  insightContent: {
    flex: 1,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  insightTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  changeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  insightDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
