import React from "react";
import { View, Text, StyleSheet } from "react-native";
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
    if (loadPercent >= 80) return "Heavy";
    if (loadPercent >= 50) return "Moderate";
    if (loadPercent > 0) return "Light";
    return "Free";
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  loadText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  hoursText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginLeft: "auto",
  },
  barBackground: {
    height: 6,
    backgroundColor: Colors.dark.headerBorder,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: BorderRadius.sm,
  },
});

export default CoachLoadIndicator;
