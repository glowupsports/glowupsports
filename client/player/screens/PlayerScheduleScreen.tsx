import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";

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
}

interface ScheduledSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  title: string;
  coachName: string;
  courtName?: string;
  status: "upcoming" | "completed" | "cancelled";
  xpEarned?: number;
  isCourtBooking?: boolean;
}

interface CourtBookingData {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  courtName: string;
  courtLocation: string | null;
  status: string;
  bookingType: string;
  price: string;
  currency: string;
  paymentStatus: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  sessions: ScheduledSession[];
}

export default function PlayerScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { data: rawSessions, isLoading: sessionsLoading, error: sessionsError } = useQuery<SessionData[]>({
    queryKey: ["/api/player/me/sessions"],
  });

  const { data: courtBookings, isLoading: bookingsLoading } = useQuery<CourtBookingData[]>({
    queryKey: ["/api/player/me/court-bookings"],
  });

  const isLoading = sessionsLoading || bookingsLoading;
  const error = sessionsError;

  const sessions: ScheduledSession[] = useMemo(() => {
    const now = new Date();
    const items: ScheduledSession[] = [];
    
    // Format time as HH:mm for display
    const formatTime = (date: Date) => {
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${mins}`;
    };
    
    // Format date as YYYY-MM-DD for calendar matching
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    // Add training sessions
    if (rawSessions) {
      for (const s of rawSessions) {
        const startDateTime = s.session?.startTime ? new Date(s.session.startTime) : new Date();
        const endDateTime = s.session?.endTime ? new Date(s.session.endTime) : new Date();
        const isPast = startDateTime < now;
        
        items.push({
          id: s.id,
          date: formatDate(startDateTime),
          startTime: formatTime(startDateTime),
          endTime: formatTime(endDateTime),
          type: s.session?.sessionType || "training",
          title: s.session?.title || "Training Session",
          coachName: s.coachName || "Your Coach",
          courtName: s.session?.courtName || undefined,
          status: s.attendanceStatus === "cancelled" ? "cancelled" : (isPast ? "completed" : "upcoming"),
        });
      }
    }
    
    // Add court bookings
    if (courtBookings) {
      for (const b of courtBookings) {
        const bookingDate = new Date(b.date + "T" + b.startTime);
        const isPast = bookingDate < now;
        
        items.push({
          id: `court-${b.id}`,
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          type: "court",
          title: "Court Booking",
          coachName: b.courtName,
          courtName: b.courtName,
          status: b.status === "cancelled" ? "cancelled" : (isPast ? "completed" : "upcoming"),
          isCourtBooking: true,
        });
      }
    }
    
    return items;
  }, [rawSessions, courtBookings]);

  const data = sessions;

  // Helper to format date as YYYY-MM-DD using local time
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        sessions: [],
      });
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateStr = formatLocalDate(date);
      const daySessions = data.filter((s) => s.date === dateStr);
      
      days.push({
        date,
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
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
        sessions: [],
      });
    }

    return days;
  }, [currentMonth, data]);

  const selectedDateSessions = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = formatLocalDate(selectedDate);
    return data.filter((s) => s.date === dateStr);
  }, [selectedDate, data]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "private": return Colors.dark.primary;
      case "group": return Colors.dark.gold;
      case "physical": return Colors.dark.orange;
      case "court": return Colors.dark.success;
      default: return Colors.dark.xpCyan;
    }
  };

  const navigateMonth = (direction: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading schedule...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load schedule</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.subtitle}>Your upcoming sessions</Text>
      </View>

      <View style={styles.calendarContainer}>
        <View style={styles.calendarHeader}>
          <Pressable onPress={() => navigateMonth(-1)} style={styles.navButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.monthTitle}>
            {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </Text>
          <Pressable onPress={() => navigateMonth(1)} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        <View style={styles.weekDays}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <Text key={day} style={styles.weekDay}>{day}</Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {calendarDays.map((day, index) => {
            const isSelected = selectedDate && 
              day.date.toISOString().split("T")[0] === selectedDate.toISOString().split("T")[0];
            
            return (
              <Pressable
                key={index}
                style={[
                  styles.calendarDay,
                  !day.isCurrentMonth && styles.calendarDayFaded,
                  day.isToday && styles.calendarDayToday,
                  isSelected && styles.calendarDaySelected,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedDate(day.date);
                }}
              >
                <Text style={[
                  styles.calendarDayText,
                  !day.isCurrentMonth && styles.calendarDayTextFaded,
                  day.isToday && styles.calendarDayTextToday,
                  isSelected && styles.calendarDayTextSelected,
                ]}>
                  {day.date.getDate()}
                </Text>
                {day.sessions.length > 0 ? (
                  <View style={styles.sessionDots}>
                    {day.sessions.slice(0, 3).map((session, i) => (
                      <View
                        key={i}
                        style={[styles.sessionDot, { backgroundColor: getTypeColor(session.type) }]}
                      />
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={styles.sessionsContainer}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>
          {selectedDate 
            ? selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
            : "Upcoming Sessions"
          }
        </Text>
        
        {(selectedDate ? selectedDateSessions : data.filter(s => s.status === "upcoming")).length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={36} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No sessions scheduled</Text>
          </View>
        ) : (
          (selectedDate ? selectedDateSessions : data.filter(s => s.status === "upcoming")).map((session) => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={[styles.sessionStripe, { backgroundColor: getTypeColor(session.type) }]} />
              <View style={styles.sessionContent}>
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionTime}>{session.startTime} - {session.endTime}</Text>
                  {session.xpEarned ? (
                    <View style={styles.xpBadge}>
                      <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                      <Text style={styles.xpText}>+{session.xpEarned}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sessionType}>
                  {session.title}
                </Text>
                <View style={styles.sessionDetails}>
                  {session.courtName ? (
                    <View style={styles.detailItem}>
                      <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
                      <Text style={styles.detailText}>{session.courtName}</Text>
                    </View>
                  ) : null}
                  <View style={styles.detailItem}>
                    <Ionicons name="person-outline" size={14} color={Colors.dark.textMuted} />
                    <Text style={styles.detailText}>{session.coachName}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  errorSubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  calendarContainer: {
    marginHorizontal: Spacing.xl,
    ...CardStyles.elevated,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  navButton: {
    padding: Spacing.xs,
  },
  monthTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  weekDays: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  weekDay: {
    flex: 1,
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  calendarDayFaded: {
    opacity: 0.3,
  },
  calendarDayToday: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderRadius: BorderRadius.sm,
  },
  calendarDaySelected: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.sm,
  },
  calendarDayText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  calendarDayTextFaded: {
    color: Colors.dark.textMuted,
  },
  calendarDayTextToday: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  calendarDayTextSelected: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  sessionDots: {
    flexDirection: "row",
    gap: 2,
    marginTop: 2,
  },
  sessionDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  sessionsContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    gap: Spacing.sm,
  },
  emptyText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sessionCard: {
    flexDirection: "row",
    ...CardStyles.elevated,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  sessionStripe: {
    width: 4,
  },
  sessionContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sessionTime: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  xpText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontSize: 10,
  },
  sessionType: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  sessionDetails: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
});
