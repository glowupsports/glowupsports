import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Spacing, Backgrounds, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";

interface BurnoutRiskData {
  riskScore: number;
  riskLevel: "low" | "moderate" | "high" | "critical";
  metrics: {
    avgDailyMinutesPast: number;
    avgDailyMinutesFuture: number;
    consecutiveHeavyDays: number;
    restDaysLastWeek: number;
    totalMinutesPast14Days: number;
    scheduledMinutesNext7Days: number;
  };
  recommendations: string[];
}

interface Props {
  onPress?: () => void;
}

export function BurnoutRiskCard({ onPress }: Props) {
  const { coach } = useCoach();

  const { data, isLoading } = useQuery<BurnoutRiskData>({
    queryKey: ["/api/coaches", coach?.id, "burnout-risk"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingText}>Analyzing workload...</Text>
        </View>
      </View>
    );
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical":
        return Colors.dark.error;
      case "high":
        return Colors.dark.orange;
      case "moderate":
        return Colors.dark.gold;
      default:
        return Colors.dark.primary;
    }
  };

  const getRiskGradient = (level: string): [string, string] => {
    switch (level) {
      case "critical":
        return [Colors.dark.error + "40", Colors.dark.error + "10"];
      case "high":
        return [Colors.dark.orange + "40", Colors.dark.orange + "10"];
      case "moderate":
        return [Colors.dark.gold + "40", Colors.dark.gold + "10"];
      default:
        return [Colors.dark.primary + "40", Colors.dark.primary + "10"];
    }
  };

  const getRiskIcon = (level: string): keyof typeof Ionicons.glyphMap => {
    switch (level) {
      case "critical":
        return "warning";
      case "high":
        return "alert-circle";
      case "moderate":
        return "information-circle";
      default:
        return "checkmark-circle";
    }
  };

  const riskColor = getRiskColor(data.riskLevel);

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <LinearGradient
        colors={getRiskGradient(data.riskLevel)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="fitness-outline" size={18} color={riskColor} />
            <Text style={styles.title}>Wellbeing</Text>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: riskColor + "20" }]}>
            <Ionicons name={getRiskIcon(data.riskLevel)} size={14} color={riskColor} />
            <Text style={[styles.riskBadgeText, { color: riskColor }]}>
              {data.riskLevel.charAt(0).toUpperCase() + data.riskLevel.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.scoreContainer}>
          <View style={styles.scoreCircle}>
            <Text style={[styles.scoreNumber, { color: riskColor }]}>{data.riskScore}</Text>
            <Text style={styles.scoreLabel}>Risk</Text>
          </View>
          <View style={styles.metricsContainer}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Avg daily</Text>
              <Text style={styles.metricValue}>
                {Math.round(data.metrics.avgDailyMinutesPast / 60 * 10) / 10}h
              </Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Rest days</Text>
              <Text style={styles.metricValue}>{data.metrics.restDaysLastWeek}/7</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Heavy streak</Text>
              <Text style={styles.metricValue}>{data.metrics.consecutiveHeavyDays}d</Text>
            </View>
          </View>
        </View>

        {data.recommendations.length > 0 ? (
          <View style={styles.recommendationContainer}>
            <Ionicons name="bulb-outline" size={14} color={Colors.dark.tabIconDefault} />
            <Text style={styles.recommendationText} numberOfLines={2}>
              {data.recommendations[0]}
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  loadingCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.lg,
    alignItems: "center",
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  card: {
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    gap: Spacing.xs,
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  riskBadgeText: {
    ...Typography.small,
    fontWeight: "600",
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  scoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: "700",
  },
  scoreLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    fontSize: 10,
  },
  metricsContainer: {
    flex: 1,
    gap: Spacing.xs,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
  },
  metricValue: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  recommendationContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  recommendationText: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    flex: 1,
    lineHeight: 18,
  },
});
