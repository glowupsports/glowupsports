import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";

const ADMIN_COLOR = "#F97316";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TIME_COLUMN_WIDTH = 50;
const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 23;

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  sessionType?: string;
  ballLevel?: string;
  status?: string;
  coachId?: string;
  courtId?: string;
  players?: { id: string; name: string }[];
}

interface Coach {
  id: string;
  name: string;
}

interface Court {
  id: string;
  name: string;
}

const COACH_COLORS = [
  "#F97316",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
  "#EC4899",
  "#14B8A6",
  "#EAB308",
  "#EF4444",
];

export default function AdminCalendarScreen() {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string | null>(null);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });

  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const getCoachName = (coachId?: string) => {
    if (!coachId) return "Unassigned";
    const coach = coaches.find((c) => c.id === coachId);
    return coach?.name || "Unknown";
  };

  const getCoachColor = (coachId?: string) => {
    if (!coachId) return Colors.dark.textMuted;
    const index = coaches.findIndex((c) => c.id === coachId);
    return COACH_COLORS[index % COACH_COLORS.length];
  };

  const getCourtName = (courtId?: string) => {
    if (!courtId) return "No Court";
    const court = courts.find((c) => c.id === courtId);
    return court?.name || "Unknown";
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`;
  };

  const todaySessions = useMemo(() => {
    const today = selectedDate.toDateString();
    let filteredSessions = sessions.filter((s) => {
      const sessionDate = new Date(s.startTime).toDateString();
      return sessionDate === today;
    });
    if (selectedCoachFilter) {
      filteredSessions = filteredSessions.filter((s) => s.coachId === selectedCoachFilter);
    }
    return filteredSessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [sessions, selectedDate, selectedCoachFilter]);

  const weekDays = useMemo(() => {
    const days: { date: Date; sessions: Session[] }[] = [];
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      const dayString = day.toDateString();
      
      let daySessions = sessions.filter((s) => {
        const sessionDate = new Date(s.startTime).toDateString();
        return sessionDate === dayString;
      });
      if (selectedCoachFilter) {
        daySessions = daySessions.filter((s) => s.coachId === selectedCoachFilter);
      }
      daySessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      
      days.push({ date: day, sessions: daySessions });
    }
    return days;
  }, [sessions, selectedDate, selectedCoachFilter]);

  const totalWeekSessions = useMemo(() => {
    return weekDays.reduce((sum, day) => sum + day.sessions.length, 0);
  }, [weekDays]);

  const upcomingSessions = useMemo(() => {
    const now = new Date();
    return todaySessions.filter(s => new Date(s.startTime) > now);
  }, [todaySessions]);

  const completedSessions = useMemo(() => {
    return todaySessions.filter(s => s.status === "completed");
  }, [todaySessions]);

  const navigateDate = (direction: number) => {
    const newDate = new Date(selectedDate);
    const increment = viewMode === "week" ? 7 : 1;
    newDate.setDate(newDate.getDate() + (direction * increment));
    setSelectedDate(newDate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const formatWeekRange = () => {
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const startMonth = startOfWeek.toLocaleDateString("en-US", { month: "short" });
    const endMonth = endOfWeek.toLocaleDateString("en-US", { month: "short" });
    const startDay = startOfWeek.getDate();
    const endDay = endOfWeek.getDate();
    
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  };

  const formatDayShort = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const getSessionPosition = (session: Session) => {
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    const height = (endHour - startHour) * HOUR_HEIGHT;
    return { top, height };
  };

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const coachLaneWidth = Math.max(80, (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / Math.max(coaches.length, 1));
  const weekDayWidth = (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / 7;

  const renderDayView = () => (
    <View style={styles.calendarGrid}>
      <View style={styles.coachHeaderRow}>
        <View style={[styles.timeColumnHeader, { width: TIME_COLUMN_WIDTH }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.coachHeaders}>
            {(selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches).map((coach, index) => (
              <View key={coach.id} style={[styles.coachHeader, { width: coachLaneWidth }]}>
                <View style={[styles.coachDot, { backgroundColor: COACH_COLORS[index % COACH_COLORS.length] }]} />
                <Text style={styles.coachHeaderText} numberOfLines={1}>{coach.name}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.gridContainer}>
          <View style={[styles.timeColumn, { width: TIME_COLUMN_WIDTH }]}>
            {hours.map((hour) => (
              <View key={hour} style={[styles.timeSlot, { height: HOUR_HEIGHT }]}>
                <Text style={styles.timeText}>{formatHour(hour)}</Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.coachLanesContainer}>
              {(selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches).map((coach, coachIndex) => {
                const coachSessions = todaySessions.filter(s => s.coachId === coach.id);
                return (
                  <View key={coach.id} style={[styles.coachLane, { width: coachLaneWidth }]}>
                    {hours.map((hour) => (
                      <View key={hour} style={[styles.hourSlot, { height: HOUR_HEIGHT }]} />
                    ))}
                    
                    {coachSessions.map((session) => {
                      const { top, height } = getSessionPosition(session);
                      const color = COACH_COLORS[coachIndex % COACH_COLORS.length];
                      return (
                        <Pressable
                          key={session.id}
                          style={[
                            styles.sessionBlock,
                            {
                              top,
                              height: height - 4,
                              opacity: session.status === "completed" ? 0.6 : 1,
                            },
                          ]}
                          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                        >
                          <LinearGradient
                            colors={[color, `${color}CC`]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.sessionGradient}
                          >
                            <Text style={styles.sessionText} numberOfLines={1}>
                              {session.sessionType || "Training"}
                            </Text>
                            <Text style={styles.sessionTime} numberOfLines={1}>
                              {formatTime(session.startTime)}
                            </Text>
                            <Text style={styles.sessionCourt} numberOfLines={1}>
                              {getCourtName(session.courtId)}
                            </Text>
                            {session.players && session.players.length > 0 ? (
                              <Text style={styles.sessionPlayers} numberOfLines={1}>
                                {session.players.length} player{session.players.length > 1 ? "s" : ""}
                              </Text>
                            ) : null}
                          </LinearGradient>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );

  const renderWeekView = () => (
    <View style={styles.calendarGrid}>
      <View style={styles.weekHeaderRow}>
        <View style={[styles.timeColumnHeader, { width: TIME_COLUMN_WIDTH }]} />
        {weekDays.map(({ date }) => (
          <View key={date.toISOString()} style={[styles.weekDayHeader, { width: weekDayWidth }]}>
            <Text style={[styles.weekDayText, isToday(date) && styles.weekDayTextToday]}>
              {formatDayShort(date)}
            </Text>
            <View style={[styles.weekDayNumber, isToday(date) && styles.weekDayNumberToday]}>
              <Text style={[styles.weekDayNumberText, isToday(date) && styles.weekDayNumberTextToday]}>
                {date.getDate()}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.gridContainer}>
          <View style={[styles.timeColumn, { width: TIME_COLUMN_WIDTH }]}>
            {hours.map((hour) => (
              <View key={hour} style={[styles.timeSlot, { height: HOUR_HEIGHT }]}>
                <Text style={styles.timeText}>{formatHour(hour)}</Text>
              </View>
            ))}
          </View>

          {weekDays.map(({ date, sessions: daySessions }) => (
            <View key={date.toISOString()} style={[styles.weekDayColumn, { width: weekDayWidth }]}>
              {hours.map((hour) => (
                <View key={hour} style={[styles.hourSlot, { height: HOUR_HEIGHT }]} />
              ))}
              
              {daySessions.map((session) => {
                const { top, height } = getSessionPosition(session);
                const color = getCoachColor(session.coachId);
                return (
                  <Pressable
                    key={session.id}
                    style={[
                      styles.weekSessionBlock,
                      {
                        top,
                        height: Math.max(height - 2, 20),
                        opacity: session.status === "completed" ? 0.6 : 1,
                      },
                    ]}
                    onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  >
                    <LinearGradient
                      colors={[color, `${color}CC`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.weekSessionGradient}
                    >
                      <Text style={styles.weekSessionText} numberOfLines={1}>
                        {getCoachName(session.coachId).split(" ")[0]}
                      </Text>
                      {height > 30 ? (
                        <Text style={styles.weekSessionTime} numberOfLines={1}>
                          {formatTime(session.startTime)}
                        </Text>
                      ) : null}
                    </LinearGradient>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  if (sessionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ADMIN_COLOR} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(249,115,22,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.viewButton, viewMode === "day" && styles.viewButtonActive]}
            onPress={() => { setViewMode("day"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Text style={[styles.viewButtonText, viewMode === "day" && styles.viewButtonTextActive]}>Day</Text>
          </Pressable>
          <Pressable
            style={[styles.viewButton, viewMode === "week" && styles.viewButtonActive]}
            onPress={() => { setViewMode("week"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Text style={[styles.viewButtonText, viewMode === "week" && styles.viewButtonTextActive]}>Week</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.dateNav}>
        <Pressable style={styles.navButton} onPress={() => navigateDate(-1)}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Pressable style={styles.dateDisplay} onPress={goToToday}>
          <Text style={styles.dateText}>
            {viewMode === "day" ? formatDate(selectedDate) : formatWeekRange()}
          </Text>
          {isToday(selectedDate) ? (
            <View style={styles.todayBadge}>
              <Text style={styles.todayText}>Today</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => navigateDate(1)}>
          <Ionicons name="chevron-forward" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, CardStyles.elevated]}>
          <Text style={styles.statValue}>{viewMode === "day" ? todaySessions.length : totalWeekSessions}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={[styles.statCard, CardStyles.elevated]}>
          <Text style={styles.statValue}>{viewMode === "day" ? upcomingSessions.length : weekDays.filter(d => isToday(d.date) || d.date > new Date()).reduce((sum, d) => sum + d.sessions.length, 0)}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={[styles.statCard, CardStyles.elevated]}>
          <Text style={styles.statValue}>{viewMode === "day" ? completedSessions.length : weekDays.reduce((sum, d) => sum + d.sessions.filter(s => s.status === "completed").length, 0)}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.coachFilter}
        contentContainerStyle={styles.coachFilterContent}
      >
        <Pressable
          style={[styles.filterChip, !selectedCoachFilter && styles.filterChipActive]}
          onPress={() => { setSelectedCoachFilter(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Text style={[styles.filterChipText, !selectedCoachFilter && styles.filterChipTextActive]}>All Coaches</Text>
        </Pressable>
        {coaches.map((coach, index) => (
          <Pressable
            key={coach.id}
            style={[
              styles.filterChip, 
              selectedCoachFilter === coach.id && styles.filterChipActive,
              { borderColor: COACH_COLORS[index % COACH_COLORS.length] + "60" }
            ]}
            onPress={() => { setSelectedCoachFilter(coach.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <View style={[styles.filterDot, { backgroundColor: COACH_COLORS[index % COACH_COLORS.length] }]} />
            <Text style={[styles.filterChipText, selectedCoachFilter === coach.id && styles.filterChipTextActive]}>
              {coach.name.split(" ")[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.calendarContainer, { paddingBottom: insets.bottom + 80 }]}>
        {viewMode === "day" ? renderDayView() : renderWeekView()}
      </View>
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
    height: 200,
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
    color: ADMIN_COLOR,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 4,
  },
  viewButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  viewButtonActive: {
    backgroundColor: ADMIN_COLOR,
  },
  viewButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  viewButtonTextActive: {
    color: Colors.dark.text,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  dateDisplay: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  dateText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  todayBadge: {
    backgroundColor: ADMIN_COLOR,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  todayText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachFilter: {
    maxHeight: 44,
    marginBottom: Spacing.sm,
  },
  coachFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
    gap: Spacing.xs,
  },
  filterChipActive: {
    backgroundColor: ADMIN_COLOR + "30",
    borderColor: ADMIN_COLOR,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: ADMIN_COLOR,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  calendarGrid: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  coachHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  timeColumnHeader: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  coachHeaders: {
    flexDirection: "row",
  },
  coachHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
    gap: Spacing.xs,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  coachDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  coachHeaderText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 10,
  },
  weekHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  weekDayHeader: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  weekDayText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  weekDayTextToday: {
    color: ADMIN_COLOR,
  },
  weekDayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  weekDayNumberToday: {
    backgroundColor: ADMIN_COLOR,
  },
  weekDayNumberText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  weekDayNumberTextToday: {
    color: Colors.dark.text,
    fontWeight: "700",
  },
  gridContainer: {
    flexDirection: "row",
  },
  timeColumn: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  timeSlot: {
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingRight: 4,
    alignItems: "flex-end",
  },
  timeText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  coachLanesContainer: {
    flexDirection: "row",
  },
  coachLane: {
    position: "relative",
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  weekDayColumn: {
    position: "relative",
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  hourSlot: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot + "50",
  },
  sessionBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 6,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  sessionGradient: {
    flex: 1,
    padding: 4,
    justifyContent: "flex-start",
  },
  sessionText: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.95)",
    textTransform: "uppercase",
  },
  sessionTime: {
    fontSize: 8,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 1,
  },
  sessionCourt: {
    fontSize: 7,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 1,
  },
  sessionPlayers: {
    fontSize: 7,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 1,
  },
  weekSessionBlock: {
    position: "absolute",
    left: 1,
    right: 1,
    borderRadius: 4,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  weekSessionGradient: {
    flex: 1,
    padding: 2,
    justifyContent: "center",
  },
  weekSessionText: {
    fontSize: 7,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.95)",
    textTransform: "uppercase",
  },
  weekSessionTime: {
    fontSize: 6,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
  },
});
