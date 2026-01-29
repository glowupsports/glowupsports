import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

const PLATFORM_PURPLE = "#9B59B6";

interface SubscriptionFunnelProps {
  activeCount: number;
  trialCount: number;
  pausedCount: number;
  churnedThisMonth: number;
  conversionRate: number;
}

export function SubscriptionFunnel({
  activeCount,
  trialCount,
  pausedCount,
  churnedThisMonth,
  conversionRate,
}: SubscriptionFunnelProps) {
  const total = activeCount + trialCount + pausedCount;
  
  const activeWidth = total > 0 ? (activeCount / total) * 100 : 0;
  const trialWidth = total > 0 ? (trialCount / total) * 100 : 0;
  const pausedWidth = total > 0 ? (pausedCount / total) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="funnel" size={18} color={PLATFORM_PURPLE} />
          </View>
          <Text style={styles.title}>Subscription Funnel</Text>
        </View>
      </View>

      <View style={styles.funnelBar}>
        {activeWidth > 0 && (
          <View style={[styles.funnelSegment, { width: `${activeWidth}%`, backgroundColor: Colors.dark.primary }]} />
        )}
        {trialWidth > 0 && (
          <View style={[styles.funnelSegment, { width: `${trialWidth}%`, backgroundColor: PLATFORM_PURPLE }]} />
        )}
        {pausedWidth > 0 && (
          <View style={[styles.funnelSegment, { width: `${pausedWidth}%`, backgroundColor: Colors.dark.textMuted }]} />
        )}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.primary }]} />
          <Text style={styles.legendText}>Active</Text>
          <Text style={styles.legendValue}>{activeCount}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: PLATFORM_PURPLE }]} />
          <Text style={styles.legendText}>Trial</Text>
          <Text style={styles.legendValue}>{trialCount}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.dark.textMuted }]} />
          <Text style={styles.legendText}>Paused</Text>
          <Text style={styles.legendValue}>{pausedCount}</Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricBox}>
          <Ionicons name="exit-outline" size={16} color={Colors.dark.error} />
          <View>
            <Text style={styles.metricValue}>{churnedThisMonth}</Text>
            <Text style={styles.metricLabel}>Churned</Text>
          </View>
        </View>
        <View style={styles.metricBox}>
          <Ionicons name="swap-horizontal" size={16} color={Colors.dark.primary} />
          <View>
            <Text style={[styles.metricValue, { color: Colors.dark.primary }]}>{conversionRate}%</Text>
            <Text style={styles.metricLabel}>Trial → Paid</Text>
          </View>
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
    backgroundColor: PLATFORM_PURPLE + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  funnelBar: {
    height: 12,
    flexDirection: "row",
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  funnelSegment: {
    height: "100%",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  legendItem: {
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  legendValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  metricBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  metricValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  metricLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
});
