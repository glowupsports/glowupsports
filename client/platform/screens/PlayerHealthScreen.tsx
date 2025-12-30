import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const PLATFORM_COLOR = "#9B59B6";

interface PlayerRowProps {
  name: string;
  academy: string;
  level: number;
  xp: number;
  sessions: number;
  streak: number;
  engagement: "high" | "medium" | "low";
}

interface PlayerHealthData {
  healthStats: {
    totalPlayers: number;
    activeThisWeek: number;
    atRisk: number;
    avgLevel: number;
    avgXpPerPlayer: number;
    avgStreak: number;
  };
  levelDistribution: { level: number; count: number }[];
  players: PlayerRowProps[];
}

function PlayerRow({ name, academy, level, xp, sessions, streak, engagement }: PlayerRowProps) {
  const engagementConfig = {
    high: { color: Colors.dark.primary, label: "High" },
    medium: { color: Colors.dark.orange, label: "Medium" },
    low: { color: Colors.dark.error, label: "Low" },
  };

  const config = engagementConfig[engagement];

  return (
    <View style={styles.playerRow}>
      <View style={styles.playerHeader}>
        <View style={styles.playerAvatar}>
          <Text style={styles.avatarText}>L{level}</Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{name}</Text>
          <Text style={styles.playerAcademy}>{academy}</Text>
        </View>
        <View style={[styles.engagementBadge, { backgroundColor: `${config.color}20` }]}>
          <Text style={[styles.engagementText, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
      
      <View style={styles.playerStats}>
        <View style={styles.playerStat}>
          <Text style={[styles.statValue, { color: Colors.dark.xpCyan }]}>{xp.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total XP</Text>
        </View>
        <View style={styles.playerStat}>
          <Text style={styles.statValue}>{sessions}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.playerStat}>
          <Text style={[styles.statValue, { color: Colors.dark.orange }]}>{streak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
      </View>
    </View>
  );
}

interface LevelDistributionProps {
  levels: { level: number; count: number }[];
}

function LevelDistribution({ levels }: LevelDistributionProps) {
  const maxCount = Math.max(...levels.map(l => l.count), 1);

  return (
    <View style={[styles.distributionCard, CardStyles.elevated]}>
      <Text style={styles.distributionTitle}>Level Distribution</Text>
      <View style={styles.distributionBars}>
        {levels.map((item) => (
          <View key={item.level} style={styles.barContainer}>
            <View 
              style={[
                styles.bar, 
                { height: `${(item.count / maxCount) * 100}%` }
              ]} 
            />
            <Text style={styles.barLabel}>L{item.level}</Text>
            <Text style={styles.barCount}>{item.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function PlayerHealthScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, error } = useQuery<PlayerHealthData>({
    queryKey: ["/api/platform/player-health"],
  });

  const healthStats = data?.healthStats || {
    totalPlayers: 0,
    activeThisWeek: 0,
    atRisk: 0,
    avgLevel: 0,
    avgXpPerPlayer: 0,
    avgStreak: 0,
  };

  const levelDistribution = data?.levelDistribution || [];
  const players = data?.players || [];

  const atRiskPlayers = players.filter(p => p.engagement === "low");
  const topPerformers = players.filter(p => p.engagement === "high");

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading player health data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load player health data</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Player Health</Text>
          <Text style={styles.subtitle}>Monitor player engagement and progress</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={[styles.statNumber, { color: Colors.dark.xpCyan }]}>{healthStats.totalPlayers}</Text>
            <Text style={styles.statLabel}>Total Players</Text>
          </View>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={[styles.statNumber, { color: Colors.dark.primary }]}>{healthStats.activeThisWeek}</Text>
            <Text style={styles.statLabel}>Active This Week</Text>
          </View>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={[styles.statNumber, { color: Colors.dark.error }]}>{healthStats.atRisk}</Text>
            <Text style={styles.statLabel}>At Risk</Text>
          </View>
        </View>

        <View style={[styles.avgCard, CardStyles.elevated]}>
          <View style={styles.avgRow}>
            <View style={styles.avgItem}>
              <Ionicons name="star" size={20} color={Colors.dark.gold} />
              <View>
                <Text style={[styles.avgValue, { color: Colors.dark.gold }]}>{healthStats.avgLevel}</Text>
                <Text style={styles.avgLabel}>Avg Level</Text>
              </View>
            </View>
            <View style={styles.avgItem}>
              <Ionicons name="flash" size={20} color={Colors.dark.xpCyan} />
              <View>
                <Text style={[styles.avgValue, { color: Colors.dark.xpCyan }]}>{healthStats.avgXpPerPlayer}</Text>
                <Text style={styles.avgLabel}>Avg XP</Text>
              </View>
            </View>
            <View style={styles.avgItem}>
              <Ionicons name="flame" size={20} color={Colors.dark.orange} />
              <View>
                <Text style={[styles.avgValue, { color: Colors.dark.orange }]}>{healthStats.avgStreak}</Text>
                <Text style={styles.avgLabel}>Avg Streak</Text>
              </View>
            </View>
          </View>
        </View>

        {levelDistribution.length > 0 ? (
          <LevelDistribution levels={levelDistribution} />
        ) : null}

        {atRiskPlayers.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="alert-circle" size={20} color={Colors.dark.error} />
              <Text style={styles.sectionTitle}>Low Engagement Players</Text>
            </View>
            <View style={[styles.playersCard, CardStyles.elevated]}>
              {atRiskPlayers.map((player, index) => (
                <PlayerRow key={index} {...player} />
              ))}
            </View>
          </View>
        ) : null}

        {topPerformers.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Performers</Text>
            <View style={[styles.playersCard, CardStyles.elevated]}>
              {topPerformers.map((player, index) => (
                <PlayerRow key={index} {...player} />
              ))}
            </View>
          </View>
        ) : null}

        {players.length === 0 ? (
          <View style={[styles.emptyCard, CardStyles.elevated]}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No player data available</Text>
            <Text style={styles.emptySubtext}>Player health data will appear once you have players</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
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
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  statNumber: {
    ...Typography.h2,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    fontSize: 10,
  },
  avgCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  avgRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  avgItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avgValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  avgLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  distributionCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  distributionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  distributionBars: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 100,
  },
  barContainer: {
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: 24,
    backgroundColor: PLATFORM_COLOR,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    minHeight: 4,
  },
  barLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  barCount: {
    ...Typography.small,
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: "600",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  playersCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  playerRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  avatarText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  playerAcademy: {
    ...Typography.small,
    color: PLATFORM_COLOR,
  },
  engagementBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  engagementText: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: "600",
  },
  playerStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  playerStat: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  emptyCard: {
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
});
