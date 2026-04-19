import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  FadeInRight,
  FadeOutLeft,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface StatOverlay {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  trend?: "up" | "down" | "neutral";
  color: string;
}

interface AnalysisDeskProps {
  stats?: {
    forehandConsistency?: number;
    sessionsThisWeek?: number;
    matchWinRate?: number;
    lastSessionRating?: number;
  };
}

function StatCard({ stat, index }: { stat: StatOverlay; index: number }) {
  const slideIn = useSharedValue(-20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    slideIn.value = withDelay(
      index * 150,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
    opacity.value = withDelay(
      index * 150,
      withTiming(1, { duration: 400 })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideIn.value }],
    opacity: opacity.value,
  }));

  const trendIcon = stat.trend === "up" ? "arrow-up" : stat.trend === "down" ? "arrow-down" : undefined;
  const trendColor = stat.trend === "up" ? ProTennisColors.success : stat.trend === "down" ? ProTennisColors.danger : ProTennisColors.textMuted;

  return (
    <Animated.View style={[styles.statCard, animStyle]}>
      <View style={[styles.statIconWrap, { backgroundColor: stat.color + "20" }]}>
        <Ionicons name={stat.icon} size={14} color={stat.color} />
      </View>
      <View style={styles.statContent}>
        <Text style={styles.statLabel}>{stat.label}</Text>
        <View style={styles.statValueRow}>
          <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
          {trendIcon && (
            <Ionicons name={trendIcon} size={10} color={trendColor} style={{ marginLeft: 4 }} />
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export function AnalysisDesk({ stats }: AnalysisDeskProps) {
  const { state } = usePlayerState();
  const [visibleStats, setVisibleStats] = useState<StatOverlay[]>([]);

  useEffect(() => {
    const newStats: StatOverlay[] = [];

    if (state.isNearLevelUp) {
      const remaining = Math.round((1 - state.xpProgress) * 100);
      newStats.push({
        id: "levelup",
        icon: "trending-up",
        label: "LEVEL PROMOTION",
        value: `${remaining}% to go`,
        trend: "up",
        color: ProTennisColors.electricGreen,
      });
    }

    if (state.streak > 0) {
      newStats.push({
        id: "streak",
        icon: "flame",
        label: "SESSION STREAK",
        value: `${state.streak} days`,
        trend: state.isStreakAtRisk ? "down" : "neutral",
        color: state.isStreakAtRisk ? ProTennisColors.warning : ProTennisColors.electricGreen,
      });
    }

    if (stats?.forehandConsistency) {
      newStats.push({
        id: "forehand",
        icon: "tennisball",
        label: "FOREHAND ACCURACY",
        value: `${stats.forehandConsistency}%`,
        trend: stats.forehandConsistency > 70 ? "up" : "neutral",
        color: ProTennisColors.neonCyan,
      });
    }

    if (stats?.sessionsThisWeek) {
      newStats.push({
        id: "sessions",
        icon: "calendar",
        label: "THIS WEEK",
        value: `${stats.sessionsThisWeek} sessions`,
        color: ProTennisColors.neonCyan,
      });
    }

    if (stats?.matchWinRate) {
      newStats.push({
        id: "winrate",
        icon: "trophy",
        label: "WIN RATE",
        value: `${stats.matchWinRate}%`,
        trend: stats.matchWinRate > 50 ? "up" : "down",
        color: stats.matchWinRate > 50 ? ProTennisColors.electricGreen : ProTennisColors.warning,
      });
    }

    setVisibleStats(newStats.slice(0, 3));
  }, [state, stats]);

  if (visibleStats.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.deskIndicator}>
          <Ionicons name="analytics" size={12} color={ProTennisColors.neonCyan} />
          <Text style={styles.deskLabel}>ANALYSIS DESK</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        {visibleStats.map((stat, index) => (
          <StatCard key={stat.id} stat={stat} index={index} />
        ))}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: ProTennisColors.surfaceDark,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: ProTennisColors.neonCyan + "15",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  deskIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deskLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: ProTennisColors.neonCyan,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceElevated,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statValue: {
    fontSize: 12,
    fontWeight: "700",
  },
}));
