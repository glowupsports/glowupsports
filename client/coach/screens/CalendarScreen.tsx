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
        </View>

        {/* Date Navigation */}
        <View style={styles.dateNav}>
          <Pressable style={styles.dateNavButton} onPress={() => changeDate(-1)}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Pressable style={styles.dateDisplay} onPress={goToToday}>
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            {selectedDate.toDateString() === new Date().toDateString() && (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>TODAY</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.dateNavButton} onPress={() => changeDate(1)}>
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

      {/* Now Playing Card */}
      <NowPlayingCard
        sessions={ownSessions}
        courts={courts}
        selectedDate={selectedDate}
        onAttendance={handleAttendance}
        onExtend={handleExtendSession}
        onEnd={handleEndSession}
      />

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
                          },
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
});
