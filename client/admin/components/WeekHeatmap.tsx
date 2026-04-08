import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface DayData {
  date: Date;
  sessionCount: number;
  intensity: number;
}

interface WeekHeatmapProps {
  days: DayData[];
  onDayPress?: (date: Date) => void;
}

export function WeekHeatmap({ days, onDayPress }: WeekHeatmapProps) {
  const getIntensityColor = (intensity: number) => {
    if (intensity === 0) return Colors.dark.backgroundRoot;
    if (intensity <= 0.25) return Colors.dark.primary + "30";
    if (intensity <= 0.5) return Colors.dark.primary + "50";
    if (intensity <= 0.75) return Colors.dark.primary + "80";
    return Colors.dark.primary;
  };

  const formatDayName = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short" }).substring(0, 1);
  };

  const formatDayNumber = (date: Date) => {
    return date.getDate().toString();
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const totalSessions = days.reduce((sum, d) => sum + d.sessionCount, 0);
  const busiestDay = days.reduce((max, d) => d.sessionCount > max.sessionCount ? d : max, days[0]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="calendar" size={18} color={Colors.dark.primary} />
            <Text style={styles.title}>WEEK OVERVIEW</Text>
          </View>
          <Text style={styles.totalSessions}>{totalSessions} sessions</Text>
        </View>

        <View style={styles.heatmapRow}>
          {days.map((day, index) => {
            const isCurrentDay = isToday(day.date);
            return (
              <Pressable
                key={index}
                style={styles.dayContainer}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDayPress?.(day.date);
                }}
              >
                <Text style={[styles.dayName, isCurrentDay && styles.todayText]}>
                  {formatDayName(day.date)}
                </Text>
                <View 
                  style={[
                    styles.dayCell, 
                    { backgroundColor: getIntensityColor(day.intensity) },
                    isCurrentDay && styles.todayCell,
                  ]}
                >
                  <Text style={[
                    styles.dayNumber,
                    day.intensity > 0.5 && styles.dayNumberLight,
                    isCurrentDay && styles.todayNumber,
                  ]}>
                    {formatDayNumber(day.date)}
                  </Text>
                </View>
                <Text style={styles.sessionCount}>
                  {day.sessionCount > 0 ? day.sessionCount : "-"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.dark.backgroundRoot }]} />
            <Text style={styles.legendText}>None</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.dark.primary + "40" }]} />
            <Text style={styles.legendText}>Light</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.dark.primary + "70" }]} />
            <Text style={styles.legendText}>Moderate</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.dark.primary }]} />
            <Text style={styles.legendText}>Busy</Text>
          </View>
        </View>

        {busiestDay && busiestDay.sessionCount > 0 && (
          <View style={styles.insight}>
            <Ionicons name="information-circle" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.insightText}>
              Busiest day: {busiestDay.date.toLocaleDateString("en-US", { weekday: "long" })} with {busiestDay.sessionCount} sessions
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
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
  totalSessions: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  heatmapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  dayContainer: {
    alignItems: "center",
    flex: 1,
  },
  dayName: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: 4,
  },
  todayText: {
    color: Colors.dark.primary,
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  todayCell: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  dayNumberLight: {
    color: Colors.dark.buttonText,
  },
  todayNumber: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  sessionCount: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  legendText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  insight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  insightText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
});
