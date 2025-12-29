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
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import ModeSwitcher from "@/components/ModeSwitcher";
import type { OwnerTabParamList } from "@/owner/navigation/OwnerNavigator";

type NavigationProp = NativeStackNavigationProp<OwnerTabParamList>;

interface AcademyStats {
  isOwnerView: boolean;
  academy: {
    id: string;
    name: string;
  };
  stats: {
    totalPlayers: number;
    activePlayers: number;
    totalCoaches: number;
    sessionsThisMonth: number;
    completedSessions: number;
    avgAttendanceRate: number;
  };
  topPerformers: Array<{
    id: string;
    name: string;
    level: number;
    totalXp: number;
    glowScore: number;
    ballLevel: string;
  }>;
  levelDistribution: {
    beginner: number;
    intermediate: number;
    advanced: number;
  };
  recentActivity: Array<{
    type: string;
    message: string;
    time: string;
  }>;
}

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
  trend?: { value: string; direction: "up" | "down" };
}

function StatCard({ icon, label, value, color, trend }: StatCardProps) {
  return (
    <View style={[styles.statCard, CardStyles.elevated]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {trend ? (
        <View style={styles.trendRow}>
          <Ionicons
            name={trend.direction === "up" ? "arrow-up" : "arrow-down"}
            size={12}
            color={trend.direction === "up" ? Colors.dark.primary : Colors.dark.error}
          />
          <Text
            style={[
              styles.trendText,
              { color: trend.direction === "up" ? Colors.dark.primary : Colors.dark.error },
            ]}
          >
            {trend.value}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface AlertCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  type: "warning" | "error" | "info";
  onPress?: () => void;
}

function AlertCard({ icon, title, message, type, onPress }: AlertCardProps) {
  const colors = {
    warning: Colors.dark.orange,
    error: Colors.dark.error,
    info: Colors.dark.xpCyan,
  };

  return (
    <Pressable style={[styles.alertCard, { borderLeftColor: colors[type] }]} onPress={onPress}>
      <View style={[styles.alertIcon, { backgroundColor: `${colors[type]}15` }]}>
        <Ionicons name={icon} size={20} color={colors[type]} />
      </View>
      <View style={styles.alertContent}>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertMessage}>{message}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

interface QuickActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress?: () => void;
}

function QuickAction({ icon, label, color, onPress }: QuickActionProps) {
  return (
    <Pressable
      style={styles.quickAction}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

interface TopPerformerRowProps {
  name: string;
  level: number;
  glowScore: number;
  ballLevel: string;
  rank: number;
}

function TopPerformerRow({ name, level, glowScore, ballLevel, rank }: TopPerformerRowProps) {
  const ballColors: Record<string, string> = {
    red: "#FF4444",
    orange: "#FF8C00",
    green: "#2ECC40",
    yellow: "#FFD700",
  };

  return (
    <View style={styles.performerRow}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <View style={styles.performerInfo}>
        <Text style={styles.performerName}>{name}</Text>
        <View style={styles.performerStats}>
          <View style={[styles.ballIndicator, { backgroundColor: ballColors[ballLevel] || ballColors.green }]} />
          <Text style={styles.performerLevel}>Level {level}</Text>
        </View>
      </View>
      <View style={styles.glowScoreBadge}>
        <Text style={styles.glowScoreText}>{glowScore}</Text>
      </View>
    </View>
  );
}

export default function OwnerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const { data: statsData, isLoading } = useQuery<AcademyStats>({
    queryKey: ["/api/owner/academy-stats"],
  });

  const academyName = statsData?.academy?.name || "My Academy";
  const stats = statsData?.stats || {
    totalPlayers: 0,
    activePlayers: 0,
    totalCoaches: 0,
    sessionsThisMonth: 0,
    completedSessions: 0,
    avgAttendanceRate: 0,
  };
  const topPerformers = statsData?.topPerformers || [];
  const recentActivity = statsData?.recentActivity || [];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,215,0,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.academyName}>{academyName}</Text>
              <View style={styles.statusRow}>
                <View style={styles.liveIndicator} />
                <Text style={styles.statusText}>Live</Text>
              </View>
            </View>
            <Pressable
              style={styles.notificationButton}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="notifications" size={24} color={Colors.dark.gold} />
            </Pressable>
          </View>

          <ModeSwitcher />
        </View>

        <View style={styles.statsGrid}>
          <StatCard 
            icon="tennisball" 
            label="Coaches" 
            value={stats.totalCoaches} 
            color={Colors.dark.primary} 
          />
          <StatCard 
            icon="people" 
            label="Players" 
            value={stats.totalPlayers} 
            color={Colors.dark.xpCyan} 
          />
          <StatCard 
            icon="calendar" 
            label="Sessions" 
            value={stats.sessionsThisMonth} 
            color={Colors.dark.orange} 
          />
          <StatCard
            icon="stats-chart"
            label="Attendance"
            value={`${stats.avgAttendanceRate}%`}
            color={Colors.dark.gold}
            trend={stats.avgAttendanceRate > 80 ? { value: "Good", direction: "up" } : undefined}
          />
        </View>

        {recentActivity.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
            </View>
            {recentActivity.map((activity, index) => (
              <AlertCard 
                key={index} 
                icon={activity.type === "session" ? "calendar" : activity.type === "xp" ? "star" : "analytics"}
                title={activity.message}
                message={activity.time}
                type="info"
              />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <QuickAction 
              icon="person-add" 
              label="Add Player" 
              color={Colors.dark.xpCyan} 
              onPress={() => navigation.navigate("People")}
            />
            <QuickAction 
              icon="add-circle" 
              label="New Session" 
              color={Colors.dark.primary} 
              onPress={() => navigation.navigate("Operations")}
            />
            <QuickAction 
              icon="document-text" 
              label="Reports" 
              color={Colors.dark.orange} 
              onPress={() => navigation.navigate("Performance")}
            />
            <QuickAction 
              icon="settings" 
              label="Settings" 
              color={Colors.dark.gold} 
              onPress={() => navigation.navigate("Settings")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Performers</Text>
            <View style={styles.glowScoreLabel}>
              <Ionicons name="star" size={12} color={Colors.dark.gold} />
              <Text style={styles.glowScoreLabelText}>Glow Score</Text>
            </View>
          </View>
          <View style={[styles.performersCard, CardStyles.elevated]}>
            {topPerformers.length > 0 ? (
              topPerformers.slice(0, 5).map((performer, index) => (
                <TopPerformerRow 
                  key={performer.id}
                  name={performer.name}
                  level={performer.level}
                  glowScore={performer.glowScore}
                  ballLevel={performer.ballLevel}
                  rank={index + 1}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="trophy-outline" size={32} color={Colors.dark.textMuted} />
                <Text style={styles.emptyStateText}>No players yet</Text>
                <Text style={styles.emptyStateSubtext}>Add players to see top performers</Text>
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
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
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  academyName: {
    ...Typography.h1,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  statusText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: "47%",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.h2,
    marginBottom: 2,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 4,
  },
  trendText: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: "600",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  alertMessage: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  quickActionLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  glowScoreLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  glowScoreLabelText: {
    ...Typography.small,
    color: Colors.dark.gold,
  },
  performersCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  performerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  rankText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  performerInfo: {
    flex: 1,
  },
  performerName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  performerStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ballIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  performerLevel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  glowScoreBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.gold + "20",
    borderRadius: BorderRadius.sm,
  },
  glowScoreText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "700",
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
  emptyStateSubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
