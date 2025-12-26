import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface Player {
  id: string;
  name: string;
  level: string;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  courtName?: string;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
  players?: Player[];
}

interface NowPlayingCardProps {
  sessions: Session[];
  courts: { id: string; name: string }[];
  selectedDate: Date;
  onAttendance: (session: Session) => void;
  onExtend: (session: Session) => void;
  onEnd: (session: Session) => void;
}

export default function NowPlayingCard({
  sessions,
  courts,
  selectedDate,
  onAttendance,
  onExtend,
  onEnd,
}: NowPlayingCardProps) {
  const [now, setNow] = useState(new Date());
  const pulseAnim = useState(new Animated.Value(1))[0];

  const isToday = useMemo(() => {
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  }, [selectedDate]);

  useEffect(() => {
    if (!isToday) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isToday]);

  useEffect(() => {
    if (!isToday) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim, isToday]);

  const todaysSessions = useMemo(() => {
    if (!isToday) return [];
    const today = new Date();
    return sessions.filter((session) => {
      const sessionDate = new Date(session.startTime);
      return (
        sessionDate.getFullYear() === today.getFullYear() &&
        sessionDate.getMonth() === today.getMonth() &&
        sessionDate.getDate() === today.getDate() &&
        session.status !== "cancelled"
      );
    });
  }, [sessions, isToday]);

  const currentSession = useMemo(() => {
    if (!isToday) return null;
    return todaysSessions.find((session) => {
      const start = new Date(session.startTime);
      const end = new Date(session.endTime);
      return now >= start && now < end;
    });
  }, [todaysSessions, now, isToday]);

  const nextSession = useMemo(() => {
    if (!isToday) return null;
    const upcoming = todaysSessions
      .filter((session) => {
        const start = new Date(session.startTime);
        return start > now;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return upcoming[0] || null;
  }, [todaysSessions, now, isToday]);

  if (!isToday || (!currentSession && !nextSession)) {
    return null;
  }

  const activeSession = currentSession || nextSession;
  const isActive = !!currentSession;

  const getTimeRemaining = (endTime: string) => {
    const end = new Date(endTime);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, total: 0 };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { hours, minutes, seconds, total: diff };
  };

  const getTimeUntil = (startTime: string) => {
    const start = new Date(startTime);
    const diff = start.getTime() - now.getTime();
    if (diff <= 0) return "Now";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    return `in ${minutes}m`;
  };

  const formatTimeRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const format = (d: Date) =>
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${format(startDate)} - ${format(endDate)}`;
  };

  const getCourtName = (courtId: string | null) => {
    if (!courtId) return "No Court";
    const court = courts.find((c) => c.id === courtId);
    return court ? court.name : "Court";
  };

  const getSessionTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      private: "Private",
      semi_private: "Semi-Private",
      group: "Group",
      physical: "Physical",
      activity: "Activity",
      court_booking: "Court Booking",
    };
    return types[type] || type;
  };

  const getSessionTypeColor = (type: string) => {
    const sessionColors: Record<string, string> = {
      private: "#2ECC40",
      semi_private: "#00D4FF",
      group: "#FF6B35",
      physical: "#9B59B6",
      activity: "#F39C12",
      court_booking: "#95A5A6",
    };
    return sessionColors[type] || Colors.dark.tabIconDefault;
  };

  const remaining = isActive ? getTimeRemaining(activeSession!.endTime) : null;

  const handleAction = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action();
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={
          isActive
            ? ["rgba(46, 204, 64, 0.15)", "rgba(46, 204, 64, 0.05)"]
            : ["rgba(0, 212, 255, 0.10)", "rgba(0, 212, 255, 0.02)"]
        }
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.statusContainer}>
            <Animated.View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isActive ? "#2ECC40" : "#00D4FF",
                  opacity: pulseAnim,
                },
              ]}
            />
            <Text style={styles.statusText}>{isActive ? "NOW PLAYING" : "UP NEXT"}</Text>
          </View>
          {isActive && remaining ? (
            <View style={styles.countdown}>
              <Text style={styles.countdownNumber}>
                {String(remaining.minutes).padStart(2, "0")}:
                {String(remaining.seconds).padStart(2, "0")}
              </Text>
              <Text style={styles.countdownLabel}>remaining</Text>
            </View>
          ) : (
            <Text style={styles.timeUntil}>{getTimeUntil(activeSession!.startTime)}</Text>
          )}
        </View>

        <View style={styles.sessionInfo}>
          <View style={styles.mainInfo}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: getSessionTypeColor(activeSession!.sessionType) + "30" },
              ]}
            >
              <Text
                style={[
                  styles.typeText,
                  { color: getSessionTypeColor(activeSession!.sessionType) },
                ]}
              >
                {getSessionTypeLabel(activeSession!.sessionType)}
              </Text>
            </View>
            <Text style={styles.timeRange}>
              {formatTimeRange(activeSession!.startTime, activeSession!.endTime)}
            </Text>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={12} color={Colors.dark.tabIconDefault} />
              <Text style={styles.detailText}>{getCourtName(activeSession!.courtId)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={12} color={Colors.dark.tabIconDefault} />
              <Text style={styles.detailText}>{activeSession!.duration} min</Text>
            </View>
            {activeSession!.players && activeSession!.players.length > 0 ? (
              <View style={styles.detailItem}>
                <Ionicons name="people-outline" size={12} color={Colors.dark.tabIconDefault} />
                <Text style={styles.detailText} numberOfLines={1}>
                  {activeSession!.players.map((p) => p.name).join(", ")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {isActive ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, styles.primaryAction]}
              onPress={() => handleAction(() => onAttendance(activeSession!))}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#FFF" />
              <Text style={styles.actionText}>Attendance</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => handleAction(() => onExtend(activeSession!))}
            >
              <Ionicons name="add-circle-outline" size={14} color={Colors.dark.text} />
              <Text style={styles.actionTextSecondary}>Extend</Text>
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={() => handleAction(() => onEnd(activeSession!))}
            >
              <Ionicons name="stop-circle-outline" size={14} color="#FF6B35" />
              <Text style={[styles.actionTextSecondary, { color: "#FF6B35" }]}>End</Text>
            </Pressable>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 64, 0.2)",
  },
  gradient: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: "#2ECC40",
    letterSpacing: 1,
  },
  countdown: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  countdownNumber: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    fontVariant: ["tabular-nums"],
  },
  countdownLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  timeUntil: {
    fontSize: Typography.small.fontSize,
    color: "#00D4FF",
    fontWeight: "600",
  },
  sessionInfo: {
    gap: Spacing.xs,
  },
  mainInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.sm,
  },
  typeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
  },
  timeRange: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  detailsRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  detailText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  primaryAction: {
    backgroundColor: "#2ECC40",
  },
  actionText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: "#FFF",
  },
  actionTextSecondary: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
