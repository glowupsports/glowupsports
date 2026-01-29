import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface Session {
  id: string;
  title: string;
  time: string;
  coachName: string;
  playerCount: number;
  status: "upcoming" | "in_progress" | "completed";
}

interface SessionQueuePanelProps {
  sessions: Session[];
  onSessionPress?: (id: string) => void;
  onStartSession?: (id: string) => void;
  onViewAll?: () => void;
}

export function SessionQueuePanel({
  sessions,
  onSessionPress,
  onStartSession,
  onViewAll,
}: SessionQueuePanelProps) {
  const upcoming = sessions.filter(s => s.status === "upcoming");
  const inProgress = sessions.filter(s => s.status === "in_progress");
  const completed = sessions.filter(s => s.status === "completed");

  const getStatusColor = (status: Session["status"]) => {
    switch (status) {
      case "upcoming": return Colors.dark.xpCyan;
      case "in_progress": return Colors.dark.primary;
      case "completed": return Colors.dark.textMuted;
    }
  };

  const getStatusIcon = (status: Session["status"]): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "upcoming": return "time-outline";
      case "in_progress": return "play-circle";
      case "completed": return "checkmark-circle";
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="list" size={20} color={Colors.dark.orange} />
          <Text style={styles.title}>Session Queue</Text>
        </View>
        <Pressable onPress={onViewAll} style={styles.viewAllBtn}>
          <Text style={styles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.dark.orange} />
        </Pressable>
      </View>

      <View style={styles.statusSummary}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: Colors.dark.xpCyan }]} />
          <Text style={styles.statusCount}>{upcoming.length}</Text>
          <Text style={styles.statusLabel}>Upcoming</Text>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: Colors.dark.primary }]} />
          <Text style={styles.statusCount}>{inProgress.length}</Text>
          <Text style={styles.statusLabel}>In Progress</Text>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: Colors.dark.textMuted }]} />
          <Text style={styles.statusCount}>{completed.length}</Text>
          <Text style={styles.statusLabel}>Completed</Text>
        </View>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sessionsScroll}
      >
        {sessions.slice(0, 6).map((session) => (
          <Pressable 
            key={session.id}
            style={[styles.sessionCard, session.status === "in_progress" && styles.activeCard]}
            onPress={() => onSessionPress?.(session.id)}
          >
            <View style={styles.sessionHeader}>
              <View style={[styles.sessionStatus, { backgroundColor: getStatusColor(session.status) + "20" }]}>
                <Ionicons name={getStatusIcon(session.status)} size={14} color={getStatusColor(session.status)} />
              </View>
              <Text style={styles.sessionTime}>{session.time}</Text>
            </View>
            
            <Text style={styles.sessionTitle} numberOfLines={1}>{session.title}</Text>
            <Text style={styles.sessionCoach} numberOfLines={1}>{session.coachName}</Text>
            
            <View style={styles.sessionFooter}>
              <View style={styles.playerCount}>
                <Ionicons name="people-outline" size={12} color={Colors.dark.textMuted} />
                <Text style={styles.playerCountText}>{session.playerCount}</Text>
              </View>
              
              {session.status === "upcoming" && (
                <Pressable 
                  style={styles.startBtn}
                  onPress={() => onStartSession?.(session.id)}
                >
                  <Text style={styles.startBtnText}>Start</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
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
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    ...Typography.small,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  statusSummary: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  statusItem: {
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusCount: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statusLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  sessionsScroll: {
    gap: Spacing.md,
    paddingRight: Spacing.md,
  },
  sessionCard: {
    width: 160,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  activeCard: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "08",
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sessionStatus: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTime: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  sessionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: 2,
  },
  sessionCoach: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  sessionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playerCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  playerCountText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  startBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.sm,
  },
  startBtnText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 11,
  },
});
