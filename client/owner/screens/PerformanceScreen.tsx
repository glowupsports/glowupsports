import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  subtitle?: string;
  color: string;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
}

function MetricCard({ icon, title, value, subtitle, color, trend }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, CardStyles.elevated]}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.metricContent}>
        <Text style={styles.metricTitle}>{title}</Text>
        <View style={styles.metricValueRow}>
          <Text style={[styles.metricValue, { color }]}>{value}</Text>
          {trend ? (
            <View style={styles.trendBadge}>
              <Ionicons
                name={trend.direction === "up" ? "arrow-up" : trend.direction === "down" ? "arrow-down" : "remove"}
                size={12}
                color={trend.direction === "up" ? Colors.dark.primary : trend.direction === "down" ? Colors.dark.error : Colors.dark.textMuted}
              />
              <Text
                style={[
                  styles.trendText,
                  { color: trend.direction === "up" ? Colors.dark.primary : trend.direction === "down" ? Colors.dark.error : Colors.dark.textMuted },
                ]}
              >
                {trend.value}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.metricSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

interface CoachPerformanceRowProps {
  name: string;
  sessions: number;
  feedbackRate: number;
  playerImprovement: number;
}

function CoachPerformanceRow({ name, sessions, feedbackRate, playerImprovement }: CoachPerformanceRowProps) {
  return (
    <View style={styles.coachRow}>
      <View style={styles.coachAvatar}>
        <Ionicons name="person" size={18} color={Colors.dark.textMuted} />
      </View>
      <Text style={styles.coachName}>{name}</Text>
      <View style={styles.coachStats}>
        <View style={styles.coachStat}>
          <Text style={styles.coachStatValue}>{sessions}</Text>
          <Text style={styles.coachStatLabel}>Sessions</Text>
        </View>
        <View style={styles.coachStat}>
          <Text style={[styles.coachStatValue, feedbackRate >= 90 ? { color: Colors.dark.primary } : feedbackRate < 70 ? { color: Colors.dark.error } : {}]}>
            {feedbackRate}%
          </Text>
          <Text style={styles.coachStatLabel}>Feedback</Text>
        </View>
        <View style={styles.coachStat}>
          <Text style={[styles.coachStatValue, { color: playerImprovement >= 0 ? Colors.dark.primary : Colors.dark.error }]}>
            {playerImprovement >= 0 ? "+" : ""}{playerImprovement}%
          </Text>
          <Text style={styles.coachStatLabel}>Improve</Text>
        </View>
      </View>
    </View>
  );
}

interface PlayerHealthRowProps {
  name: string;
  level: string;
  risk: "low" | "medium" | "high";
  indicator: string;
}

function PlayerHealthRow({ name, level, risk, indicator }: PlayerHealthRowProps) {
  const riskColors = {
    low: Colors.dark.primary,
    medium: Colors.dark.orange,
    high: Colors.dark.error,
  };

  return (
    <View style={styles.playerRow}>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{name}</Text>
        <Text style={styles.playerLevel}>{level}</Text>
      </View>
      <View style={[styles.riskBadge, { backgroundColor: `${riskColors[risk]}20` }]}>
        <View style={[styles.riskDot, { backgroundColor: riskColors[risk] }]} />
        <Text style={[styles.riskText, { color: riskColors[risk] }]}>{indicator}</Text>
      </View>
    </View>
  );
}

export default function PerformanceScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Performance</Text>
          <Text style={styles.subtitle}>Academy metrics and player health</Text>
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard
            icon="star"
            title="Avg Glow Score"
            value="7.8"
            color={Colors.dark.gold}
            trend={{ value: "+0.3", direction: "up" }}
          />
          <MetricCard
            icon="trending-up"
            title="Progress Velocity"
            value="12%"
            subtitle="per month"
            color={Colors.dark.primary}
            trend={{ value: "+2%", direction: "up" }}
          />
          <MetricCard
            icon="calendar"
            title="Attendance"
            value="89%"
            color={Colors.dark.xpCyan}
            trend={{ value: "-1%", direction: "down" }}
          />
          <MetricCard
            icon="people"
            title="Level Distribution"
            value="Balanced"
            color={Colors.dark.orange}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coach Performance</Text>
          <View style={[styles.tableContainer, CardStyles.elevated]}>
            <CoachPerformanceRow name="Alex Johnson" sessions={48} feedbackRate={94} playerImprovement={15} />
            <CoachPerformanceRow name="Maria Garcia" sessions={32} feedbackRate={87} playerImprovement={8} />
            <CoachPerformanceRow name="John Smith" sessions={24} feedbackRate={65} playerImprovement={-2} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Player Health Indicators</Text>
          <View style={[styles.tableContainer, CardStyles.elevated]}>
            <PlayerHealthRow name="Tommy Wilson" level="Green Ball" risk="low" indicator="Fast progress" />
            <PlayerHealthRow name="Emma Davis" level="Orange Ball" risk="medium" indicator="Plateau detected" />
            <PlayerHealthRow name="Jake Brown" level="Red Ball" risk="high" indicator="Drop-off risk" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  metricCard: {
    width: "48%",
    flexDirection: "row",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  metricContent: {
    flex: 1,
  },
  metricTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  metricValue: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  metricSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  trendText: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: "600",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  tableContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
    marginLeft: Spacing.md,
  },
  coachStats: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  coachStat: {
    alignItems: "center",
  },
  coachStatValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  coachStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  playerLevel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskText: {
    ...Typography.small,
    fontWeight: "500",
  },
});
