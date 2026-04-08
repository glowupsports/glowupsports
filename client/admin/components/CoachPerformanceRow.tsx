import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

export interface CoachPerformance {
  id: string;
  name: string;
  avatar?: string;
  sessionsToday: number;
  completedSessions: number;
  playersTrainedToday: number;
  earningsToday: number;
  rating: number;
  isActive: boolean;
}

interface CoachPerformanceRowProps {
  coaches: CoachPerformance[];
  currency: string;
  onCoachPress?: (coachId: string) => void;
  onViewAll?: () => void;
}

function CoachCard({ 
  coach, 
  currency, 
  onPress 
}: { 
  coach: CoachPerformance; 
  currency: string;
  onPress?: () => void;
}) {
  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return parts.length > 1 
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  return (
    <Pressable 
      style={styles.coachCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <View style={styles.coachHeader}>
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={coach.isActive ? [Colors.dark.primary, Colors.dark.xpCyan] : [Colors.dark.textMuted, Colors.dark.textMuted]}
            style={styles.avatarGradient}
          >
            <Text style={styles.avatarText}>{getInitials(coach.name)}</Text>
          </LinearGradient>
          {coach.isActive && (
            <View style={styles.activeIndicator} />
          )}
        </View>
        <Text style={styles.coachName} numberOfLines={1}>{coach.name}</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{coach.completedSessions}/{coach.sessionsToday}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{coach.playersTrainedToday}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.earningsContainer}>
          <Ionicons name="cash" size={12} color={Colors.dark.gold} />
          <Text style={styles.earningsText}>{currency} {coach.earningsToday}</Text>
        </View>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={12} color={Colors.dark.orange} />
          <Text style={styles.ratingText}>{coach.rating.toFixed(1)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function CoachPerformanceRow({ 
  coaches, 
  currency, 
  onCoachPress,
  onViewAll,
}: CoachPerformanceRowProps) {
  const activeCoaches = coaches.filter(c => c.isActive).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="people" size={18} color={Colors.dark.primary} />
          <Text style={styles.title}>COACH PERFORMANCE</Text>
          <View style={styles.activeBadge}>
            <Text style={styles.activeText}>{activeCoaches} Active</Text>
          </View>
        </View>
        <Pressable onPress={onViewAll}>
          <Text style={styles.viewAllText}>View All</Text>
        </Pressable>
      </View>

      {coaches.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {coaches.map((coach) => (
            <CoachCard
              key={coach.id}
              coach={coach}
              currency={currency}
              onPress={() => onCoachPress?.(coach.id)}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={32} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No coaches available</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1.5,
  },
  activeBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: Spacing.xs,
  },
  activeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  viewAllText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  coachCard: {
    width: 140,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  coachHeader: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.sm,
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  coachName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.dark.border,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  earningsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  earningsText: {
    fontSize: 11,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: {
    fontSize: 11,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
});
