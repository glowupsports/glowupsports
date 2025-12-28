import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import ModeSwitcher from "@/components/ModeSwitcher";

interface AcademyRowProps {
  name: string;
  coaches: number;
  players: number;
  revenue: number;
  status: "active" | "paused" | "trial";
}

function AcademyRow({ name, coaches, players, revenue, status }: AcademyRowProps) {
  const statusColors = {
    active: Colors.dark.primary,
    paused: Colors.dark.orange,
    trial: Colors.dark.xpCyan,
  };

  return (
    <Pressable style={styles.academyRow}>
      <View style={styles.academyInfo}>
        <Text style={styles.academyName}>{name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColors[status]}20` }]}>
          <Text style={[styles.statusText, { color: statusColors[status] }]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Text>
        </View>
      </View>
      <View style={styles.academyStats}>
        <View style={styles.academyStat}>
          <Text style={styles.statValue}>{coaches}</Text>
          <Text style={styles.statLabel}>Coaches</Text>
        </View>
        <View style={styles.academyStat}>
          <Text style={styles.statValue}>{players}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.academyStat}>
          <Text style={[styles.statValue, { color: Colors.dark.gold }]}>${revenue}</Text>
          <Text style={styles.statLabel}>MRR</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function PlatformDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const platformStats = {
    totalAcademies: 12,
    totalCoaches: 47,
    totalPlayers: 312,
    mrr: 28500,
    activeTrials: 3,
  };

  const academies: AcademyRowProps[] = [
    { name: "Tennis Academy Pro", coaches: 4, players: 23, revenue: 2850, status: "active" },
    { name: "Elite Tennis Club", coaches: 3, players: 18, revenue: 2200, status: "active" },
    { name: "Junior Champions", coaches: 2, players: 15, revenue: 1800, status: "trial" },
    { name: "City Tennis Center", coaches: 5, players: 32, revenue: 3500, status: "active" },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(155,89,182,0.15)", "transparent"]}
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
              <Text style={styles.subtitle}>Platform Owner Dashboard</Text>
            </View>
            <Ionicons name="globe" size={32} color="#9B59B6" />
          </View>

          <ModeSwitcher />
        </View>

        <View style={[styles.statsCard, CardStyles.elevated]}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: "#9B59B6" }]}>{platformStats.totalAcademies}</Text>
              <Text style={styles.statLabel}>Academies</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: Colors.dark.primary }]}>{platformStats.totalCoaches}</Text>
              <Text style={styles.statLabel}>Coaches</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, { color: Colors.dark.xpCyan }]}>{platformStats.totalPlayers}</Text>
              <Text style={styles.statLabel}>Players</Text>
            </View>
          </View>
          <View style={styles.mrrRow}>
            <Text style={styles.mrrLabel}>Monthly Recurring Revenue</Text>
            <Text style={styles.mrrValue}>${platformStats.mrr.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Academies</Text>
            <Pressable style={styles.addButton}>
              <Ionicons name="add" size={18} color="#9B59B6" />
              <Text style={styles.addButtonText}>Add Academy</Text>
            </Pressable>
          </View>
          <View style={[styles.academiesCard, CardStyles.elevated]}>
            {academies.map((academy, index) => (
              <AcademyRow key={index} {...academy} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Controls</Text>
          <View style={styles.controlsGrid}>
            <Pressable style={[styles.controlCard, CardStyles.elevated]}>
              <Ionicons name="cash" size={24} color={Colors.dark.gold} />
              <Text style={styles.controlLabel}>Billing</Text>
            </Pressable>
            <Pressable style={[styles.controlCard, CardStyles.elevated]}>
              <Ionicons name="settings" size={24} color={Colors.dark.orange} />
              <Text style={styles.controlLabel}>XP Engine</Text>
            </Pressable>
            <Pressable style={[styles.controlCard, CardStyles.elevated]}>
              <Ionicons name="shield" size={24} color={Colors.dark.error} />
              <Text style={styles.controlLabel}>Kill Switch</Text>
            </Pressable>
            <Pressable style={[styles.controlCard, CardStyles.elevated]}>
              <Ionicons name="analytics" size={24} color={Colors.dark.xpCyan} />
              <Text style={styles.controlLabel}>Analytics</Text>
            </Pressable>
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
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  platformTitle: {
    ...Typography.h1,
    color: "#9B59B6",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  statsCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.lg,
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    ...Typography.h1,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  mrrRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot,
  },
  mrrLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  mrrValue: {
    ...Typography.h2,
    color: Colors.dark.gold,
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: "rgba(155,89,182,0.15)",
    borderRadius: BorderRadius.sm,
  },
  addButtonText: {
    ...Typography.small,
    color: "#9B59B6",
    fontWeight: "600",
  },
  academiesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  academyRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  academyInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.small,
    fontSize: 10,
    fontWeight: "600",
  },
  academyStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  academyStat: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  controlsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  controlCard: {
    width: "47%",
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  controlLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
});
