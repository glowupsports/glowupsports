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

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
  onPress?: () => void;
}

function StatCard({ icon, label, value, color = Colors.dark.primary, onPress }: StatCardProps) {
  return (
    <Pressable
      style={[styles.statCard, CardStyles.elevated]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.statIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

interface QuickActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
}

function QuickAction({ icon, label, color = Colors.dark.primary, onPress }: QuickActionProps) {
  return (
    <Pressable
      style={styles.quickAction}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();

  const stats = useMemo(() => ({
    totalCoaches: 4,
    totalPlayers: 23,
    activeSessions: 3,
    monthlyRevenue: 4250,
  }), []);

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
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.welcomeText}>Admin Dashboard</Text>
              <Text style={styles.academyName}>Tennis Academy Pro</Text>
            </View>
            <Pressable
              style={styles.notificationButton}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="notifications-outline" size={24} color={Colors.dark.text} />
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>3</Text>
              </View>
            </Pressable>
          </View>

          <ModeSwitcher />
        </View>

        <View style={styles.statsGrid}>
          <StatCard icon="people" label="Coaches" value={stats.totalCoaches} color={Colors.dark.primary} />
          <StatCard icon="person" label="Players" value={stats.totalPlayers} color={Colors.dark.xpCyan} />
          <StatCard icon="calendar" label="Active Sessions" value={stats.activeSessions} color={Colors.dark.orange} />
          <StatCard icon="cash" label="Revenue" value={`$${stats.monthlyRevenue}`} color={Colors.dark.gold} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <QuickAction icon="person-add" label="Add Coach" color={Colors.dark.primary} onPress={() => {}} />
            <QuickAction icon="person-add-outline" label="Add Player" color={Colors.dark.xpCyan} onPress={() => {}} />
            <QuickAction icon="calendar-outline" label="Schedule" color={Colors.dark.orange} onPress={() => {}} />
            <QuickAction icon="analytics" label="Reports" color={Colors.dark.gold} onPress={() => {}} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Management</Text>
          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <Ionicons name="people-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Manage Coaches</Text>
                <Text style={styles.menuCardSubtitle}>View, edit, and add coaches</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <Ionicons name="person-outline" size={24} color={Colors.dark.xpCyan} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Manage Players</Text>
                <Text style={styles.menuCardSubtitle}>View, edit, and add players</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <Ionicons name="shield-outline" size={24} color={Colors.dark.orange} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Roles & Permissions</Text>
                <Text style={styles.menuCardSubtitle}>Manage access controls</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academy Settings</Text>
          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <Ionicons name="business-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Academy Profile</Text>
                <Text style={styles.menuCardSubtitle}>Business info, branding, location</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </Pressable>

          <Pressable style={[styles.menuCard, CardStyles.elevated]}>
            <View style={styles.menuCardContent}>
              <Ionicons name="tennisball-outline" size={24} color={Colors.dark.primary} />
              <View style={styles.menuCardText}>
                <Text style={styles.menuCardTitle}>Courts & Facilities</Text>
                <Text style={styles.menuCardSubtitle}>Manage court types and availability</Text>
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    width: "47%",
    padding: Spacing.lg,
    alignItems: "center",
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.numberLarge,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
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
