import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import ModeSwitcher from "@/components/ModeSwitcher";

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

interface SessionRowProps {
  time: string;
  coach: string;
  court: string;
  players: number;
}

function SessionRow({ time, coach, court, players }: SessionRowProps) {
  return (
    <View style={styles.sessionRow}>
      <Text style={styles.sessionTime}>{time}</Text>
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionCoach}>{coach}</Text>
        <Text style={styles.sessionDetails}>{court} - {players} players</Text>
      </View>
      <View style={styles.sessionStatus}>
        <View style={styles.sessionLive} />
      </View>
    </View>
  );
}

export default function OwnerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, academy } = useAuth();

  const academyName = academy?.name || "My Academy";
  
  const stats = useMemo(() => ({
    coaches: academy?.coachCount || 0,
    players: academy?.playerCount || 0,
    sessionsToday: academy?.todaySessionCount || 0,
    glowScore: academy?.glowScore || 0,
    revenueMonth: academy?.monthlyRevenue || 0,
    revenueWeek: academy?.weeklyRevenue || 0,
  }), [academy]);

  const alerts = useMemo(() => {
    const pendingAlerts: AlertCardProps[] = [];
    if (academy?.missedFeedbackCount && academy.missedFeedbackCount > 0) {
      pendingAlerts.push({
        icon: "alert-circle" as const,
        title: "Missed Feedback",
        message: `${academy.missedFeedbackCount} sessions need feedback`,
        type: "warning" as const,
      });
    }
    if (academy?.overduePaymentCount && academy.overduePaymentCount > 0) {
      pendingAlerts.push({
        icon: "cash" as const,
        title: "Payment Overdue",
        message: `${academy.overduePaymentCount} player(s) with outstanding balance`,
        type: "error" as const,
      });
    }
    if (academy?.atRiskPlayerCount && academy.atRiskPlayerCount > 0) {
      pendingAlerts.push({
        icon: "person" as const,
        title: "Players at Risk",
        message: `${academy.atRiskPlayerCount} player(s) showing drop-off signs`,
        type: "info" as const,
      });
    }
    return pendingAlerts;
  }, [academy]);

  const todaySessions = useMemo(() => {
    return academy?.todaySessions || [];
  }, [academy]);

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
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>3</Text>
              </View>
            </Pressable>
          </View>

          <ModeSwitcher />
        </View>

        <View style={styles.statsGrid}>
          <StatCard icon="tennisball" label="Coaches" value={stats.coaches} color={Colors.dark.primary} />
          <StatCard icon="people" label="Players" value={stats.players} color={Colors.dark.xpCyan} />
          <StatCard icon="calendar" label="Today" value={stats.sessionsToday} color={Colors.dark.orange} />
          <StatCard
            icon="star"
            label="Glow Score"
            value={stats.glowScore}
            color={Colors.dark.gold}
            trend={{ value: "+0.3", direction: "up" }}
          />
        </View>

        <View style={[styles.revenueCard, CardStyles.elevated]}>
          <View style={styles.revenueHeader}>
            <Ionicons name="trending-up" size={24} color={Colors.dark.gold} />
            <Text style={styles.revenueTitle}>Revenue</Text>
          </View>
          <View style={styles.revenueRow}>
            <View style={styles.revenueStat}>
              <Text style={styles.revenueValue}>${stats.revenueMonth.toLocaleString()}</Text>
              <Text style={styles.revenueLabel}>This Month</Text>
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueStat}>
              <Text style={styles.revenueValue}>${stats.revenueWeek.toLocaleString()}</Text>
              <Text style={styles.revenueLabel}>This Week</Text>
            </View>
          </View>
        </View>

        {alerts.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Alerts</Text>
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>{alerts.length}</Text>
              </View>
            </View>
            {alerts.map((alert, index) => (
              <AlertCard key={index} {...alert} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <QuickAction icon="person-add" label="Add Player" color={Colors.dark.xpCyan} />
            <QuickAction icon="add-circle" label="New Session" color={Colors.dark.primary} />
            <QuickAction icon="document-text" label="Reports" color={Colors.dark.orange} />
            <QuickAction icon="settings" label="Settings" color={Colors.dark.gold} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sessions Today</Text>
            <Pressable style={styles.viewAllButton}>
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.gold} />
            </Pressable>
          </View>
          <View style={[styles.sessionsCard, CardStyles.elevated]}>
            {todaySessions.map((session, index) => (
              <SessionRow key={index} {...session} />
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
  notificationBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: "700",
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
  revenueCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  revenueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  revenueTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  revenueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  revenueStat: {
    flex: 1,
    alignItems: "center",
  },
  revenueValue: {
    ...Typography.h1,
    color: Colors.dark.gold,
  },
  revenueLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  revenueDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.backgroundRoot,
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
  alertBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  alertBadgeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "700",
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
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  sessionsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  sessionTime: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
    width: 60,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionCoach: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  sessionDetails: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sessionStatus: {
    width: 30,
    alignItems: "center",
  },
  sessionLive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
});
