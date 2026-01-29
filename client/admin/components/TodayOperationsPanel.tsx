import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface TodayOperationsPanelProps {
  currentDate: Date;
  totalSessions: number;
  completedSessions: number;
  inProgressSessions: number;
  upcomingSessions: number;
  onDateChange?: (date: Date) => void;
  onViewSchedule?: () => void;
}

export function TodayOperationsPanel({
  currentDate,
  totalSessions,
  completedSessions,
  inProgressSessions,
  upcomingSessions,
  onDateChange,
  onViewSchedule,
}: TodayOperationsPanelProps) {
  const [selectedDate, setSelectedDate] = useState(currentDate);

  const formatDate = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) return "Today";
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const navigateDate = (direction: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction);
    setSelectedDate(newDate);
    onDateChange?.(newDate);
  };

  const getDayStatus = () => {
    if (completedSessions === totalSessions && totalSessions > 0) {
      return { label: "ALL COMPLETE", color: Colors.dark.primary, icon: "checkmark-circle" as const };
    }
    if (inProgressSessions > 0) {
      return { label: "IN PROGRESS", color: Colors.dark.xpCyan, icon: "play-circle" as const };
    }
    if (upcomingSessions > 0) {
      return { label: "SCHEDULED", color: Colors.dark.orange, icon: "time" as const };
    }
    return { label: "NO SESSIONS", color: Colors.dark.textMuted, icon: "calendar-outline" as const };
  };

  const status = getDayStatus();
  const progressPercent = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="flash" size={18} color={Colors.dark.orange} />
            <Text style={styles.title}>OPERATIONS</Text>
          </View>
          
          <View style={styles.dateNav}>
            <Pressable style={styles.navButton} onPress={() => navigateDate(-1)}>
              <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            <Pressable style={styles.navButton} onPress={() => navigateDate(1)}>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
            </Pressable>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: status.color + "20" }]}>
            <Ionicons name={status.icon} size={12} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Session Progress</Text>
            <Text style={styles.progressValue}>{completedSessions}/{totalSessions}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
            />
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <View style={[styles.statDot, { backgroundColor: Colors.dark.primary }]} />
            <Text style={styles.statNumber}>{completedSessions}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statDot, { backgroundColor: Colors.dark.xpCyan }]} />
            <Text style={styles.statNumber}>{inProgressSessions}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          <View style={styles.statBox}>
            <View style={[styles.statDot, { backgroundColor: Colors.dark.orange }]} />
            <Text style={styles.statNumber}>{upcomingSessions}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
        </View>

        <Pressable 
          style={styles.viewScheduleButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onViewSchedule?.();
          }}
        >
          <Text style={styles.viewScheduleText}>View Full Schedule</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.dark.orange} />
        </Pressable>
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
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.orange,
    letterSpacing: 1.5,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  navButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dateText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    paddingHorizontal: Spacing.sm,
    minWidth: 80,
    textAlign: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  progressSection: {
    marginBottom: Spacing.lg,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  progressLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  progressValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: Spacing.xs,
  },
  statNumber: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  viewScheduleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.orange + "15",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  viewScheduleText: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
});
