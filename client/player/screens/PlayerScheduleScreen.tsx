import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Alert, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, Backgrounds, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { EmptyStateCard } from "@/components/EmptyStateCard";

interface VacationData {
  active: boolean;
  activeVacation?: { id: string; startDate: string; endDate: string };
  upcomingVacation?: { id: string; startDate: string; endDate: string };
  holidays: Array<{ id: string; startDate: string; endDate: string }>;
}

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
  xpPotential?: number;
  isCourtBooking?: boolean;
  countsForProgress: boolean;
  attendanceImpact?: "affects" | "no_impact" | "frozen";
  cancelledByCoach?: boolean;
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
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showVacationWizard, setShowVacationWizard] = useState(false);
  const [vacationStartDate, setVacationStartDate] = useState<Date | null>(null);
  const [vacationEndDate, setVacationEndDate] = useState<Date | null>(null);

  const { data: rawSessions, isLoading: sessionsLoading, error: sessionsError } = useQuery<SessionData[]>({
    queryKey: ["/api/player/me/sessions"],
  });

  const { data: courtBookings, isLoading: bookingsLoading } = useQuery<CourtBookingData[]>({
    queryKey: ["/api/player/me/court-bookings"],
  });

  const { data: profileData } = useQuery<{ player: { attendanceStreak?: number } }>({
    queryKey: ["/api/player/me"],
  });

  const { data: vacationData } = useQuery<VacationData>({
    queryKey: ["/api/player/me/vacation"],
  });

  const createVacationMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string }) => {
      return apiRequest("/api/player/me/vacation", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/sessions"] });
      setShowVacationWizard(false);
      setVacationStartDate(null);
      setVacationEndDate(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const cancelVacationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/player/me/vacation/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/sessions"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const hasActiveOrUpcomingVacation = vacationData?.activeVacation || vacationData?.upcomingVacation;

  const isLoading = sessionsLoading || bookingsLoading;
  const error = sessionsError;
  const attendanceStreak = profileData?.player?.attendanceStreak || 0;

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
        const startDateTime = s.session?.startTime ? new Date(s.session.startTime) : new Date();
        const endDateTime = s.session?.endTime ? new Date(s.session.endTime) : new Date();
        const isPast = startDateTime < now;
        const sessionType = s.session?.sessionType || "training";
        
        const isCancelled = s.attendanceStatus === "cancelled";
        const cancelledByCoach = s.attendanceStatus === "cancelled_by_coach";
        const isNoShow = s.attendanceStatus === "no_show" || s.attendanceStatus === "absent";
        const isHolidayMode = s.attendanceStatus === "holiday";
        
        let attendanceImpact: "affects" | "no_impact" | "frozen" | undefined = undefined;
        if (cancelledByCoach) {
          attendanceImpact = "no_impact";
        } else if (isNoShow || isCancelled) {
          attendanceImpact = "affects";
        } else if (isHolidayMode) {
          attendanceImpact = "frozen";
        }
        
        const isCancelledStatus = isCancelled || cancelledByCoach || isNoShow;
        
        items.push({
          id: s.id,
          date: formatDate(startDateTime),
          startTime: formatTime(startDateTime),
          endTime: formatTime(endDateTime),
          type: sessionType,
          title: s.session?.title || "Training Session",
          coachName: s.coachName || "Your Coach",
          courtName: s.session?.courtName || undefined,
          status: isCancelledStatus ? "cancelled" : (isPast ? "completed" : "upcoming"),
          xpPotential: sessionType === "private" ? 120 : sessionType === "group" ? 80 : 100,
          countsForProgress: true,
          attendanceImpact,
          cancelledByCoach,
        });
      }
    }
    
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
          countsForProgress: false,
        });
      }
    }
    
    return items.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.startTime}`);
      const dateB = new Date(`${b.date}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    });
  }, [rawSessions, courtBookings]);

  const nextSession = useMemo(() => {
    return sessions.find(s => s.status === "upcoming" && !s.isCourtBooking);
  }, [sessions]);

  const weeklyXpStats = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const formatDateStr = (d: Date) => {
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const mondayStr = formatDateStr(monday);
    const sundayStr = formatDateStr(sunday);

    const weekSessions = sessions.filter(s => 
      s.countsForProgress && 
      s.date >= mondayStr && 
      s.date <= sundayStr &&
      s.status !== "cancelled"
    );

    const baseXp = weekSessions.reduce((sum, s) => sum + (s.xpPotential || 0), 0);
    const completedXp = weekSessions
      .filter(s => s.status === "completed")
      .reduce((sum, s) => sum + (s.xpPotential || 0), 0);
    const upcomingXp = weekSessions
      .filter(s => s.status === "upcoming")
      .reduce((sum, s) => sum + (s.xpPotential || 0), 0);
    
    let streakMultiplier = 0;
    if (attendanceStreak >= 7) streakMultiplier = 0.20;
    else if (attendanceStreak >= 5) streakMultiplier = 0.15;
    else if (attendanceStreak >= 3) streakMultiplier = 0.10;
    
    const bonusXp = Math.round(baseXp * streakMultiplier);
    const totalXp = baseXp + bonusXp;

    return {
      baseXp,
      bonusXp,
      totalXp,
      completedXp,
      upcomingXp,
      streakMultiplier,
      sessionCount: weekSessions.length,
      completedCount: weekSessions.filter(s => s.status === "completed").length,
    };
  }, [sessions, attendanceStreak]);

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
      const daySessions = sessions.filter((s) => s.date === dateStr);
      
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
  }, [currentMonth, sessions]);

  const selectedDateSessions = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = formatLocalDate(selectedDate);
    return sessions.filter((s) => s.date === dateStr);
  }, [selectedDate, sessions]);

  const isDateInVacation = (date: Date): boolean => {
    if (!vacationData?.holidays?.length) return false;
    const dateStr = formatLocalDate(date);
    return vacationData.holidays.some(h => {
      const start = h.startDate.split('T')[0];
      const end = h.endDate.split('T')[0];
      return dateStr >= start && dateStr <= end;
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "private": return Colors.dark.primary;
      case "group": return Colors.dark.gold;
      case "semi_private": return Colors.dark.orange;
      case "court": return Colors.dark.xpCyan;
      default: return Colors.dark.primary;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private Training";
      case "group": return "Group Training";
      case "semi_private": return "Semi-Private";
      case "court": return "Court Booking";
      default: return "Training";
    }
  };

  const navigateMonth = (direction: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
  };

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.getTime() === today.getTime()) return "Today";
    if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
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
    <ScrollView 
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Quest Timeline Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Quest Timeline</Text>
        <Text style={styles.subtitle}>Complete training for XP rewards</Text>
      </View>

      {/* Weekly XP Quest Card */}
      <LinearGradient
        colors={[`rgba(200, 255, 61, 0.1)`, `rgba(200, 255, 61, 0.02)`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.weeklyQuestCard}
      >
        <View style={styles.weeklyQuestHeader}>
          <View style={styles.weeklyQuestIcon}>
            <Ionicons name="trophy" size={20} color={Colors.dark.gold} />
          </View>
          <Text style={styles.weeklyQuestLabel}>WEEKLY XP QUEST</Text>
          {weeklyXpStats.streakMultiplier > 0 ? (
            <View style={styles.streakBonusBadge}>
              <Ionicons name="flame" size={12} color={Colors.dark.orange} />
              <Text style={styles.streakBonusText}>+{Math.round(weeklyXpStats.streakMultiplier * 100)}%</Text>
            </View>
          ) : null}
        </View>
        
        <View style={styles.weeklyQuestProgressSection}>
          <View style={styles.xpProgressBar}>
            <View 
              style={[
                styles.xpProgressFill, 
                { width: weeklyXpStats.totalXp > 0 ? `${Math.min((weeklyXpStats.completedXp / weeklyXpStats.totalXp) * 100, 100)}%` : "0%" }
              ]} 
            />
          </View>
          <View style={styles.xpStats}>
            <View style={styles.xpStatItem}>
              <Text style={styles.xpStatValue}>{weeklyXpStats.completedXp}</Text>
              <Text style={styles.xpStatLabel}>Earned</Text>
            </View>
            <View style={styles.xpStatDivider} />
            <View style={styles.xpStatItem}>
              <Text style={styles.xpStatValue}>{weeklyXpStats.upcomingXp}</Text>
              <Text style={styles.xpStatLabel}>Pending</Text>
            </View>
            <View style={styles.xpStatDivider} />
            <View style={styles.xpStatItem}>
              <Text style={[styles.xpStatValue, { color: Colors.dark.gold }]}>{weeklyXpStats.totalXp}</Text>
              <Text style={styles.xpStatLabel}>Total</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.weeklyQuestInfo}>
          <Text style={styles.weeklyQuestProgressText}>
            <Text style={{ color: GlowColors.primary, fontWeight: "700" }}>{weeklyXpStats.completedCount}</Text>
            <Text style={{ color: Colors.dark.textMuted }}> / {weeklyXpStats.sessionCount} quests completed</Text>
          </Text>
          {weeklyXpStats.bonusXp > 0 ? (
            <Text style={styles.bonusXpText}>
              <Ionicons name="flash" size={12} color={Colors.dark.gold} /> +{weeklyXpStats.bonusXp} streak bonus
            </Text>
          ) : attendanceStreak > 0 && attendanceStreak < 3 ? (
            <Text style={styles.streakHintText}>
              <Ionicons name="flame-outline" size={12} color={Colors.dark.textMuted} /> {3 - attendanceStreak} more days for streak bonus
            </Text>
          ) : null}
        </View>
      </LinearGradient>

      {/* NEXT TRAINING Hero Card */}
      {nextSession ? (
        <View style={styles.nextTrainingCard}>
          <View style={styles.nextTrainingHeader}>
            <Text style={styles.nextTrainingLabel}>NEXT TRAINING</Text>
            <View style={styles.confirmedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
            </View>
          </View>
          
          <View style={styles.nextTrainingContent}>
            <View style={styles.nextTrainingIcon}>
              <Ionicons name="tennisball" size={24} color={GlowColors.primary} />
            </View>
            <View style={styles.nextTrainingInfo}>
              <Text style={styles.nextTrainingTitle}>{getTypeLabel(nextSession.type)}</Text>
              <Text style={styles.nextTrainingTime}>
                {formatSessionDate(nextSession.date)} · {nextSession.startTime} - {nextSession.endTime}
              </Text>
              {nextSession.courtName ? (
                <Text style={styles.nextTrainingCourt}>
                  <Ionicons name="location" size={12} color={Colors.dark.textMuted} /> {nextSession.courtName}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.nextTrainingBadges}>
            <View style={styles.xpPotentialBadge}>
              <Ionicons name="flash" size={14} color={Colors.dark.gold} />
              <Text style={styles.xpPotentialText}>+{nextSession.xpPotential} XP potential</Text>
            </View>
            {attendanceStreak > 0 ? (
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={14} color={Colors.dark.orange} />
                <Text style={styles.streakText}>Streak continues · Day {attendanceStreak + 1}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.nextTrainingActions}>
            <Pressable style={styles.viewDetailsButton}>
              <Text style={styles.viewDetailsText}>View Details</Text>
              <Ionicons name="chevron-forward" size={16} color={GlowColors.primary} />
            </Pressable>
            <Pressable style={styles.rescheduleButton}>
              <Ionicons name="calendar-outline" size={16} color={Colors.dark.gold} />
              <Text style={styles.rescheduleText}>Reschedule</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.noNextSessionCard}>
          <Ionicons name="calendar-outline" size={32} color={Colors.dark.textMuted} />
          <Text style={styles.noNextSessionTitle}>No upcoming training</Text>
          <Text style={styles.noNextSessionSubtitle}>Book a lesson to continue your progress</Text>
          <Pressable style={styles.bookLessonButton}>
            <LinearGradient
              colors={[GlowColors.primary, GlowColors.dark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bookLessonGradient}
            >
              <Text style={styles.bookLessonText}>Book Lesson</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* Calendar */}
      <View style={styles.calendarContainer}>
        <View style={styles.calendarHeader}>
          <Pressable onPress={() => navigateMonth(-1)} style={styles.navButton}>
            <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.monthTitle}>
            {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </Text>
          <Pressable onPress={() => navigateMonth(1)} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
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
              formatLocalDate(day.date) === formatLocalDate(selectedDate);
            const hasTraining = day.sessions.some(s => !s.isCourtBooking);
            const hasBooking = day.sessions.some(s => s.isCourtBooking);
            const isVacationDay = isDateInVacation(day.date);
            
            return (
              <Pressable
                key={index}
                style={[
                  styles.calendarDay,
                  !day.isCurrentMonth && styles.calendarDayFaded,
                  isSelected && styles.calendarDaySelected,
                  isVacationDay && styles.calendarDayVacation,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedDate(day.date);
                }}
              >
                {isVacationDay ? (
                  <View style={styles.vacationIndicator}>
                    <Ionicons name="airplane" size={10} color={Colors.dark.xpCyan} />
                  </View>
                ) : hasTraining ? (
                  <View style={styles.trainingIndicator}>
                    <Ionicons name="tennisball" size={12} color={GlowColors.primary} />
                  </View>
                ) : null}
                <Text style={[
                  styles.calendarDayText,
                  !day.isCurrentMonth && styles.calendarDayTextFaded,
                  day.isToday && styles.calendarDayTextToday,
                  isSelected && styles.calendarDayTextSelected,
                  hasTraining && styles.calendarDayTextWithSession,
                  isVacationDay && styles.calendarDayTextVacation,
                ]}>
                  {day.date.getDate()}
                </Text>
                {hasBooking && !hasTraining && !isVacationDay ? (
                  <View style={styles.bookingDot} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Vacation Card - show when no active/upcoming vacation */}
      {!hasActiveOrUpcomingVacation && !showVacationWizard ? (
        <Pressable 
          style={styles.vacationCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowVacationWizard(true);
          }}
        >
          <View style={styles.vacationCardContent}>
            <View style={styles.vacationIcon}>
              <Ionicons name="airplane" size={24} color={Colors.dark.xpCyan} />
            </View>
            <View style={styles.vacationInfo}>
              <Text style={styles.vacationTitle}>Going on vacation?</Text>
              <Text style={styles.vacationSubtitle}>Set your dates and we'll pause lessons</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </View>
        </Pressable>
      ) : null}

      {/* Active/Upcoming Vacation Banner */}
      {hasActiveOrUpcomingVacation && !showVacationWizard ? (
        <View style={styles.activeVacationCard}>
          <View style={styles.activeVacationHeader}>
            <Ionicons name="airplane" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.activeVacationLabel}>
              {vacationData?.activeVacation ? "ON VACATION" : "VACATION SCHEDULED"}
            </Text>
          </View>
          <Text style={styles.activeVacationDates}>
            {new Date(hasActiveOrUpcomingVacation.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} 
            {" - "}
            {new Date(hasActiveOrUpcomingVacation.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </Text>
          <Text style={styles.activeVacationNote}>
            Lessons are paused during this period
          </Text>
          <Pressable 
            style={[styles.cancelVacationButton, cancelVacationMutation.isPending && styles.cancelVacationButtonDisabled]}
            disabled={cancelVacationMutation.isPending}
            onPress={() => {
              const confirmCancel = () => {
                if (hasActiveOrUpcomingVacation) {
                  cancelVacationMutation.mutate(hasActiveOrUpcomingVacation.id);
                }
              };
              if (Platform.OS === "web") {
                if (window.confirm("Cancel this vacation? Your lessons will resume.")) {
                  confirmCancel();
                }
              } else {
                Alert.alert(
                  "Cancel Vacation",
                  "Cancel this vacation? Your lessons will resume.",
                  [
                    { text: "Keep Vacation", style: "cancel" },
                    { text: "Cancel It", style: "destructive", onPress: confirmCancel },
                  ]
                );
              }
            }}
          >
            {cancelVacationMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <Text style={styles.cancelVacationText}>Cancel Vacation</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Vacation Wizard */}
      {showVacationWizard ? (
        <View style={styles.vacationWizard}>
          <View style={styles.vacationWizardHeader}>
            <View style={styles.vacationWizardIcon}>
              <Ionicons name="airplane" size={28} color={Colors.dark.xpCyan} />
            </View>
            <Text style={styles.vacationWizardTitle}>Plan Your Break</Text>
            <Text style={styles.vacationWizardSubtitle}>Select your vacation dates</Text>
          </View>

          {/* Date Selection */}
          <View style={styles.dateSection}>
            <Text style={styles.dateSectionLabel}>Start Date</Text>
            <View style={styles.datePickerWrapper}>
              <DateTimePicker
                value={vacationStartDate || new Date()}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(event, date) => {
                  if (date) setVacationStartDate(date);
                }}
              />
            </View>
            {vacationStartDate ? (
              <Text style={styles.dateSelectedText}>
                {vacationStartDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </Text>
            ) : null}
          </View>

          <View style={styles.dateSection}>
            <Text style={styles.dateSectionLabel}>End Date</Text>
            <View style={styles.datePickerWrapper}>
              <DateTimePicker
                value={vacationEndDate || vacationStartDate || new Date()}
                mode="date"
                display="default"
                minimumDate={vacationStartDate || new Date()}
                onChange={(event, date) => {
                  if (date) setVacationEndDate(date);
                }}
              />
            </View>
            {vacationEndDate ? (
              <Text style={styles.dateSelectedText}>
                {vacationEndDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </Text>
            ) : null}
          </View>

          {/* Validation Error */}
          {vacationStartDate && vacationEndDate && vacationEndDate < vacationStartDate ? (
            <View style={styles.validationError}>
              <Ionicons name="alert-circle" size={14} color={Colors.dark.error} />
              <Text style={styles.validationErrorText}>End date must be after start date</Text>
            </View>
          ) : null}

          {/* Policy Info */}
          <View style={styles.policyInfo}>
            <Ionicons name="information-circle" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.policyText}>
              Sessions during your vacation will be automatically paused. 
              Your credits remain safe and will be available when you return.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.vacationActions}>
            <Pressable 
              style={[styles.cancelButton, createVacationMutation.isPending && styles.cancelButtonDisabled]}
              disabled={createVacationMutation.isPending}
              onPress={() => {
                setShowVacationWizard(false);
                setVacationStartDate(null);
                setVacationEndDate(null);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={[
                styles.confirmButton,
                (!vacationStartDate || !vacationEndDate || (vacationEndDate < vacationStartDate)) && styles.confirmButtonDisabled
              ]}
              disabled={!vacationStartDate || !vacationEndDate || (vacationEndDate < vacationStartDate) || createVacationMutation.isPending}
              onPress={() => {
                if (vacationStartDate && vacationEndDate && vacationEndDate >= vacationStartDate) {
                  createVacationMutation.mutate({
                    startDate: vacationStartDate.toISOString().split('T')[0],
                    endDate: vacationEndDate.toISOString().split('T')[0],
                  });
                }
              }}
            >
              <LinearGradient
                colors={vacationStartDate && vacationEndDate && vacationEndDate >= vacationStartDate
                  ? [Colors.dark.xpCyan, "#0099CC"] 
                  : [Colors.dark.backgroundTertiary, Colors.dark.backgroundTertiary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmButtonGradient}
              >
                {createVacationMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirm Vacation</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* TODAY Section */}
      <View style={styles.todaySection}>
        <Text style={styles.todaySectionTitle}>
          {selectedDate ? (
            formatLocalDate(selectedDate) === formatLocalDate(new Date()) 
              ? `TODAY · ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`
              : selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
          ) : "TODAY"}
        </Text>
        
        {selectedDateSessions.length === 0 ? (
          <EmptyStateCard
            icon="calendar"
            title="No sessions scheduled"
            description="Book a lesson with your coach to start training"
            ctaText="Book a Lesson"
            onPress={() => navigation.navigate("LessonBooking" as never)}
            style={styles.emptyStateCard}
          />
        ) : (
          selectedDateSessions.map((session) => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={styles.sessionCardLeft}>
                <View style={[styles.sessionIcon, { backgroundColor: session.isCourtBooking ? "rgba(0, 212, 255, 0.15)" : "rgba(200, 255, 61, 0.15)" }]}>
                  {session.isCourtBooking ? (
                    <Ionicons name="tennisball-outline" size={20} color={Colors.dark.xpCyan} />
                  ) : (
                    <Ionicons name="tennisball" size={20} color={GlowColors.primary} />
                  )}
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionTitle}>{getTypeLabel(session.type)}</Text>
                  {session.countsForProgress ? (
                    <View style={styles.xpRow}>
                      <Text style={styles.sessionXp}>+{session.xpPotential} XP</Text>
                      <View style={styles.countsForProgressBadge}>
                        <Ionicons name="checkmark" size={10} color={GlowColors.primary} />
                        <Text style={styles.countsForProgressText}>Counts for progress</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.sessionSubtitle}>Free Play</Text>
                  )}
                  {!session.isCourtBooking && session.coachName ? (
                    <Text style={styles.sessionCoach}>
                      <Ionicons name="person" size={11} color={Colors.dark.textMuted} /> Coach: {session.coachName}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.sessionCardRight}>
                <Text style={styles.sessionTime}>{session.startTime} - {session.endTime}</Text>
                <View style={[styles.statusBadge, session.status === "cancelled" && styles.statusBadgeCancelled]}>
                  <Ionicons 
                    name={session.status === "cancelled" ? "close-circle" : "checkmark-circle"} 
                    size={12} 
                    color={session.status === "cancelled" ? Colors.dark.error : GlowColors.primary} 
                  />
                  <Text style={[styles.statusText, session.status === "cancelled" && styles.statusTextCancelled]}>
                    {session.status === "cancelled" ? "Cancelled" : "Confirmed"}
                  </Text>
                </View>
                {session.attendanceImpact ? (
                  <View style={[
                    styles.impactBadge, 
                    session.attendanceImpact === "no_impact" && styles.impactBadgeNoImpact,
                    session.attendanceImpact === "frozen" && styles.impactBadgeFrozen
                  ]}>
                    <Ionicons 
                      name={
                        session.attendanceImpact === "no_impact" 
                          ? "shield-checkmark" 
                          : session.attendanceImpact === "frozen"
                            ? "snow"
                            : "warning"
                      } 
                      size={10} 
                      color={
                        session.attendanceImpact === "no_impact" 
                          ? GlowColors.primary 
                          : session.attendanceImpact === "frozen"
                            ? Colors.dark.xpCyan
                            : Colors.dark.gold
                      } 
                    />
                    <Text style={[
                      styles.impactText,
                      session.attendanceImpact === "no_impact" && styles.impactTextNoImpact,
                      session.attendanceImpact === "frozen" && styles.impactTextFrozen
                    ]}>
                      {session.attendanceImpact === "no_impact" 
                        ? "No impact" 
                        : session.attendanceImpact === "frozen"
                          ? "Frozen (holiday)"
                          : "Affects streak"}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      {/* CONSISTENCY Streak Section */}
      <View style={styles.consistencyCard}>
        <View style={styles.consistencyHeader}>
          <Ionicons name="flame" size={20} color={Colors.dark.orange} />
          <Text style={styles.consistencyLabel}>CONSISTENCY</Text>
        </View>
        <Text style={styles.streakCount}>{attendanceStreak}-day streak</Text>
        <View style={styles.streakFlames}>
          {[...Array(7)].map((_, i) => (
            <Ionicons 
              key={i} 
              name="flame" 
              size={24} 
              color={i < attendanceStreak ? Colors.dark.gold : Colors.dark.backgroundTertiary} 
            />
          ))}
        </View>
        <Text style={styles.streakMotivation}>
          {attendanceStreak > 0 
            ? "Attend today to extend your streak" 
            : "Start training to build your streak"}
        </Text>
      </View>
    </ScrollView>
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
    fontSize: 28,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },

  // Next Training Card
  nextTrainingCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  nextTrainingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  nextTrainingLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  confirmedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  nextTrainingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  nextTrainingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  nextTrainingInfo: {
    flex: 1,
  },
  nextTrainingTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  nextTrainingTime: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  nextTrainingCourt: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  nextTrainingBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  xpPotentialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  xpPotentialText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 165, 0, 0.15)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  streakText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  nextTrainingActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  viewDetailsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  viewDetailsText: {
    ...Typography.small,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  rescheduleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  rescheduleText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "600",
  },

  // No Next Session Card
  noNextSessionCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.xl,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  noNextSessionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  noNextSessionSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  bookLessonButton: {
    marginTop: Spacing.sm,
  },
  bookLessonGradient: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  bookLessonText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },

  // Calendar
  calendarContainer: {
    marginHorizontal: Spacing.xl,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  navButton: {
    padding: Spacing.xs,
  },
  monthTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  weekDays: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  weekDay: {
    flex: 1,
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    fontSize: 10,
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
    position: "relative",
  },
  calendarDayFaded: {
    opacity: 0.3,
  },
  calendarDaySelected: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.sm,
  },
  calendarDayText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontSize: 12,
  },
  calendarDayTextFaded: {
    color: Colors.dark.textMuted,
  },
  calendarDayTextToday: {
    color: GlowColors.primary,
    fontWeight: "700",
  },
  calendarDayTextSelected: {
    color: Backgrounds.root,
    fontWeight: "600",
  },
  calendarDayTextWithSession: {
    color: GlowColors.primary,
    fontWeight: "700",
  },
  trainingIndicator: {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: [{ translateX: -6 }],
  },
  vacationIndicator: {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: [{ translateX: -5 }],
  },
  calendarDayVacation: {
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    borderRadius: BorderRadius.sm,
  },
  calendarDayTextVacation: {
    color: Colors.dark.xpCyan,
  },
  bookingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.xpCyan,
    position: "absolute",
    bottom: 2,
  },

  // Today Section
  todaySection: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  todaySectionTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
  },
  emptyDayState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  emptyDayText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  emptyDaySubtext: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  emptyStateCard: {
    marginVertical: Spacing.lg,
  },
  sessionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderLeftWidth: 3,
    borderLeftColor: GlowColors.primary,
    shadowColor: GlowColors.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  sessionCardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    flex: 1,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  sessionXp: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  countsForProgressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  countsForProgressText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontSize: 10,
  },
  sessionSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  sessionCoach: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 4,
    fontSize: 11,
  },
  sessionCardRight: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sessionTime: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  statusBadgeCancelled: {},
  statusText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontSize: 10,
  },
  statusTextCancelled: {
    color: Colors.dark.error,
  },
  impactBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  impactBadgeNoImpact: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
  },
  impactBadgeFrozen: {
    backgroundColor: "rgba(0, 212, 255, 0.15)",
  },
  impactText: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontSize: 9,
  },
  impactTextNoImpact: {
    color: GlowColors.primary,
  },
  impactTextFrozen: {
    color: Colors.dark.xpCyan,
  },

  // Consistency Card
  consistencyCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  consistencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  consistencyLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  streakCount: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  streakFlames: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  streakMotivation: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },

  // Vacation Card
  vacationCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  vacationCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  vacationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  vacationInfo: {
    flex: 1,
  },
  vacationTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  vacationSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },

  // Active Vacation Card
  activeVacationCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
  },
  activeVacationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  activeVacationLabel: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  activeVacationDates: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  activeVacationNote: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  cancelVacationButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  cancelVacationButtonDisabled: {
    opacity: 0.5,
  },
  cancelVacationText: {
    ...Typography.small,
    color: Colors.dark.error,
    fontWeight: "500",
  },

  // Vacation Wizard
  vacationWizard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  vacationWizardHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  vacationWizardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  vacationWizardTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  vacationWizardSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  dateSection: {
    marginBottom: Spacing.md,
  },
  dateSectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  dateInputText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  datePickerWrapper: {
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  dateSelectedText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginTop: Spacing.xs,
  },
  validationError: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  validationErrorText: {
    ...Typography.small,
    color: Colors.dark.error,
  },
  policyInfo: {
    flexDirection: "row",
    gap: Spacing.sm,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  policyText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  vacationActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  confirmButton: {
    flex: 2,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonGradient: {
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },

  weeklyQuestCard: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  weeklyQuestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  weeklyQuestIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  weeklyQuestLabel: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "700",
    letterSpacing: 1,
    flex: 1,
    textTransform: "uppercase",
  },
  streakBonusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 165, 0, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  streakBonusText: {
    ...Typography.small,
    color: Colors.dark.orange,
    fontWeight: "700",
  },
  xpProgressBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  xpProgressFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 4,
  },
  xpStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  xpStatItem: {
    alignItems: "center",
  },
  xpStatValue: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  xpStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  xpStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.dark.border,
  },
  weeklyQuestInfo: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: Spacing.xs,
  },
  bonusXpText: {
    ...Typography.small,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  streakHintText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  weeklyQuestProgressSection: {
    marginBottom: Spacing.sm,
  },
  weeklyQuestProgressText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
});
