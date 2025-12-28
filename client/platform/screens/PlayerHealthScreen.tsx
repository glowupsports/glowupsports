import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
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
  const maxCount = Math.max(...levels.map(l => l.count));

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

  const healthStats = {
    totalPlayers: 312,
    activeThisWeek: 287,
    atRisk: 25,
    avgLevel: 4.2,
    avgXpPerPlayer: 1250,
    avgStreak: 3.8,
  };

  const levelDistribution = [
    { level: 1, count: 45 },
    { level: 2, count: 62 },
    { level: 3, count: 78 },
    { level: 4, count: 55 },
    { level: 5, count: 42 },
    { level: 6, count: 20 },
    { level: 7, count: 10 },
  ];

  const players: PlayerRowProps[] = [
    { name: "Alex Thompson", academy: "Tennis Academy Pro", level: 6, xp: 4250, sessions: 48, streak: 12, engagement: "high" },
    { name: "Maya Rodriguez", academy: "Elite Tennis Club", level: 5, xp: 3800, sessions: 42, streak: 8, engagement: "high" },
    { name: "Jordan Lee", academy: "Junior Champions", level: 4, xp: 2100, sessions: 28, streak: 5, engagement: "medium" },
    { name: "Sam Wilson", academy: "City Tennis Center", level: 3, xp: 1450, sessions: 22, streak: 2, engagement: "low" },
    { name: "Taylor Kim", academy: "Tennis Academy Pro", level: 7, xp: 5600, sessions: 65, streak: 15, engagement: "high" },
  ];

  const atRiskPlayers = players.filter(p => p.engagement === "low");

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

        <LevelDistribution levels={levelDistribution} />

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performers</Text>
          <View style={[styles.playersCard, CardStyles.elevated]}>
            {players.filter(p => p.engagement === "high").map((player, index) => (
              <PlayerRow key={index} {...player} />
            ))}
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
});
