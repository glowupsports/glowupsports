import React, { } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
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
  reason: string;
}

function PlayerHealthRow({ name, level, risk, indicator, reason }: PlayerHealthRowProps) {
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
        <Text style={[styles.playerReason, { color: riskColors[risk] }]}>{reason}</Text>
      </View>
      <View style={[styles.riskBadge, { backgroundColor: `${riskColors[risk]}20` }]}>
        <View style={[styles.riskDot, { backgroundColor: riskColors[risk] }]} />
        <Text style={[styles.riskText, { color: riskColors[risk] }]}>{indicator}</Text>
      </View>
    </View>
  );
}

interface PeopleData {
  coaches: {
    id: string;
    name: string;
    role: string;
    status: string;
    stats: { label: string; value: string }[];
  }[];
  players: {
    id: string;
    name: string;
    role: string;
    status: string;
    stats: { label: string; value: string }[];
  }[];
}

export default function PerformanceScreen() {
  const insets = useSafeAreaInsets();
  const { data: peopleData, isLoading } = useQuery<PeopleData>({
    queryKey: ["/api/owner/people"],
  });

  const coaches = peopleData?.coaches || [];
  const players = peopleData?.players || [];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading performance data...</Text>
      </View>
    );
  }

  const avgAttendance = players.length > 0 
    ? Math.round(players.reduce((sum, p) => {
        const att = p.stats.find(s => s.label === "Attendance");
        return sum + (att ? parseInt(att.value) : 0);
      }, 0) / players.length)
    : 0;

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
              icon="people"
              title="Total Players"
              value={String(players.length)}
              color={Colors.dark.gold}
            />
            <MetricCard
              icon="tennisball"
              title="Total Coaches"
              value={String(coaches.length)}
              color={Colors.dark.primary}
            />
            <MetricCard
              icon="calendar"
              title="Avg Attendance"
              value={`${avgAttendance}%`}
              color={Colors.dark.xpCyan}
            />
            <MetricCard
              icon="stats-chart"
              title="Active"
              value={String(players.filter(p => p.status === "active").length)}
              color={Colors.dark.orange}
            />
          </View>
        

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coach Performance</Text>
            <View style={[styles.tableContainer, CardStyles.elevated]}>
              {coaches.length > 0 ? (
                coaches.map((coach) => {
                  const sessions = coach.stats.find(s => s.label === "Sessions/wk");
                  const feedback = coach.stats.find(s => s.label === "Feedback %");
                  return (
                    <CoachPerformanceRow
                      key={coach.id}
                      name={coach.name}
                      sessions={parseInt(sessions?.value || "0")}
                      feedbackRate={parseInt(feedback?.value || "0")}
                      playerImprovement={0}
                    />
                  );
                })
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="tennisball-outline" size={32} color={Colors.dark.textMuted} />
                  <Text style={styles.emptyStateText}>No coaches yet</Text>
                </View>
              )}
            </View>
          </View>
        

        
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Player Health Indicators</Text>
            <View style={[styles.tableContainer, CardStyles.elevated]}>
            {players.length > 0 ? (
              players.slice(0, 5).map((player) => {
                const attendance = player.stats.find(s => s.label === "Attendance");
                const attValue = parseInt(attendance?.value || "0");
                const risk = attValue >= 80 ? "low" : attValue >= 60 ? "medium" : "high";
                const indicator = attValue >= 80 ? "On track" : attValue >= 60 ? "Needs attention" : "At risk";
                const reason = attValue >= 80 
                  ? `${attValue}% attendance - excellent`
                  : attValue >= 60 
                    ? `${attValue}% attendance - below target`
                    : `${attValue}% attendance - needs intervention`;
                return (
                  <PlayerHealthRow
                    key={player.id}
                    name={player.name}
                    level={player.role}
                    risk={risk}
                    indicator={indicator}
                    reason={reason}
                  />
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={32} color={Colors.dark.textMuted} />
                <Text style={styles.emptyStateText}>No players yet</Text>
              </View>
            )}
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
  playerReason: {
    ...Typography.small,
    fontSize: 11,
    marginTop: 2,
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptyState: {
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  emptyStateText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
});
