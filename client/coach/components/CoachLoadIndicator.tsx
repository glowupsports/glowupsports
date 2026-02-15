import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, BorderRadius, Typography, GlowColors, FunctionColors, TextColors } from "@/constants/theme";

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
  const staminaPercent = Math.max(0, 100 - loadPercent);

  const getStaminaColor = (): readonly [string, string] => {
    if (staminaPercent <= 20) return [FunctionColors.error, FunctionColors.error] as const;
    if (staminaPercent <= 50) return [FunctionColors.social, Colors.dark.gold] as const;
    return [GlowColors.primary, FunctionColors.info] as const;
  };

  const getStaminaLabel = () => {
    if (staminaPercent <= 20) return "DEPLETED";
    if (staminaPercent <= 50) return "DRAINING";
    if (staminaPercent < 100) return "CHARGED";
    return "FULL POWER";
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Stamina</Text>
        <Text style={[styles.loadText, { color: getStaminaColor()[0] }]}>
          {getStaminaLabel()}
        </Text>
        <Text style={styles.hoursText}>
          {Math.round(staminaPercent)}%
        </Text>
      </View>
      <View style={styles.barBackground}>
        <LinearGradient
          colors={getStaminaColor()}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barFill, { width: `${Math.max(2, staminaPercent)}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderBottomWidth: 1,
    borderBottomColor: GlowColors.primary + "20",
    borderTopWidth: 1,
    borderTopColor: GlowColors.primary + "10",
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
    color: TextColors.muted,
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
    color: TextColors.muted,
    marginLeft: "auto",
    letterSpacing: 0.3,
  },
  barBackground: {
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GlowColors.primary + "20",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
    }),
  },
});

export default CoachLoadIndicator;
