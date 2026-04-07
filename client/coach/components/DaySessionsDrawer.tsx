import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, getPlayerLevelColor } from "@/constants/theme";

interface Player {
  id: string;
  name: string;
  level?: string;
  ballLevel?: string | null;
  status?: string;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
  players?: Player[];
}

interface DaySessionsDrawerProps {
  visible: boolean;
  sessions: Session[];
  dateLabel: string;
  onClose: () => void;
  onSelectSession: (session: Session) => void;
}

const getSessionTypeLabel = (type: string) => {
  switch (type) {
    case "private": return "Private";
    case "private_adjusted": return "Private";
    case "semi_private": return "Semi-Private";
    case "group": return "Group";
    case "physical": return "Physical";
    case "activity": return "Activity";
    default: return type;
  }
};

const getSessionTypeColor = (type: string) => {
  switch (type) {
    case "private":
    case "private_adjusted":
      return Colors.dark.xpCyan;
    case "semi_private":
      return Colors.dark.gold;
    case "group":
      return Colors.dark.primary;
    case "physical":
      return Colors.dark.orange;
    default:
      return Colors.dark.primary;
  }
};

const getStatusInfo = (status: string | null) => {
  switch (status) {
    case "completed":
      return { label: "Completed", icon: "checkmark-circle" as const, color: Colors.dark.primary };
    case "cancelled":
      return { label: "Cancelled", icon: "close-circle" as const, color: Colors.dark.error };
    case "in_progress":
      return { label: "Live", icon: "radio-button-on" as const, color: "#FF4444" };
    default:
      return { label: "Scheduled", icon: "time" as const, color: Colors.dark.xpCyan };
  }
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

function SessionBriefIndicator({ sessionId }: { sessionId: string }) {
  const { data } = useQuery<{ id: string }>({
    queryKey: [`/api/coach/sessions/${sessionId}/brief`],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  if (!data?.id) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 6 }}>
      <Ionicons name="sparkles" size={12} color="#A78BFA" />
    </View>
  );
}

export default function DaySessionsDrawer({ visible, sessions, dateLabel, onClose, onSelectSession }: DaySessionsDrawerProps) {
  const insets = useSafeAreaInsets();

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const totalMinutes = sessions.reduce((acc, s) => acc + s.duration, 0);
  const completedCount = sessions.filter(s => s.status === "completed").length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundDefault, Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Day Overview</Text>
            <Text style={styles.dateText}>{dateLabel}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{sessions.length}</Text>
            <Text style={styles.statLabel}>SESSIONS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalMinutes}</Text>
            <Text style={styles.statLabel}>MINUTES</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: Colors.dark.primary }]}>{completedCount}/{sessions.length}</Text>
            <Text style={styles.statLabel}>DONE</Text>
          </View>
        </View>

        <ScrollView style={styles.sessionList} contentContainerStyle={styles.sessionListContent} showsVerticalScrollIndicator={false}>
          {sortedSessions.map((session) => {
            const typeColor = getSessionTypeColor(session.sessionType);
            const statusInfo = getStatusInfo(session.status);
            const players = session.players || [];
            const presentCount = players.filter(p => p.status === "present" || p.status === "late").length;
            const playerNames = players.slice(0, 3).map(p => p.name.split(" ")[0]).join(", ");
            const extraPlayers = players.length > 3 ? ` +${players.length - 3}` : "";
            const primaryBallLevel = players[0]?.ballLevel;

            return (
              <Pressable
                key={session.id}
                style={({ pressed }) => [
                  styles.sessionCard,
                  pressed && styles.sessionCardPressed,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelectSession(session);
                }}
              >
                <View style={[styles.sessionCardAccent, { backgroundColor: typeColor }]} />

                <View style={styles.sessionCardContent}>
                  <View style={styles.sessionCardTop}>
                    <View style={styles.timeContainer}>
                      <Ionicons name="time-outline" size={14} color={Colors.dark.disabled} />
                      <Text style={styles.timeText}>
                        {formatTime(session.startTime)} - {formatTime(session.endTime)}
                      </Text>
                      <SessionBriefIndicator sessionId={session.id} />
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + "20" }]}>
                      <Ionicons name={statusInfo.icon} size={12} color={statusInfo.color} />
                      <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                    </View>
                  </View>

                  <View style={styles.sessionCardMiddle}>
                    <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
                      <Text style={[styles.typeText, { color: typeColor }]}>{getSessionTypeLabel(session.sessionType)}</Text>
                    </View>
                    <Text style={styles.durationText}>{session.duration}m</Text>
                    {primaryBallLevel ? (
                      <View style={[styles.ballDot, { backgroundColor: getPlayerLevelColor(primaryBallLevel) }]} />
                    ) : null}
                  </View>

                  {players.length > 0 ? (
                    <View style={styles.sessionCardBottom}>
                      <Ionicons name="people-outline" size={14} color={Colors.dark.disabled} />
                      <Text style={styles.playerNamesText} numberOfLines={1}>
                        {playerNames}{extraPlayers}
                      </Text>
                      {session.status === "completed" ? (
                        <Text style={styles.attendanceText}>
                          {presentCount}/{players.length} present
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <View style={styles.sessionCardBottom}>
                      <Ionicons name="people-outline" size={14} color={Colors.dark.disabled} />
                      <Text style={styles.noPlayersText}>No players assigned</Text>
                    </View>
                  )}
                </View>

                <View style={styles.chevronContainer}>
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.disabled} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    alignItems: "center",
  },
  title: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.disabled,
    letterSpacing: 1,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  sessionList: {
    flex: 1,
    marginTop: Spacing.md,
  },
  sessionListContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  sessionCard: {
    flexDirection: "row",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  sessionCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  sessionCardAccent: {
    width: 4,
  },
  sessionCardContent: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  sessionCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sessionCardMiddle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  durationText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    fontWeight: "600",
  },
  ballDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionCardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playerNamesText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  noPlayersText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.disabled,
    fontStyle: "italic",
  },
  attendanceText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  chevronContainer: {
    justifyContent: "center",
    paddingRight: Spacing.sm,
  },
});
