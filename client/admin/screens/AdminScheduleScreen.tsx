import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  sessionType?: string;
  ballLevel?: string;
  status?: string;
  coachId?: string;
  players?: { id: string; name: string }[];
}

interface Coach {
  id: string;
  name: string;
}

export default function AdminScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });

  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const getCoachName = (coachId?: string) => {
    if (!coachId) return "Unassigned";
    const coach = coaches.find((c) => c.id === coachId);
    return coach?.name || "Unknown";
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const todaySessions = useMemo(() => {
    const today = selectedDate.toDateString();
    return sessions.filter((s) => {
      const sessionDate = new Date(s.startTime).toDateString();
      return sessionDate === today;
    }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [sessions, selectedDate]);

  const navigateDate = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction);
    setSelectedDate(newDate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const getBallLevelColor = (level?: string) => {
    switch (level) {
      case "red": return "#EF4444";
      case "orange": return "#F97316";
      case "green": return "#22C55E";
      case "yellow": return "#EAB308";
      default: return Colors.dark.textMuted;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "scheduled": return Colors.dark.primary;
      case "completed": return Colors.dark.successNeon;
      case "cancelled": return Colors.dark.error;
      default: return Colors.dark.textMuted;
    }
  };

  const renderSession = ({ item }: { item: Session }) => (
    <Pressable
      style={[styles.sessionCard, CardStyles.elevated]}
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
    >
      <View style={styles.sessionTime}>
        <Text style={styles.timeText}>{formatTime(item.startTime)}</Text>
        <Text style={styles.timeDivider}>-</Text>
        <Text style={styles.timeText}>{formatTime(item.endTime)}</Text>
      </View>
      <View style={styles.sessionDetails}>
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionType}>{item.sessionType || "Training"}</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status || "Scheduled"}
            </Text>
          </View>
        </View>
        <View style={styles.sessionMeta}>
          <Ionicons name="person" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.coachName}>{getCoachName(item.coachId)}</Text>
          {item.ballLevel ? (
            <View style={[styles.ballBadge, { backgroundColor: `${getBallLevelColor(item.ballLevel)}20` }]}>
              <View style={[styles.ballDot, { backgroundColor: getBallLevelColor(item.ballLevel) }]} />
              <Text style={[styles.ballText, { color: getBallLevelColor(item.ballLevel) }]}>
                {item.ballLevel}
              </Text>
            </View>
          ) : null}
        </View>
        {item.players && item.players.length > 0 ? (
          <Text style={styles.playerCount}>{item.players.length} players</Text>
        ) : null}
      </View>
    </Pressable>
  );

  if (sessionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.toggleButton, viewMode === "day" && styles.toggleActive]}
            onPress={() => setViewMode("day")}
          >
            <Text style={[styles.toggleText, viewMode === "day" && styles.toggleTextActive]}>Day</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, viewMode === "week" && styles.toggleActive]}
            onPress={() => setViewMode("week")}
          >
            <Text style={[styles.toggleText, viewMode === "week" && styles.toggleTextActive]}>Week</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.dateNavigator}>
        <Pressable style={styles.navButton} onPress={() => navigateDate(-1)}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Pressable
          style={styles.dateDisplay}
          onPress={() => {
            setSelectedDate(new Date());
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
          {selectedDate.toDateString() === new Date().toDateString() ? (
            <View style={styles.todayBadge}>
              <Text style={styles.todayText}>Today</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => navigateDate(1)}>
          <Ionicons name="chevron-forward" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, CardStyles.elevated]}>
          <Text style={styles.summaryValue}>{todaySessions.length}</Text>
          <Text style={styles.summaryLabel}>Sessions</Text>
        </View>
        <View style={[styles.summaryCard, CardStyles.elevated]}>
          <Text style={styles.summaryValue}>
            {todaySessions.filter((s) => s.status === "scheduled").length}
          </Text>
          <Text style={styles.summaryLabel}>Upcoming</Text>
        </View>
        <View style={[styles.summaryCard, CardStyles.elevated]}>
          <Text style={styles.summaryValue}>
            {todaySessions.filter((s) => s.status === "completed").length}
          </Text>
          <Text style={styles.summaryLabel}>Completed</Text>
        </View>
      </View>

      <FlatList
        data={todaySessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No sessions scheduled</Text>
            <Text style={styles.emptySubtext}>Sessions will appear here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 2,
  },
  toggleButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  toggleActive: {
    backgroundColor: Colors.dark.orange,
  },
  toggleText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  toggleTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  dateNavigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dateText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  todayBadge: {
    backgroundColor: Colors.dark.orange,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  todayText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryCard: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
  },
  summaryValue: {
    ...Typography.numberLarge,
    color: Colors.dark.text,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  list: {
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  sessionCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sessionTime: {
    alignItems: "center",
    marginRight: Spacing.md,
    paddingRight: Spacing.md,
    borderRightWidth: 2,
    borderRightColor: Colors.dark.orange,
  },
  timeText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  timeDivider: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginVertical: 2,
  },
  sessionDetails: {
    flex: 1,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  sessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  coachName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.xs,
    gap: 3,
  },
  ballDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ballText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  playerCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
});
