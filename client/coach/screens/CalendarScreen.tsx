import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import CreateSessionDrawer from "@/coach/components/CreateSessionDrawer";
import NowPlayingCard from "@/coach/components/NowPlayingCard";
import AttendanceDrawer from "@/coach/components/AttendanceDrawer";

interface CoachData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  homeLocationId: string | null;
  hourlyRate: string | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TIME_COLUMN_WIDTH = 50;
const COURT_LANE_WIDTH = (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / 3;
const HOUR_HEIGHT_60 = 80;
const HOUR_HEIGHT_30 = 60;
const START_HOUR = 6;
const END_HOUR = 23;

function PulsingDot() {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    scale.value = withRepeat(
      withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={pulsingStyles.container}>
      <Animated.View style={[pulsingStyles.outer, animatedStyle]} />
      <View style={pulsingStyles.inner} />
    </View>
  );
}

const pulsingStyles = StyleSheet.create({
  container: {
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -8,
  },
  outer: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.error,
  },
  inner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
  },
});

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
}

interface BlockedSession {
  id: string;
  courtId: string | null;
  startTime: string;
  endTime: string;
  blocked: true;
}

interface Court {
  id: string;
  name: string;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const {
    coach,
    setCoach,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    timeGrid,
    setTimeGrid,
    focusMode,
    setFocusMode,
    calendarData,
    isLoading,
  } = useCoach();

  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ courtId: string; time: Date } | null>(null);
  const [selectedSessionForAttendance, setSelectedSessionForAttendance] = useState<Session | null>(null);
  const [weekMode, setWeekMode] = useState<"overview" | "availability">("overview");

  // Fetch available coaches
  const { data: coaches = [], isLoading: coachesLoading } = useQuery<CoachData[]>({
    queryKey: ["/api/coaches"],
  });

  // Auto-select first coach if none selected
  useEffect(() => {
    if (!coach && coaches.length > 0) {
      setCoach(coaches[0]);
    }
  }, [coach, coaches, setCoach]);

  const hourHeight = timeGrid === 30 ? HOUR_HEIGHT_30 : HOUR_HEIGHT_60;
  
  const isToday = useMemo(() => {
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  }, [selectedDate]);
  
  const displayHours = useMemo(() => {
    if (focusMode && isToday) {
      const now = new Date();
      const currentHour = now.getHours();
      const focusStart = Math.max(START_HOUR, currentHour - 1);
      const focusEnd = Math.min(END_HOUR, currentHour + 3);
      return Array.from({ length: focusEnd - focusStart + 1 }, (_, i) => focusStart + i);
    }
    return Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  }, [focusMode, isToday]);
  
  const focusBaseHour = focusMode && isToday ? displayHours[0] : START_HOUR;
  const hours = displayHours;
  const courts = calendarData?.courts || [];
  const ownSessions = calendarData?.ownSessions || [];
  const blockedSessions = calendarData?.blockedSessions || [];

  const formatTime = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`;
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const getSessionPosition = (session: Session | BlockedSession) => {
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    const top = (startHour - focusBaseHour) * hourHeight;
    const height = (endHour - startHour) * hourHeight;
    return { top, height };
  };

  const getCourtIndex = (courtId: string | null) => {
    if (!courtId) return -1;
    return courts.findIndex((c) => c.id === courtId);
  };

  const handleSlotPress = (courtId: string, hour: number) => {
    const time = new Date(selectedDate);
    time.setHours(hour, 0, 0, 0);
    setSelectedSlot({ courtId, time });
    setShowCreateDrawer(true);
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const getWeekDates = (date: Date): Date[] => {
    const day = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const changeWeek = (weeks: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + weeks * 7);
    setSelectedDate(newDate);
  };

  const changeMonth = (months: number) => {
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();
    const targetMonth = currentMonth + months;
    const targetYear = currentYear + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    const currentDay = selectedDate.getDate();
    const newDay = Math.min(currentDay, lastDayOfTargetMonth);
    const newDate = new Date(targetYear, normalizedMonth, newDay);
    setSelectedDate(newDate);
  };

  const getMonthDates = (date: Date): (Date | null)[][] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = [];
    
    for (let i = 0; i < startPadding; i++) {
      week.push(null);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      week.push(new Date(year, month, day));
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      weeks.push(week);
    }
    
    return weeks;
  };

  const monthDates = useMemo(() => getMonthDates(selectedDate), [selectedDate]);

  const formatMonthYear = (date: Date) => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const formatWeekRange = (dates: Date[]) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const first = dates[0];
    const last = dates[6];
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()} - ${last.getDate()} ${months[first.getMonth()]}`;
    }
    return `${first.getDate()} ${months[first.getMonth()]} - ${last.getDate()} ${months[last.getMonth()]}`;
  };

  const getSessionsForDate = (date: Date) => {
    return ownSessions.filter((s) => {
      const sessionDate = new Date(s.startTime);
      return sessionDate.toDateString() === date.toDateString();
    });
  };

  const getDayStats = (date: Date) => {
    const daySessions = getSessionsForDate(date);
    
    // Calculate duration from start/end when missing
    const getSessionDuration = (s: Session) => {
      if (s.duration && s.duration > 0) return s.duration;
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    };
    
    const totalMinutes = daySessions.reduce((acc, s) => acc + getSessionDuration(s), 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
    const uniqueCourts = new Set(daySessions.map(s => s.courtId).filter(Boolean)).size;
    
    // Calculate time distribution by DURATION (morning: 6-12, afternoon: 12-17, evening: 17-23)
    let morningMinutes = 0;
    let afternoonMinutes = 0;
    let eveningMinutes = 0;
    
    daySessions.forEach(s => {
      const startTime = new Date(s.startTime);
      const endTime = new Date(s.endTime);
      const duration = getSessionDuration(s);
      
      // Use decimal hours for accurate period allocation
      const startDecimal = startTime.getHours() + startTime.getMinutes() / 60;
      const endDecimal = endTime.getHours() + endTime.getMinutes() / 60;
      const sessionSpan = endDecimal - startDecimal || 1;
      
      // Morning: 6-12, Afternoon: 12-17, Evening: 17-23
      // Calculate overlap with each period using clamped interval
      const morningOverlap = Math.max(0, Math.min(endDecimal, 12) - Math.max(startDecimal, 6));
      const afternoonOverlap = Math.max(0, Math.min(endDecimal, 17) - Math.max(startDecimal, 12));
      const eveningOverlap = Math.max(0, Math.min(endDecimal, 23) - Math.max(startDecimal, 17));
      
      // Distribute duration proportionally to overlap
      morningMinutes += (morningOverlap / sessionSpan) * duration;
      afternoonMinutes += (afternoonOverlap / sessionSpan) * duration;
      eveningMinutes += (eveningOverlap / sessionSpan) * duration;
    });
    
    // Normalize to fill levels (max 3 hours = 180 min as full bar)
    const maxPeriodMinutes = 180;
    const morningFill = Math.min(1, morningMinutes / maxPeriodMinutes);
    const afternoonFill = Math.min(1, afternoonMinutes / maxPeriodMinutes);
    const eveningFill = Math.min(1, eveningMinutes / maxPeriodMinutes);
    
    // Calculate energy level based on total hours AND back-to-back detection
    let backToBackCount = 0;
    const sortedSessions = [...daySessions].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    for (let i = 1; i < sortedSessions.length; i++) {
      const prevEnd = new Date(sortedSessions[i - 1].endTime).getTime();
      const currStart = new Date(sortedSessions[i].startTime).getTime();
      const gap = (currStart - prevEnd) / (1000 * 60); // gap in minutes
      if (gap < 15) backToBackCount++;
    }
    
    // Energy scoring: hours + back-to-back penalty
    const loadScore = totalHours + (backToBackCount * 0.5);
    let energyLevel: "green" | "orange" | "red" = "green";
    if (loadScore >= 7 || totalHours >= 8) {
      energyLevel = "red";
    } else if (loadScore >= 4.5 || totalHours >= 5) {
      energyLevel = "orange";
    }
    
    return {
      sessions: daySessions.length,
      totalMinutes,
      totalHours,
      courts: uniqueCourts,
      energyLevel,
      morningFill,
      afternoonFill,
      eveningFill,
      morningMinutes: Math.round(morningMinutes),
      afternoonMinutes: Math.round(afternoonMinutes),
      eveningMinutes: Math.round(eveningMinutes),
      backToBackCount,
      loadScore,
    };
  };

  const getEnergyColor = (level: "green" | "orange" | "red") => {
    switch (level) {
      case "green": return Colors.dark.primary;
      case "orange": return Colors.dark.gold;
      case "red": return Colors.dark.error;
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setViewMode("day");
  };

  const handleAttendance = (session: Session) => {
    setSelectedSessionForAttendance(session);
  };

  const handleExtendSession = (session: Session) => {
    console.log("Extend session:", session.id);
  };

  const handleEndSession = (session: Session) => {
    console.log("End session:", session.id);
  };

  const handleSessionLongPress = (session: Session) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const now = new Date();
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);
    const isActive = now >= startTime && now < endTime;
    const isUpcoming = now < startTime;
    const isPast = now >= endTime;
    
    const options: { text: string; onPress?: () => void; style?: "cancel" | "default" | "destructive" }[] = [
      { text: "Cancel", style: "cancel" },
    ];
    
    if (isActive || isPast) {
      options.unshift({
        text: "Mark Attendance",
        onPress: () => handleAttendance(session),
      });
    }
    
    if (isActive) {
      options.unshift({
        text: "Extend Session (+15m)",
        onPress: () => handleExtendSession(session),
      });
      options.unshift({
        text: "End Session Now",
        onPress: () => handleEndSession(session),
        style: "destructive",
      });
    }
    
    if (isUpcoming) {
      options.unshift({
        text: "Cancel Session",
        onPress: () => {
          Alert.alert(
            "Cancel Session",
            "Are you sure you want to cancel this session?",
            [
              { text: "No", style: "cancel" },
              { text: "Yes, Cancel", style: "destructive", onPress: () => console.log("Cancel:", session.id) },
            ]
          );
        },
        style: "destructive",
      });
    }
    
    const sessionType = session.sessionType === "private" ? "Private" : 
                       session.sessionType === "semi_private" ? "Semi-Private" : 
                       session.sessionType === "group" ? "Group" : session.sessionType;
    
    Alert.alert(
      `${sessionType} Session`,
      `${new Date(session.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} - ${new Date(session.endTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`,
      options
    );
  };

  const getCurrentTimePosition = () => {
    if (!isToday) return null;
    const now = new Date();
    const currentHours = now.getHours() + now.getMinutes() / 60;
    if (currentHours < focusBaseHour || currentHours > END_HOUR) return null;
    return (currentHours - focusBaseHour) * hourHeight;
  };

  const nowPosition = getCurrentTimePosition();

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case "private":
        return Colors.dark.primary;
      case "semi":
        return Colors.dark.xpCyan;
      case "group":
        return Colors.dark.orange;
      case "physical":
        return Colors.dark.gold;
      default:
        return Colors.dark.primary;
    }
  };

  if (!coach) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.noCoachContainer}>
          {coachesLoading ? (
            <>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
              <Text style={styles.noCoachText}>Loading coaches...</Text>
            </>
          ) : coaches.length === 0 ? (
            <>
              <Ionicons name="person-circle-outline" size={80} color={Colors.dark.disabled} />
              <Text style={styles.noCoachText}>No coaches found</Text>
              <Text style={styles.noCoachSubtext}>Please add a coach to the system first</Text>
            </>
          ) : (
            <>
              <Text style={styles.noCoachText}>Select a Coach</Text>
              <View style={styles.coachList}>
                {coaches.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.coachItem}
                    onPress={() => setCoach(c)}
                  >
                    <Ionicons name="person-circle" size={40} color={Colors.dark.primary} />
                    <View style={styles.coachInfo}>
                      <Text style={styles.coachName}>{c.name}</Text>
                      <Text style={styles.coachEmail}>{c.email}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={Colors.dark.disabled} />
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Coach Calendar</Text>
          {viewMode === "day" && (
            <View style={styles.headerActions}>
              <Pressable
                style={[styles.toggleButton, focusMode && styles.toggleActive]}
                onPress={() => setFocusMode(!focusMode)}
              >
                <Ionicons
                  name="eye-outline"
                  size={18}
                  color={focusMode ? Colors.dark.backgroundRoot : Colors.dark.text}
                />
              </Pressable>
              <Pressable
                style={styles.gridToggle}
                onPress={() => setTimeGrid(timeGrid === 30 ? 60 : 30)}
              >
                <Text style={styles.gridToggleText}>{timeGrid}m</Text>
              </Pressable>
            </View>
          )}
          {viewMode === "week" && (
            <View style={styles.weekModeToggle}>
              <Pressable
                style={[styles.weekModeButton, weekMode === "overview" && styles.weekModeButtonActive]}
                onPress={() => setWeekMode("overview")}
              >
                <Ionicons name="analytics-outline" size={14} color={weekMode === "overview" ? Colors.dark.backgroundRoot : Colors.dark.text} />
                <Text style={[styles.weekModeText, weekMode === "overview" && styles.weekModeTextActive]}>Overview</Text>
              </Pressable>
              <Pressable
                style={[styles.weekModeButton, weekMode === "availability" && styles.weekModeButtonActive]}
                onPress={() => setWeekMode("availability")}
              >
                <Ionicons name="time-outline" size={14} color={weekMode === "availability" ? Colors.dark.backgroundRoot : Colors.dark.text} />
                <Text style={[styles.weekModeText, weekMode === "availability" && styles.weekModeTextActive]}>Slots</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Date Navigation */}
        <View style={styles.dateNav}>
          <Pressable 
            style={styles.dateNavButton} 
            onPress={() => {
              if (viewMode === "day") changeDate(-1);
              else if (viewMode === "week") changeWeek(-1);
              else changeMonth(-1);
            }}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Pressable style={styles.dateDisplay} onPress={goToToday}>
            <Text style={styles.dateText}>
              {viewMode === "day" && formatDate(selectedDate)}
              {viewMode === "week" && formatWeekRange(weekDates)}
              {viewMode === "month" && formatMonthYear(selectedDate)}
            </Text>
            {selectedDate.toDateString() === new Date().toDateString() && viewMode === "day" && (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>TODAY</Text>
              </View>
            )}
          </Pressable>
          <Pressable 
            style={styles.dateNavButton} 
            onPress={() => {
              if (viewMode === "day") changeDate(1);
              else if (viewMode === "week") changeWeek(1);
              else changeMonth(1);
            }}
          >
            <Ionicons name="chevron-forward" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>

        {/* View Mode Toggle */}
        <View style={styles.viewToggle}>
          {(["day", "week", "month"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.viewButton, viewMode === mode && styles.viewButtonActive]}
              onPress={() => setViewMode(mode)}
            >
              <Text
                style={[
                  styles.viewButtonText,
                  viewMode === mode && styles.viewButtonTextActive,
                ]}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Now Playing Card - only in day view */}
      {viewMode === "day" && (
        <NowPlayingCard
          sessions={ownSessions}
          courts={courts}
          selectedDate={selectedDate}
          onAttendance={handleAttendance}
          onExtend={handleExtendSession}
          onEnd={handleEndSession}
        />
      )}

      {/* DAY VIEW */}
      {viewMode === "day" && (
        <>
          {/* Court Headers */}
          <View style={styles.courtHeaders}>
            <View style={styles.timeColumnHeader} />
            {courts.map((court) => (
              <View key={court.id} style={styles.courtHeader}>
                <Text style={styles.courtHeaderText}>{court.name}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <ScrollView style={styles.calendarScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.calendarGrid}>
              {/* Time Column */}
              <View style={styles.timeColumn}>
                {hours.map((hour) => (
                  <View key={hour} style={[styles.timeSlot, { height: hourHeight }]}>
                    <Text style={styles.timeText}>{formatTime(hour)}</Text>
                  </View>
                ))}
              </View>

              {/* Court Lanes */}
              <View style={styles.courtLanesContainer}>
                {courts.map((court, courtIndex) => (
                  <View key={court.id} style={styles.courtLane}>
                    {/* Hour grid lines and clickable slots */}
                    {hours.map((hour) => (
                      <Pressable
                        key={hour}
                        style={[styles.hourSlot, { height: hourHeight }]}
                        onPress={() => handleSlotPress(court.id, hour)}
                      >
                        <View style={styles.hourLine} />
                        {timeGrid === 30 && <View style={[styles.halfHourLine, { top: hourHeight / 2 }]} />}
                      </Pressable>
                    ))}

                    {/* Render sessions for this court */}
                    {ownSessions
                      .filter((s) => s.courtId === court.id)
                      .map((session) => {
                        const { top, height } = getSessionPosition(session);
                        const now = new Date();
                        const sessionEnd = new Date(session.endTime);
                        const sessionStart = new Date(session.startTime);
                        const isPast = sessionEnd < now;
                        const isActive = now >= sessionStart && now < sessionEnd;
                        const sessionLabel = session.sessionType === "private" ? "Private" :
                                            session.sessionType === "semi_private" ? "Semi" :
                                            session.sessionType === "group" ? "Group" :
                                            session.sessionType === "physical" ? "Physical" :
                                            session.sessionType;
                        return (
                          <Pressable
                            key={session.id}
                            onPress={() => handleAttendance(session)}
                            onLongPress={() => handleSessionLongPress(session)}
                            delayLongPress={300}
                            style={[
                              styles.sessionBlock,
                              {
                                top,
                                height: height - 2,
                                backgroundColor: getSessionTypeColor(session.sessionType),
                                opacity: isPast ? 0.5 : 1,
                              },
                              isActive && styles.sessionBlockActive,
                            ]}
                          >
                            <Text style={styles.sessionText} numberOfLines={1}>
                              {sessionLabel}
                            </Text>
                            <Text style={styles.sessionTime} numberOfLines={1}>
                              {new Date(session.startTime).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })}
                            </Text>
                          </Pressable>
                        );
                      })}

                    {/* Render blocked sessions */}
                    {blockedSessions
                      .filter((s) => s.courtId === court.id)
                      .map((session) => {
                        const { top, height } = getSessionPosition(session);
                        return (
                          <View
                            key={session.id}
                            style={[styles.blockedBlock, { top, height: height - 2 }]}
                          >
                            <Text style={styles.blockedText}>Unavailable</Text>
                          </View>
                        );
                      })}
                  </View>
                ))}

                {/* Now Line */}
                {nowPosition !== null && isToday && (
                  <View style={[styles.nowLine, { top: nowPosition }]}>
                    <PulsingDot />
                    <View style={styles.nowLineBar} />
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </>
      )}

      {/* WEEK VIEW - OVERVIEW MODE */}
      {viewMode === "week" && weekMode === "overview" && (
        <ScrollView 
          style={styles.calendarScroll} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.weekCardsContainer}
        >
          {weekDates.map((date, idx) => {
            const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const isToday = date.toDateString() === new Date().toDateString();
            const stats = getDayStats(date);
            const energyColor = getEnergyColor(stats.energyLevel);
            
            return (
              <Pressable 
                key={idx} 
                style={[styles.dayCard, isToday && styles.dayCardToday]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleDateSelect(date);
                }}
              >
                {/* Card Header */}
                <View style={styles.dayCardHeader}>
                  <View style={styles.dayCardDateInfo}>
                    <Text style={[styles.dayCardDayName, isToday && styles.dayCardDayNameToday]}>
                      {dayNames[idx]}
                    </Text>
                    <Text style={styles.dayCardDate}>{date.getDate()}</Text>
                  </View>
                  <View style={[styles.energyIndicator, { backgroundColor: energyColor + "30" }]}>
                    <View style={[styles.energyFill, { backgroundColor: energyColor, width: `${Math.min(100, stats.totalHours * 12.5)}%` }]} />
                  </View>
                </View>

                {/* Time Distribution */}
                <View style={styles.timeDistribution}>
                  <View style={styles.timeZone}>
                    <View style={[styles.timeBar, { height: `${stats.morningFill * 100}%`, backgroundColor: stats.morningMinutes > 0 ? Colors.dark.xpCyan : Colors.dark.backgroundTertiary }]} />
                    <Text style={styles.timeZoneLabel}>AM</Text>
                  </View>
                  <View style={styles.timeZone}>
                    <View style={[styles.timeBar, { height: `${stats.afternoonFill * 100}%`, backgroundColor: stats.afternoonMinutes > 0 ? Colors.dark.primary : Colors.dark.backgroundTertiary }]} />
                    <Text style={styles.timeZoneLabel}>PM</Text>
                  </View>
                  <View style={styles.timeZone}>
                    <View style={[styles.timeBar, { height: `${stats.eveningFill * 100}%`, backgroundColor: stats.eveningMinutes > 0 ? Colors.dark.gold : Colors.dark.backgroundTertiary }]} />
                    <Text style={styles.timeZoneLabel}>EVE</Text>
                  </View>
                </View>

                {/* Mini Stats */}
                <View style={styles.dayCardStats}>
                  <View style={styles.dayCardStat}>
                    <Ionicons name="calendar-outline" size={12} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.dayCardStatText}>{stats.sessions}</Text>
                  </View>
                  <View style={styles.dayCardStat}>
                    <Ionicons name="tennisball-outline" size={12} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.dayCardStatText}>{stats.courts}</Text>
                  </View>
                  <View style={styles.dayCardStat}>
                    <Ionicons name="time-outline" size={12} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.dayCardStatText}>{stats.totalHours}h</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* WEEK VIEW - AVAILABILITY MODE */}
      {viewMode === "week" && weekMode === "availability" && (
        <View style={styles.availabilityContainer}>
          {/* Next Free Slots Quick Scan */}
          {(() => {
            const freeSlots: { date: Date; courtId: string; courtName: string; hour: number }[] = [];
            const slotHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
            
            weekDates.forEach(date => {
              const daySessions = getSessionsForDate(date);
              courts.forEach(court => {
                slotHours.forEach(hour => {
                  const slotStart = new Date(date);
                  slotStart.setHours(hour, 0, 0, 0);
                  const slotEnd = new Date(date);
                  slotEnd.setHours(hour + 1, 0, 0, 0);
                  
                  const isOccupied = daySessions.some(s => {
                    const sStart = new Date(s.startTime);
                    const sEnd = new Date(s.endTime);
                    return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                  });
                  
                  if (!isOccupied && freeSlots.length < 4) {
                    freeSlots.push({ date, courtId: court.id, courtName: court.name, hour });
                  }
                });
              });
            });
            
            return freeSlots.length > 0 ? (
              <View style={styles.freeSlotsBar}>
                <Text style={styles.freeSlotsLabel}>Next free:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {freeSlots.slice(0, 4).map((slot, i) => (
                    <Pressable 
                      key={i} 
                      style={styles.freeSlotChip}
                      onPress={() => {
                        const slotDate = new Date(slot.date);
                        slotDate.setHours(slot.hour, 0, 0, 0);
                        setSelectedSlot({ courtId: slot.courtId, time: slotDate });
                        setShowCreateDrawer(true);
                      }}
                    >
                      <Text style={styles.freeSlotText}>
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][slot.date.getDay()]} {formatTime(slot.hour)}
                      </Text>
                      <Text style={styles.freeSlotCourt}>{slot.courtName}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null;
          })()}
          
          {/* Availability Grid */}
          <ScrollView style={styles.calendarScroll} showsVerticalScrollIndicator={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.availabilityGrid}>
                {/* Time Column */}
                <View style={styles.availTimeColumn}>
                  <View style={styles.availCornerCell} />
                  {[8, 10, 12, 14, 16, 18, 20].map(hour => (
                    <View key={hour} style={styles.availTimeCell}>
                      <Text style={styles.availTimeText}>{formatTime(hour)}</Text>
                    </View>
                  ))}
                </View>
                
                {/* Day Columns */}
                {weekDates.map((date, dayIdx) => {
                  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                  const isToday = date.toDateString() === new Date().toDateString();
                  const daySessions = getSessionsForDate(date);
                  
                  return (
                    <View key={dayIdx} style={styles.availDayColumn}>
                      {/* Day Header */}
                      <View style={[styles.availDayHeader, isToday && styles.availDayHeaderToday]}>
                        <Text style={[styles.availDayName, isToday && styles.availDayNameToday]}>{dayNames[dayIdx]}</Text>
                        <Text style={styles.availDayDate}>{date.getDate()}</Text>
                      </View>
                      
                      {/* Time Blocks (2-hour chunks) */}
                      {[8, 10, 12, 14, 16, 18, 20].map(hour => {
                        const blockStart = new Date(date);
                        blockStart.setHours(hour, 0, 0, 0);
                        const blockEnd = new Date(date);
                        blockEnd.setHours(hour + 2, 0, 0, 0);
                        
                        // Check occupancy per court
                        const courtOccupancy = courts.map(court => {
                          const occupied = daySessions.some(s => {
                            const sStart = new Date(s.startTime);
                            const sEnd = new Date(s.endTime);
                            return s.courtId === court.id && sStart < blockEnd && sEnd > blockStart;
                          });
                          return { court, occupied };
                        });
                        
                        const allFree = courtOccupancy.every(c => !c.occupied);
                        const allBusy = courtOccupancy.every(c => c.occupied);
                        const partialFree = !allFree && !allBusy;
                        
                        return (
                          <Pressable 
                            key={hour} 
                            style={[
                              styles.availBlock,
                              allFree && styles.availBlockFree,
                              allBusy && styles.availBlockBusy,
                              partialFree && styles.availBlockPartial,
                            ]}
                            onPress={() => {
                              if (!allBusy) {
                                const freeCourt = courtOccupancy.find(c => !c.occupied);
                                if (freeCourt) {
                                  setSelectedSlot({ courtId: freeCourt.court.id, time: blockStart });
                                  setShowCreateDrawer(true);
                                }
                              }
                            }}
                          >
                            {/* Mini court indicators */}
                            <View style={styles.courtIndicators}>
                              {courtOccupancy.map((co, i) => (
                                <View 
                                  key={i} 
                                  style={[
                                    styles.courtDot,
                                    co.occupied ? styles.courtDotBusy : styles.courtDotFree
                                  ]} 
                                />
                              ))}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      )}

      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <ScrollView style={styles.calendarScroll} showsVerticalScrollIndicator={false}>
          {/* Month Day Headers */}
          <View style={styles.monthDayHeaders}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <Text key={day} style={styles.monthDayHeaderText}>{day}</Text>
            ))}
          </View>

          {/* Month Grid */}
          {monthDates.map((week, weekIdx) => {
            // Calculate week load for background tint using raw minutes for precision
            const weekDates = week.filter(d => d !== null) as Date[];
            const weekSessions = weekDates.flatMap(d => getSessionsForDate(d));
            const getSessionDuration = (s: Session) => {
              if (s.duration && s.duration > 0) return s.duration;
              const start = new Date(s.startTime);
              const end = new Date(s.endTime);
              return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
            };
            const weekTotalMinutes = weekSessions.reduce((acc, s) => acc + getSessionDuration(s), 0);
            const weekAvgMinutesPerDay = weekDates.length > 0 ? weekTotalMinutes / weekDates.length : 0;
            const weekIsHeavy = weekAvgMinutesPerDay >= 300; // 5 hours = 300 min
            const weekIsBusy = weekAvgMinutesPerDay >= 180; // 3 hours = 180 min
            
            return (
              <View 
                key={weekIdx} 
                style={[
                  styles.monthWeekRow,
                  weekIsHeavy && styles.monthWeekHeavy,
                  !weekIsHeavy && weekIsBusy && styles.monthWeekBusy,
                ]}
              >
                {week.map((date, dayIdx) => {
                  if (!date) {
                    return <View key={dayIdx} style={styles.monthDayEmpty} />;
                  }
                  const stats = getDayStats(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const loadColor = getEnergyColor(stats.energyLevel);
                  // Use raw minutes for precise bar height: 480 min (8h) = full bar
                  const loadHeight = Math.min(100, (stats.totalMinutes / 480) * 100);
                  
                  return (
                    <Pressable 
                      key={dayIdx} 
                      style={[
                        styles.monthDay, 
                        isWeekend && styles.monthDayWeekend,
                        isToday && styles.monthDayToday, 
                        isSelected && styles.monthDaySelected
                      ]}
                      onPress={() => handleDateSelect(date)}
                    >
                      {/* Date number (small, top-left) */}
                      <Text style={[
                        styles.monthDayNumber, 
                        isWeekend && styles.monthDayNumberWeekend,
                        isToday && styles.monthDayNumberToday
                      ]}>
                        {date.getDate()}
                      </Text>
                      
                      {/* Load bar (main visual element) */}
                      <View style={styles.monthLoadContainer}>
                        <View 
                          style={[
                            styles.monthLoadBar, 
                            { 
                              height: `${loadHeight}%`, 
                              backgroundColor: stats.totalHours > 0 ? loadColor : Colors.dark.backgroundTertiary 
                            }
                          ]} 
                        />
                      </View>
                      
                      {/* Hours stat (bottom) */}
                      {stats.totalHours > 0 && (
                        <Text style={styles.monthHoursText}>{stats.totalHours}h</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      {/* Create Session Drawer */}
      <CreateSessionDrawer
        visible={showCreateDrawer}
        onClose={() => {
          setShowCreateDrawer(false);
          setSelectedSlot(null);
        }}
        initialCourtId={selectedSlot?.courtId}
        initialTime={selectedSlot?.time}
      />

      {/* Attendance Drawer */}
      <AttendanceDrawer
        visible={!!selectedSessionForAttendance}
        session={selectedSessionForAttendance}
        onClose={() => setSelectedSessionForAttendance(null)}
        onSave={() => {
          setSelectedSessionForAttendance(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  noCoachContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  noCoachText: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
  },
  noCoachSubtext: {
    ...Typography.body,
    color: Colors.dark.disabled,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  toggleButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleActive: {
    backgroundColor: Colors.dark.primary,
  },
  gridToggle: {
    paddingHorizontal: Spacing.md,
    height: 36,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  gridToggleText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  dateNavButton: {
    padding: Spacing.sm,
  },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  dateText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  todayBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  todayBadgeText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    padding: 2,
  },
  viewButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: BorderRadius.xs - 2,
  },
  viewButtonActive: {
    backgroundColor: Colors.dark.primary,
  },
  viewButtonText: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  viewButtonTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  courtHeaders: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  timeColumnHeader: {
    width: TIME_COLUMN_WIDTH,
  },
  courtHeader: {
    width: COURT_LANE_WIDTH,
    alignItems: "center",
  },
  courtHeaderText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  calendarScroll: {
    flex: 1,
  },
  calendarGrid: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
  },
  timeColumn: {
    width: TIME_COLUMN_WIDTH,
  },
  timeSlot: {
    height: HOUR_HEIGHT_60,
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  timeText: {
    ...Typography.caption,
    color: Colors.dark.disabled,
  },
  courtLanesContainer: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
  },
  courtLane: {
    width: COURT_LANE_WIDTH,
    position: "relative",
    borderLeftWidth: 1,
    borderLeftColor: Colors.dark.backgroundTertiary,
  },
  hourSlot: {
    height: HOUR_HEIGHT_60,
    position: "relative",
  },
  hourLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  halfHourLine: {
    position: "absolute",
    top: HOUR_HEIGHT_60 / 2,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
    opacity: 0.5,
  },
  sessionBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.xs,
    padding: Spacing.xs,
    overflow: "hidden",
  },
  sessionBlockActive: {
    borderWidth: 2,
    borderColor: Colors.dark.text,
  },
  sessionText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  sessionTime: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    opacity: 0.8,
    fontSize: 10,
  },
  blockedBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(100, 100, 100, 0.3)",
    padding: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderStyle: "dashed",
    overflow: "hidden",
  },
  blockedText: {
    ...Typography.caption,
    color: Colors.dark.disabled,
    fontStyle: "italic",
    textAlign: "center",
  },
  nowLine: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 100,
  },
  nowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.error,
    marginLeft: -5,
  },
  nowLineBar: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.dark.error,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  coachList: {
    width: "100%",
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  coachItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  coachInfo: {
    flex: 1,
  },
  coachName: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  coachEmail: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  weekCardsContainer: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dayCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  dayCardToday: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  dayCardHeader: {
    width: 70,
    alignItems: "center",
  },
  dayCardDateInfo: {
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  dayCardDayName: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  dayCardDayNameToday: {
    color: Colors.dark.primary,
  },
  dayCardDate: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  energyIndicator: {
    width: 60,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  energyFill: {
    height: "100%",
    borderRadius: 3,
  },
  timeDistribution: {
    flex: 1,
    flexDirection: "row",
    height: 50,
    gap: Spacing.xs,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  timeZone: {
    alignItems: "center",
    width: 30,
    height: "100%",
    justifyContent: "flex-end",
  },
  timeBar: {
    width: 20,
    borderRadius: 4,
    minHeight: 4,
  },
  timeZoneLabel: {
    ...Typography.caption,
    fontSize: 9,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  dayCardStats: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  dayCardStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dayCardStatText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  monthDayHeaders: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  monthDayHeaderText: {
    flex: 1,
    ...Typography.caption,
    color: Colors.dark.disabled,
    textAlign: "center",
    fontWeight: "600",
  },
  monthWeekRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
  },
  monthWeekHeavy: {
    backgroundColor: Colors.dark.error + "08",
  },
  monthWeekBusy: {
    backgroundColor: Colors.dark.gold + "08",
  },
  monthDay: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
    minHeight: 80,
    justifyContent: "space-between",
  },
  monthDayEmpty: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
    minHeight: 80,
  },
  monthDayToday: {
    backgroundColor: Colors.dark.primary + "15",
  },
  monthDayWeekend: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  monthDaySelected: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
  },
  monthDayNumber: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "500",
    alignSelf: "flex-start",
  },
  monthDayNumberWeekend: {
    color: Colors.dark.disabled,
  },
  monthDayNumberToday: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  monthLoadContainer: {
    flex: 1,
    width: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
    marginVertical: 4,
  },
  monthLoadBar: {
    width: "100%",
    borderRadius: 4,
  },
  monthHoursText: {
    ...Typography.caption,
    fontSize: 9,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  // Week mode toggle styles
  weekModeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    padding: 2,
  },
  weekModeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs - 2,
    gap: 4,
  },
  weekModeButtonActive: {
    backgroundColor: Colors.dark.primary,
  },
  weekModeText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  weekModeTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  // Availability mode styles
  availabilityContainer: {
    flex: 1,
  },
  freeSlotsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: Spacing.sm,
  },
  freeSlotsLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  freeSlotChip: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  freeSlotText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  freeSlotCourt: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  availabilityGrid: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  availTimeColumn: {
    width: 45,
  },
  availCornerCell: {
    height: 50,
  },
  availTimeCell: {
    height: 50,
    justifyContent: "center",
  },
  availTimeText: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.disabled,
  },
  availDayColumn: {
    width: 48,
    marginHorizontal: 2,
  },
  availDayHeader: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xs,
    marginBottom: 2,
  },
  availDayHeaderToday: {
    backgroundColor: Colors.dark.primary + "30",
  },
  availDayName: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
  },
  availDayNameToday: {
    color: Colors.dark.primary,
  },
  availDayDate: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  availBlock: {
    height: 50,
    borderRadius: BorderRadius.xs,
    marginBottom: 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  availBlockFree: {
    backgroundColor: Colors.dark.primary + "15",
    borderColor: Colors.dark.primary + "30",
  },
  availBlockBusy: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderColor: Colors.dark.backgroundTertiary,
  },
  availBlockPartial: {
    backgroundColor: Colors.dark.gold + "15",
    borderColor: Colors.dark.gold + "30",
  },
  courtIndicators: {
    flexDirection: "row",
    gap: 3,
  },
  courtDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  courtDotFree: {
    backgroundColor: Colors.dark.primary,
  },
  courtDotBusy: {
    backgroundColor: Colors.dark.disabled,
  },
});
