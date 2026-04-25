import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { convertUTCTimeToLocal } from "@/lib/dateUtils";

const SERIES_PURPLE = "#8A2BE2";

interface SeriesSummary {
  id: string;
  name: string;
  sessionType: string;
  dayOfWeek: number;
  startTime: string;
  status: string;
  playerCount: number;
  sessionsCompleted: number;
  pendingFeedback: number;
}

interface SeriesSummaryCardProps {
  onPress?: () => void;
  onViewAll?: () => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SeriesSummaryCard({ onPress, onViewAll }: SeriesSummaryCardProps) {
  const { academy } = useCoach();
  const { data: seriesData, isLoading } = useQuery<SeriesSummary[]>({
    queryKey: ["/api/coach/series"],
  });

  const activeSeries = seriesData?.filter(s => s.status === "active") || [];
  const pausedSeries = seriesData?.filter(s => s.status === "paused") || [];
  
  const totalActiveSeries = activeSeries.length;
  const totalPausedSeries = pausedSeries.length;
  
  const todayDayOfWeek = new Date().getDay();
  const todaysSeries = activeSeries.filter(s => Number(s.dayOfWeek) === todayDayOfWeek);
  
  const totalPlayers = activeSeries.reduce((acc, s) => acc + s.playerCount, 0);
  
  // Helper to convert UTC time to local academy time
  const getLocalTime = (utcTime: string) => {
    const timezone = academy?.timezone || "Asia/Dubai";
    return convertUTCTimeToLocal(utcTime, timezone);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={["rgba(138, 43, 226, 0.1)", "rgba(0, 0, 0, 0.7)"]}
          style={styles.gradient}
        >
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading classes...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (!seriesData || seriesData.length === 0) {
    return (
      <Pressable style={styles.container} onPress={onPress}>
        <LinearGradient
          colors={["rgba(138, 43, 226, 0.15)", "rgba(0, 0, 0, 0.8)"]}
          style={styles.gradient}
        >
          <LinearGradient
            colors={[SERIES_PURPLE + "60", "transparent", Colors.dark.xpCyan + "40"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topLine}
          />
          <View style={styles.emptyContent}>
            <View style={styles.iconWrapper}>
              <Ionicons name="layers-outline" size={24} color={SERIES_PURPLE} />
            </View>
            <Text style={styles.emptyTitle}>No Classes</Text>
            <Text style={styles.emptySubtitle}>Create your first recurring class</Text>
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["rgba(138, 43, 226, 0.12)", "rgba(0, 0, 0, 0.85)"]}
        style={styles.gradient}
      >
        <LinearGradient
          colors={[SERIES_PURPLE + "80", "transparent", Colors.dark.xpCyan + "60"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topLine}
        />
        
        <Pressable 
          style={styles.header}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onViewAll?.();
          }}
        >
          <View style={styles.titleRow}>
            <View style={[styles.iconWrapper, { backgroundColor: SERIES_PURPLE + "25" }]}>
              <Ionicons name="layers" size={14} color={SERIES_PURPLE} />
            </View>
            <Text style={styles.title}>MY CLASSES</Text>
          </View>
          <View style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.xpCyan} />
          </View>
        </Pressable>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalActiveSeries}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{todaysSeries.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalPlayers}</Text>
            <Text style={styles.statLabel}>Players</Text>
          </View>
          {totalPausedSeries > 0 ? (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: Colors.dark.accentWarning }]}>{totalPausedSeries}</Text>
                <Text style={styles.statLabel}>Paused</Text>
              </View>
            </>
          ) : null}
        </View>

        {todaysSeries.length > 0 ? (
          <View style={styles.todaySection}>
            <Text style={styles.todayLabel}>Today&apos;s Classes</Text>
            {todaysSeries.slice(0, 2).map((series, index) => (
              <Pressable 
                key={series.id} 
                style={styles.seriesItem}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPress?.();
                }}
              >
                <View style={styles.seriesItemLeft}>
                  <View style={[styles.seriesTypeDot, { backgroundColor: getTypeColor(series.sessionType) }]} />
                  <View>
                    <Text style={styles.seriesName} numberOfLines={1}>{series.name}</Text>
                    <Text style={styles.seriesTime}>{getLocalTime(series.startTime)}</Text>
                  </View>
                </View>
                <View style={styles.seriesItemRight}>
                  <Text style={styles.playerCount}>{series.playerCount}</Text>
                  <Ionicons name="people" size={12} color={Colors.dark.textMuted} />
                </View>
              </Pressable>
            ))}
            {todaysSeries.length > 2 ? (
              <Text style={styles.moreText}>+{todaysSeries.length - 2} more</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.noTodaySection}>
            <Text style={styles.noTodayText}>No classes scheduled for today</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

function getTypeColor(type: string): string {
  switch (type) {
    case "private": return SERIES_PURPLE;
    case "semi_private": return Colors.dark.xpCyan;
    case "group": return Colors.dark.successNeon;
    case "physical": return Colors.dark.orange;
    default: return Colors.dark.primary;
  }
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  gradient: {
    padding: Spacing.md,
  },
  topLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.body.fontSize,
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
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SERIES_PURPLE + "20",
  },
  title: {
    color: Colors.dark.text,
    fontSize: Typography.small.fontSize,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  viewAllText: {
    color: Colors.dark.xpCyan,
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    color: Colors.dark.text,
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
  },
  statLabel: {
    color: Colors.dark.textMuted,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.dark.border,
  },
  todaySection: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
  },
  todayLabel: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  seriesItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  seriesItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  seriesTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  seriesName: {
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
  },
  seriesTime: {
    color: Colors.dark.textMuted,
    fontSize: Typography.caption.fontSize,
  },
  seriesItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  playerCount: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
  },
  moreText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.caption.fontSize,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  noTodaySection: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
    alignItems: "center",
  },
  noTodayText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.small.fontSize,
    fontStyle: "italic",
  },
  emptyContent: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    color: Colors.dark.textMuted,
    fontSize: Typography.small.fontSize,
    marginTop: Spacing.xs,
  },
});
