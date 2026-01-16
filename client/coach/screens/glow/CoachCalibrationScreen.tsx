import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";

interface CalibrationMetric {
  id: string;
  name: string;
  description: string;
  score: number;
  maxScore: number;
  status: "good" | "warning" | "critical";
  trend: "up" | "down" | "stable";
}

interface AnomalyAlert {
  id: string;
  type: "fast_promotion" | "scoring_bias" | "evidence_gap" | "pattern_deviation";
  severity: "low" | "medium" | "high";
  playerName: string;
  description: string;
  detectedAt: string;
  resolved: boolean;
}

interface CoachStats {
  totalPlayers: number;
  avgPromotionDays: number;
  avgSkillScore: number;
  evidenceRatio: number;
  calibrationScore: number;
}

const ANOMALY_COLORS = {
  fast_promotion: Colors.dark.orange,
  scoring_bias: Colors.dark.ballRed,
  evidence_gap: Colors.dark.gold,
  pattern_deviation: Colors.dark.ballGlow,
};

const ANOMALY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  fast_promotion: "flash-outline",
  scoring_bias: "analytics-outline",
  evidence_gap: "videocam-off-outline",
  pattern_deviation: "warning-outline",
};

export default function CoachCalibrationScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [showResolved, setShowResolved] = useState(false);

  const { data: stats } = useQuery<CoachStats>({
    queryKey: ["/api/coach/calibration/stats"],
  });

  const { data: metrics = [] } = useQuery<CalibrationMetric[]>({
    queryKey: ["/api/coach/calibration/metrics"],
  });

  const { data: anomalies = [] } = useQuery<AnomalyAlert[]>({
    queryKey: ["/api/coach/calibration/anomalies"],
  });

  const filteredAnomalies = showResolved 
    ? anomalies 
    : anomalies.filter(a => !a.resolved);

  const getStatusColor = (status: CalibrationMetric["status"]) => {
    switch (status) {
      case "good": return Colors.dark.successNeon;
      case "warning": return Colors.dark.orange;
      case "critical": return Colors.dark.error;
    }
  };

  const getTrendIcon = (trend: CalibrationMetric["trend"]): keyof typeof Ionicons.glyphMap => {
    switch (trend) {
      case "up": return "trending-up";
      case "down": return "trending-down";
      default: return "remove-outline";
    }
  };

  const getSeverityColor = (severity: AnomalyAlert["severity"]) => {
    switch (severity) {
      case "high": return Colors.dark.error;
      case "medium": return Colors.dark.orange;
      case "low": return Colors.dark.gold;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const calibrationScore = stats?.calibrationScore ?? 0;
  const calibrationColor = calibrationScore >= 80 
    ? Colors.dark.successNeon 
    : calibrationScore >= 60 
      ? Colors.dark.orange 
      : Colors.dark.error;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <ThemedText style={styles.title}>Coach Calibration</ThemedText>
      <ThemedText style={styles.subtitle}>
        Monitor your scoring consistency and identify potential issues
      </ThemedText>

      <Card style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <ThemedText style={styles.scoreLabel}>Calibration Score</ThemedText>
          <Ionicons 
            name="shield-checkmark" 
            size={24} 
            color={calibrationColor} 
          />
        </View>
        <View style={styles.scoreRow}>
          <ThemedText style={[styles.scoreValue, { color: calibrationColor }]}>
            {calibrationScore}
          </ThemedText>
          <ThemedText style={styles.scoreMax}>/100</ThemedText>
        </View>
        <ThemedText style={styles.scoreDescription}>
          {calibrationScore >= 80 
            ? "Excellent! Your scoring is consistent with platform standards."
            : calibrationScore >= 60
              ? "Good, but some areas need attention."
              : "Action required: Review your scoring patterns."}
        </ThemedText>

        <View style={styles.quickStats}>
          <View style={styles.quickStat}>
            <ThemedText style={styles.quickStatValue}>{stats?.totalPlayers ?? 0}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>Players</ThemedText>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStat}>
            <ThemedText style={styles.quickStatValue}>{stats?.avgPromotionDays ?? 0}d</ThemedText>
            <ThemedText style={styles.quickStatLabel}>Avg Promotion</ThemedText>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStat}>
            <ThemedText style={styles.quickStatValue}>{((stats?.evidenceRatio ?? 0) * 100).toFixed(0)}%</ThemedText>
            <ThemedText style={styles.quickStatLabel}>Evidence Rate</ThemedText>
          </View>
        </View>
      </Card>

      <ThemedText style={styles.sectionTitle}>Calibration Metrics</ThemedText>

      {metrics.map((metric) => (
        <Card key={metric.id} style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <View style={styles.metricInfo}>
              <ThemedText style={styles.metricName}>{metric.name}</ThemedText>
              <ThemedText style={styles.metricDescription}>{metric.description}</ThemedText>
            </View>
            <View style={styles.metricScore}>
              <ThemedText style={[styles.metricValue, { color: getStatusColor(metric.status) }]}>
                {metric.score}/{metric.maxScore}
              </ThemedText>
              <Ionicons 
                name={getTrendIcon(metric.trend)} 
                size={16} 
                color={metric.trend === "up" ? Colors.dark.successNeon : metric.trend === "down" ? Colors.dark.error : Colors.dark.text} 
              />
            </View>
          </View>
          <View style={styles.metricBar}>
            <View 
              style={[
                styles.metricBarFill, 
                { 
                  width: `${(metric.score / metric.maxScore) * 100}%`,
                  backgroundColor: getStatusColor(metric.status),
                }
              ]} 
            />
          </View>
        </Card>
      ))}

      <View style={styles.anomalySection}>
        <View style={styles.anomalyHeader}>
          <ThemedText style={styles.sectionTitle}>Anomaly Alerts</ThemedText>
          <Pressable 
            style={styles.filterButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowResolved(!showResolved);
            }}
          >
            <Ionicons 
              name={showResolved ? "eye" : "eye-off"} 
              size={16} 
              color={Colors.dark.text} 
            />
            <ThemedText style={styles.filterButtonText}>
              {showResolved ? "Show Active" : "Show All"}
            </ThemedText>
          </Pressable>
        </View>

        {filteredAnomalies.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="shield-checkmark-outline" size={48} color={Colors.dark.successNeon} />
            <ThemedText style={styles.emptyText}>No anomalies detected</ThemedText>
            <ThemedText style={styles.emptySubtext}>Your scoring patterns are consistent</ThemedText>
          </Card>
        ) : (
          filteredAnomalies.map((anomaly) => (
            <Card 
              key={anomaly.id} 
              style={[styles.anomalyCard, anomaly.resolved ? styles.resolvedCard : null].filter(Boolean)}
            >
              <View style={styles.anomalyIconRow}>
                <View style={[styles.anomalyIcon, { backgroundColor: ANOMALY_COLORS[anomaly.type] + "20" }]}>
                  <Ionicons 
                    name={ANOMALY_ICONS[anomaly.type]} 
                    size={20} 
                    color={ANOMALY_COLORS[anomaly.type]} 
                  />
                </View>
                <View style={styles.anomalyInfo}>
                  <View style={styles.anomalyTitleRow}>
                    <ThemedText style={styles.anomalyPlayer}>{anomaly.playerName}</ThemedText>
                    <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(anomaly.severity) + "20" }]}>
                      <ThemedText style={[styles.severityText, { color: getSeverityColor(anomaly.severity) }]}>
                        {anomaly.severity.toUpperCase()}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.anomalyDate}>{formatDate(anomaly.detectedAt)}</ThemedText>
                </View>
                {anomaly.resolved ? (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
                ) : null}
              </View>
              <ThemedText style={styles.anomalyDescription}>{anomaly.description}</ThemedText>
              
              {!anomaly.resolved ? (
                <View style={styles.anomalyActions}>
                  <Pressable style={styles.reviewButton}>
                    <Ionicons name="eye-outline" size={16} color={Colors.dark.xpCyan} />
                    <ThemedText style={styles.reviewButtonText}>Review</ThemedText>
                  </Pressable>
                  <Pressable style={styles.dismissButton}>
                    <Ionicons name="close-outline" size={16} color={Colors.dark.text} />
                    <ThemedText style={styles.dismissButtonText}>Dismiss</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          ))
        )}
      </View>

      <Card style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={24} color={Colors.dark.xpCyan} />
        <View style={styles.infoContent}>
          <ThemedText style={styles.infoTitle}>About Calibration</ThemedText>
          <ThemedText style={styles.infoText}>
            The calibration system monitors your scoring patterns to ensure consistency across the platform. 
            It detects potential issues like unusually fast promotions, scoring bias, or missing evidence.
          </ThemedText>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.xl,
  },
  scoreCard: {
    marginBottom: Spacing.xl,
    padding: Spacing.xl,
  },
  scoreHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  scoreLabel: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: Spacing.sm,
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: "700",
  },
  scoreMax: {
    fontSize: 24,
    color: Colors.dark.text,
    opacity: 0.4,
    marginLeft: Spacing.xs,
  },
  scoreDescription: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.8,
    marginBottom: Spacing.lg,
  },
  quickStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  quickStat: {
    alignItems: "center",
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  quickStatLabel: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  metricCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  metricInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  metricName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  metricDescription: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  metricScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  metricBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  metricBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  anomalySection: {
    marginTop: Spacing.xl,
  },
  anomalyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  filterButtonText: {
    fontSize: 12,
    color: Colors.dark.text,
  },
  emptyCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  anomalyCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  resolvedCard: {
    opacity: 0.6,
  },
  anomalyIconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  anomalyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  anomalyInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  anomalyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  anomalyPlayer: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  severityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  severityText: {
    fontSize: 9,
    fontWeight: "700",
  },
  anomalyDate: {
    fontSize: 11,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  anomalyDescription: {
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  anomalyActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  reviewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  reviewButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  dismissButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  dismissButtonText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  infoCard: {
    marginTop: Spacing.xl,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.8,
    lineHeight: 18,
  },
});
