import React from "react";
import { View, Text, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { SessionInstance, SeriesDetail } from "./types";

interface SeriesTimelineTabProps {
  series: SeriesDetail;
  accentColor: string;
  formatDate: (dateStr: string) => string;
  onSessionPress: (session: SessionInstance) => void;
}

export function SeriesTimelineTab({ series, accentColor, formatDate, onSessionPress }: SeriesTimelineTabProps) {
  const sortedSessions = [...(series.sessions || [])].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  const formatSessionTime = (startTime: string) => {
    try {
      const date = new Date(startTime);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "";
    }
  };

  return (
    <View style={styles.tabContent}>
      {sortedSessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No sessions scheduled yet</Text>
        </View>
      ) : (
        sortedSessions.map((session, index) => {
          const sessionDate = new Date(session.startTime);
          const now = new Date();
          const isCompleted = session.status === "completed";
          const isCancelled = session.status === "cancelled";
          const isSkipped = session.status === "skipped";
          const isPast = sessionDate.getTime() < now.getTime();
          const isToday = sessionDate.toDateString() === now.toDateString();
          const needsAttendance = isPast && !isCompleted && !isCancelled && !isSkipped;
          const isFuture = !isPast && !isToday;

          return (
            <Pressable
              key={session.id}
              style={styles.timelineItem}
              onPress={() => onSessionPress(session)}
            >
              <View style={styles.timelineConnector}>
                <View
                  style={[
                    styles.timelineDot,
                    isCompleted ? { backgroundColor: Colors.dark.successNeon } : null,
                    isCancelled || isSkipped ? { backgroundColor: Colors.dark.error } : null,
                    isToday && !isCompleted && !isCancelled ? { backgroundColor: accentColor } : null,
                    isFuture ? { backgroundColor: Colors.dark.textMuted } : null,
                    needsAttendance ? { backgroundColor: Colors.dark.accentWarning } : null,
                  ]}
                />
                {index < sortedSessions.length - 1 ? (
                  <View style={styles.timelineLine} />
                ) : null}
              </View>
              <View style={[styles.timelineContent, styles.timelineContentClickable]}>
                <View style={styles.timelineHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                    <Text
                      style={[
                        styles.timelineDate,
                        isToday ? { color: accentColor, fontWeight: "700" } : null,
                        needsAttendance ? { color: Colors.dark.accentWarning } : null,
                      ]}
                    >
                      {isToday ? "Today" : formatDate(session.startTime)}
                    </Text>
                    <Text style={[styles.timelineSessionTime, isFuture ? { color: Colors.dark.accentCyan } : null]}>
                      {formatSessionTime(session.startTime)}
                    </Text>
                  </View>
                  <View style={styles.timelineStatusRow}>
                    <Text
                      style={[
                        styles.timelineStatus,
                        isCompleted ? { color: Colors.dark.successNeon } : null,
                        isCancelled || isSkipped ? { color: Colors.dark.error } : null,
                        needsAttendance ? { color: Colors.dark.accentWarning } : null,
                        isFuture ? { color: Colors.dark.accentCyan } : null,
                      ]}
                    >
                      {isCompleted
                        ? "Completed"
                        : isCancelled || isSkipped
                        ? "Cancelled - Refunded"
                        : isPast || isToday
                        ? "Needs Attendance"
                        : "Tap to Edit"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={
                        isCancelled || isSkipped
                          ? Colors.dark.error
                          : isCompleted
                          ? Colors.dark.successNeon
                          : isFuture
                          ? Colors.dark.accentCyan
                          : Colors.dark.accentWarning
                      }
                    />
                  </View>
                </View>
                <Text style={styles.timelineTime}>
                  Week {session.weekNumber || index + 1}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}
