import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Spacing, BorderRadius } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";

interface EarningsSummary {
  realized: {
    amount: string;
    currency: string;
    sessionsCount: number;
    status: string;
  };
  projected: {
    amount: string;
    currency: string;
    sessionsCount: number;
    status: string;
  };
  total: {
    amount: string;
    currency: string;
  };
  paymentRule: {
    type: string;
    hourlyRate: string | null;
    currency: string;
  };
  period: {
    month: number;
    year: number;
    monthName: string;
  };
}

interface Props {
  onPress?: () => void;
}

export function CoachEarningsCard({ onPress }: Props) {
  const { coach } = useCoach();

  const { data, isLoading } = useQuery<EarningsSummary>({
    queryKey: ["/api/coach/earnings/summary"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading earnings...</Text>
        </View>
      </View>
    );
  }

  const realizedAmount = parseFloat(data.realized.amount);
  const projectedAmount = parseFloat(data.projected.amount);

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <LinearGradient
        colors={[`${Colors.dark.primary}30`, `${Colors.dark.primary}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="wallet-outline" size={18} color={Colors.dark.primary} />
            <Text style={styles.title}>Coach Earnings</Text>
          </View>
          <View style={styles.periodBadge}>
            <Text style={styles.periodText}>{data.period.monthName}</Text>
          </View>
        </View>

        <View style={styles.earningsGrid}>
          <View style={styles.earningItem}>
            <View style={styles.earningHeader}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
              <Text style={styles.earningLabel}>Earned</Text>
            </View>
            <Text style={styles.earningAmount}>
              {data.realized.currency} {realizedAmount.toLocaleString()}
            </Text>
            <Text style={styles.sessionCount}>
              {data.realized.sessionsCount} lesson{data.realized.sessionsCount !== 1 ? "s" : ""}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.earningItem}>
            <View style={styles.earningHeader}>
              <Ionicons name="time-outline" size={14} color={Colors.dark.gold} />
              <Text style={styles.earningLabel}>Expected</Text>
            </View>
            <Text style={[styles.earningAmount, styles.projectedAmount]}>
              {data.projected.currency} {projectedAmount.toLocaleString()}
            </Text>
            <Text style={styles.sessionCount}>
              {data.projected.sessionsCount} upcoming
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.paymentInfo}>
            <Ionicons name="card-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.paymentText}>
              {data.paymentRule.type === "hourly" 
                ? `${data.paymentRule.currency} ${data.paymentRule.hourlyRate}/hr`
                : data.paymentRule.type
              }
            </Text>
          </View>
          <View style={styles.viewDetails}>
            <Text style={styles.viewDetailsText}>View details</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.primary} />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  loadingCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    ...Typography.small,
  },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
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
    gap: Spacing.xs,
  },
  title: {
    color: Colors.dark.text,
    ...Typography.body,
    fontWeight: "600",
  },
  periodBadge: {
    backgroundColor: `${Colors.dark.primary}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  periodText: {
    color: Colors.dark.primary,
    ...Typography.caption,
    fontWeight: "600",
  },
  earningsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  earningItem: {
    flex: 1,
  },
  earningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: Spacing.xs,
  },
  earningLabel: {
    color: Colors.dark.textMuted,
    ...Typography.caption,
  },
  earningAmount: {
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 2,
  },
  projectedAmount: {
    color: Colors.dark.gold,
  },
  sessionCount: {
    color: Colors.dark.textMuted,
    ...Typography.caption,
  },
  divider: {
    width: 1,
    backgroundColor: `${Colors.dark.text}20`,
    marginHorizontal: Spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: `${Colors.dark.text}10`,
    paddingTop: Spacing.sm,
  },
  paymentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  paymentText: {
    color: Colors.dark.textMuted,
    ...Typography.caption,
  },
  viewDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewDetailsText: {
    color: Colors.dark.primary,
    ...Typography.caption,
  },
});
