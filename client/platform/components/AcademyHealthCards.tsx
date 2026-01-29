import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

const PLATFORM_PURPLE = "#9B59B6";

interface AcademyHealth {
  id: string;
  name: string;
  players: number;
  coaches: number;
  mrr: number;
  healthScore: number;
  status: "healthy" | "warning" | "critical" | "trial" | "paused";
}

interface AcademyHealthCardsProps {
  academies: AcademyHealth[];
  currency: string;
  onAcademyPress?: (id: string) => void;
  onViewAll?: () => void;
}

export function AcademyHealthCards({
  academies,
  currency,
  onAcademyPress,
  onViewAll,
}: AcademyHealthCardsProps) {
  const getStatusStyle = (status: AcademyHealth["status"]) => {
    switch (status) {
      case "healthy": return { bg: Colors.dark.primary + "20", color: Colors.dark.primary, icon: "checkmark-circle" as const };
      case "warning": return { bg: Colors.dark.orange + "20", color: Colors.dark.orange, icon: "warning" as const };
      case "critical": return { bg: Colors.dark.error + "20", color: Colors.dark.error, icon: "alert-circle" as const };
      case "trial": return { bg: PLATFORM_PURPLE + "20", color: PLATFORM_PURPLE, icon: "hourglass" as const };
      case "paused": return { bg: Colors.dark.textMuted + "20", color: Colors.dark.textMuted, icon: "pause-circle" as const };
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toLocaleString();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="business" size={18} color={PLATFORM_PURPLE} />
          </View>
          <Text style={styles.title}>Academy Health</Text>
        </View>
        <Pressable style={styles.viewAllBtn} onPress={onViewAll}>
          <Text style={styles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={PLATFORM_PURPLE} />
        </Pressable>
      </View>

      {academies.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={32} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No academies yet</Text>
        </View>
      ) : (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardsScroll}
        >
          {academies.slice(0, 6).map((academy) => {
            const statusStyle = getStatusStyle(academy.status);
            return (
              <Pressable 
                key={academy.id}
                style={styles.academyCard}
                onPress={() => onAcademyPress?.(academy.id)}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Ionicons name={statusStyle.icon} size={12} color={statusStyle.color} />
                  </View>
                  <View style={styles.healthScore}>
                    <Text style={[styles.healthScoreText, { color: statusStyle.color }]}>{academy.healthScore}</Text>
                  </View>
                </View>
                
                <Text style={styles.academyName} numberOfLines={1}>{academy.name}</Text>
                
                <View style={styles.academyStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="people-outline" size={12} color={Colors.dark.textMuted} />
                    <Text style={styles.statItemText}>{academy.players}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="person-outline" size={12} color={Colors.dark.textMuted} />
                    <Text style={styles.statItemText}>{academy.coaches}</Text>
                  </View>
                </View>
                
                <View style={styles.mrrRow}>
                  <Text style={styles.mrrLabel}>MRR</Text>
                  <Text style={styles.mrrValue}>{currency} {formatCurrency(academy.mrr)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
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
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: PLATFORM_PURPLE + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    ...Typography.small,
    color: PLATFORM_PURPLE,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  cardsScroll: {
    gap: Spacing.md,
    paddingRight: Spacing.md,
  },
  academyCard: {
    width: 160,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  healthScore: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.sm,
  },
  healthScoreText: {
    ...Typography.small,
    fontWeight: "700",
    fontSize: 12,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  academyStats: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statItemText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  mrrRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  mrrLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  mrrValue: {
    ...Typography.small,
    color: PLATFORM_PURPLE,
    fontWeight: "700",
  },
});
