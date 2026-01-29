import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface GrowthMetricsPanelProps {
  newSignups: number;
  signupChange: number;
  retentionRate: number;
  retentionChange: number;
  churnRate: number;
  activeGrowth: number;
}

export function GrowthMetricsPanel({
  newSignups,
  signupChange,
  retentionRate,
  retentionChange,
  churnRate,
  activeGrowth,
}: GrowthMetricsPanelProps) {
  const formatChange = (value: number) => {
    const prefix = value >= 0 ? "+" : "";
    return `${prefix}${value}%`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="trending-up" size={18} color={Colors.dark.primary} />
          </View>
          <Text style={styles.title}>Growth Metrics</Text>
        </View>
        <Text style={styles.period}>This Month</Text>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="person-add" size={16} color={Colors.dark.xpCyan} />
            <View style={[styles.changeBadge, { backgroundColor: signupChange >= 0 ? Colors.dark.primary + "20" : Colors.dark.error + "20" }]}>
              <Ionicons 
                name={signupChange >= 0 ? "arrow-up" : "arrow-down"} 
                size={10} 
                color={signupChange >= 0 ? Colors.dark.primary : Colors.dark.error} 
              />
              <Text style={[styles.changeText, { color: signupChange >= 0 ? Colors.dark.primary : Colors.dark.error }]}>
                {formatChange(signupChange)}
              </Text>
            </View>
          </View>
          <Text style={styles.metricValue}>{newSignups}</Text>
          <Text style={styles.metricLabel}>New Signups</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="heart" size={16} color={Colors.dark.primary} />
            <View style={[styles.changeBadge, { backgroundColor: retentionChange >= 0 ? Colors.dark.primary + "20" : Colors.dark.error + "20" }]}>
              <Ionicons 
                name={retentionChange >= 0 ? "arrow-up" : "arrow-down"} 
                size={10} 
                color={retentionChange >= 0 ? Colors.dark.primary : Colors.dark.error} 
              />
              <Text style={[styles.changeText, { color: retentionChange >= 0 ? Colors.dark.primary : Colors.dark.error }]}>
                {formatChange(retentionChange)}
              </Text>
            </View>
          </View>
          <Text style={styles.metricValue}>{retentionRate}%</Text>
          <Text style={styles.metricLabel}>Retention Rate</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="exit" size={16} color={Colors.dark.error} />
          </View>
          <Text style={[styles.metricValue, { color: churnRate > 5 ? Colors.dark.error : Colors.dark.text }]}>{churnRate}%</Text>
          <Text style={styles.metricLabel}>Churn Rate</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="rocket" size={16} color={Colors.dark.gold} />
          </View>
          <Text style={[styles.metricValue, { color: activeGrowth >= 0 ? Colors.dark.primary : Colors.dark.error }]}>
            {activeGrowth >= 0 ? "+" : ""}{activeGrowth}%
          </Text>
          <Text style={styles.metricLabel}>Active Growth</Text>
        </View>
      </View>
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
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  period: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  metricCard: {
    width: "48%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  changeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: 2,
  },
  changeText: {
    ...Typography.small,
    fontWeight: "600",
    fontSize: 10,
  },
  metricValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  metricLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
});
