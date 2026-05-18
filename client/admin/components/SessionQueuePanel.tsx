import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
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

function SessionCard({ session, index, onPress, onStart }: {
  session: Session;
  index: number;
  onPress?: () => void;
  onStart?: () => void;
}) {
  const translateX = useSharedValue(30);
  const opacity = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    const delay = index * 70;
    translateX.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 180 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: pressScale.value }],
    opacity: opacity.value,
  }));

  const statusColor = session.status === "in_progress"
    ? Colors.dark.primary
    : session.status === "upcoming"
    ? Colors.dark.xpCyan
    : Colors.dark.textMuted;

  const statusIcon: React.ComponentProps<typeof Ionicons>["name"] =
    session.status === "in_progress"
      ? "play-circle"
      : session.status === "upcoming"
      ? "time-outline"
      : "checkmark-circle";

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={[
          styles.sessionCard,
          session.status === "in_progress" && {
            borderColor: Colors.dark.primary,
            backgroundColor: Colors.dark.primary + "08",
          },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        onPressIn={() => { pressScale.value = withSpring(0.96, { damping: 15 }); }}
        onPressOut={() => { pressScale.value = withSpring(1, { damping: 15 }); }}
      >
        <View style={styles.sessionHeader}>
          <View style={[styles.sessionStatus, { backgroundColor: statusColor + "20" }]}>
            <Ionicons name={statusIcon} size={14} color={statusColor} />
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
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onStart?.();
              }}
            >
              <Text style={styles.startBtnText}>Start</Text>
            </Pressable>
          )}

          {session.status === "in_progress" && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="list" size={18} color={Colors.dark.orange} />
          <Text style={styles.title}>Session Queue</Text>
        </View>
        <Pressable onPress={onViewAll} style={styles.viewAllBtn}>
          <Text style={styles.viewAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.dark.orange} />
        </Pressable>
      </View>

      <View style={styles.statusSummary}>
        {[
          { color: Colors.dark.xpCyan, count: upcoming.length, label: "Upcoming" },
          { color: Colors.dark.primary, count: inProgress.length, label: "Live" },
          { color: Colors.dark.textMuted, count: completed.length, label: "Done" },
        ].map((item) => (
          <View key={item.label} style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: item.color }]} />
            <Text style={[styles.statusCount, { color: item.count > 0 ? item.color : Colors.dark.textMuted }]}>{item.count}</Text>
            <Text style={styles.statusLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={28} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No sessions today</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sessionsScroll}
        >
          {sessions.slice(0, 8).map((session, i) => (
            <SessionCard
              key={session.id}
              session={session}
              index={i}
              onPress={() => onSessionPress?.(session.id)}
              onStart={() => onStartSession?.(session.id)}
            />
          ))}
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
  emptyState: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
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
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.dark.primary,
  },
  liveText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
});
