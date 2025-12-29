import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import ModeSwitcher from "@/components/ModeSwitcher";
import type { AdminTabParamList } from "@/admin/navigation/AdminNavigator";

type AdminNavProp = BottomTabNavigationProp<AdminTabParamList>;

interface DashboardData {
  academy: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  } | null;
  kpis: {
    activePlayers: number;
    activeCoaches: number;
    sessionsThisWeek: number;
    attendanceRate: number;
    outstandingPayments: number;
    monthlyRevenue: number;
    currency: string;
  };
  alerts: Array<{
    id: string;
    type: "error" | "warning" | "info";
    category: string;
    title: string;
    description: string;
    playerId?: string;
    playerName?: string;
    coachId?: string;
    coachName?: string;
    amount?: number;
  }>;
  upcomingSessions: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    coachName: string;
    status: string;
  }>;
  quickStats: {
    totalPlayers: number;
    totalCoaches: number;
    completedSessionsThisMonth: number;
    unpaidPlayerCount: number;
  };
}

interface KpiCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  onPress?: () => void;
}

function KpiCard({ icon, label, value, subValue, color = Colors.dark.primary, onPress }: KpiCardProps) {
  return (
    <Pressable
      style={[styles.kpiCard, CardStyles.elevated]}
      onPress={() => {
        if (onPress) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      disabled={!onPress}
    >
      <View style={[styles.kpiIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {subValue ? <Text style={styles.kpiSubValue}>{subValue}</Text> : null}
    </Pressable>
  );
}

interface AlertCardProps {
  alert: DashboardData["alerts"][0];
  onPress?: () => void;
}

function AlertCard({ alert, onPress }: AlertCardProps) {
  const getAlertColor = (type: string) => {
    switch (type) {
      case "error": return Colors.dark.error;
      case "warning": return Colors.dark.orange;
      default: return Colors.dark.xpCyan;
    }
  };

  const getAlertIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    switch (category) {
      case "payment": return "card-outline";
      case "attendance": return "calendar-outline";
      case "coach": return "person-outline";
      default: return "alert-circle-outline";
    }
  };

  const color = getAlertColor(alert.type);

  return (
    <Pressable
      style={[styles.alertCard, { borderLeftColor: color }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <View style={[styles.alertIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={getAlertIcon(alert.category)} size={18} color={color} />
      </View>
      <View style={styles.alertContent}>
        <Text style={styles.alertTitle}>{alert.title}</Text>
        <Text style={styles.alertDescription}>{alert.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

interface SessionCardProps {
  session: DashboardData["upcomingSessions"][0];
}

function SessionCard({ session }: SessionCardProps) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const formatDay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  };

  return (
    <View style={[styles.sessionCard, CardStyles.elevated]}>
      <View style={styles.sessionTime}>
        <Text style={styles.sessionDay}>{formatDay(session.startTime)}</Text>
        <Text style={styles.sessionHour}>{formatTime(session.startTime)}</Text>
      </View>
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionTitle}>{session.title}</Text>
        <Text style={styles.sessionCoach}>{session.coachName}</Text>
      </View>
      <View style={[styles.sessionStatus, { backgroundColor: `${Colors.dark.primary}20` }]}>
        <Text style={[styles.sessionStatusText, { color: Colors.dark.primary }]}>
          {session.status}
        </Text>
      </View>
    </View>
  );
}

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AdminNavProp>();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const { data: dashboardData, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/admin/dashboard"],
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const kpis = dashboardData?.kpis;
  const alerts = dashboardData?.alerts || [];
  const upcomingSessions = dashboardData?.upcomingSessions || [];
  const currency = kpis?.currency || "AED";

  const formatCurrency = (amount: number) => {
    return `${currency} ${amount.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.orange} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.welcomeText}>Admin Dashboard</Text>
              <Text style={styles.academyName}>{dashboardData?.academy?.name || "Tennis Academy"}</Text>
            </View>
            <Pressable
              style={styles.notificationButton}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="notifications-outline" size={24} color={Colors.dark.text} />
              {alerts.length > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{alerts.length}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <ModeSwitcher />
        </View>

        <View style={styles.kpisGrid}>
          <KpiCard 
            icon="person" 
            label="Active Players" 
            value={kpis?.activePlayers || 0}
            color={Colors.dark.xpCyan}
            onPress={() => navigation.navigate("AdminPlayers")}
          />
          <KpiCard 
            icon="people" 
            label="Active Coaches" 
            value={kpis?.activeCoaches || 0}
            color={Colors.dark.primary}
            onPress={() => navigation.navigate("AdminCoaches")}
          />
          <KpiCard 
            icon="calendar" 
            label="Sessions/Week" 
            value={kpis?.sessionsThisWeek || 0}
            color={Colors.dark.orange}
            onPress={() => navigation.navigate("AdminSchedule")}
          />
          <KpiCard 
            icon="checkmark-circle" 
            label="Attendance" 
            value={`${kpis?.attendanceRate || 0}%`}
            color={Colors.dark.successNeon}
            onPress={() => navigation.navigate("AdminReports")}
          />
          <KpiCard 
            icon="alert-circle" 
            label="Outstanding" 
            value={formatCurrency(kpis?.outstandingPayments || 0)}
            color={Colors.dark.error}
            onPress={() => navigation.navigate("AdminReports")}
          />
          <KpiCard 
            icon="cash" 
            label="Revenue/Mo" 
            value={formatCurrency(kpis?.monthlyRevenue || 0)}
            color={Colors.dark.gold}
            onPress={() => navigation.navigate("AdminReports")}
          />
        </View>

        {alerts.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Alerts</Text>
              <View style={styles.alertCountBadge}>
                <Text style={styles.alertCountText}>{alerts.length}</Text>
              </View>
            </View>
            {alerts.slice(0, 5).map((alert) => (
              <AlertCard 
                key={alert.id} 
                alert={alert}
                onPress={() => {
                  if (alert.playerId) {
                    navigation.navigate("AdminPlayers");
                  } else if (alert.coachId) {
                    navigation.navigate("AdminCoaches");
                  }
                }}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminPlayers");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                <Ionicons name="person-add" size={22} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.quickActionLabel}>Add Player</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminCoaches");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.primary}20` }]}>
                <Ionicons name="person-add-outline" size={22} color={Colors.dark.primary} />
              </View>
              <Text style={styles.quickActionLabel}>Add Coach</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminSchedule");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.orange}20` }]}>
                <Ionicons name="calendar-outline" size={22} color={Colors.dark.orange} />
              </View>
              <Text style={styles.quickActionLabel}>Schedule</Text>
            </Pressable>
            <Pressable 
              style={styles.quickAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("AdminReports");
              }}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${Colors.dark.gold}20` }]}>
                <Ionicons name="analytics" size={22} color={Colors.dark.gold} />
              </View>
              <Text style={styles.quickActionLabel}>Reports</Text>
            </Pressable>
          </View>
        </View>

        {upcomingSessions.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
              <Pressable onPress={() => navigation.navigate("AdminSchedule")}>
                <Text style={styles.seeAllText}>See All</Text>
              </Pressable>
            </View>
            {upcomingSessions.slice(0, 5).map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
          <Pressable 
            style={[styles.menuCard, CardStyles.elevated]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminCoaches");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="people-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Manage Coaches</Text>
                <Text style={styles.menuCardSubtitle}>Performance, payments, profiles</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.menuCard, CardStyles.elevated]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminPlayers");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="person-outline" size={24} color={Colors.dark.xpCyan} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Manage Players</Text>
                <Text style={styles.menuCardSubtitle}>Attendance, progress, payments</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable 
            style={[styles.menuCard, CardStyles.elevated]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("AdminSettings");
            }}
          >
            <View style={styles.menuCardContent}>
              <Ionicons name="business-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Academy Settings</Text>
                <Text style={styles.menuCardSubtitle}>Profile, courts, permissions</Text>
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
  loadingContainer: {
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
  welcomeText: {
    ...Typography.h2,
    color: Colors.dark.orange,
    marginBottom: Spacing.xs,
  },
  academyName: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: {
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: "700",
  },
  kpisGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  kpiCard: {
    width: "31%",
    padding: Spacing.md,
    alignItems: "center",
  },
  kpiIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  kpiValue: {
    ...Typography.numberLarge,
    color: Colors.dark.text,
    fontSize: 18,
    marginBottom: 2,
  },
  kpiLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  kpiSubValue: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
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
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
  },
  alertCountBadge: {
    backgroundColor: Colors.dark.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  alertCountText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  seeAllText: {
    ...Typography.small,
    color: Colors.dark.orange,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
  },
  alertIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: 2,
  },
  alertDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  quickAction: {
    width: "22%",
    alignItems: "center",
    gap: Spacing.sm,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    ...Typography.caption,
    color: Colors.dark.text,
    textAlign: "center",
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sessionTime: {
    alignItems: "center",
    marginRight: Spacing.md,
    minWidth: 50,
  },
  sessionDay: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  sessionHour: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  sessionCoach: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sessionStatus: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  sessionStatusText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  menuCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  menuCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuCardText: {
    flex: 1,
  },
  menuCardTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  menuCardSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
});
