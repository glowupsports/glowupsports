import React, { useMemo, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import ModeSwitcher from "@/components/ModeSwitcher";

interface AcademyCardProps {
  name: string;
  location: string;
  coaches: number;
  players: number;
  revenue: number;
  isActive?: boolean;
  onPress?: () => void;
}

function AcademyCard({ name, location, coaches, players, revenue, isActive, onPress }: AcademyCardProps) {
  return (
    <Pressable
      style={[styles.academyCard, CardStyles.elevated, isActive && styles.academyCardActive]}
      onPress={onPress}
    >
      <View style={styles.academyCardHeader}>
        <View style={[styles.academyIcon, isActive && styles.academyIconActive]}>
          <Ionicons name="tennisball" size={24} color={isActive ? Colors.dark.backgroundRoot : Colors.dark.gold} />
        </View>
        <View style={styles.academyInfo}>
          <Text style={styles.academyName}>{name}</Text>
          <Text style={styles.academyLocation}>{location}</Text>
        </View>
        {isActive ? (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.academyStats}>
        <View style={styles.academyStat}>
          <Text style={styles.academyStatValue}>{coaches}</Text>
          <Text style={styles.academyStatLabel}>Coaches</Text>
        </View>
        <View style={styles.academyStatDivider} />
        <View style={styles.academyStat}>
          <Text style={styles.academyStatValue}>{players}</Text>
          <Text style={styles.academyStatLabel}>Players</Text>
        </View>
        <View style={styles.academyStatDivider} />
        <View style={styles.academyStat}>
          <Text style={[styles.academyStatValue, { color: Colors.dark.gold }]}>${revenue}</Text>
          <Text style={styles.academyStatLabel}>Revenue</Text>
        </View>
      </View>
    </Pressable>
  );
}

interface SystemStatProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
}

function SystemStat({ icon, label, value, color }: SystemStatProps) {
  return (
    <View style={styles.systemStat}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.systemStatLabel}>{label}</Text>
      <Text style={[styles.systemStatValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function OwnerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();

  const academies = useMemo(() => [
    { id: "1", name: "Tennis Academy Pro", location: "New York, NY", coaches: 4, players: 23, revenue: 4250, isActive: true },
    { id: "2", name: "Elite Tennis Club", location: "Los Angeles, CA", coaches: 3, players: 18, revenue: 3100, isActive: false },
  ], []);

  const systemStats = useMemo(() => ({
    totalAcademies: 2,
    totalCoaches: 7,
    totalPlayers: 41,
    totalRevenue: 7350,
    activeSubscriptions: 2,
    serverHealth: "Excellent",
  }), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,215,0,0.15)", "transparent"]}
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
              <Text style={styles.welcomeText}>Owner Dashboard</Text>
              <Text style={styles.ownerName}>Welcome, {user?.email?.split("@")[0] || "Owner"}</Text>
            </View>
            <Pressable
              style={styles.settingsButton}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="cog" size={24} color={Colors.dark.gold} />
            </Pressable>
          </View>

          <ModeSwitcher />
        </View>

        <View style={[styles.systemOverview, CardStyles.glowCard]}>
          <View style={styles.systemOverviewHeader}>
            <Ionicons name="analytics" size={20} color={Colors.dark.gold} />
            <Text style={styles.systemOverviewTitle}>System Overview</Text>
          </View>
          <View style={styles.systemStatsRow}>
            <SystemStat icon="business" label="Academies" value={systemStats.totalAcademies} color={Colors.dark.gold} />
            <SystemStat icon="people" label="Coaches" value={systemStats.totalCoaches} color={Colors.dark.primary} />
            <SystemStat icon="person" label="Players" value={systemStats.totalPlayers} color={Colors.dark.xpCyan} />
          </View>
          <View style={styles.systemStatsRow}>
            <SystemStat icon="card" label="Subscriptions" value={systemStats.activeSubscriptions} color={Colors.dark.orange} />
            <SystemStat icon="cash" label="Revenue" value={`$${systemStats.totalRevenue}`} color={Colors.dark.gold} />
            <SystemStat icon="pulse" label="Health" value={systemStats.serverHealth} color={Colors.dark.primary} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Academies</Text>
            <Pressable
              style={styles.addButton}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="add" size={20} color={Colors.dark.gold} />
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
          {academies.map((academy) => (
            <AcademyCard key={academy.id} {...academy} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Management</Text>
          
          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <View style={[styles.menuIcon, { backgroundColor: `${Colors.dark.gold}20` }]}>
                <Ionicons name="card-outline" size={22} color={Colors.dark.gold} />
              </View>
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Billing & Subscriptions</Text>
                <Text style={styles.menuCardSubtitle}>Manage plans, invoices, payments</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <View style={[styles.menuIcon, { backgroundColor: `${Colors.dark.primary}20` }]}>
                <Ionicons name="people-outline" size={22} color={Colors.dark.primary} />
              </View>
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Team Management</Text>
                <Text style={styles.menuCardSubtitle}>Invite admins, manage permissions</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <View style={[styles.menuIcon, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                <Ionicons name="bar-chart-outline" size={22} color={Colors.dark.xpCyan} />
              </View>
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Analytics & Reports</Text>
                <Text style={styles.menuCardSubtitle}>Performance metrics, trends</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <View style={[styles.menuIcon, { backgroundColor: `${Colors.dark.orange}20` }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color={Colors.dark.orange} />
              </View>
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Security & Audit</Text>
                <Text style={styles.menuCardSubtitle}>Logs, access history, compliance</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <View style={[styles.menuIcon, { backgroundColor: `${Colors.dark.error}20` }]}>
                <Ionicons name="cog-outline" size={22} color={Colors.dark.textMuted} />
              </View>
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>System Settings</Text>
                <Text style={styles.menuCardSubtitle}>API keys, integrations, config</Text>
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
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  ownerName: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  systemOverview: {
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderColor: "rgba(255,215,0,0.3)",
  },
  systemOverviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  systemOverviewTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  systemStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  systemStat: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
  },
  systemStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  systemStatValue: {
    ...Typography.numberSmall,
    color: Colors.dark.text,
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
  },
  addButtonText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  academyCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  academyCardActive: {
    borderColor: "rgba(255,215,0,0.4)",
  },
  academyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  academyIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  academyIconActive: {
    backgroundColor: Colors.dark.gold,
  },
  academyInfo: {
    flex: 1,
  },
  academyName: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  academyLocation: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  activeBadge: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: "rgba(255,215,0,0.2)",
    borderRadius: BorderRadius.sm,
  },
  activeBadgeText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  academyStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  academyStat: {
    alignItems: "center",
  },
  academyStatValue: {
    ...Typography.numberMedium,
    color: Colors.dark.text,
  },
  academyStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  academyStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.1)",
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
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
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
