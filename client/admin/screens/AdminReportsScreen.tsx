import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

interface AdminStats {
  totalCoaches: number;
  totalPlayers: number;
  totalSessions: number;
  activeSessions: number;
  monthlyRevenue: number;
  attendanceRate: number;
}

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();

  const { data: coaches = [] } = useQuery<any[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: players = [] } = useQuery<any[]>({
    queryKey: ["/api/players"],
  });

  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["/api/sessions"],
  });

  const stats: AdminStats = {
    totalCoaches: coaches.length,
    totalPlayers: players.length,
    totalSessions: sessions.length,
    activeSessions: sessions.filter((s: any) => s.status === "scheduled").length,
    monthlyRevenue: 4250,
    attendanceRate: 87,
  };

  const ballLevelDistribution = players.reduce((acc: Record<string, number>, player: any) => {
    const level = player.ballLevel || "unknown";
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});

  const getBallLevelColor = (level: string) => {
    switch (level) {
      case "red": return "#EF4444";
      case "orange": return "#F97316";
      case "green": return "#22C55E";
      case "yellow": return "#EAB308";
      default: return Colors.dark.textMuted;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Reports & Analytics</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="people" size={24} color={Colors.dark.primary} />
              <Text style={styles.statValue}>{stats.totalCoaches}</Text>
              <Text style={styles.statLabel}>Coaches</Text>
            </View>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="person" size={24} color={Colors.dark.xpCyan} />
              <Text style={styles.statValue}>{stats.totalPlayers}</Text>
              <Text style={styles.statLabel}>Players</Text>
            </View>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="calendar" size={24} color={Colors.dark.orange} />
              <Text style={styles.statValue}>{stats.totalSessions}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={[styles.statCard, CardStyles.elevated]}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.dark.successNeon} />
              <Text style={styles.statValue}>{stats.attendanceRate}%</Text>
              <Text style={styles.statLabel}>Attendance</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Player Distribution</Text>
          <View style={[styles.distributionCard, CardStyles.elevated]}>
            {Object.entries(ballLevelDistribution).map(([level, count]) => (
              <View key={level} style={styles.distributionRow}>
                <View style={styles.distributionLabel}>
                  <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(level) }]} />
                  <Text style={styles.levelName}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
                </View>
                <View style={styles.distributionBarContainer}>
                  <View
                    style={[
                      styles.distributionBar,
                      {
                        width: `${((count as number) / stats.totalPlayers) * 100}%`,
                        backgroundColor: getBallLevelColor(level),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.distributionCount}>{count as number}</Text>
              </View>
            ))}
            {Object.keys(ballLevelDistribution).length === 0 ? (
              <Text style={styles.noDataText}>No player data available</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Reports</Text>
          <Pressable style={[styles.reportCard, CardStyles.elevated]}>
            <View style={styles.reportContent}>
              <Ionicons name="trending-up" size={24} color={Colors.dark.successNeon} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Player Progress</Text>
                <Text style={styles.reportSubtitle}>Track skill development over time</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.reportCard, CardStyles.elevated]}>
            <View style={styles.reportContent}>
              <Ionicons name="calendar-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Session History</Text>
                <Text style={styles.reportSubtitle}>View past sessions and attendance</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.reportCard, CardStyles.elevated]}>
            <View style={styles.reportContent}>
              <Ionicons name="cash-outline" size={24} color={Colors.dark.gold} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Revenue Report</Text>
                <Text style={styles.reportSubtitle}>Financial overview and trends</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.reportCard, CardStyles.elevated]}>
            <View style={styles.reportContent}>
              <Ionicons name="analytics-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.reportText}>
                <Text style={styles.reportTitle}>Coach Performance</Text>
                <Text style={styles.reportSubtitle}>Coach activity and metrics</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
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
    height: 150,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statCard: {
    width: "47%",
    padding: Spacing.lg,
    alignItems: "center",
  },
  statValue: {
    ...Typography.numberLarge,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  distributionCard: {
    padding: Spacing.lg,
  },
  distributionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  distributionLabel: {
    flexDirection: "row",
    alignItems: "center",
    width: 80,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  levelName: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  distributionBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    marginHorizontal: Spacing.md,
  },
  distributionBar: {
    height: 8,
    borderRadius: 4,
  },
  distributionCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 30,
    textAlign: "right",
  },
  noDataText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    padding: Spacing.lg,
  },
  reportCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  reportContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  reportText: {
    flex: 1,
  },
  reportTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  reportSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
});
