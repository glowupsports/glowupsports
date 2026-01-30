import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";

import { PlatformCommandCenter } from "@/platform/components/PlatformCommandCenter";
import { AcademyHealthCards } from "@/platform/components/AcademyHealthCards";
import { SubscriptionFunnel } from "@/platform/components/SubscriptionFunnel";
import { AnimatedKpiCard } from "@/admin/components/AnimatedKpiCard";
import { SmartInsightsPanel, Insight } from "@/admin/components/SmartInsightsPanel";

const PLATFORM_PURPLE = "#9B59B6";

interface PlatformDashboardData {
  platform: {
    name: string;
    currency: string;
  };
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
  subscriptions: {
    activeCount: number;
    trialCount: number;
    pausedCount: number;
    churnedThisMonth: number;
    conversionRate: number;
  };
  academies: Array<{
    id: string;
    name: string;
    players: number;
    coaches: number;
    mrr: number;
    healthScore: number;
    status: "healthy" | "warning" | "critical" | "trial" | "paused";
  }>;
  weekActivity: Array<{
    day: string;
    intensity: number;
  }>;
  insights: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    change?: number;
  }>;
  alerts: Array<{
    type: "warning" | "error" | "info";
    title: string;
    description: string;
  }>;
}

interface ActivityDayProps {
  day: string;
  intensity: number;
}

function ActivityDay({ day, intensity }: ActivityDayProps) {
  const opacity = Math.min(1, 0.2 + (intensity * 0.2));
  return (
    <View style={styles.activityDayContainer}>
      <View style={[styles.activityDay, { backgroundColor: `rgba(46, 204, 113, ${opacity})` }]} />
      <Text style={styles.activityDayLabel}>{day}</Text>
    </View>
  );
}

export default function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: platformData, isLoading, refetch } = useQuery<PlatformDashboardData>({
    queryKey: ["/api/platform/dashboard/enhanced"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const weekActivity = platformData?.weekActivity || [
    { day: "M", intensity: 3 },
    { day: "T", intensity: 4 },
    { day: "W", intensity: 5 },
    { day: "T", intensity: 4 },
    { day: "F", intensity: 6 },
    { day: "S", intensity: 3 },
    { day: "S", intensity: 2 },
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

  const metrics = platformData?.metrics || {
    activeAcademies: 0,
    totalCoaches: 0,
    totalPlayers: 0,
    mrr: 0,
    newSignups: 0,
    churnRate: 0,
    trialAcademies: 0,
    pausedAcademies: 0,
  };

  const subscriptions = platformData?.subscriptions || {
    activeCount: metrics.activeAcademies,
    trialCount: metrics.trialAcademies || 0,
    pausedCount: metrics.pausedAcademies || 0,
    churnedThisMonth: 0,
    conversionRate: 75,
  };

  const insights: Insight[] = (platformData?.insights || []).map(i => ({
    ...i,
    type: i.type as Insight["type"],
  }));

  const currency = platformData?.platform?.currency || "$";

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PLATFORM_PURPLE} />
        <Text style={styles.loadingText}>Loading Platform Center...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.18)", "rgba(142,68,173,0.10)", "transparent"]}
        style={styles.headerGradient}
      />

      <CollapsibleModeSwitcher />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PLATFORM_PURPLE} />
        }
      >
        <PlatformCommandCenter
          platformName={platformData?.platform?.name || "Glow Up Sports"}
          totalMrr={metrics.mrr}
          activeAcademies={metrics.activeAcademies}
          totalPlayers={metrics.totalPlayers}
          currency={currency}
          onLogoutPress={handleLogout}
          onSettingsPress={() => navigation.navigate("System")}
        />

        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="people"
              label="Total Coaches"
              value={metrics.totalCoaches}
              color={Colors.dark.primary}
              onPress={() => navigation.navigate("CoachHealth")}
            />
          </View>
          <View style={styles.kpiItem}>
            <AnimatedKpiCard
              icon="person-add"
              label="New Signups"
              value={metrics.newSignups}
              color={Colors.dark.xpCyan}
              onPress={() => navigation.navigate("PlayerHealth")}
            />
          </View>
        </View>

        <SubscriptionFunnel
          activeCount={subscriptions.activeCount}
          trialCount={subscriptions.trialCount}
          pausedCount={subscriptions.pausedCount}
          churnedThisMonth={subscriptions.churnedThisMonth}
          conversionRate={subscriptions.conversionRate}
        />

        <AcademyHealthCards
          academies={platformData?.academies || []}
          currency={currency}
          onAcademyPress={(id) => navigation.navigate("Academies")}
          onViewAll={() => navigation.navigate("Academies")}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Platform Activity</Text>
            <Text style={styles.periodText}>{metrics.totalPlayers} players</Text>
          </View>
          <View style={styles.activityCard}>
            <Text style={styles.activityLabel}>Weekly Activity</Text>
            <View style={styles.activityRow}>
              {weekActivity.map((item, index) => (
                <ActivityDay key={index} day={item.day} intensity={item.intensity} />
              ))}
            </View>
          </View>
        </View>

        <SmartInsightsPanel insights={insights} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("Academies");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${PLATFORM_PURPLE}15` }]}>
                <Ionicons name="business" size={22} color={PLATFORM_PURPLE} />
              </View>
              <Text style={styles.quickActionLabel}>Academies</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("Financials");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}15` }]}>
                <Ionicons name="cash" size={22} color={Colors.dark.primary} />
              </View>
              <Text style={styles.quickActionLabel}>Finance</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("CoachHealth");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                <Ionicons name="people" size={22} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.quickActionLabel}>Coaches</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("System");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.orange}15` }]}>
                <Ionicons name="settings" size={22} color={Colors.dark.orange} />
              </View>
              <Text style={styles.quickActionLabel}>System</Text>
            </Pressable>
          </View>
        </View>

        {(platformData?.alerts?.length || 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            {platformData?.alerts.slice(0, 3).map((alert, index) => (
              <View 
                key={index} 
                style={[styles.alertCard, { 
                  borderLeftColor: alert.type === "error" ? Colors.dark.error : 
                                   alert.type === "warning" ? Colors.dark.orange : Colors.dark.xpCyan 
                }]}
              >
                <Ionicons 
                  name={alert.type === "error" ? "alert-circle" : alert.type === "warning" ? "warning" : "information-circle"} 
                  size={20} 
                  color={alert.type === "error" ? Colors.dark.error : 
                         alert.type === "warning" ? Colors.dark.orange : Colors.dark.xpCyan} 
                />
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <Text style={styles.alertDescription}>{alert.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
    height: 320,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  kpiRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  kpiItem: {
    flex: 1,
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
    marginBottom: Spacing.md,
  },
  periodText: {
    ...Typography.small,
    color: PLATFORM_PURPLE,
    fontWeight: "600",
  },
  activityCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  activityLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  activityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  activityDayContainer: {
    alignItems: "center",
    gap: 6,
  },
  activityDay: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  activityDayLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
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
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  quickActionLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
    fontSize: 11,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    marginBottom: Spacing.sm,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  alertDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
