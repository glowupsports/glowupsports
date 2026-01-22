import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Image } from "expo-image";
import { getStaticAssetsUrl } from "@/lib/query-client";

const ProTennisColors = {
  midnightBlue: "#0B0D10",
  surfaceCard: "#141820",
  surfaceElevated: "#1A1F2A",
  neonGreen: "#C8FF3D",
  neonCyan: "#00E5FF",
  neonPurple: "#E040FB",
  neonOrange: "#FF9500",
  white: "#FFFFFF",
  textSecondary: "#A0A4B0",
  textMuted: "#6B7280",
  gold: "#FFD700",
  border: "#2A2E38",
  error: "#FF5252",
};

interface SessionData {
  id: string;
  sessionId: string;
  attendanceStatus: string;
  session: {
    id: string;
    startTime: string;
    endTime: string;
    sessionType: string;
    courtName: string | null;
    title: string;
  } | null;
  coachName: string | null;
  coachPhotoUrl?: string | null;
}

interface ScheduledSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  coachName: string;
  coachPhotoUrl?: string;
  courtName?: string;
  status: "upcoming" | "completed" | "cancelled";
  attendanceStatus?: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  sessions: ScheduledSession[];
}

interface AttendanceStats {
  totalSessions: number;
  attended: number;
  missed: number;
  percentage: number;
  streak: number;
}

function NeonBorderCard({ children, accentColor = ProTennisColors.neonCyan, style }: { children: React.ReactNode; accentColor?: string; style?: any }) {
  return (
    <View style={[styles.neonCard, style]}>
      <View style={[styles.neonCardGlow, { shadowColor: accentColor }]} />
      <LinearGradient
        colors={[accentColor + "15", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.neonCardGradient}
      />
      <View style={[styles.neonCardBorder, { borderColor: accentColor + "40" }]}>
        {children}
      </View>
    </View>
  );
}

function StatCard({ icon, label, value, color, subtext }: { icon: string; label: string; value: string | number; color: string; subtext?: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subtext ? <Text style={styles.statSubtext}>{subtext}</Text> : null}
    </View>
  );
}

