import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  duration?: number;
  durationMinutes?: number;
}

interface CoachLoadIndicatorProps {
  sessions: Session[];
  selectedDate: Date;
  maxHoursPerDay?: number;
}

export function CoachLoadIndicator({
  sessions,
  selectedDate,
  maxHoursPerDay = 8,
}: CoachLoadIndicatorProps) {
  const dayStart = new Date(selectedDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(selectedDate);
  dayEnd.setHours(23, 59, 59, 999);

  const daySessions = sessions.filter((s) => {
    const sessionDate = new Date(s.startTime);
    return sessionDate >= dayStart && sessionDate <= dayEnd;
  });

  const totalMinutes = daySessions.reduce((sum, s) => {
    const mins = s.durationMinutes || s.duration || 60;
    return sum + mins;
  }, 0);
  const totalHours = totalMinutes / 60;
  const loadPercent = Math.min(100, (totalHours / maxHoursPerDay) * 100);

  const getLoadColor = (): readonly [string, string] => {
    if (loadPercent >= 80) return [Colors.dark.error, Colors.dark.error] as const;
    if (loadPercent >= 50) return [Colors.dark.orange, Colors.dark.gold] as const;
    return [Colors.dark.primary, Colors.dark.xpCyan] as const;
  };

  const getLoadLabel = () => {
    if (loadPercent >= 80) return "HEAVY";
    if (loadPercent >= 50) return "MODERATE";
    if (loadPercent > 0) return "LIGHT";
    return "FREE";
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Load</Text>
        <Text style={[styles.loadText, { color: getLoadColor()[0] }]}>
          {getLoadLabel()}
        </Text>
        <Text style={styles.hoursText}>
          {totalHours.toFixed(1)}h / {maxHoursPerDay}h
        </Text>
      </View>
      <View style={styles.barBackground}>
        <LinearGradient
          colors={getLoadColor()}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barFill, { width: `${Math.max(2, loadPercent)}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(12, 12, 15, 0.98)",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.primary + "20",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.primary + "10",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  loadText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  hoursText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    marginLeft: "auto",
    letterSpacing: 0.3,
  },
  barBackground: {
    height: 8,
    backgroundColor: "rgba(30, 30, 35, 0.95)",
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
    }),
  },
});

export default CoachLoadIndicator;
