import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import ModeSwitcher from "@/components/ModeSwitcher";

const PLATFORM_COLOR = "#9B59B6";

interface PlatformStats {
  metrics: {
    activeAcademies: number;
    totalCoaches: number;
    totalPlayers: number;
    mrr: number;
    newSignups: number;
    churnRate: number;
    trialAcademies: number;
    pausedAcademies: number;
  };
  alerts: Array<{
    type: string;
    title: string;
    description: string;
    academyName?: string;
  }>;
  revenueData: Array<{
    month: string;
    amount: number;
  }>;
}

interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  color?: string;
}

function MetricCard({ icon, label, value, trend, trendUp, color = PLATFORM_COLOR }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, CardStyles.elevated]}>
      <View style={[styles.metricIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {trend ? (
        <View style={styles.trendContainer}>
          <Ionicons 
            name={trendUp ? "trending-up" : "trending-down"} 
            size={12} 
            color={trendUp ? Colors.dark.primary : Colors.dark.error} 
          />
          <Text style={[styles.trendText, { color: trendUp ? Colors.dark.primary : Colors.dark.error }]}>
            {trend}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface AlertCardProps {
  type: "warning" | "error" | "info";
  title: string;
  description: string;
  academyName?: string;
}

function AlertCard({ type, title, description, academyName }: AlertCardProps) {
  const colors = {
    warning: Colors.dark.orange,
    error: Colors.dark.error,
    info: Colors.dark.xpCyan,
  };
  const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
    warning: "warning",
    error: "alert-circle",
    info: "information-circle",
  };

  return (
    <View style={[styles.alertCard, { borderLeftColor: colors[type] }]}>
      <View style={styles.alertHeader}>
        <Ionicons name={icons[type]} size={20} color={colors[type]} />
        <View style={styles.alertContent}>
          <Text style={styles.alertTitle}>{title}</Text>
          {academyName ? <Text style={styles.alertAcademy}>{academyName}</Text> : null}
        </View>
      </View>
      <Text style={styles.alertDescription}>{description}</Text>
    </View>
  );
}

interface ActivityDayProps {
  day: string;
  intensity: number;
}

function ActivityDay({ day, intensity }: ActivityDayProps) {
  const opacity = Math.min(1, 0.2 + (intensity * 0.2));
  return (
    <View style={styles.activityDayContainer}>
      <View style={[styles.activityDay, { backgroundColor: `rgba(155, 89, 182, ${opacity})` }]} />
      <Text style={styles.activityDayLabel}>{day}</Text>
    </View>
  );
}

export default function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  const { data: stats, isLoading, error } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  const weekActivity = [
    { day: "M", intensity: 4 },
    { day: "T", intensity: 3 },
    { day: "W", intensity: 5 },
    { day: "T", intensity: 4 },
    { day: "F", intensity: 3 },
    { day: "S", intensity: 2 },
    { day: "S", intensity: 1 },
  ];

  const handleLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) {
        logout();
      }
    } else {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign Out",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              logout();
            },
          },
        ]
      );
    }
  };

  const metrics = stats?.metrics || {
    activeAcademies: 0,
    totalCoaches: 0,
    totalPlayers: 0,
    mrr: 0,
    newSignups: 0,
    churnRate: 0,
  };

  const alerts = stats?.alerts || [];
  const revenueData = stats?.revenueData || [];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_COLOR} />
        <Text style={styles.loadingText}>Loading platform data...</Text>
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
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.platformTitle}>Glow Up Sports</Text>
              <Text style={styles.subtitle}>Command Center</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable 
                style={styles.logoutIconButton}
                onPress={handleLogout}
              >
                <Ionicons name="log-out-outline" size={22} color={Colors.dark.textMuted} />
              </Pressable>
              <View style={styles.globeIcon}>
                <Ionicons name="globe" size={28} color={PLATFORM_COLOR} />
              </View>
            </View>
          </View>

          <ModeSwitcher />
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard 
            icon="business" 
            label="Active Academies" 
            value={metrics.activeAcademies}
            trend={metrics.newSignups > 0 ? `+${metrics.newSignups} this month` : undefined}
            trendUp={true}
            color={PLATFORM_COLOR}
          />
          <MetricCard 
            icon="people" 
            label="Total Coaches" 
            value={metrics.totalCoaches}
            color={Colors.dark.primary}
          />
          <MetricCard 
            icon="person" 
            label="Total Players" 
            value={metrics.totalPlayers}
            color={Colors.dark.xpCyan}
          />
          <MetricCard 
            icon="card" 
            label="MRR" 
            value={metrics.mrr > 0 ? `$${metrics.mrr.toLocaleString()}` : "$0"}
            color={Colors.dark.gold}
          />
        </View>

        <View style={styles.secondaryMetrics}>
          <View style={[styles.secondaryMetricCard, CardStyles.elevated]}>
            <View style={styles.secondaryMetricRow}>
              <Ionicons name="person-add" size={18} color={Colors.dark.primary} />
              <Text style={styles.secondaryMetricLabel}>New Signups</Text>
            </View>
            <Text style={styles.secondaryMetricValue}>{metrics.newSignups}</Text>
          </View>
          <View style={[styles.secondaryMetricCard, CardStyles.elevated]}>
            <View style={styles.secondaryMetricRow}>
              <Ionicons name="exit" size={18} color={Colors.dark.error} />
              <Text style={styles.secondaryMetricLabel}>Churn Rate</Text>
            </View>
            <Text style={[styles.secondaryMetricValue, { color: Colors.dark.error }]}>
              {metrics.churnRate}%
            </Text>
          </View>
        </View>

        {alerts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alerts & Warnings</Text>
            <View style={styles.alertsContainer}>
              {alerts.map((alert, index) => (
                <AlertCard 
                  key={index} 
                  type={alert.type as "warning" | "error" | "info"} 
                  title={alert.title}
                  description={alert.description}
                  academyName={alert.academyName}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Activity</Text>
          <View style={[styles.activityCard, CardStyles.elevated]}>
            <View style={styles.activityHeader}>
              <Text style={styles.activitySubtitle}>Weekly Activity</Text>
              <Text style={styles.activityValue}>{metrics.totalPlayers} players</Text>
            </View>
            <View style={styles.activityHeatmap}>
              {weekActivity.map((day, index) => (
                <ActivityDay key={index} day={day.day} intensity={day.intensity} />
              ))}
            </View>
            <View style={styles.activityStats}>
              <View style={styles.activityStat}>
                <Text style={styles.activityStatLabel}>Trial Academies</Text>
                <Text style={styles.activityStatValue}>{stats?.metrics.trialAcademies || 0}</Text>
              </View>
              <View style={styles.activityStat}>
                <Text style={styles.activityStatLabel}>Paused</Text>
                <Text style={styles.activityStatValue}>{stats?.metrics.pausedAcademies || 0}</Text>
              </View>
            </View>
          </View>
        </View>

        {revenueData.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Revenue Trend</Text>
            <View style={[styles.growthCard, CardStyles.elevated]}>
              <View style={styles.growthBars}>
                {revenueData.map((item, index) => {
                  const maxAmount = Math.max(...revenueData.map(r => r.amount));
                  const height = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 10;
                  return (
                    <View key={index} style={styles.growthBarContainer}>
                      <View 
                        style={[
                          styles.growthBar, 
                          { 
                            height: `${height}%`, 
                            backgroundColor: index === revenueData.length - 1 ? PLATFORM_COLOR : `${PLATFORM_COLOR}60` 
                          }
                        ]} 
                      />
                      <Text style={styles.growthBarLabel}>{item.month}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.growthLegend}>
                <View style={styles.growthLegendItem}>
                  <View style={[styles.legendDot, { backgroundColor: PLATFORM_COLOR }]} />
                  <Text style={styles.legendText}>Current Month</Text>
                </View>
                <View style={styles.growthLegendItem}>
                  <View style={[styles.legendDot, { backgroundColor: `${PLATFORM_COLOR}60` }]} />
                  <Text style={styles.legendText}>Previous Months</Text>
                </View>
              </View>
            </View>
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
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  logoutIconButton: {
    padding: Spacing.sm,
  },
  globeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${PLATFORM_COLOR}20`,
    justifyContent: "center",
    alignItems: "center",
  },
  platformTitle: {
    ...Typography.h1,
    color: PLATFORM_COLOR,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metricCard: {
    width: "48%",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  metricIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  metricValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  metricLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  trendContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  trendText: {
    ...Typography.small,
    fontSize: 10,
  },
  secondaryMetrics: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  secondaryMetricCard: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  secondaryMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  secondaryMetricLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  secondaryMetricValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  alertsContainer: {
    gap: Spacing.sm,
  },
  alertCard: {
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  alertAcademy: {
    ...Typography.small,
    color: PLATFORM_COLOR,
  },
  alertDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginLeft: 28,
  },
  activityCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  activitySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  activityValue: {
    ...Typography.h3,
    color: PLATFORM_COLOR,
  },
  activityHeatmap: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.lg,
  },
  activityDayContainer: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  activityDay: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
  },
  activityDayLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  activityStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  activityStat: {
    alignItems: "center",
  },
  activityStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  activityStatValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  growthCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  growthBars: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 120,
    marginBottom: Spacing.md,
  },
  growthBarContainer: {
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
  },
  growthBar: {
    width: 28,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    minHeight: 4,
  },
  growthBarLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  growthLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  growthLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