export default function PlayerScheduleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { data: rawSessions, isLoading: sessionsLoading, error: sessionsError } = useQuery<SessionData[]>({
    queryKey: ["/api/player/me/sessions"],
  });

  const { data: profileData } = useQuery<{ player: { attendanceStreak?: number } }>({
    queryKey: ["/api/player/me"],
  });

  const attendanceStreak = profileData?.player?.attendanceStreak || 0;

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const sessions: ScheduledSession[] = useMemo(() => {
    const now = new Date();
    const items: ScheduledSession[] = [];
    
    const formatTime = (date: Date) => {
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${mins}`;
    };
    
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    if (rawSessions) {
      for (const s of rawSessions) {
        if (!s.session?.startTime) continue;
        const startDate = new Date(s.session.startTime);
        const endDate = s.session.endTime ? new Date(s.session.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);
        const isPast = startDate < now;
        const isCancelled = s.attendanceStatus === "cancelled";

        items.push({
          id: s.id,
          date: formatDate(startDate),
          startTime: formatTime(startDate),
          endTime: formatTime(endDate),
          type: s.session.sessionType || "training",
          title: s.session.title || getTypeLabel(s.session.sessionType),
          coachName: s.coachName || "Coach",
          courtName: s.session.courtName || undefined,
          status: isCancelled ? "cancelled" : (isPast ? "completed" : "upcoming"),
          attendanceStatus: s.attendanceStatus,
        });
      }
    }
    
    return items.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.startTime}`);
      const dateB = new Date(`${b.date}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    });
  }, [rawSessions]);

  const attendanceStats: AttendanceStats = useMemo(() => {
    const completed = sessions.filter(s => s.status === "completed");
    const attended = completed.filter(s => s.attendanceStatus === "present" || s.attendanceStatus === "attended").length;
    const missed = completed.filter(s => s.attendanceStatus === "absent" || s.attendanceStatus === "no_show").length;
    const total = attended + missed;
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;
    
    return {
      totalSessions: completed.length,
      attended,
      missed,
      percentage,
      streak: attendanceStreak,
    };
  }, [sessions, attendanceStreak]);

  const upcomingSessions = useMemo(() => {
    return sessions.filter(s => s.status === "upcoming").slice(0, 5);
  }, [sessions]);

  const nextSession = upcomingSessions[0];

  const thisMonthSessions = useMemo(() => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    return sessions.filter(s => s.date.startsWith(monthStr) && s.status !== "cancelled").length;
  }, [sessions]);

  const getNextSessionCountdown = () => {
    if (!nextSession) return null;
    const sessionDate = new Date(`${nextSession.date}T${nextSession.startTime}`);
    const now = new Date();
    const diff = sessionDate.getTime() - now.getTime();
    
    if (diff < 0) return "Now";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "Soon";
  };

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: CalendarDay[] = [];

    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        sessions: [],
      });
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateStr = formatLocalDate(date);
      const daySessions = sessions.filter((s) => s.date === dateStr);
      const selectedStr = formatLocalDate(selectedDate);
      
      days.push({
        date,
        isCurrentMonth: true,
        isToday: formatLocalDate(date) === formatLocalDate(today),
        isSelected: dateStr === selectedStr,
        sessions: daySessions,
      });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        sessions: [],
      });
    }

    return days;
  }, [currentMonth, sessions, selectedDate]);

  const selectedDateSessions = useMemo(() => {
    const dateStr = formatLocalDate(selectedDate);
    return sessions.filter((s) => s.date === dateStr);
  }, [selectedDate, sessions]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "private": return ProTennisColors.neonGreen;
      case "group": return ProTennisColors.gold;
      case "semi_private": return ProTennisColors.neonOrange;
      default: return ProTennisColors.neonCyan;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "group": return "Group";
      case "semi_private": return "Semi-Private";
      default: return "Training";
    }
  };

  const navigateMonth = (direction: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
  };

  const handleDayPress = (day: CalendarDay) => {
    if (!day.isCurrentMonth) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(day.date);
  };

  const handleBookLesson = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("BookLesson");
  };

  const formatSelectedDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const selectedStr = formatLocalDate(selectedDate);
    const todayStr = formatLocalDate(today);
    const tomorrowStr = formatLocalDate(tomorrow);
    
    if (selectedStr === todayStr) return "Today";
    if (selectedStr === tomorrowStr) return "Tomorrow";
    
    return selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  if (sessionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ProTennisColors.neonCyan} />
        <Text style={styles.loadingText}>Loading your schedule...</Text>
      </View>
    );
  }

  if (sessionsError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={48} color={ProTennisColors.error} />
        <Text style={styles.errorText}>Unable to load schedule</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={styles.headerSection}>
            <Text style={styles.screenTitle}>My Schedule</Text>
            <Pressable style={styles.bookButton} onPress={handleBookLesson}>
              <LinearGradient
                colors={[ProTennisColors.neonGreen, "#A8E000"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bookButtonGradient}
              >
                <Feather name="plus" size={18} color={ProTennisColors.midnightBlue} />
                <Text style={styles.bookButtonText}>Book Lesson</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatCard
              icon="clock"
              label="Next Lesson"
              value={getNextSessionCountdown() || "-"}
              color={ProTennisColors.neonCyan}
              subtext={nextSession ? nextSession.type.charAt(0).toUpperCase() + nextSession.type.slice(1) : undefined}
            />
            <StatCard
              icon="calendar"
              label="This Month"
              value={thisMonthSessions}
              color={ProTennisColors.neonGreen}
              subtext="Lessons"
            />
            <StatCard
              icon="check-circle"
              label="Attendance"
              value={`${attendanceStats.percentage}%`}
              color={attendanceStats.percentage >= 80 ? ProTennisColors.neonGreen : ProTennisColors.neonOrange}
              subtext={`${attendanceStats.streak} streak`}
            />
          </ScrollView>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <NeonBorderCard accentColor={ProTennisColors.neonPurple} style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => navigateMonth(-1)} style={styles.monthNavButton}>
                <Feather name="chevron-left" size={24} color={ProTennisColors.white} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
              </Text>
              <Pressable onPress={() => navigateMonth(1)} style={styles.monthNavButton}>
                <Feather name="chevron-right" size={24} color={ProTennisColors.white} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <Text key={day} style={styles.weekdayLabel}>{day}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day, index) => {
                const hasPrivate = day.sessions.some(s => s.type === "private");
                const hasGroup = day.sessions.some(s => s.type === "group");
                const hasSemiPrivate = day.sessions.some(s => s.type === "semi_private");
                
                return (
                  <Pressable
                    key={index}
                    style={[
                      styles.calendarDay,
                      !day.isCurrentMonth && styles.calendarDayOtherMonth,
                      day.isToday && styles.calendarDayToday,
                      day.isSelected && styles.calendarDaySelected,
                    ]}
                    onPress={() => handleDayPress(day)}
                  >
                    <Text style={[
                      styles.calendarDayText,
                      !day.isCurrentMonth && styles.calendarDayTextOther,
                      day.isToday && styles.calendarDayTextToday,
                      day.isSelected && styles.calendarDayTextSelected,
                    ]}>
                      {day.date.getDate()}
                    </Text>
                    {day.sessions.length > 0 && day.isCurrentMonth ? (
                      <View style={styles.sessionDots}>
                        {hasPrivate ? <View style={[styles.sessionDot, { backgroundColor: ProTennisColors.neonGreen }]} /> : null}
                        {hasGroup ? <View style={[styles.sessionDot, { backgroundColor: ProTennisColors.gold }]} /> : null}
                        {hasSemiPrivate ? <View style={[styles.sessionDot, { backgroundColor: ProTennisColors.neonOrange }]} /> : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ProTennisColors.neonGreen }]} />
                <Text style={styles.legendText}>Private</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ProTennisColors.gold }]} />
                <Text style={styles.legendText}>Group</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ProTennisColors.neonOrange }]} />
                <Text style={styles.legendText}>Semi-Private</Text>
              </View>
            </View>
          </NeonBorderCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{formatSelectedDate()}</Text>
            <Text style={styles.sectionCount}>{selectedDateSessions.length} {selectedDateSessions.length === 1 ? "lesson" : "lessons"}</Text>
          </View>

          {selectedDateSessions.length === 0 ? (
            <View style={styles.emptyDay}>
              <View style={styles.emptyDayIcon}>
                <Feather name="calendar" size={32} color={ProTennisColors.textMuted} />
              </View>
              <Text style={styles.emptyDayText}>No lessons scheduled</Text>
              <Pressable style={styles.emptyDayButton} onPress={handleBookLesson}>
                <Text style={styles.emptyDayButtonText}>Book a Lesson</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.sessionsList}>
              {selectedDateSessions.map((session, index) => (
                <Animated.View key={session.id} entering={FadeIn.delay(index * 100).duration(300)}>
                  <NeonBorderCard accentColor={getTypeColor(session.type)} style={styles.sessionCard}>
                    <View style={styles.sessionCardContent}>
                      <View style={styles.sessionTime}>
                        <Text style={styles.sessionTimeText}>{session.startTime}</Text>
                        <View style={styles.sessionTimeLine} />
                        <Text style={styles.sessionTimeText}>{session.endTime}</Text>
                      </View>
                      <View style={styles.sessionInfo}>
                        <View style={[styles.sessionTypeBadge, { backgroundColor: getTypeColor(session.type) + "25" }]}>
                          <Text style={[styles.sessionTypeText, { color: getTypeColor(session.type) }]}>
                            {getTypeLabel(session.type)}
                          </Text>
                        </View>
                        <Text style={styles.sessionTitle}>{session.title}</Text>
                        <View style={styles.sessionMeta}>
                          <Feather name="user" size={12} color={ProTennisColors.textSecondary} />
                          <Text style={styles.sessionMetaText}>{session.coachName}</Text>
                          {session.courtName ? (
                            <>
                              <Text style={styles.sessionMetaDot}>·</Text>
                              <Feather name="map-pin" size={12} color={ProTennisColors.textSecondary} />
                              <Text style={styles.sessionMetaText}>{session.courtName}</Text>
                            </>
                          ) : null}
                        </View>
                      </View>
                      {session.status === "completed" ? (
                        <View style={[styles.sessionStatus, { backgroundColor: ProTennisColors.neonGreen + "20" }]}>
                          <Feather name="check" size={16} color={ProTennisColors.neonGreen} />
                        </View>
                      ) : session.status === "cancelled" ? (
                        <View style={[styles.sessionStatus, { backgroundColor: ProTennisColors.error + "20" }]}>
                          <Feather name="x" size={16} color={ProTennisColors.error} />
                        </View>
                      ) : (
                        <View style={[styles.sessionStatus, { backgroundColor: ProTennisColors.neonCyan + "20" }]}>
                          <Feather name="clock" size={16} color={ProTennisColors.neonCyan} />
                        </View>
                      )}
                    </View>
                  </NeonBorderCard>
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>

        {upcomingSessions.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(500).duration(400)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Lessons</Text>
              <Text style={styles.sectionCount}>{upcomingSessions.length} scheduled</Text>
            </View>
            <View style={styles.upcomingList}>
              {upcomingSessions.map((session, index) => (
                <View key={session.id} style={styles.upcomingItem}>
                  <View style={[styles.upcomingDot, { backgroundColor: getTypeColor(session.type) }]} />
                  <View style={styles.upcomingInfo}>
                    <Text style={styles.upcomingTitle}>{session.title}</Text>
                    <Text style={styles.upcomingMeta}>
                      {new Date(session.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {session.startTime}
                    </Text>
                  </View>
                  <View style={[styles.upcomingBadge, { backgroundColor: getTypeColor(session.type) + "20" }]}>
                    <Text style={[styles.upcomingBadgeText, { color: getTypeColor(session.type) }]}>
                      {getTypeLabel(session.type)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(600).duration(400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Attendance History</Text>
          </View>
          <NeonBorderCard accentColor={ProTennisColors.neonGreen} style={styles.attendanceCard}>
            <View style={styles.attendanceStats}>
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceValue, { color: ProTennisColors.neonGreen }]}>{attendanceStats.attended}</Text>
                <Text style={styles.attendanceLabel}>Attended</Text>
              </View>
              <View style={styles.attendanceDivider} />
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceValue, { color: ProTennisColors.error }]}>{attendanceStats.missed}</Text>
                <Text style={styles.attendanceLabel}>Missed</Text>
              </View>
              <View style={styles.attendanceDivider} />
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceValue, { color: ProTennisColors.gold }]}>{attendanceStats.streak}</Text>
                <Text style={styles.attendanceLabel}>Streak</Text>
              </View>
            </View>
            <View style={styles.attendanceProgressContainer}>
              <View style={styles.attendanceProgressBg}>
                <LinearGradient
                  colors={[ProTennisColors.neonGreen, ProTennisColors.neonCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.attendanceProgressFill, { width: `${attendanceStats.percentage}%` }]}
                />
              </View>
              <Text style={styles.attendancePercentage}>{attendanceStats.percentage}% attendance rate</Text>
            </View>
          </NeonBorderCard>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ProTennisColors.midnightBlue,
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: ProTennisColors.textSecondary,
    fontSize: 14,
  },
  errorText: {
    marginTop: Spacing.md,
    color: ProTennisColors.error,
    fontSize: 16,
    fontWeight: "600",
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: ProTennisColors.white,
  },
  bookButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  bookButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
  },
  statsRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    backgroundColor: ProTennisColors.surfaceCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: 110,
    alignItems: "center",
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: ProTennisColors.white,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  statSubtext: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
    marginTop: 2,
  },
  neonCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    position: "relative",
  },
  neonCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  neonCardGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
  },
  neonCardBorder: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    backgroundColor: ProTennisColors.surfaceCard,
    overflow: "hidden",
  },
  calendarCard: {},
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  monthNavButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: ProTennisColors.surfaceElevated,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.white,
    letterSpacing: 1,
  },
  weekdayRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.border,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
    textTransform: "uppercase",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  calendarDayOtherMonth: {
    opacity: 0.3,
  },
  calendarDayToday: {
    backgroundColor: ProTennisColors.neonPurple + "30",
    borderRadius: 8,
  },
  calendarDaySelected: {
    backgroundColor: ProTennisColors.neonCyan,
    borderRadius: 8,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  calendarDayTextOther: {
    color: ProTennisColors.textMuted,
  },
  calendarDayTextToday: {
    color: ProTennisColors.neonPurple,
    fontWeight: "800",
  },
  calendarDayTextSelected: {
    color: ProTennisColors.midnightBlue,
    fontWeight: "800",
  },
  sessionDots: {
    flexDirection: "row",
    gap: 2,
    marginTop: 2,
  },
  sessionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: ProTennisColors.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: ProTennisColors.textSecondary,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  sectionCount: {
    fontSize: 13,
    color: ProTennisColors.textMuted,
  },
  emptyDay: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyDayIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ProTennisColors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyDayText: {
    fontSize: 15,
    color: ProTennisColors.textMuted,
    marginBottom: Spacing.md,
  },
  emptyDayButton: {
    backgroundColor: ProTennisColors.neonGreen,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
  },
  emptyDayButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
  },
  sessionsList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  sessionCard: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  sessionCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sessionTime: {
    alignItems: "center",
    width: 50,
  },
  sessionTimeText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
  sessionTimeLine: {
    width: 1,
    height: 16,
    backgroundColor: ProTennisColors.border,
    marginVertical: 2,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTypeBadge: {
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  sessionTypeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.white,
    marginBottom: 4,
  },
  sessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sessionMetaText: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
  },
  sessionMetaDot: {
    color: ProTennisColors.textMuted,
    marginHorizontal: 4,
  },
  sessionStatus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingList: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  upcomingItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceCard,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  upcomingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.md,
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  upcomingMeta: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  upcomingBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  upcomingBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  attendanceCard: {},
  attendanceStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.border,
  },
  attendanceStat: {
    alignItems: "center",
    flex: 1,
  },
  attendanceValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  attendanceLabel: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  attendanceDivider: {
    width: 1,
    backgroundColor: ProTennisColors.border,
  },
  attendanceProgressContainer: {
    padding: Spacing.md,
  },
  attendanceProgressBg: {
    height: 8,
    backgroundColor: ProTennisColors.surfaceElevated,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  attendanceProgressFill: {
    height: "100%",
    borderRadius: 4,
  },
  attendancePercentage: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    textAlign: "center",
  },
});
