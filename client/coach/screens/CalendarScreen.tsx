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
  const [monthMode, setMonthMode] = useState<"load" | "availability">("load");

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
      case "semi_private":
        return Colors.dark.xpCyan;
      case "group":
        return Colors.dark.orange;
      case "physical":
        return Colors.dark.gold;
      default:
        return Colors.dark.primary;
    }
  };

  const getSessionTypeGradient = (type: string): [string, string] => {
    switch (type) {
      case "private":
        return ["#3AE374", "#1E8449"];
      case "semi_private":
        return ["#00E5FF", "#0097A7"];
      case "group":
        return ["#FF8A50", "#D84315"];
      case "physical":
        return ["#FFD54F", "#F9A825"];
      default:
        return ["#3AE374", "#1E8449"];
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

                    {/* Render sessions for this court (or unassigned sessions in first court) */}
                    {ownSessions
                      .filter((s) => s.courtId === court.id || (s.courtId === null && courtIndex === 0))
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
                        const gradientColors = getSessionTypeGradient(session.sessionType);
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
                                height: height - 4,
                                opacity: isPast ? 0.5 : 1,
                              },
                              isActive && styles.sessionBlockActive,
                            ]}
                          >
                            <LinearGradient
                              colors={gradientColors}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.sessionGradient}
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
                            </LinearGradient>
                          </Pressable>
                        );
                      })}

                    {/* Render blocked sessions */}
                    {blockedSessions
                      .filter((s) => s.courtId === court.id || (s.courtId === null && courtIndex === 0))
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

      {/* WEEK VIEW - AVAILABILITY MODE (Energy Bands) */}
      {viewMode === "week" && weekMode === "availability" && (
        <View style={styles.availabilityContainer}>
          {/* Energy Bands - Fluid visualization */}
          <View style={styles.energyBandsContainer}>
            {weekDates.map((date, dayIdx) => {
              const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
              const isToday = date.toDateString() === new Date().toDateString();
              const isSelected = date.toDateString() === selectedDate.toDateString();
              const daySessions = getSessionsForDate(date);
              
              // Calculate availability: total possible hours vs booked hours
              const totalHours = 14; // 8:00 - 22:00
              const totalSlots = totalHours * courts.length;
              
              let bookedSlots = 0;
              for (let hour = 8; hour < 22; hour++) {
                const slotStart = new Date(date);
                slotStart.setHours(hour, 0, 0, 0);
                const slotEnd = new Date(date);
                slotEnd.setHours(hour + 1, 0, 0, 0);
                
                courts.forEach(court => {
                  const isOccupied = daySessions.some(s => {
                    const sStart = new Date(s.startTime);
                    const sEnd = new Date(s.endTime);
                    return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                  });
                  if (isOccupied) bookedSlots++;
                });
              }
              
              const availabilityPercent = Math.max(0, (totalSlots - bookedSlots) / totalSlots * 100);
              const freeHours = Math.round(((totalSlots - bookedSlots) / courts.length));
              
              // Energy color based on availability
              const energyColor = availabilityPercent > 60 
                ? Colors.dark.primary 
                : availabilityPercent > 30 
                  ? Colors.dark.gold 
                  : "#FF6B6B";
              
              // Find first free slot for this day
              const findFirstFreeSlot = () => {
                for (let hour = 8; hour < 22; hour++) {
                  const slotStart = new Date(date);
                  slotStart.setHours(hour, 0, 0, 0);
                  const slotEnd = new Date(date);
                  slotEnd.setHours(hour + 1, 0, 0, 0);
                  
                  for (const court of courts) {
                    const isOccupied = daySessions.some(s => {
                      const sStart = new Date(s.startTime);
                      const sEnd = new Date(s.endTime);
                      return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                    });
                    if (!isOccupied) {
                      return { courtId: court.id, time: slotStart };
                    }
                  }
                }
                return null;
              };
              
              return (
                <Pressable 
                  key={dayIdx} 
                  style={[
                    styles.energyBandColumn,
                    isToday && styles.energyBandToday,
                    isSelected && styles.energyBandSelected,
                  ]}
                  onPress={() => {
                    // First tap selects the date and switches to day view
                    setSelectedDate(date);
                    setViewMode("day");
                  }}
                  onLongPress={() => {
                    // Long press opens create drawer with first free slot
                    setSelectedDate(date);
                    const freeSlot = findFirstFreeSlot();
                    if (freeSlot) {
                      setSelectedSlot(freeSlot);
                      setShowCreateDrawer(true);
                    }
                  }}
                  delayLongPress={300}
                >
                  {/* Day Label */}
                  <View style={styles.energyBandHeader}>
                    <Text style={[styles.energyBandDayName, isToday && styles.energyBandDayNameToday]}>
                      {dayNames[dayIdx]}
                    </Text>
                    <Text style={[styles.energyBandDate, isToday && styles.energyBandDateToday]}>
                      {date.getDate()}
                    </Text>
                  </View>
                  
                  {/* Energy Bar - Gradient fill from bottom */}
                  <View style={styles.energyBarContainer}>
                    <LinearGradient
                      colors={[
                        energyColor + "00",
                        energyColor + "15",
                        energyColor + "40",
                      ]}
                      style={[
                        styles.energyBarFill,
                        { height: `${availabilityPercent}%` }
                      ]}
                    />
                    
                    {/* Subtle glow at top of energy */}
                    {availabilityPercent > 10 && (
                      <View 
                        style={[
                          styles.energyBarGlow,
                          { 
                            bottom: `${availabilityPercent - 5}%`,
                            backgroundColor: energyColor,
                            shadowColor: energyColor,
                          }
                        ]} 
                      />
                    )}
                  </View>
                  
                  {/* Availability Label */}
                  <View style={styles.energyBandFooter}>
                    <Text style={[styles.energyBandHours, { color: energyColor }]}>
                      {freeHours}h
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          
          {/* Subtle time hint at bottom */}
          <View style={styles.energyTimeHint}>
            <Text style={styles.energyTimeHintText}>8:00</Text>
            <View style={styles.energyTimeHintLine} />
            <Text style={styles.energyTimeHintText}>22:00</Text>
          </View>
        </View>
      )}

      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <View style={{ flex: 1 }}>
          {/* Month Mode Toggle */}
          <View style={styles.monthModeToggle}>
            <Pressable
              style={[styles.monthModeButton, monthMode === "load" && styles.monthModeButtonActive]}
              onPress={() => setMonthMode("load")}
            >
              <Ionicons name="flame-outline" size={14} color={monthMode === "load" ? Colors.dark.backgroundRoot : Colors.dark.text} />
              <Text style={[styles.monthModeText, monthMode === "load" && styles.monthModeTextActive]}>Load</Text>
            </Pressable>
            <Pressable
              style={[styles.monthModeButton, monthMode === "availability" && styles.monthModeButtonActive]}
              onPress={() => setMonthMode("availability")}
            >
              <Ionicons name="calendar-outline" size={14} color={monthMode === "availability" ? Colors.dark.backgroundRoot : Colors.dark.text} />
              <Text style={[styles.monthModeText, monthMode === "availability" && styles.monthModeTextActive]}>Availability</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.calendarScroll} showsVerticalScrollIndicator={false}>
            {/* Month Day Headers */}
            <View style={styles.monthDayHeaders}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <Text key={day} style={styles.monthDayHeaderText}>{day}</Text>
              ))}
            </View>

            {/* Month Grid */}
            {monthDates.map((week, weekIdx) => {
              return (
                <View key={weekIdx} style={styles.monthWeekRowPremium}>
                  {week.map((date, dayIdx) => {
                    if (!date) {
                      return <View key={dayIdx} style={styles.monthDayCardEmpty} />;
                    }
                    const stats = getDayStats(date);
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isSelected = date.toDateString() === selectedDate.toDateString();
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    
                    // Load mode: gradient fill based on hours
                    const loadHeight = Math.min(100, (stats.totalMinutes / 480) * 100);
                    const loadGradient: [string, string] = stats.totalMinutes >= 360 
                      ? ["#FF6B35", "#D84315"] // Heavy: orange-red
                      : stats.totalMinutes >= 240 
                        ? ["#FFD54F", "#F9A825"] // Busy: amber
                        : stats.totalMinutes > 0 
                          ? ["#3AE374", "#1E8449"] // Normal: green
                          : ["transparent", "transparent"];
                    
                    // Availability mode: derive status from actual booked hours
                    // Capacity assumption: 8 hours max per day, each slot = ~1 hour
                    const maxCapacity = 8;
                    const bookedHours = stats.totalHours;
                    const freeHours = Math.max(0, maxCapacity - bookedHours);
                    // Thresholds: 5+ free hours = open, 2-4 = limited, <2 = full
                    const availabilityStatus = freeHours >= 5 ? "open" : freeHours >= 2 ? "limited" : "full";
                    // Display remaining slots (only if actually open/limited)
                    const displaySlots = Math.floor(freeHours);
                    
                    return (
                      <Pressable 
                        key={dayIdx} 
                        style={[
                          styles.monthDayCard, 
                          isWeekend && styles.monthDayCardWeekend,
                          isToday && styles.monthDayCardToday, 
                          isSelected && styles.monthDayCardSelected
                        ]}
                        onPress={() => handleDateSelect(date)}
                      >
                        {/* Date number (small, top-left) */}
                        <Text style={[
                          styles.monthDayCardNumber, 
                          isWeekend && styles.monthDayCardNumberWeekend,
                          isToday && styles.monthDayCardNumberToday
                        ]}>
                          {date.getDate()}
                        </Text>
                        
                        {monthMode === "load" ? (
                          <>
                            {/* Gradient fill from bottom */}
                            {stats.totalMinutes > 0 && (
                              <View style={[styles.monthLoadFillContainer, { height: `${loadHeight}%` }]}>
                                <LinearGradient
                                  colors={loadGradient}
                                  style={styles.monthLoadFill}
                                  start={{ x: 0, y: 1 }}
                                  end={{ x: 0, y: 0 }}
                                />
                              </View>
                            )}
                            {/* Hours label */}
                            {stats.totalHours > 0 && (
                              <Text style={styles.monthHoursLabel}>{stats.totalHours}h</Text>
                            )}
                          </>
                        ) : (
                          <>
                            {/* Availability indicator */}
                            <View style={[
                              styles.monthAvailabilityIndicator,
                              availabilityStatus === "open" && styles.monthAvailabilityOpen,
                              availabilityStatus === "limited" && styles.monthAvailabilityLimited,
                              availabilityStatus === "full" && styles.monthAvailabilityFull,
                            ]} />
                            {availabilityStatus !== "full" && displaySlots > 0 && (
                              <Text style={styles.monthSlotsLabel}>{displaySlots}h</Text>
                            )}
                          </>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
          
          {/* Day Context Panel - Always visible, updates with selected day */}
          <View style={styles.dayContextPanel}>
            {/* Header */}
            <View style={styles.dayContextHeader}>
              <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
              <Text style={styles.dayContextDate}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][selectedDate.getDay()]}{" "}
                {selectedDate.getDate()}{" "}
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][selectedDate.getMonth()]}
              </Text>
              {selectedDate.toDateString() === new Date().toDateString() && (
                <Text style={styles.dayContextTodayBadge}>Today</Text>
              )}
            </View>
            
            {/* Mode-dependent content */}
            {(() => {
              const stats = getDayStats(selectedDate);
              const daySessions = getSessionsForDate(selectedDate);
              
              // Calculate if there are any free slots
              const hasAvailability = (() => {
                for (let hour = 8; hour < 22; hour++) {
                  const slotStart = new Date(selectedDate);
                  slotStart.setHours(hour, 0, 0, 0);
                  const slotEnd = new Date(selectedDate);
                  slotEnd.setHours(hour + 1, 0, 0, 0);
                  
                  for (const court of courts) {
                    const isOccupied = daySessions.some(s => {
                      const sStart = new Date(s.startTime);
                      const sEnd = new Date(s.endTime);
                      return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                    });
                    if (!isOccupied) return true;
                  }
                }
                return false;
              })();
              
              if (monthMode === "load") {
                // Load mode - show sessions and workload
                // Calculate peak time from actual session distribution
                const morningMinutes = daySessions.filter(s => new Date(s.startTime).getHours() < 12).reduce((sum, s) => {
                  const mins = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000;
                  return sum + mins;
                }, 0);
                const afternoonMinutes = daySessions.filter(s => {
                  const hour = new Date(s.startTime).getHours();
                  return hour >= 12 && hour < 17;
                }).reduce((sum, s) => {
                  const mins = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000;
                  return sum + mins;
                }, 0);
                const eveningMinutes = daySessions.filter(s => new Date(s.startTime).getHours() >= 17).reduce((sum, s) => {
                  const mins = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000;
                  return sum + mins;
                }, 0);
                
                const peakTime = stats.sessions === 0 ? "—" 
                  : eveningMinutes >= morningMinutes && eveningMinutes >= afternoonMinutes ? "Evening"
                  : afternoonMinutes >= morningMinutes ? "Afternoon" : "Morning";
                const loadLevel = stats.totalMinutes >= 360 ? "High load" : stats.totalMinutes >= 240 ? "Moderate" : "Light";
                
                return (
                  <View style={styles.dayContextContent}>
                    <View style={styles.dayContextRow}>
                      <Text style={styles.dayContextLabel}>{stats.sessions} sessions</Text>
                      <Text style={styles.dayContextDot}>·</Text>
                      <Text style={styles.dayContextLabel}>{stats.totalMinutes} min</Text>
                    </View>
                    {stats.sessions > 0 && (
                      <View style={styles.dayContextRow}>
                        <Text style={styles.dayContextMeta}>Peak: {peakTime}</Text>
                        <Text style={styles.dayContextDot}>·</Text>
                        <Text style={[
                          styles.dayContextMeta,
                          stats.totalMinutes >= 360 && { color: "#FF6B6B" },
                          stats.totalMinutes >= 240 && stats.totalMinutes < 360 && { color: Colors.dark.gold },
                        ]}>{loadLevel}</Text>
                      </View>
                    )}
                    
                    {/* Mini load bar */}
                    <View style={styles.dayContextLoadBar}>
                      <View 
                        style={[
                          styles.dayContextLoadFill,
                          { 
                            width: `${Math.min(100, (stats.totalMinutes / 480) * 100)}%`,
                            backgroundColor: stats.totalMinutes >= 360 ? "#FF6B6B" : stats.totalMinutes >= 240 ? Colors.dark.gold : Colors.dark.primary,
                          }
                        ]} 
                      />
                    </View>
                  </View>
                );
              } else {
                // Availability mode - show free slots
                const freeSlots: { courtId: string; courtName: string; hour: number }[] = [];
                for (let hour = 8; hour < 22; hour++) {
                  const slotStart = new Date(selectedDate);
                  slotStart.setHours(hour, 0, 0, 0);
                  const slotEnd = new Date(selectedDate);
                  slotEnd.setHours(hour + 1, 0, 0, 0);
                  
                  courts.forEach(court => {
                    const isOccupied = daySessions.some(s => {
                      const sStart = new Date(s.startTime);
                      const sEnd = new Date(s.endTime);
                      return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                    });
                    if (!isOccupied && freeSlots.length < 5) {
                      freeSlots.push({ courtId: court.id, courtName: court.name, hour });
                    }
                  });
                }
                
                return (
                  <View style={styles.dayContextContent}>
                    {freeSlots.length > 0 ? (
                      <>
                        <Text style={styles.dayContextAvailLabel}>Available today:</Text>
                        {freeSlots.slice(0, 3).map((slot, i) => (
                          <Pressable 
                            key={i} 
                            style={styles.dayContextSlot}
                            onPress={() => {
                              const slotTime = new Date(selectedDate);
                              slotTime.setHours(slot.hour, 0, 0, 0);
                              setSelectedSlot({ courtId: slot.courtId, time: slotTime });
                              setShowCreateDrawer(true);
                            }}
                          >
                            <Text style={styles.dayContextSlotTime}>{formatTime(slot.hour)} - {formatTime(slot.hour + 1)}</Text>
                            <Text style={styles.dayContextSlotCourt}>{slot.courtName}</Text>
                          </Pressable>
                        ))}
                        {freeSlots.length > 3 && (
                          <Text style={styles.dayContextMoreSlots}>+{freeSlots.length - 3} more available</Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.dayContextNoSlots}>Fully booked</Text>
                    )}
                  </View>
                );
              }
            })()}
            
            {/* Quick Action - disabled when fully booked */}
            {(() => {
              const daySessions = getSessionsForDate(selectedDate);
              // Check if there are any free slots
              let firstFreeSlot: { courtId: string; time: Date } | null = null;
              for (let hour = 8; hour < 22 && !firstFreeSlot; hour++) {
                const slotStart = new Date(selectedDate);
                slotStart.setHours(hour, 0, 0, 0);
                const slotEnd = new Date(selectedDate);
                slotEnd.setHours(hour + 1, 0, 0, 0);
                
                for (const court of courts) {
                  const isOccupied = daySessions.some(s => {
                    const sStart = new Date(s.startTime);
                    const sEnd = new Date(s.endTime);
                    return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                  });
                  if (!isOccupied) {
                    firstFreeSlot = { courtId: court.id, time: slotStart };
                    break;
                  }
                }
              }
              
              const isFullyBooked = !firstFreeSlot;
              
              return (
                <Pressable 
                  style={[
                    styles.dayContextAction,
                    isFullyBooked && styles.dayContextActionDisabled,
                  ]}
                  onPress={() => {
                    if (firstFreeSlot) {
                      setSelectedSlot(firstFreeSlot);
                      setShowCreateDrawer(true);
                    }
                  }}
                  disabled={isFullyBooked}
                >
                  <Ionicons 
                    name={isFullyBooked ? "close-circle-outline" : "add-circle-outline"} 
                    size={16} 
                    color={isFullyBooked ? Colors.dark.disabled : Colors.dark.primary} 
                  />
                  <Text style={[
                    styles.dayContextActionText,
                    isFullyBooked && styles.dayContextActionTextDisabled,
                  ]}>
                    {isFullyBooked ? "Fully booked" : "Book on this day"}
                  </Text>
                </Pressable>
              );
            })()}
          </View>
        </View>
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
    paddingVertical: Spacing.md,
    backgroundColor: "rgba(30, 30, 35, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
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
    fontWeight: "700",
    letterSpacing: 0.5,
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
    borderLeftColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  halfHourLine: {
    position: "absolute",
    top: HOUR_HEIGHT_60 / 2,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  sessionBlock: {
    position: "absolute",
    left: 3,
    right: 3,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  sessionBlockActive: {
    borderWidth: 2,
    borderColor: Colors.dark.text,
    shadowColor: Colors.dark.primary,
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  sessionGradient: {
    flex: 1,
    padding: Spacing.sm,
    justifyContent: "center",
  },
  sessionText: {
    ...Typography.caption,
    color: "#FFFFFF",
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  sessionTime: {
    ...Typography.caption,
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 10,
    fontWeight: "500",
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
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
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
  // Premium Month View styles
  monthModeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 3,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  monthModeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  monthModeButtonActive: {
    backgroundColor: Colors.dark.primary,
  },
  monthModeText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  monthModeTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  monthWeekRowPremium: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    gap: 6,
    marginBottom: 6,
  },
  monthDayCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(40, 40, 45, 0.8)",
    minHeight: 70,
    padding: 6,
    overflow: "hidden",
    position: "relative",
  },
  monthDayCardEmpty: {
    flex: 1,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(30, 30, 35, 0.4)",
    minHeight: 70,
  },
  monthDayCardWeekend: {
    backgroundColor: "rgba(35, 35, 40, 0.6)",
  },
  monthDayCardToday: {
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  monthDayCardSelected: {
    shadowColor: Colors.dark.text,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  monthDayCardNumber: {
    ...Typography.caption,
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
    zIndex: 2,
  },
  monthDayCardNumberWeekend: {
    color: "rgba(255, 255, 255, 0.4)",
  },
  monthDayCardNumberToday: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  monthLoadFillContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    overflow: "hidden",
  },
  monthLoadFill: {
    flex: 1,
    opacity: 0.7,
  },
  monthHoursLabel: {
    position: "absolute",
    bottom: 4,
    right: 6,
    ...Typography.caption,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "600",
    zIndex: 2,
  },
  monthAvailabilityIndicator: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -5,
    marginLeft: -5,
  },
  monthAvailabilityOpen: {
    backgroundColor: "#3AE374",
    shadowColor: "#3AE374",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  monthAvailabilityLimited: {
    backgroundColor: "#FFD54F",
    shadowColor: "#FFD54F",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  monthAvailabilityFull: {
    backgroundColor: "rgba(80, 80, 80, 0.3)",
  },
  monthSlotsLabel: {
    position: "absolute",
    bottom: 4,
    right: 6,
    ...Typography.caption,
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
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
  // Availability mode styles - Energy Bands
  availabilityContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  energyBandsContainer: {
    flexDirection: "row",
    flex: 1,
    gap: Spacing.sm,
  },
  energyBandColumn: {
    flex: 1,
    backgroundColor: "rgba(30, 30, 35, 0.4)",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    minHeight: 280,
  },
  energyBandToday: {
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  energyBandSelected: {
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  energyBandHeader: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingTop: Spacing.md,
  },
  energyBandDayName: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  energyBandDayNameToday: {
    color: Colors.dark.primary,
  },
  energyBandDate: {
    ...Typography.body,
    fontSize: 18,
    color: Colors.dark.text,
    fontWeight: "700",
    marginTop: 2,
  },
  energyBandDateToday: {
    color: Colors.dark.primary,
  },
  energyBarContainer: {
    flex: 1,
    justifyContent: "flex-end",
    marginHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    backgroundColor: "rgba(20, 20, 25, 0.3)",
  },
  energyBarFill: {
    width: "100%",
    borderRadius: BorderRadius.sm,
  },
  energyBarGlow: {
    position: "absolute",
    left: "20%",
    right: "20%",
    height: 3,
    borderRadius: 2,
    opacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  energyBandFooter: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  energyBandHours: {
    ...Typography.caption,
    fontSize: 12,
    fontWeight: "700",
  },
  energyTimeHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    opacity: 0.4,
  },
  energyTimeHintText: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.disabled,
  },
  energyTimeHintLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.disabled,
    marginHorizontal: Spacing.md,
    opacity: 0.3,
  },
  // Day Context Panel styles
  dayContextPanel: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  dayContextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dayContextDate: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  dayContextTodayBadge: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.backgroundRoot,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    fontWeight: "600",
  },
  dayContextContent: {
    gap: Spacing.xs,
  },
  dayContextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dayContextLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  dayContextDot: {
    ...Typography.caption,
    color: Colors.dark.disabled,
  },
  dayContextMeta: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  dayContextLoadBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    marginTop: Spacing.xs,
    overflow: "hidden",
  },
  dayContextLoadFill: {
    height: "100%",
    borderRadius: 2,
  },
  dayContextAvailLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
  },
  dayContextSlot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.primary + "10",
    borderRadius: BorderRadius.xs,
    marginBottom: 4,
  },
  dayContextSlotTime: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  dayContextSlotCourt: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  dayContextMoreSlots: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
    marginTop: Spacing.xs,
  },
  dayContextNoSlots: {
    ...Typography.caption,
    color: Colors.dark.disabled,
    fontStyle: "italic",
  },
  dayContextAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.sm,
  },
  dayContextActionText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  dayContextActionDisabled: {
    backgroundColor: "rgba(60, 60, 65, 0.3)",
  },
  dayContextActionTextDisabled: {
    color: Colors.dark.disabled,
  },
});
