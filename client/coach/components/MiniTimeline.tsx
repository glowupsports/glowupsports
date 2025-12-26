import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
  players?: { id: string; name: string }[];
}

interface MiniTimelineProps {
  sessions: Session[];
  onSessionPress?: (session: Session) => void;
}

export default function MiniTimeline({ sessions, onSessionPress }: MiniTimelineProps) {
  const now = new Date();
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getSessionStatus = (session: Session) => {
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    
    if (now >= start && now < end) return "current";
    if (now < start) return "upcoming";
    return "past";
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "private":
        return Colors.dark.primary;
      case "semi-private":
        return Colors.dark.orange;
      case "group":
        return "#00D4FF";
      default:
        return Colors.dark.tabIconDefault;
    }
  };

  if (sessions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No sessions today</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {sortedSessions.map((session, index) => {
        const status = getSessionStatus(session);
        const typeColor = getTypeColor(session.sessionType);
        const isLast = index === sortedSessions.length - 1;

        return (
          <Pressable
            key={session.id}
            style={styles.sessionRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSessionPress?.(session);
            }}
          >
            <View style={styles.timelineColumn}>
              <View
                style={[
                  styles.dot,
                  status === "current" && styles.dotCurrent,
                  status === "past" && styles.dotPast,
                  { borderColor: typeColor },
                ]}
              >
                {status === "current" ? (
                  <View style={[styles.dotInner, { backgroundColor: typeColor }]} />
                ) : null}
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.line,
                    status === "past" && styles.linePast,
                  ]}
                />
              ) : null}
            </View>

            <View style={styles.sessionContent}>
              <View style={styles.timeRow}>
                <Text
                  style={[
                    styles.time,
                    status === "past" && styles.textPast,
                  ]}
                >
                  {formatTime(session.startTime)}
                </Text>
                <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
                  <Text style={[styles.typeText, { color: typeColor }]}>
                    {session.sessionType}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.players,
                  status === "past" && styles.textPast,
                ]}
                numberOfLines={1}
              >
                {session.players && session.players.length > 0
                  ? session.players.map(p => p.name).join(", ")
                  : "No players"}
              </Text>
              <Text style={styles.duration}>{session.duration} min</Text>
            </View>

            {status === "current" ? (
              <View style={styles.nowBadge}>
                <Ionicons name="radio-button-on" size={12} color={Colors.dark.primary} />
                <Text style={styles.nowText}>Now</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.sm,
  },
  emptyContainer: {
    padding: Spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sessionRow: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingRight: Spacing.sm,
  },
  timelineColumn: {
    alignItems: "center",
    width: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCurrent: {
    backgroundColor: "transparent",
  },
  dotPast: {
    opacity: 0.5,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 40,
    backgroundColor: Colors.dark.disabled,
    marginVertical: 4,
  },
  linePast: {
    opacity: 0.3,
  },
  sessionContent: {
    flex: 1,
    gap: 2,
    paddingBottom: Spacing.md,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  time: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  textPast: {
    opacity: 0.5,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  typeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  players: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
  },
  duration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  nowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  nowText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
});
