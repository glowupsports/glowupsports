import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
  FadeIn,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { useRoute, RouteProp } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { 
  getLocalDateString, 
  formatLocalDateToString, 
  formatDateObjectInTimezone,
  getTimeInTimezone,
  formatTimeInTimezone,
  parseUTCTimestamp,
} from "@/lib/dateUtils";

import { PremiumSessionWizard } from "@/coach/components/PremiumSessionWizard";
import AttendanceDrawer from "@/coach/components/AttendanceDrawer";
import SessionDetailDrawer from "@/coach/components/SessionDetailDrawer";
import QuickFeedbackModal from "@/coach/components/QuickFeedbackModal";
import { useCoachMarks, CoachMarkTarget } from "@/components/CoachMarks";

type CalendarRouteParams = {
  Calendar: {
    openSessionId?: string;
    action?: "attendance" | "detail" | "extend" | "end";
    openWizard?: boolean;
  };
};

interface CoachData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  homeLocationId: string | null;
  hourlyRate: string | null;
  level: number | null;
  totalXp: number | null;
  role: string | null;
  academyId: string | null;
}

const TIME_COLUMN_WIDTH = 50;
const MIN_COURT_LANE_WIDTH = 90;
const HOUR_HEIGHT_60 = 80;
const HOUR_HEIGHT_30 = 60;
const START_HOUR = 6;
const END_HOUR = 21;


// Compare dates by UTC date string to avoid timezone issues
const isSameUTCDate = (date1: Date, date2: Date): boolean => {
  return date1.getUTCFullYear() === date2.getUTCFullYear() &&
         date1.getUTCMonth() === date2.getUTCMonth() &&
         date1.getUTCDate() === date2.getUTCDate();
};

// Get UTC date string (YYYY-MM-DD) from a timestamp
const getUTCDateString = (timestamp: string | Date): string => {
  const date = parseUTCTimestamp(timestamp);
  return date.toISOString().split('T')[0];
};

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

interface SessionPlayer {
  id: string;
  name: string;
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
  players?: SessionPlayer[];
  location?: string;
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

interface DraggableSessionProps {
  session: Session;
  top: number;
  height: number;
  isPast: boolean;
  isActive: boolean;
  gradientColors: readonly [string, string, ...string[]];
  sessionLabel: string;
  formattedTime: string; // Pre-formatted time in academy timezone
  hourHeight: number;
  onTap: () => void;
  onLongPress: () => void;
  onDragEnd: (deltaY: number, deltaX: number) => void;
  courtLaneWidth: number;
  onDragUpdate?: (deltaY: number, deltaX: number, isDragging: boolean) => void;
  hasConflict?: boolean;
}

function DraggableSessionBlock({
  session,
  top,
  height,
  isPast,
  isActive,
  gradientColors,
  sessionLabel,
  formattedTime,
  hourHeight,
  onTap,
  onLongPress,
  onDragEnd,
  courtLaneWidth,
  onDragUpdate,
  hasConflict,
}: DraggableSessionProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .enabled(!isPast)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.05);
      zIndex.value = 100;
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      if (onDragUpdate) {
        const snapY = Math.round(event.translationY / (hourHeight / 2)) * (hourHeight / 2);
        const snapX = Math.round(event.translationX / courtLaneWidth) * courtLaneWidth;
        runOnJS(onDragUpdate)(snapY, snapX, true);
      }
    })
    .onEnd((event) => {
      isDragging.value = false;
      scale.value = withSpring(1);
      zIndex.value = 1;
      
      if (onDragUpdate) {
        runOnJS(onDragUpdate)(0, 0, false);
      }
      
      const snapY = Math.round(event.translationY / (hourHeight / 2)) * (hourHeight / 2);
      const snapX = Math.round(event.translationX / courtLaneWidth) * courtLaneWidth;
      
      if (Math.abs(snapY) >= hourHeight / 4 || Math.abs(snapX) >= courtLaneWidth / 2) {
        runOnJS(onDragEnd)(snapY, snapX);
      }
      
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onTap)();
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onEnd(() => {
      if (!isDragging.value) {
        runOnJS(onLongPress)();
      }
    });

  const composed = Gesture.Race(panGesture, Gesture.Exclusive(longPressGesture, tapGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    shadowOpacity: isDragging.value ? 0.3 : 0,
    shadowRadius: isDragging.value ? 8 : 0,
    elevation: isDragging.value ? 8 : 0,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          dragStyles.sessionBlock,
          {
            top,
            height: height - 4,
            opacity: isPast ? 0.5 : 1,
          },
          isActive && dragStyles.sessionBlockActive,
          hasConflict && dragStyles.sessionBlockConflict,
          isPast && dragStyles.sessionBlockLocked,
          animatedStyle,
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={dragStyles.sessionGradient}
        >
          {sessionLabel.includes("\n") ? (
            <>
              <Text style={dragStyles.sessionText} numberOfLines={1}>
                {sessionLabel.split("\n")[0]}
              </Text>
              <Text style={dragStyles.sessionPlayerName} numberOfLines={1}>
                {sessionLabel.split("\n")[1]}
              </Text>
            </>
          ) : (
            <Text style={dragStyles.sessionText} numberOfLines={1}>
              {sessionLabel}
            </Text>
          )}
        </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
}

interface WeekDraggableSessionProps {
  session: Session;
  top: number;
  height: number;
  isPast: boolean;
  isActive: boolean;
  gradientColors: readonly [string, string, ...string[]];
  sessionLabel: string;
  formattedTime: string; // Pre-formatted time in academy timezone
  hourHeight: number;
  onTap: () => void;
  onLongPress: () => void;
  onDragEnd: (deltaY: number, deltaX: number) => void;
  dayColumnWidth: number;
  hasConflict?: boolean;
}

function WeekDraggableSessionBlock({
  session,
  top,
  height,
  isPast,
  isActive,
  gradientColors,
  sessionLabel,
  formattedTime,
  hourHeight,
  onTap,
  onLongPress,
  onDragEnd,
  dayColumnWidth,
  hasConflict,
}: WeekDraggableSessionProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .enabled(!isPast)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.1);
      zIndex.value = 100;
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      isDragging.value = false;
      scale.value = withSpring(1);
      zIndex.value = 1;
      
      const snapY = Math.round(event.translationY / (hourHeight / 2)) * (hourHeight / 2);
      const snapX = Math.round(event.translationX / dayColumnWidth) * dayColumnWidth;
      
      if (Math.abs(snapY) >= hourHeight / 4 || Math.abs(snapX) >= dayColumnWidth / 2) {
        runOnJS(onDragEnd)(snapY, snapX);
      }
      
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onTap)();
    });

  const composed = Gesture.Race(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    shadowOpacity: isDragging.value ? 0.4 : 0,
    shadowRadius: isDragging.value ? 10 : 0,
    elevation: isDragging.value ? 10 : 0,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          dragStyles.weekSessionBlock,
          {
            top,
            height: Math.max(height - 2, 20),
            opacity: isPast ? 0.5 : 1,
          },
          isActive && dragStyles.weekSessionBlockActive,
          hasConflict && dragStyles.weekSessionBlockConflict,
          isPast && dragStyles.weekSessionBlockLocked,
          animatedStyle,
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={dragStyles.weekSessionGradient}
        >
          <Text style={dragStyles.weekSessionText} numberOfLines={1}>
            {sessionLabel}
          </Text>
          {height > 40 && (
            <Text style={dragStyles.weekSessionTime} numberOfLines={1}>
              {formattedTime}
            </Text>
          )}
        </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
}

const dragStyles = StyleSheet.create({
  sessionBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  sessionBlockActive: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  sessionBlockConflict: {
    borderWidth: 2,
    borderColor: Colors.dark.error,
    borderStyle: "dashed",
  },
  sessionBlockLocked: {
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    borderStyle: "dotted",
  },
  sessionGradient: {
    flex: 1,
    padding: Spacing.xs,
    justifyContent: "center",
  },
  sessionText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sessionTime: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(0, 0, 0, 0.9)",
    letterSpacing: 0.3,
    marginTop: 1,
  },
  sessionPlayerName: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(0, 0, 0, 0.7)",
    letterSpacing: 0.2,
    marginTop: 1,
    textTransform: "capitalize",
  },
  weekSessionBlock: {
    position: "absolute",
    left: 1,
    right: 1,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "25",
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
  weekSessionBlockActive: {
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  weekSessionBlockConflict: {
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  weekSessionBlockLocked: {
    borderWidth: 1,
    borderColor: Colors.dark.disabled,
    borderStyle: "dotted",
  },
  weekSessionGradient: {
    flex: 1,
    padding: 2,
    justifyContent: "center",
  },
  weekSessionText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  weekSessionTime: {
    fontSize: 7,
    fontWeight: "600",
    color: "rgba(0, 0, 0, 0.85)",
    letterSpacing: 0,
    textAlign: "center",
  },
});

export default function CalendarScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const route = useRoute<RouteProp<CalendarRouteParams, "Calendar">>();
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
    isFetching,
    academy,
  } = useCoach();

  const { startTour, isActive: tourIsActive } = useCoachMarks();

  const calendarTourSteps = useMemo(() => [
    { id: "cal_date_nav", title: "Navigate Dates", description: "Swipe or tap the arrows to move between days. Long press to jump back to today.", position: "bottom" as const },
    { id: "cal_view_toggle", title: "Day, Week & Month", description: "Switch between day, week and month views to see your schedule at a glance.", position: "bottom" as const },
    { id: "cal_court_grid", title: "Court Grid", description: "Each column is a court. Tap an empty slot to create a new session there.", position: "top" as const },
    { id: "cal_header_actions", title: "Quick Actions", description: "Export your calendar, toggle focus mode, or undo a drag-and-drop move.", position: "bottom" as const },
  ], []);

  useEffect(() => {
    if (!isLoading && calendarData && !tourIsActive) {
      const timer = setTimeout(() => startTour("coach_calendar_tour", calendarTourSteps), 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, calendarData]);

  // Academy timezone for correct local time display - default to Dubai if not set
  const academyTimezone = academy?.timezone || "Asia/Dubai";

  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ courtId: string; time: Date } | null>(null);
  const [selectedSessionForAttendance, setSelectedSessionForAttendance] = useState<Session | null>(null);
  const [selectedSessionForDetail, setSelectedSessionForDetail] = useState<Session | null>(null);
  const [detailInitialAction, setDetailInitialAction] = useState<"attendance" | "detail" | "extend" | "end" | undefined>(undefined);
  const [selectedSessionForFeedback, setSelectedSessionForFeedback] = useState<Session | null>(null);
  const [dayMode, setDayMode] = useState<"overview" | "slots">("slots");
  const [weekMode, setWeekMode] = useState<"overview" | "availability">("availability");
  const [monthMode, setMonthMode] = useState<"load" | "availability">("load");
  const [draggingSession, setDraggingSession] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{
    sessionId: string;
    originalStart: string;
    originalEnd: string;
    originalCourtId: string | null;
  } | null>(null);
  const [dragConflict, setDragConflict] = useState<string | null>(null);
  const [pendingDrag, setPendingDrag] = useState<{
    session: Session;
    newStart: Date;
    newEnd: Date;
    newCourtId?: string;
    newCourtName?: string;
    isPastSession: boolean;
  } | null>(null);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null); // null = all locations
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string | null>(null); // null = all courts
  const [isExporting, setIsExporting] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false); // Collapse DAY/WEEK/MONTH and court filters
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Array<{ courtId: string; courtName: string; hour: number }>>([]);
  const [selectionStart, setSelectionStart] = useState<{ courtIndex: number; hour: number } | null>(null);
  const [showBlockActionModal, setShowBlockActionModal] = useState(false);
  const [blockReason, setBlockReason] = useState<string>("training");
  const [blockMode, setBlockMode] = useState<"coach" | "court">("coach");
  const [blockDateFrom, setBlockDateFrom] = useState<Date>(new Date());
  const [blockDateTo, setBlockDateTo] = useState<Date>(new Date());
  const [blockWeekdays, setBlockWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // Refs for synchronized horizontal scrolling between court headers and lanes
  const courtHeaderScrollRef = useRef<ScrollView>(null);
  const courtLanesScrollRef = useRef<ScrollView>(null);

  const allLocations = calendarData?.locations || [];
  
  // Sort courts by user-defined position (set in Settings)
  const allCourts = useMemo(() => {
    const courts = calendarData?.courts || [];
    return [...courts].sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [calendarData?.courts]);

  const exportCalendarToICS = useCallback(async () => {
    if (!calendarData?.ownSessions || calendarData.ownSessions.length === 0) {
      Alert.alert("No Sessions", "There are no sessions to export.");
      return;
    }

    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const formatICSDate = (dateStr: string): string => {
        const date = parseUTCTimestamp(dateStr);
        return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      };

      const escapeICS = (text: string): string => {
        return text.replace(/[\\;,\n]/g, (match) => {
          if (match === "\n") return "\\n";
          return "\\" + match;
        });
      };

      const events = calendarData.ownSessions.map((session) => {
        const court = allCourts.find(c => c.id === session.courtId);
        const courtName = court?.name || "Court";
        const location = court?.locationId ? allLocations.find(l => l.id === court.locationId)?.name : "";
        
        return [
          "BEGIN:VEVENT",
          `UID:${session.id}@glowupsports.com`,
          `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
          `DTSTART:${formatICSDate(session.startTime)}`,
          `DTEND:${formatICSDate(session.endTime)}`,
          `SUMMARY:${escapeICS(`Tennis Session - ${session.sessionType || "Training"}`)}`,
          `LOCATION:${escapeICS(`${courtName}${location ? ` - ${location}` : ""}`)}`,
          `DESCRIPTION:${escapeICS(`Duration: ${session.duration} min | Status: ${session.status || "scheduled"}`)}`,
          "STATUS:CONFIRMED",
          "END:VEVENT",
        ].join("\r\n");
      });

      const icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Glow Up Sports//Coach Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Coach Sessions",
        ...events,
        "END:VCALENDAR",
      ].join("\r\n");

      const fileName = `coach-calendar-${formatLocalDateToString(selectedDate).replace(/\//g, "-")}.ics`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(fileUri, icsContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/calendar",
          dialogTitle: "Export Calendar",
          UTI: "public.calendar-event",
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Export Ready", "Calendar file created but sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Error exporting calendar:", error);
      Alert.alert("Export Failed", "Could not export calendar. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExporting(false);
    }
  }, [calendarData?.ownSessions, allCourts, allLocations, selectedDate]);

  // Fetch travel times for this coach
  const { data: travelTimes = [] } = useQuery<Array<{
    id: string;
    fromLocationId: string;
    toLocationId: string;
    travelTimeMinutes: number;
  }>>({
    queryKey: ["/api/coach/travel-times"],
  });
  
  const hourHeight = timeGrid === 30 ? HOUR_HEIGHT_30 : HOUR_HEIGHT_60;
  
  // Apply filters: location filter first, then court filter
  const locationFilteredCourts = selectedLocationFilter 
    ? allCourts.filter(c => c.locationId === selectedLocationFilter)
    : allCourts;
  const courts = selectedCourtFilter 
    ? locationFilteredCourts.filter(c => c.id === selectedCourtFilter) 
    : locationFilteredCourts;
  
  // Group courts by location for visual separators
  const getLocationForCourt = (courtId: string) => {
    const court = allCourts.find(c => c.id === courtId);
    return court?.locationId || null;
  };
  
  // Returns true if this is the first court in a new location group
  // For index 0: true only if it has a locationId (to show header for first group)
  // For other indices: true if locationId differs from previous court
  const isFirstCourtInNewLocation = (index: number) => {
    const currentLocationId = courts[index]?.locationId;
    if (index === 0) {
      // Show location header for first court only if it has a location
      return !!currentLocationId;
    }
    const prevLocationId = courts[index - 1]?.locationId;
    return currentLocationId !== prevLocationId;
  };
  
  // Calculate dynamic lane width based on number of visible courts
  // Use scrollable layout if courts don't fit, with minimum width per court
  const availableWidth = screenWidth - TIME_COLUMN_WIDTH - Spacing.lg * 2;
  const dynamicLaneWidth = courts.length === 1 
    ? availableWidth
    : courts.length <= 3
      ? availableWidth / courts.length
      : MIN_COURT_LANE_WIDTH; // Use minimum width for many courts, allow horizontal scroll
  
  // Total width of all court lanes (for scroll content)
  const totalCourtsWidth = courts.length * dynamicLaneWidth;
  const needsHorizontalScroll = totalCourtsWidth > availableWidth;

  // Handle deep linking from Dashboard quick actions
  useEffect(() => {
    const params = route.params;
    if (params?.openSessionId && calendarData?.ownSessions) {
      const session = calendarData.ownSessions.find(s => s.id === params.openSessionId);
      if (session) {
        if (params.action === "attendance") {
          setSelectedSessionForAttendance(session as Session);
        } else {
          // For extend/end/detail, open session detail drawer with the action
          setDetailInitialAction(params.action);
          setSelectedSessionForDetail(session as Session);
        }
      }
    }
  }, [route.params?.openSessionId, route.params?.action, route.params?._ts, calendarData?.ownSessions]);
  
  // Handle opening wizard from Quick Actions FAB
  useEffect(() => {
    if (route.params?.openWizard) {
      setShowCreateDrawer(true);
    }
  }, [route.params?.openWizard]);
  
  const updateSessionMutation = useMutation({
    mutationFn: async ({ sessionId, startTime, endTime, courtId, originalData }: { 
      sessionId: string; 
      startTime: string; 
      endTime: string;
      courtId?: string;
      originalData?: { startTime: string; endTime: string; courtId: string | null };
    }) => {
      const response = await apiRequest("PATCH", `/api/sessions/${sessionId}`, { startTime, endTime, courtId, checkConflicts: true });
      return { response, originalData, sessionId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.originalData) {
        setLastMove({
          sessionId: data.sessionId,
          originalStart: data.originalData.startTime,
          originalEnd: data.originalData.endTime,
          originalCourtId: data.originalData.courtId,
        });
      }
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorData = error?.response?.data || error?.data || {};
      const conflictType = errorData.conflictType;
      const playerName = errorData.playerName;
      
      if (conflictType === 'coach') {
        Alert.alert("Scheduling Conflict", "You already have another session at this time.");
      } else if (conflictType === 'court') {
        Alert.alert("Court Unavailable", "This court is already booked at the selected time.");
      } else if (conflictType === 'player' && playerName) {
        Alert.alert("Player Conflict", `${playerName} has another session at this time.`);
      } else {
        Alert.alert("Error", "Failed to move session. Please try again.");
      }
    },
  });

  const undoLastMove = useCallback(() => {
    if (!lastMove) return;
    
    updateSessionMutation.mutate({
      sessionId: lastMove.sessionId,
      startTime: lastMove.originalStart,
      endTime: lastMove.originalEnd,
      courtId: lastMove.originalCourtId || undefined,
    });
    setLastMove(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [lastMove, updateSessionMutation]);

  const handleSessionDragEnd = useCallback((
    session: Session, 
    deltaY: number, 
    deltaX: number,
    currentCourtIndex: number
  ) => {
    const hoursChanged = deltaY / hourHeight;
    const courtsChanged = Math.round(deltaX / dynamicLaneWidth);
    
    const originalStart = parseUTCTimestamp(session.startTime);
    const originalEnd = parseUTCTimestamp(session.endTime);
    
    const newStart = new Date(originalStart);
    newStart.setMinutes(newStart.getMinutes() + Math.round(hoursChanged * 60));
    
    const newEnd = new Date(originalEnd);
    newEnd.setMinutes(newEnd.getMinutes() + Math.round(hoursChanged * 60));
    
    const newCourtIndex = Math.max(0, Math.min(courts.length - 1, currentCourtIndex + courtsChanged));
    const newCourtId = courts[newCourtIndex]?.id;
    const newCourtName = courts[newCourtIndex]?.name;
    
    if (newStart.getHours() < START_HOUR || newEnd.getHours() > END_HOUR + 1) {
      Alert.alert("Invalid Time", "Session cannot be moved outside operating hours.");
      return;
    }
    
    const isPastSession = newStart < new Date();
    
    setPendingDrag({
      session,
      newStart,
      newEnd,
      newCourtId,
      newCourtName,
      isPastSession,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [hourHeight, courts]);
  
  const handleWeekSessionDragEnd = useCallback((
    session: Session,
    deltaY: number,
    deltaX: number,
    dayColumnWidth: number
  ) => {
    const minutesChanged = Math.round((deltaY / hourHeight) * 60);
    const daysChanged = Math.round(deltaX / dayColumnWidth);
    
    const originalStart = parseUTCTimestamp(session.startTime);
    const originalEnd = parseUTCTimestamp(session.endTime);
    
    const newStart = new Date(originalStart.getTime());
    newStart.setDate(originalStart.getDate() + daysChanged);
    newStart.setMinutes(originalStart.getMinutes() + minutesChanged);
    
    const newEnd = new Date(originalEnd.getTime());
    newEnd.setDate(originalEnd.getDate() + daysChanged);
    newEnd.setMinutes(originalEnd.getMinutes() + minutesChanged);
    
    if (newStart.getHours() < START_HOUR || newEnd.getHours() > END_HOUR + 1) {
      Alert.alert("Invalid Time", "Session cannot be moved outside operating hours.");
      return;
    }
    
    const isPastSession = newStart < new Date();
    
    setPendingDrag({
      session,
      newStart,
      newEnd,
      isPastSession,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [hourHeight]);

  const confirmPendingDrag = useCallback(() => {
    if (!pendingDrag) return;
    
    updateSessionMutation.mutate({
      sessionId: pendingDrag.session.id,
      startTime: pendingDrag.newStart.toISOString(),
      endTime: pendingDrag.newEnd.toISOString(),
      courtId: pendingDrag.newCourtId,
      originalData: {
        startTime: pendingDrag.session.startTime,
        endTime: pendingDrag.session.endTime,
        courtId: pendingDrag.session.courtId,
      },
    });
    setPendingDrag(null);
  }, [pendingDrag, updateSessionMutation]);

  const cancelPendingDrag = useCallback(() => {
    setPendingDrag(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

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

  const isToday = useMemo(() => {
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  }, [selectedDate]);
  
  // Always show full time range 06:00-21:00 in DAY view
  const displayHours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  }, []);
  
  const focusBaseHour = focusMode && isToday ? displayHours[0] : START_HOUR;
  const hours = displayHours;
  const ownSessions = calendarData?.ownSessions || [];
  const blockedSessions = calendarData?.blockedSessions || [];
  const coachBlocks = calendarData?.coachBlocks || [];

  // Compute cross-location busy blocks - show "Busy Elsewhere" on courts where coach is unavailable
  // because they have a session at another location at the same time
  const crossLocationBusyBlocks = useMemo(() => {
    if (ownSessions.length === 0 || courts.length === 0) return [];
    
    const blocks: Array<{
      id: string;
      courtId: string;
      startTime: string;
      endTime: string;
      busyAtLocation: string;
      sessionType: string;
    }> = [];
    
    // For each session, create "busy elsewhere" blocks on the CURRENTLY VISIBLE courts
    // This shows blocking even when filtering to a single court/location
    ownSessions.forEach(session => {
      if (!session.courtId) return;
      
      // Find the location of this session's court (use allCourts to get correct info even if filtered out)
      const sessionCourt = allCourts.find(c => c.id === session.courtId);
      const sessionLocation = allLocations.find(l => l.id === sessionCourt?.locationId);
      const locationName = sessionLocation?.name?.split(" ")[0] || "Elsewhere";
      
      // Create blocks on all VISIBLE courts (from filtered courts list) except the session's own court
      courts.forEach(court => {
        if (court.id === session.courtId) return; // Skip the same court - session is already shown there
        
        blocks.push({
          id: `busy-${session.id}-${court.id}`,
          courtId: court.id,
          startTime: session.startTime,
          endTime: session.endTime,
          busyAtLocation: locationName,
          sessionType: session.sessionType,
        });
      });
    });
    
    return blocks;
  }, [ownSessions, courts, allCourts, allLocations]);

  // Compute travel time blocks between sessions at different locations
  const travelTimeBlocks = useMemo(() => {
    if (travelTimes.length === 0 || ownSessions.length < 2) return [];
    
    // Sort sessions by start time
    const sortedSessions = [...ownSessions].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    
    const blocks: Array<{
      id: string;
      startTime: string;
      endTime: string;
      fromLocation: string;
      toLocation: string;
      minutes: number;
    }> = [];
    
    for (let i = 0; i < sortedSessions.length - 1; i++) {
      const currentSession = sortedSessions[i];
      const nextSession = sortedSessions[i + 1];
      
      // Get location IDs from court
      const currentLocationId = currentSession.locationId || courts.find(c => c.id === currentSession.courtId)?.locationId;
      const nextLocationId = nextSession.locationId || courts.find(c => c.id === nextSession.courtId)?.locationId;
      
      // Skip if same location or no location info
      if (!currentLocationId || !nextLocationId || currentLocationId === nextLocationId) continue;
      
      // Find travel time for this pair
      const travelTime = travelTimes.find(t => 
        (t.fromLocationId === currentLocationId && t.toLocationId === nextLocationId) ||
        (t.fromLocationId === nextLocationId && t.toLocationId === currentLocationId)
      );
      
      if (!travelTime) continue;
      
      // Calculate travel block times - starts when current session ends
      const travelStart = new Date(currentSession.endTime);
      const travelEnd = new Date(travelStart);
      travelEnd.setMinutes(travelEnd.getMinutes() + travelTime.travelTimeMinutes);
      
      blocks.push({
        id: `travel-${currentSession.id}-${nextSession.id}`,
        startTime: travelStart.toISOString(),
        endTime: travelEnd.toISOString(),
        fromLocation: currentLocationId,
        toLocation: nextLocationId,
        minutes: travelTime.travelTimeMinutes,
      });
    }
    
    return blocks;
  }, [ownSessions, travelTimes, courts]);

  const checkDragConflict = useCallback((
    session: Session,
    deltaY: number,
    deltaX: number,
    currentCourtIndex: number,
    isDragging: boolean
  ) => {
    if (!isDragging) {
      setDragConflict(null);
      return;
    }
    
    const hoursChanged = deltaY / hourHeight;
    const courtsChanged = Math.round(deltaX / dynamicLaneWidth);
    
    const originalStart = parseUTCTimestamp(session.startTime);
    const originalEnd = parseUTCTimestamp(session.endTime);
    
    const newStart = new Date(originalStart);
    newStart.setMinutes(newStart.getMinutes() + Math.round(hoursChanged * 60));
    
    const newEnd = new Date(originalEnd);
    newEnd.setMinutes(newEnd.getMinutes() + Math.round(hoursChanged * 60));
    
    const newCourtIndex = Math.max(0, Math.min(courts.length - 1, currentCourtIndex + courtsChanged));
    const newCourtId = courts[newCourtIndex]?.id;
    
    // Check for session conflicts
    const hasSessionConflict = ownSessions.some(s => {
      if (s.id === session.id) return false;
      
      const sStart = parseUTCTimestamp(s.startTime);
      const sEnd = parseUTCTimestamp(s.endTime);
      
      const timeOverlap = newStart < sEnd && newEnd > sStart;
      
      if (!timeOverlap) return false;
      
      if (newCourtId && s.courtId === newCourtId) return true;
      
      return true;
    });

    // Check for travel time block conflicts
    const hasTravelConflict = travelTimeBlocks.some(block => {
      const blockStart = new Date(block.startTime);
      const blockEnd = new Date(block.endTime);
      return newStart < blockEnd && newEnd > blockStart;
    });

    const hasTimeConflict = hasSessionConflict || hasTravelConflict;
    
    setDragConflict(hasTimeConflict ? session.id : null);
  }, [hourHeight, courts, ownSessions, travelTimeBlocks]);

  const formatTime = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`;
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const getSessionPosition = (session: Session | BlockedSession) => {
    // Use timezone-aware time extraction to position sessions correctly in local academy time
    const startLocal = getTimeInTimezone(session.startTime, academyTimezone);
    const endLocal = getTimeInTimezone(session.endTime, academyTimezone);
    const startHour = startLocal.hours + startLocal.minutes / 60;
    const endHour = endLocal.hours + endLocal.minutes / 60;
    const top = (startHour - focusBaseHour) * hourHeight;
    const height = (endHour - startHour) * hourHeight;
    return { top, height };
  };

  const getCourtIndex = (courtId: string | null) => {
    if (!courtId) return -1;
    return courts.findIndex((c) => c.id === courtId);
  };

  const handleSlotPress = (courtId: string, hour: number) => {
    if (selectionMode) {
      toggleCellSelection(courtId, hour);
      return;
    }
    const time = new Date(selectedDate);
    time.setHours(hour, 0, 0, 0);
    setSelectedSlot({ courtId, time });
    setShowCreateDrawer(true);
  };

  const handleSlotLongPress = (courtId: string, courtName: string, hour: number, courtIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSelectionMode(true);
    setSelectionStart({ courtIndex, hour });
    setSelectedCells([{ courtId, courtName, hour }]);
  };

  const toggleCellSelection = (courtId: string, hour: number) => {
    setSelectedCells(prev => {
      const exists = prev.find(c => c.courtId === courtId && c.hour === hour);
      if (exists) {
        return prev.filter(c => !(c.courtId === courtId && c.hour === hour));
      }
      const courtName = courts.find(c => c.id === courtId)?.name || "";
      return [...prev, { courtId, courtName, hour }];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const extendSelection = (courtId: string, courtName: string, hour: number, courtIndex: number) => {
    if (!selectionStart) return;
    const minCourtIdx = Math.min(selectionStart.courtIndex, courtIndex);
    const maxCourtIdx = Math.max(selectionStart.courtIndex, courtIndex);
    const minHour = Math.min(selectionStart.hour, hour);
    const maxHour = Math.max(selectionStart.hour, hour);
    const newCells: Array<{ courtId: string; courtName: string; hour: number }> = [];
    for (let ci = minCourtIdx; ci <= maxCourtIdx; ci++) {
      if (ci >= 0 && ci < courts.length) {
        for (let h = minHour; h <= maxHour; h++) {
          newCells.push({ courtId: courts[ci].id, courtName: courts[ci].name, hour: h });
        }
      }
    }
    setSelectedCells(newCells);
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedCells([]);
    setSelectionStart(null);
  };

  const confirmSelection = () => {
    if (selectedCells.length === 0) {
      clearSelection();
      return;
    }
    setBlockDateFrom(new Date(selectedDate));
    setBlockDateTo(new Date(selectedDate));
    const dayOfWeek = selectedDate.getDay();
    setBlockWeekdays([dayOfWeek]);
    setBlockMode("coach");
    setShowBlockActionModal(true);
  };

  const isCellSelected = (courtId: string, hour: number) => {
    return selectedCells.some(c => c.courtId === courtId && c.hour === hour);
  };

  const blockCourtMutation = useMutation({
    mutationFn: async (cells: Array<{ courtId: string; hour: number }>) => {
      const dateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
      const promises = cells.map(cell => {
        const startTime = `${cell.hour.toString().padStart(2, "0")}:00`;
        const endHour = cell.hour + 1;
        const endTime = `${endHour.toString().padStart(2, "0")}:00`;
        return apiRequest("POST", `/api/courts/${cell.courtId}/block`, {
          date: dateStr,
          startTime,
          endTime,
          reason: blockReason,
        });
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      clearSelection();
      setShowBlockActionModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to block courts");
    },
  });

  const coachBlockMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string; weekdays: number[]; startTime: string; endTime: string; reason: string }) => {
      return apiRequest("POST", "/api/coach/time-blocks", data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      clearSelection();
      setShowBlockActionModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Blocked", `${data.count || ''} time blocks created`);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to create time blocks");
    },
  });

  const deleteCoachBlockMutation = useMutation({
    mutationFn: async (blockId: string) => {
      return apiRequest("DELETE", `/api/coach/time-blocks/${blockId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to remove block");
    },
  });

  const unblockCourtMutation = useMutation({
    mutationFn: async (data: { courtId: string; startTime: string; endTime: string }) => {
      const dateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
      const startLocal = getTimeInTimezone(data.startTime, academyTimezone);
      const endLocal = getTimeInTimezone(data.endTime, academyTimezone);
      const startTimeStr = `${startLocal.hours.toString().padStart(2, "0")}:${startLocal.minutes.toString().padStart(2, "0")}`;
      const endTimeStr = `${endLocal.hours.toString().padStart(2, "0")}:${endLocal.minutes.toString().padStart(2, "0")}`;
      return apiRequest("POST", `/api/courts/${data.courtId}/unblock`, {
        date: dateStr,
        startTime: startTimeStr,
        endTime: endTimeStr,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to unblock court");
    },
  });

  const handleBlockedSlotPress = (session: any) => {
    if (!session.courtId) return;
    const startLocal = getTimeInTimezone(session.startTime, academyTimezone);
    const endLocal = getTimeInTimezone(session.endTime, academyTimezone);
    const startStr = `${startLocal.hours.toString().padStart(2, "0")}:${startLocal.minutes.toString().padStart(2, "0")}`;
    const endStr = `${endLocal.hours.toString().padStart(2, "0")}:${endLocal.minutes.toString().padStart(2, "0")}`;
    const courtName = courts.find(c => c.id === session.courtId)?.name || "Court";
    if (session.isCourtBlock) {
      const reason = session.blockedReason ? ` (${session.blockedReason})` : "";
      Alert.alert(
        "Blocked Court",
        `${courtName}${reason}\n${startStr} - ${endStr}`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Unblock", style: "destructive", onPress: () => {
            unblockCourtMutation.mutate({
              courtId: session.courtId!,
              startTime: session.startTime,
              endTime: session.endTime,
            });
          }},
        ]
      );
    } else {
      Alert.alert(
        "Unavailable",
        `${courtName}\n${startStr} - ${endStr}\nAnother coach has a session here.`
      );
    }
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
    // Use academy timezone for correct local date filtering on BOTH sides
    const targetDateStr = formatDateObjectInTimezone(date, academyTimezone);
    return ownSessions.filter((s) => {
      const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
      return sessionDateStr === targetDateStr;
    });
  };

  const getDayStats = (date: Date) => {
    const daySessions = getSessionsForDate(date);
    
    // Calculate duration from start/end when missing
    const getSessionDuration = (s: Session) => {
      if (s.duration && s.duration > 0) return s.duration;
      const start = parseUTCTimestamp(s.startTime);
      const end = parseUTCTimestamp(s.endTime);
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
      const duration = getSessionDuration(s);
      
      // Use academy timezone for accurate period allocation
      const startLocal = getTimeInTimezone(s.startTime, academyTimezone);
      const endLocal = getTimeInTimezone(s.endTime, academyTimezone);
      const startDecimal = startLocal.hours + startLocal.minutes / 60;
      const endDecimal = endLocal.hours + endLocal.minutes / 60;
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
      parseUTCTimestamp(a.startTime).getTime() - parseUTCTimestamp(b.startTime).getTime()
    );
    for (let i = 1; i < sortedSessions.length; i++) {
      const prevEnd = parseUTCTimestamp(sortedSessions[i - 1].endTime).getTime();
      const currStart = parseUTCTimestamp(sortedSessions[i].startTime).getTime();
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

  const handleSessionTap = (session: Session) => {
    setSelectedSessionForDetail(session);
  };
  
  const handleAttendance = (session: Session) => {
    setSelectedSessionForDetail(null);
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
    const startTime = parseUTCTimestamp(session.startTime);
    const endTime = parseUTCTimestamp(session.endTime);
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
      `${formatTimeInTimezone(session.startTime, academyTimezone)} - ${formatTimeInTimezone(session.endTime, academyTimezone)}`,
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
        return "#00D4FF";
      case "semi_private":
        return "#FF6B35";
      case "group":
        return "#FFD700";
      case "physical":
        return "#9B59B6";
      default:
        return "#00D4FF";
    }
  };

  const getSessionTypeGradient = (type: string): [string, string] => {
    switch (type) {
      case "private":
        return ["#00D4FF", "#0097B8"];
      case "semi_private":
        return ["#FF6B35", "#CC4A1A"];
      case "group":
        return ["#FFD700", "#CC9900"];
      case "physical":
        return ["#9B59B6", "#6C3483"];
      default:
        return ["#00D4FF", "#0097B8"];
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

      {/* Header - Gaming Glassmorphism */}
      <View style={styles.headerGlass}>
        <LinearGradient
          colors={["#00D4FF", "#2ECC40"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerTopLine}
        />
        <LinearGradient
          colors={["rgba(0, 212, 255, 0.08)", "rgba(46, 204, 64, 0.05)", "rgba(0, 0, 0, 0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerGradientOverlay}
        />
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>COACH CALENDAR</Text>
          <CoachMarkTarget id="cal_header_actions"><View style={styles.headerActions}>
            <Pressable
              style={[styles.toggleButton, isExporting && styles.toggleActive]}
              onPress={exportCalendarToICS}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={Colors.dark.primary}
                />
              )}
            </Pressable>
            {viewMode === "day" && dayMode === "slots" && lastMove ? (
              <Pressable
                style={[styles.toggleButton, styles.undoButton]}
                onPress={undoLastMove}
              >
                <Ionicons
                  name="arrow-undo-outline"
                  size={18}
                  color={Colors.dark.gold}
                />
              </Pressable>
            ) : null}
            {viewMode === "day" && dayMode === "slots" && (
              <>
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
              </>
            )}
          </View></CoachMarkTarget>
          {viewMode === "day" && (
            <View style={styles.weekModeToggle}>
              <Pressable
                style={[styles.weekModeButton, dayMode === "overview" && styles.weekModeButtonActive]}
                onPress={() => setDayMode("overview")}
              >
                <Ionicons name="list-outline" size={14} color={dayMode === "overview" ? Colors.dark.backgroundRoot : Colors.dark.text} />
                <Text style={[styles.weekModeText, dayMode === "overview" && styles.weekModeTextActive]}>Overview</Text>
              </Pressable>
              <Pressable
                style={[styles.weekModeButton, dayMode === "slots" && styles.weekModeButtonActive]}
                onPress={() => setDayMode("slots")}
              >
                <Ionicons name="grid-outline" size={14} color={dayMode === "slots" ? Colors.dark.backgroundRoot : Colors.dark.text} />
                <Text style={[styles.weekModeText, dayMode === "slots" && styles.weekModeTextActive]}>Slots</Text>
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

        {/* Date Navigation - Gaming Style - Tap to collapse/expand filters */}
        <CoachMarkTarget id="cal_date_nav">
        <View style={styles.dateNavGaming}>
          <Pressable 
            style={styles.dateNavButtonGaming} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (viewMode === "day") changeDate(-1);
              else if (viewMode === "week") changeWeek(-1);
              else changeMonth(-1);
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#00D4FF" />
          </Pressable>
          <Pressable 
            style={[styles.dateDisplayGaming, headerCollapsed && styles.dateDisplayCollapsed]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setHeaderCollapsed(!headerCollapsed);
            }}
            onLongPress={goToToday}
          >
            <Text style={styles.dateTextGaming}>
              {viewMode === "day" && formatDate(selectedDate)}
              {viewMode === "week" && formatWeekRange(weekDates)}
              {viewMode === "month" && formatMonthYear(selectedDate)}
            </Text>
            {selectedDate.toDateString() === new Date().toDateString() && viewMode === "day" && (
              <View style={styles.todayBadgeGaming}>
                <Text style={styles.todayBadgeTextGaming}>TODAY</Text>
              </View>
            )}
            <View style={[styles.collapseIndicator, headerCollapsed && styles.collapseIndicatorExpanded]}>
              {headerCollapsed && (
                <Text style={styles.collapseHintText}>TAP TO SHOW FILTERS</Text>
              )}
              <Ionicons 
                name={headerCollapsed ? "chevron-down" : "chevron-up"} 
                size={16} 
                color={headerCollapsed ? "#00D4FF" : Colors.dark.textMuted} 
              />
            </View>
          </Pressable>
          <Pressable 
            style={styles.dateNavButtonGaming} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (viewMode === "day") changeDate(1);
              else if (viewMode === "week") changeWeek(1);
              else changeMonth(1);
            }}
          >
            <Ionicons name="chevron-forward" size={22} color="#00D4FF" />
          </Pressable>
        </View>
        </CoachMarkTarget>

        {/* View Mode Toggle - Gaming Style - Collapsible */}
        {!headerCollapsed && (
          <CoachMarkTarget id="cal_view_toggle">
          <View style={styles.viewToggleGaming}>
            {(["day", "week", "month"] as const).map((mode) => (
              <Pressable
                key={mode}
                style={[styles.viewButtonGaming, viewMode === mode && styles.viewButtonGamingActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setViewMode(mode);
                }}
              >
                {viewMode === mode ? (
                  <LinearGradient
                    colors={["#00D4FF", "#2ECC40"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.viewButtonGamingGradient}
                  >
                    <Text style={styles.viewButtonTextGamingActive}>
                      {mode.toUpperCase()}
                    </Text>
                  </LinearGradient>
                ) : (
                  <Text style={styles.viewButtonTextGaming}>
                    {mode.toUpperCase()}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
          </CoachMarkTarget>
        )}
      </View>

      {/* DAY VIEW - OVERVIEW MODE (Compact Lesson List for selected date) */}
      {viewMode === "day" && dayMode === "overview" && (
        <ScrollView 
          style={styles.calendarScroll} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.weekCardsContainer}
        >
          {(() => {
            const daySessions = getSessionsForDate(selectedDate)
              .sort((a, b) => parseUTCTimestamp(a.startTime).getTime() - parseUTCTimestamp(b.startTime).getTime());
            
            if (daySessions.length === 0) {
              return (
                <View style={styles.overviewEmpty}>
                  <Ionicons name="calendar-outline" size={48} color={Colors.dark.tabIconDefault} />
                  <Text style={styles.overviewEmptyText}>No lessons today</Text>
                </View>
              );
            }
            
            return daySessions.map((session) => {
              const typeLabel = session.sessionType === "private" ? "Private" :
                                session.sessionType === "semi_private" ? "Semi-Private" :
                                session.sessionType === "group" ? "Group" :
                                session.sessionType === "physical" ? "Physical" : "Session";
              const playerNames = session.players?.map(p => p.name.split(" ")[0]).join(", ") || "";
              const courtName = courts.find(c => c.id === session.courtId)?.name || "";
              const gradientColors = getSessionTypeGradient(session.sessionType);
              const now = new Date();
              const sessionStart = parseUTCTimestamp(session.startTime);
              const sessionEnd = parseUTCTimestamp(session.endTime);
              const isPast = sessionEnd < now;
              const isActive = now >= sessionStart && now < sessionEnd;
              
              return (
                <Pressable
                  key={session.id}
                  style={[styles.overviewSessionRow, isPast && styles.overviewSessionRowPast]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedSessionForDetail(session as Session);
                  }}
                >
                  <View style={[styles.overviewSessionAccent, { backgroundColor: gradientColors[0] }]} />
                  <View style={styles.overviewSessionTime}>
                    <Text style={[styles.overviewTimeText, isPast && styles.overviewTimePast]}>
                      {formatTimeInTimezone(session.startTime, academyTimezone)}
                    </Text>
                    <Text style={styles.overviewTimeDash}>-</Text>
                    <Text style={[styles.overviewTimeText, isPast && styles.overviewTimePast]}>
                      {formatTimeInTimezone(session.endTime, academyTimezone)}
                    </Text>
                  </View>
                  <View style={styles.overviewSessionInfo}>
                    <View style={styles.overviewSessionTopRow}>
                      <Text style={[styles.overviewTypeLabel, { color: gradientColors[0] }]}>{typeLabel}</Text>
                      {isActive ? (
                        <View style={styles.overviewLiveBadge}>
                          <View style={styles.overviewLiveDot} />
                          <Text style={styles.overviewLiveText}>LIVE</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.overviewSessionDetails}>
                      {playerNames ? <Text style={styles.overviewPlayerText} numberOfLines={1}>{playerNames}</Text> : null}
                      {courtName ? (
                        <View style={styles.overviewCourtChip}>
                          <Ionicons name="location-outline" size={10} color={Colors.dark.tabIconDefault} />
                          <Text style={styles.overviewCourtText}>{courtName}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.dark.tabIconDefault} />
                </Pressable>
              );
            });
          })()}
        </ScrollView>
      )}

      {/* DAY VIEW - SLOTS MODE */}
      {viewMode === "day" && dayMode === "slots" && (
        <>
          {/* Location & Court Filters - Collapsible */}
          {!headerCollapsed && (allLocations.length > 0 || allCourts.length > 1) && (
            <View style={styles.filterSection}>
              {/* Location Filter Row */}
              {allLocations.length > 0 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.locationFilterContainer}
                  contentContainerStyle={styles.courtFilterContent}
                >
                  <Pressable
                    style={[
                      styles.locationFilterChip,
                      !selectedLocationFilter && styles.locationFilterChipActive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedLocationFilter(null);
                      setSelectedCourtFilter(null); // Reset court filter when changing location
                    }}
                  >
                    <Ionicons name="location" size={12} color={!selectedLocationFilter ? Colors.dark.gold : Colors.dark.textMuted} style={{ marginRight: 4 }} />
                    <Text style={[
                      styles.locationFilterText,
                      !selectedLocationFilter && styles.locationFilterTextActive,
                    ]}>All Locations</Text>
                  </Pressable>
                  {allLocations.map((location) => (
                    <Pressable
                      key={location.id}
                      style={[
                        styles.locationFilterChip,
                        selectedLocationFilter === location.id && styles.locationFilterChipActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedLocationFilter(location.id);
                        setSelectedCourtFilter(null); // Reset court filter when changing location
                      }}
                    >
                      <Ionicons name="location" size={12} color={selectedLocationFilter === location.id ? Colors.dark.gold : Colors.dark.textMuted} style={{ marginRight: 4 }} />
                      <Text style={[
                        styles.locationFilterText,
                        selectedLocationFilter === location.id && styles.locationFilterTextActive,
                      ]}>{location.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              
              {/* Court Filter Row */}
              {locationFilteredCourts.length > 1 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.courtFilterContainer}
                  contentContainerStyle={styles.courtFilterContent}
                >
                  <Pressable
                    style={[
                      styles.courtFilterChip,
                      !selectedCourtFilter && styles.courtFilterChipActive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCourtFilter(null);
                    }}
                  >
                    <Text style={[
                      styles.courtFilterText,
                      !selectedCourtFilter && styles.courtFilterTextActive,
                    ]}>All Courts</Text>
                  </Pressable>
                  {locationFilteredCourts.map((court) => (
                    <Pressable
                      key={court.id}
                      style={[
                        styles.courtFilterChip,
                        selectedCourtFilter === court.id && styles.courtFilterChipActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedCourtFilter(court.id);
                      }}
                    >
                      <Text style={[
                        styles.courtFilterText,
                        selectedCourtFilter === court.id && styles.courtFilterTextActive,
                      ]}>{court.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Court Headers - Clean minimal style */}
          <CoachMarkTarget id="cal_court_grid">
          <View style={styles.courtHeaders}>
            <View style={styles.timeColumnHeader} />
            <ScrollView
              ref={courtHeaderScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                // Sync scroll with court lanes
                courtLanesScrollRef.current?.scrollTo({
                  x: e.nativeEvent.contentOffset.x,
                  animated: false,
                });
              }}
              contentContainerStyle={{ width: totalCourtsWidth }}
            >
              {courts.map((court, index) => {
                return (
                  <View key={court.id} style={[
                    styles.courtHeader,
                    { width: dynamicLaneWidth },
                    index > 0 && styles.courtHeaderWithDivider,
                  ]}>
                    <Text style={styles.courtHeaderText} numberOfLines={1}>{court.name}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
          </CoachMarkTarget>

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

              {/* Court Lanes - Horizontal Scrollable */}
              <ScrollView
                ref={courtLanesScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  // Sync scroll with court headers
                  courtHeaderScrollRef.current?.scrollTo({
                    x: e.nativeEvent.contentOffset.x,
                    animated: false,
                  });
                }}
                contentContainerStyle={{ width: totalCourtsWidth }}
                style={styles.courtLanesContainer}
              >
                {courts.map((court, courtIndex) => (
                  <View key={court.id} style={[
                    styles.courtLane,
                    { width: dynamicLaneWidth },
                    courtIndex > 0 && styles.courtLaneWithDivider,
                  ]}>
                    {/* Hour grid lines and clickable slots */}
                    {hours.map((hour, hourIndex) => (
                      <Pressable
                        key={hour}
                        style={[
                          styles.hourSlot, 
                          { height: hourHeight },
                          hourIndex % 2 === 0 ? styles.hourSlotEven : styles.hourSlotOdd,
                          isCellSelected(court.id, hour) && styles.hourSlotSelected,
                        ]}
                        onPress={() => handleSlotPress(court.id, hour)}
                        onLongPress={() => handleSlotLongPress(court.id, court.name, hour, courtIndex)}
                        delayLongPress={400}
                      >
                        <View style={styles.hourLine} />
                        {timeGrid === 30 && <View style={[styles.halfHourLine, { top: hourHeight / 2 }]} />}
                        {isCellSelected(court.id, hour) && (
                          <View style={styles.selectedCellOverlay}>
                            <Feather name="check" size={14} color={Colors.dark.primary} />
                          </View>
                        )}
                      </Pressable>
                    ))}

                    {/* Render draggable sessions for this court (or unassigned sessions in first court) */}
                    {ownSessions
                      .filter((s) => {
                        // Filter by selected date using academy timezone (not UTC!)
                        const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
                        const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                        if (sessionDateStr !== selectedDateStr) return false;
                        // Then filter by court
                        return s.courtId === court.id || (s.courtId === null && courtIndex === 0);
                      })
                      .map((session) => {
                        const { top, height } = getSessionPosition(session);
                        const now = new Date();
                        const sessionEnd = parseUTCTimestamp(session.endTime);
                        const sessionStart = parseUTCTimestamp(session.startTime);
                        const isPast = sessionEnd < now;
                        const isActive = now >= sessionStart && now < sessionEnd;
                        const typeLabel = session.sessionType === "private" ? "Private" :
                                          session.sessionType === "semi_private" ? "Semi" :
                                          session.sessionType === "group" ? "Group" :
                                          session.sessionType === "physical" ? "Physical" : "";
                        const playerName = session.players?.[0]?.name?.split(" ")[0] || "";
                        const sessionLabel = playerName ? `${typeLabel}\n${playerName}` : typeLabel;
                        const gradientColors = getSessionTypeGradient(session.sessionType);
                        return (
                          <DraggableSessionBlock
                            key={session.id}
                            session={session}
                            top={top}
                            height={height}
                            isPast={isPast}
                            isActive={isActive}
                            gradientColors={gradientColors}
                            sessionLabel={sessionLabel}
                            formattedTime={formatTimeInTimezone(session.startTime, academyTimezone)}
                            hourHeight={hourHeight}
                            courtLaneWidth={dynamicLaneWidth}
                            onTap={() => handleSessionTap(session)}
                            onLongPress={() => handleSessionLongPress(session)}
                            onDragEnd={(deltaY, deltaX) => handleSessionDragEnd(session, deltaY, deltaX, courtIndex)}
                            onDragUpdate={(deltaY, deltaX, isDragging) => checkDragConflict(session, deltaY, deltaX, courtIndex, isDragging)}
                            hasConflict={dragConflict === session.id}
                          />
                        );
                      })}

                    {/* Render blocked sessions */}
                    {blockedSessions
                      .filter((s) => s.courtId === court.id || (s.courtId === null && courtIndex === 0))
                      .map((session) => {
                        const { top, height } = getSessionPosition(session);
                        const isCourtBlock = (session as any).isCourtBlock;
                        return (
                          <Pressable
                            key={session.id}
                            style={[
                              isCourtBlock ? styles.blockedBlock : styles.blockedBlockOther,
                              { top, height: height - 2 },
                            ]}
                            onPress={() => handleBlockedSlotPress(session)}
                          >
                            {isCourtBlock ? (
                              <>
                                <Feather name="lock" size={12} color="#FF4444" style={{ marginBottom: 2 }} />
                                <Text style={styles.blockedTextCourt}>BLOCKED</Text>
                                {(session as any).blockedReason && height > 40 ? (
                                  <Text style={styles.blockedReasonText}>
                                    {(session as any).blockedReason}
                                  </Text>
                                ) : null}
                              </>
                            ) : (
                              <Text style={styles.blockedText}>Unavailable</Text>
                            )}
                          </Pressable>
                        );
                      })}

                    {/* Render coach personal blocks (orange dashed) */}
                    {coachBlocks
                      .filter((block: any) => {
                        const blockDateStr = getLocalDateString(new Date(block.startTime), academyTimezone);
                        const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                        return blockDateStr === selectedDateStr;
                      })
                      .map((block: any) => {
                        const startDt = new Date(block.startTime);
                        const endDt = new Date(block.endTime);
                        const startHour = startDt.getUTCHours() + startDt.getUTCMinutes() / 60;
                        const endHour = endDt.getUTCHours() + endDt.getUTCMinutes() / 60;
                        const top = (startHour - START_HOUR) * hourHeight;
                        const height = (endHour - startHour) * hourHeight;
                        return (
                          <View
                            key={block.id + "-" + court.id}
                            style={[
                              styles.coachBlockStyle,
                              { top, height: height - 2 },
                            ]}
                          >
                            <Feather name="user-x" size={10} color="#FFA500" style={{ marginBottom: 1 }} />
                            <Text style={styles.coachBlockText}>MY BLOCK</Text>
                            {height > 30 && block.blockReason ? (
                              <Text style={[styles.coachBlockText, { fontWeight: "400", fontSize: 8 }]}>
                                {block.blockReason}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}

                    {/* Render cross-location busy blocks - show where coach is busy elsewhere */}
                    {crossLocationBusyBlocks
                      .filter((block) => {
                        // Filter by selected date
                        const blockDateStr = getLocalDateString(block.startTime, academyTimezone);
                        const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                        if (blockDateStr !== selectedDateStr) return false;
                        // Filter by court
                        return block.courtId === court.id;
                      })
                      .map((block) => {
                        const startLocal = getTimeInTimezone(block.startTime, academyTimezone);
                        const endLocal = getTimeInTimezone(block.endTime, academyTimezone);
                        const startHour = startLocal.hours + startLocal.minutes / 60;
                        const endHour = endLocal.hours + endLocal.minutes / 60;
                        const top = (startHour - focusBaseHour) * hourHeight;
                        const height = (endHour - startHour) * hourHeight;
                        return (
                          <View
                            key={block.id}
                            style={[styles.busyElsewhereBlock, { top, height: Math.max(height - 2, 24) }]}
                          >
                            <Feather name="map-pin" size={10} color={Colors.dark.gold} style={{ marginRight: 2 }} />
                            <Text style={styles.busyElsewhereText} numberOfLines={1}>
                              @ {block.busyAtLocation}
                            </Text>
                          </View>
                        );
                      })}

                    {/* Render travel time blocks (only on first court lane) */}
                    {courtIndex === 0 && travelTimeBlocks
                      .filter((block) => {
                        // Use academy timezone for date comparison
                        const blockDateStr = getLocalDateString(block.startTime, academyTimezone);
                        const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                        return blockDateStr === selectedDateStr;
                      })
                      .map((block) => {
                        // Use timezone-aware time extraction for positioning
                        const startLocal = getTimeInTimezone(block.startTime, academyTimezone);
                        const endLocal = getTimeInTimezone(block.endTime, academyTimezone);
                        const startHour = startLocal.hours + startLocal.minutes / 60;
                        const endHour = endLocal.hours + endLocal.minutes / 60;
                        const top = (startHour - focusBaseHour) * hourHeight;
                        const height = (endHour - startHour) * hourHeight;
                        return (
                          <View
                            key={block.id}
                            style={[styles.travelTimeBlock, { top, height: Math.max(height - 2, 24), width: courts.length * dynamicLaneWidth - 4 }]}
                          >
                            <Feather name="navigation" size={12} color={Colors.dark.gold} style={{ marginRight: 4 }} />
                            <Text style={styles.travelTimeBlockText}>{block.minutes} min travel</Text>
                          </View>
                        );
                      })}
                  </View>
                ))}

                {/* Now Line */}
                {nowPosition !== null && isToday && (
                  <View style={[styles.nowLine, { top: nowPosition, width: totalCourtsWidth }]}>
                    <PulsingDot />
                    <View style={[styles.nowLineBar, { width: totalCourtsWidth }]} />
                  </View>
                )}
              </ScrollView>
            </View>
          </ScrollView>
        </>
      )}

      {/* WEEK VIEW - OVERVIEW MODE (Week Calendar Grid - sessions only, no empty slots) */}
      {viewMode === "week" && weekMode === "overview" && (
        <>
          {/* Court Filter for Week Overview */}
          {allCourts.length > 1 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.courtFilterContainer}
              contentContainerStyle={styles.courtFilterContent}
            >
              <Pressable
                style={[styles.courtFilterChip, !selectedCourtFilter && styles.courtFilterChipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedCourtFilter(null);
                }}
              >
                <Text style={[styles.courtFilterText, !selectedCourtFilter && styles.courtFilterTextActive]}>All Courts</Text>
              </Pressable>
              {allCourts.map((court) => (
                <Pressable
                  key={court.id}
                  style={[styles.courtFilterChip, selectedCourtFilter === court.id && styles.courtFilterChipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCourtFilter(court.id);
                  }}
                >
                  <Text style={[styles.courtFilterText, selectedCourtFilter === court.id && styles.courtFilterTextActive]}>{court.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <ScrollView 
            style={styles.calendarScroll} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.xl }}
          >
            {/* Sticky Week Day Header Row */}
            <View style={styles.weekCalHeader}>
              <View style={styles.weekCalTimeCol}>
                <Text style={styles.weekCalTimeLabel}>TIME</Text>
              </View>
              {weekDates.map((date, idx) => {
                const dayLetters = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
                const isToday = date.toDateString() === new Date().toDateString();
                return (
                  <Pressable
                    key={idx}
                    style={[styles.weekCalDayCol, isToday && styles.weekCalDayColToday]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      handleDateSelect(date);
                    }}
                  >
                    <Text style={[styles.weekCalDayLabel, isToday && styles.weekCalDayLabelToday]}>{dayLetters[idx]}</Text>
                    <Text style={[styles.weekCalDateLabel, isToday && styles.weekCalDateLabelToday]}>{date.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Calendar Grid - only time rows that have sessions */}
            {(() => {
              const filteredSessions = selectedCourtFilter 
                ? ownSessions.filter(s => s.courtId === selectedCourtFilter)
                : ownSessions;

              const weekSessionsByDay: Record<number, typeof ownSessions> = {};
              const allHours = new Set<number>();
              
              const getHourInTz = (isoStr: string) => {
                const d = parseUTCTimestamp(isoStr);
                const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: academyTimezone }).formatToParts(d);
                const hourPart = parts.find(p => p.type === "hour");
                return parseInt(hourPart?.value || "0", 10);
              };

              weekDates.forEach((date, idx) => {
                const targetDateStr = formatDateObjectInTimezone(date, academyTimezone);
                const daySessions = filteredSessions.filter((s) => {
                  const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
                  return sessionDateStr === targetDateStr;
                });
                weekSessionsByDay[idx] = daySessions;
                daySessions.forEach(s => {
                  allHours.add(getHourInTz(s.startTime));
                });
              });

              const sortedHours = Array.from(allHours).sort((a, b) => a - b);

              if (sortedHours.length === 0) {
                return (
                  <View style={styles.overviewEmpty}>
                    <Ionicons name="calendar-outline" size={48} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.overviewEmptyText}>No lessons this week</Text>
                  </View>
                );
              }

              return sortedHours.map(hour => {
                const timeStr = `${hour.toString().padStart(2, "0")}:00`;
                return (
                  <View key={hour} style={styles.weekCalRow}>
                    <View style={styles.weekCalTimeCol}>
                      <Text style={styles.weekCalTimeText}>{timeStr}</Text>
                    </View>
                    {weekDates.map((_, dayIdx) => {
                      const daySessions = weekSessionsByDay[dayIdx] || [];
                      const hourSessions = daySessions.filter(s => {
                        return getHourInTz(s.startTime) === hour;
                      });
                      const isToday = weekDates[dayIdx].toDateString() === new Date().toDateString();

                      return (
                        <View key={dayIdx} style={[styles.weekCalCell, isToday && styles.weekCalCellToday]}>
                          {hourSessions.map(session => {
                            const gradientColors = getSessionTypeGradient(session.sessionType);
                            const typeLabel = session.sessionType === "private" ? "PVT" :
                                              session.sessionType === "semi_private" ? "SEMI" :
                                              session.sessionType === "group" ? "GRP" :
                                              session.sessionType === "physical" ? "FIT" : "SES";
                            const playerName = session.players?.[0]?.name?.split(" ")[0] || "";
                            const now = new Date();
                            const sessionEnd = parseUTCTimestamp(session.endTime);
                            const sessionStart = parseUTCTimestamp(session.startTime);
                            const isPast = sessionEnd < now;
                            const isActive = now >= sessionStart && now < sessionEnd;

                            return (
                              <Pressable
                                key={session.id}
                                style={[
                                  styles.weekCalSessionBlock,
                                  { backgroundColor: gradientColors[0] + "30", borderLeftColor: gradientColors[0] },
                                  isPast && styles.weekCalSessionPast,
                                  isActive && styles.weekCalSessionActive,
                                ]}
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setSelectedSessionForDetail(session as Session);
                                }}
                              >
                                <Text style={[styles.weekCalSessionType, { color: gradientColors[0] }]} numberOfLines={1}>{typeLabel}</Text>
                                {playerName ? <Text style={styles.weekCalSessionPlayer} numberOfLines={1}>{playerName}</Text> : null}
                                {isActive ? <View style={styles.weekCalLiveDot} /> : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                );
              });
            })()}
          </ScrollView>
        </>
      )}

      {/* WEEK VIEW - SLOTS MODE (Playtomic-style Time Grid) */}
      {viewMode === "week" && weekMode === "availability" && (
        <>
          {/* Sticky Week Header with Day Columns */}
          <View style={styles.weekGridHeader}>
            <View style={styles.weekTimeColumnHeader}>
              <Text style={styles.weekTimeHeaderText}>Time</Text>
            </View>
            {weekDates.map((date, dayIdx) => {
              const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <Pressable
                  key={dayIdx}
                  style={[styles.weekDayHeader, isToday && styles.weekDayHeaderToday]}
                  onPress={() => {
                    setSelectedDate(date);
                    setViewMode("day");
                  }}
                >
                  <Text style={[styles.weekDayName, isToday && styles.weekDayNameToday]}>
                    {dayNames[dayIdx]}
                  </Text>
                  <Text style={[styles.weekDayNumber, isToday && styles.weekDayNumberToday]}>
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Scrollable Time Grid */}
          <ScrollView style={styles.weekGridScroll} showsVerticalScrollIndicator={false}>
            {(() => {
              // Fixed hour range for week view (never affected by focusMode)
              const weekHours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
              
              // Calculate week now position relative to START_HOUR
              const getWeekNowPosition = () => {
                const now = new Date();
                const currentHours = now.getHours() + now.getMinutes() / 60;
                if (currentHours < START_HOUR || currentHours > END_HOUR) return null;
                return (currentHours - START_HOUR) * hourHeight;
              };
              const weekNowPosition = getWeekNowPosition();
              
              // Get blocked sessions for a specific date (using academy timezone)
              const getBlockedSessionsForDate = (date: Date) => {
                const targetDateStr = formatDateObjectInTimezone(date, academyTimezone);
                return blockedSessions.filter((s) => {
                  const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
                  return sessionDateStr === targetDateStr;
                });
              };
              
              return (
                <View style={styles.weekGridBody}>
                  {/* Time Column */}
                  <View style={styles.weekTimeColumn}>
                    {weekHours.map((hour) => (
                      <View key={hour} style={[styles.weekTimeSlot, { height: hourHeight }]}>
                        <Text style={styles.weekTimeText}>{formatTime(hour)}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Day Columns with Sessions */}
                  <View style={styles.weekDayColumns}>
                    {weekDates.map((date, dayIdx) => {
                      const isDayToday = date.toDateString() === new Date().toDateString();
                      const daySessions = getSessionsForDate(date);
                      const dayBlockedSessions = getBlockedSessionsForDate(date);
                      
                      // Calculate session positions for this day (using academy timezone)
                      const getWeekSessionPosition = (session: Session | BlockedSession) => {
                        const startLocal = getTimeInTimezone(session.startTime, academyTimezone);
                        const endLocal = getTimeInTimezone(session.endTime, academyTimezone);
                        const startHour = startLocal.hours + startLocal.minutes / 60;
                        const endHour = endLocal.hours + endLocal.minutes / 60;
                        const top = (startHour - START_HOUR) * hourHeight;
                        const height = (endHour - startHour) * hourHeight;
                        return { top, height };
                      };

                      return (
                        <View key={dayIdx} style={[styles.weekDayColumn, isDayToday && styles.weekDayColumnToday]}>
                          {/* Hour grid lines and clickable slots */}
                          {weekHours.map((hour) => (
                            <Pressable
                              key={hour}
                              style={[styles.weekHourSlot, { height: hourHeight }]}
                              onPress={() => {
                                const time = new Date(date);
                                time.setHours(hour, 0, 0, 0);
                                setSelectedDate(date);
                                setSelectedSlot({ courtId: courts[0]?.id || "", time });
                                setShowCreateDrawer(true);
                              }}
                            >
                              <View style={styles.weekHourLine} />
                              {timeGrid === 30 && <View style={[styles.weekHalfHourLine, { top: hourHeight / 2 }]} />}
                            </Pressable>
                          ))}

                          {/* Render blocked sessions */}
                          {dayBlockedSessions.map((session) => {
                            const { top, height } = getWeekSessionPosition(session);
                            return (
                              <View
                                key={session.id}
                                style={[
                                  styles.weekBlockedBlock,
                                  {
                                    top,
                                    height: Math.max(height - 2, 20),
                                  },
                                ]}
                              >
                                <Text style={styles.weekBlockedText}>Blocked</Text>
                              </View>
                            );
                          })}

                          {/* Render coach personal blocks in week view */}
                          {coachBlocks
                            .filter((block: any) => {
                              const blockDateStr = getLocalDateString(new Date(block.startTime), academyTimezone);
                              const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
                              return blockDateStr === dateStr;
                            })
                            .map((block: any) => {
                              const startDt = new Date(block.startTime);
                              const endDt = new Date(block.endTime);
                              const startHour = startDt.getUTCHours() + startDt.getUTCMinutes() / 60;
                              const endHour = endDt.getUTCHours() + endDt.getUTCMinutes() / 60;
                              const top = (startHour - START_HOUR) * hourHeight;
                              const height = (endHour - startHour) * hourHeight;
                              return (
                                <View
                                  key={block.id + "-week"}
                                  style={[styles.coachBlockStyle, { top, height: Math.max(height - 2, 16) }]}
                                >
                                  <Text style={[styles.coachBlockText, { fontSize: 7 }]}>MY BLOCK</Text>
                                </View>
                              );
                            })}

                          {/* Render draggable sessions for this day */}
                          {daySessions.map((session) => {
                            const { top, height } = getWeekSessionPosition(session);
                            const now = new Date();
                            const sessionEnd = parseUTCTimestamp(session.endTime);
                            const sessionStart = parseUTCTimestamp(session.startTime);
                            const isPast = sessionEnd < now;
                            const isActive = now >= sessionStart && now < sessionEnd;
                            const gradientColors = getSessionTypeGradient(session.sessionType);
                            
                            // Session type as full name for week view
                            const typeLabel = session.sessionType === "private" ? "PRIVATE" :
                                              session.sessionType === "semi_private" ? "SEMI" :
                                              session.sessionType === "group" ? "GROUP" : 
                                              session.sessionType === "physical" ? "PHYS" : "";
                            
                            // Get player names for the session
                            const playerNames = session.players?.map(p => p.name.split(" ")[0]).join(", ") || "";
                            
                            // Get location name
                            const sessionCourt = courts.find(c => c.id === session.courtId);
                            const courtLocation = sessionCourt?.locationId ? allLocations.find(l => l.id === sessionCourt.locationId) : null;
                            const locationShortName = courtLocation?.name?.split(" ")[0] || "";
                            
                            // Build session label: TYPE + name(s) + location
                            const sessionLabel = typeLabel;
                            const sessionSubtitle = playerNames || locationShortName;
                            
                            const dayColumnWidth = (screenWidth - TIME_COLUMN_WIDTH - Spacing.lg * 2) / 7;
                            
                            return (
                              <WeekDraggableSessionBlock
                                key={session.id}
                                session={session}
                                top={top}
                                height={height}
                                isPast={isPast}
                                isActive={isActive}
                                gradientColors={gradientColors}
                                sessionLabel={sessionLabel}
                                formattedTime={sessionSubtitle}
                                hourHeight={hourHeight}
                                dayColumnWidth={dayColumnWidth}
                                onTap={() => {
                                  setSelectedDate(date);
                                  handleSessionTap(session);
                                }}
                                onLongPress={() => handleSessionLongPress(session)}
                                onDragEnd={(deltaY, deltaX) => handleWeekSessionDragEnd(session, deltaY, deltaX, dayColumnWidth)}
                              />
                            );
                          })}

                          {/* Current time line for today */}
                          {isDayToday && weekNowPosition !== null && (
                            <View style={[styles.weekNowLine, { top: weekNowPosition }]} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
          </ScrollView>
        </>
      )}

      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <ScrollView 
          style={{ flex: 1 }} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        >
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

          <View>
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
          </View>
          
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
                      const sStart = parseUTCTimestamp(s.startTime);
                      const sEnd = parseUTCTimestamp(s.endTime);
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
                const morningMinutes = daySessions.filter(s => parseUTCTimestamp(s.startTime).getHours() < 12).reduce((sum, s) => {
                  const mins = (parseUTCTimestamp(s.endTime).getTime() - parseUTCTimestamp(s.startTime).getTime()) / 60000;
                  return sum + mins;
                }, 0);
                const afternoonMinutes = daySessions.filter(s => {
                  const hour = parseUTCTimestamp(s.startTime).getHours();
                  return hour >= 12 && hour < 17;
                }).reduce((sum, s) => {
                  const mins = (parseUTCTimestamp(s.endTime).getTime() - parseUTCTimestamp(s.startTime).getTime()) / 60000;
                  return sum + mins;
                }, 0);
                const eveningMinutes = daySessions.filter(s => parseUTCTimestamp(s.startTime).getHours() >= 17).reduce((sum, s) => {
                  const mins = (parseUTCTimestamp(s.endTime).getTime() - parseUTCTimestamp(s.startTime).getTime()) / 60000;
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
                        <View style={styles.peakPill}>
                          <Ionicons 
                            name={peakTime === "Morning" ? "sunny-outline" : peakTime === "Afternoon" ? "partly-sunny-outline" : "moon-outline"} 
                            size={10} 
                            color={Colors.dark.xpCyan} 
                          />
                          <Text style={styles.peakPillText}>{peakTime}</Text>
                        </View>
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
                      const sStart = parseUTCTimestamp(s.startTime);
                      const sEnd = parseUTCTimestamp(s.endTime);
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
                    const sStart = parseUTCTimestamp(s.startTime);
                    const sEnd = parseUTCTimestamp(s.endTime);
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
        </ScrollView>
      )}

      {/* Selection Mode Toolbar */}
      {selectionMode && viewMode === "day" ? (
        <View style={[styles.selectionToolbar, { bottom: Math.max(insets.bottom, 20) + 80 }]}>
          <View style={styles.selectionToolbarContent}>
            <Pressable style={styles.selectionCancelBtn} onPress={clearSelection}>
              <Feather name="x" size={20} color="#FFF" />
            </Pressable>
            <Text style={styles.selectionCount}>
              {selectedCells.length} slot{selectedCells.length !== 1 ? "s" : ""} selected
            </Text>
            <Pressable 
              style={[styles.selectionBlockBtn, selectedCells.length === 0 && { opacity: 0.4 }]} 
              onPress={confirmSelection}
              disabled={selectedCells.length === 0}
            >
              <Feather name="lock" size={18} color="#FFF" />
              <Text style={styles.selectionBlockBtnText}>BLOCK</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {/* FAB Button - Gaming Style with Gradient */}
          <Pressable
            style={styles.fabContainer}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowCreateDrawer(true);
            }}
          >
            <Animated.View style={styles.fabGlow} />
            <LinearGradient
              colors={["#00D4FF", "#2ECC40"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Ionicons name="add" size={28} color="#1A1A1A" />
            </LinearGradient>
          </Pressable>
        </>
      )}

      {/* Block Action Modal - Enhanced with date range & weekday selector */}
      <Modal
        visible={showBlockActionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBlockActionModal(false)}
      >
        <Pressable style={styles.blockModalOverlay} onPress={() => setShowBlockActionModal(false)}>
          <ScrollView style={{ maxHeight: "90%" }} contentContainerStyle={{ justifyContent: "center", flexGrow: 1 }}>
          <Pressable style={styles.blockModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.blockModalTitle}>BLOCK MY TIME</Text>
            <Text style={styles.blockModalSubtitle}>
              Block your availability as a coach
            </Text>

            {/* Time summary */}
            <View style={styles.blockModalSummary}>
              {(() => {
                const allHours = selectedCells.map(c => c.hour).sort((a, b) => a - b);
                const uniqueHours = [...new Set(allHours)];
                if (uniqueHours.length === 0) return null;
                const startH = uniqueHours[0];
                const endH = uniqueHours[uniqueHours.length - 1] + 1;
                return (
                  <View style={styles.blockModalSummaryRow}>
                    <Feather name="clock" size={14} color={Colors.dark.primary} />
                    <Text style={styles.blockModalTimeRange}>
                      {formatTime(startH)} - {formatTime(endH)}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Date Range */}
            <Text style={styles.blockModalReasonLabel}>DATE RANGE</Text>
            <View style={styles.dateRangeRow}>
              <Pressable 
                style={styles.datePickerBtn} 
                onPress={() => setShowFromPicker(!showFromPicker)}
              >
                <Feather name="calendar" size={14} color={Colors.dark.primary} />
                <Text style={styles.datePickerBtnText}>
                  {blockDateFrom.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </Text>
              </Pressable>
              <Text style={styles.dateRangeArrow}>to</Text>
              <Pressable 
                style={styles.datePickerBtn} 
                onPress={() => setShowToPicker(!showToPicker)}
              >
                <Feather name="calendar" size={14} color={Colors.dark.primary} />
                <Text style={styles.datePickerBtnText}>
                  {blockDateTo.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </Text>
              </Pressable>
            </View>
            
            {showFromPicker ? (
              <View style={styles.inlineDatePicker}>
                <View style={styles.datePickerControls}>
                  <Pressable onPress={() => {
                    const d = new Date(blockDateFrom);
                    d.setDate(d.getDate() - 1);
                    setBlockDateFrom(d);
                  }}>
                    <Feather name="chevron-left" size={24} color={Colors.dark.primary} />
                  </Pressable>
                  <Text style={styles.datePickerCurrentDate}>
                    {blockDateFrom.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                  <Pressable onPress={() => {
                    const d = new Date(blockDateFrom);
                    d.setDate(d.getDate() + 1);
                    setBlockDateFrom(d);
                    if (d > blockDateTo) setBlockDateTo(new Date(d));
                  }}>
                    <Feather name="chevron-right" size={24} color={Colors.dark.primary} />
                  </Pressable>
                </View>
                <Pressable style={styles.datePickerDone} onPress={() => setShowFromPicker(false)}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </Pressable>
              </View>
            ) : null}

            {showToPicker ? (
              <View style={styles.inlineDatePicker}>
                <View style={styles.datePickerControls}>
                  <Pressable onPress={() => {
                    const d = new Date(blockDateTo);
                    d.setDate(d.getDate() - 1);
                    if (d >= blockDateFrom) setBlockDateTo(d);
                  }}>
                    <Feather name="chevron-left" size={24} color={Colors.dark.primary} />
                  </Pressable>
                  <Text style={styles.datePickerCurrentDate}>
                    {blockDateTo.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                  <Pressable onPress={() => {
                    const d = new Date(blockDateTo);
                    d.setDate(d.getDate() + 1);
                    setBlockDateTo(d);
                  }}>
                    <Feather name="chevron-right" size={24} color={Colors.dark.primary} />
                  </Pressable>
                </View>
                <Pressable style={styles.datePickerDone} onPress={() => setShowToPicker(false)}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Weekday Selector */}
            <Text style={[styles.blockModalReasonLabel, { marginTop: 16 }]}>REPEAT ON DAYS</Text>
            <View style={styles.weekdayRow}>
              {[
                { label: "Sun", value: 0 },
                { label: "Mon", value: 1 },
                { label: "Tue", value: 2 },
                { label: "Wed", value: 3 },
                { label: "Thu", value: 4 },
                { label: "Fri", value: 5 },
                { label: "Sat", value: 6 },
              ].map((day) => {
                const isSelected = blockWeekdays.includes(day.value);
                return (
                  <Pressable
                    key={day.value}
                    style={[styles.weekdayPill, isSelected && styles.weekdayPillActive]}
                    onPress={() => {
                      setBlockWeekdays(prev =>
                        isSelected
                          ? prev.filter(d => d !== day.value)
                          : [...prev, day.value]
                      );
                    }}
                  >
                    <Text style={[styles.weekdayPillText, isSelected && styles.weekdayPillTextActive]}>
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Reason */}
            <Text style={[styles.blockModalReasonLabel, { marginTop: 16 }]}>REASON</Text>
            <View style={styles.blockReasonRow}>
              {["personal", "holiday", "tournament", "sick", "training"].map((reason) => (
                <Pressable
                  key={reason}
                  style={[
                    styles.blockReasonPill,
                    blockReason === reason && styles.blockReasonPillActive,
                  ]}
                  onPress={() => setBlockReason(reason)}
                >
                  <Text style={[
                    styles.blockReasonPillText,
                    blockReason === reason && styles.blockReasonPillTextActive,
                  ]}>
                    {reason.charAt(0).toUpperCase() + reason.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.blockModalActions}>
              <Pressable style={styles.blockModalCancelBtn} onPress={() => {
                setShowBlockActionModal(false);
              }}>
                <Text style={styles.blockModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={styles.blockModalConfirmBtn} 
                onPress={() => {
                  const allHours = selectedCells.map(c => c.hour).sort((a, b) => a - b);
                  const uniqueHours = [...new Set(allHours)];
                  const startH = uniqueHours[0];
                  const endH = uniqueHours[uniqueHours.length - 1] + 1;
                  const startTime = `${startH.toString().padStart(2, "0")}:00`;
                  const endTime = `${endH.toString().padStart(2, "0")}:00`;
                  const startDate = `${blockDateFrom.getFullYear()}-${(blockDateFrom.getMonth() + 1).toString().padStart(2, "0")}-${blockDateFrom.getDate().toString().padStart(2, "0")}`;
                  const endDate = `${blockDateTo.getFullYear()}-${(blockDateTo.getMonth() + 1).toString().padStart(2, "0")}-${blockDateTo.getDate().toString().padStart(2, "0")}`;
                  coachBlockMutation.mutate({
                    startDate,
                    endDate,
                    weekdays: blockWeekdays,
                    startTime,
                    endTime,
                    reason: blockReason,
                  });
                }}
                disabled={coachBlockMutation.isPending || blockWeekdays.length === 0}
              >
                {coachBlockMutation.isPending ? (
                  <ActivityIndicator size="small" color="#1A1A1A" />
                ) : (
                  <>
                    <Feather name="lock" size={16} color="#1A1A1A" />
                    <Text style={styles.blockModalConfirmText}>Block Time</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* Loading Overlay - Only show on initial load when there's no data */}
      {isLoading && !calendarData && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}
      
      {/* Subtle refresh indicator when fetching with existing data */}
      {isFetching && calendarData && (
        <View style={styles.refreshIndicator}>
          <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
        </View>
      )}

      {/* Create Session Wizard - Premium Card Flow */}
      <PremiumSessionWizard
        visible={showCreateDrawer}
        onClose={() => {
          setShowCreateDrawer(false);
          setSelectedSlot(null);
        }}
        initialDate={selectedSlot?.time}
        initialCourtId={selectedSlot?.courtId}
      />

      {/* Session Detail Drawer */}
      <SessionDetailDrawer
        visible={!!selectedSessionForDetail}
        session={selectedSessionForDetail}
        courts={courts}
        onClose={() => {
          setSelectedSessionForDetail(null);
          setDetailInitialAction(undefined);
        }}
        onAttendance={() => {
          if (selectedSessionForDetail) {
            handleAttendance(selectedSessionForDetail);
          }
        }}
        onFeedback={() => {
          if (selectedSessionForDetail) {
            setSelectedSessionForFeedback(selectedSessionForDetail);
            setSelectedSessionForDetail(null);
          }
        }}
        initialAction={detailInitialAction}
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

      {/* Quick Feedback Modal */}
      <QuickFeedbackModal
        visible={!!selectedSessionForFeedback}
        session={selectedSessionForFeedback}
        onClose={() => setSelectedSessionForFeedback(null)}
        onComplete={() => {
          setSelectedSessionForFeedback(null);
        }}
      />

      {/* Drag Confirm Modal */}
      <Modal
        visible={!!pendingDrag}
        transparent
        animationType="fade"
        onRequestClose={cancelPendingDrag}
      >
        <View style={dragModalStyles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cancelPendingDrag} />
          <View style={dragModalStyles.container}>
            <Animated.View entering={FadeIn.duration(200)} style={dragModalStyles.card}>
              {/* Header */}
              <View style={dragModalStyles.header}>
                <View style={dragModalStyles.iconContainer}>
                  <Ionicons name="move" size={28} color={GlowColors.primary} />
                </View>
                <Text style={dragModalStyles.title}>Move Session</Text>
                {pendingDrag?.isPastSession ? (
                  <View style={dragModalStyles.warningBadge}>
                    <Ionicons name="warning" size={14} color="#FF6B35" />
                    <Text style={dragModalStyles.warningText}>Past Time</Text>
                  </View>
                ) : null}
              </View>

              {/* Session Info */}
              <View style={dragModalStyles.sessionInfo}>
                <Text style={dragModalStyles.sessionName} numberOfLines={1}>
                  {pendingDrag?.session?.type === "private" ? "PRIVATE" : 
                   pendingDrag?.session?.type === "group" ? "GROUP" : 
                   pendingDrag?.session?.type?.toUpperCase() || "SESSION"}
                </Text>
              </View>

              {/* Changes Preview */}
              <View style={dragModalStyles.changesContainer}>
                {/* Time Change */}
                <View style={dragModalStyles.changeRow}>
                  <Ionicons name="time-outline" size={20} color="#8E8E93" />
                  <View style={dragModalStyles.changeContent}>
                    <Text style={dragModalStyles.changeLabel}>Time</Text>
                    <View style={dragModalStyles.changeValues}>
                      <Text style={dragModalStyles.oldValue}>
                        {pendingDrag?.session ? formatTimeInTimezone(parseUTCTimestamp(pendingDrag.session.startTime)) : ""}
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color={GlowColors.primary} />
                      <Text style={dragModalStyles.newValue}>
                        {pendingDrag?.newStart ? formatTimeInTimezone(pendingDrag.newStart) : ""}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Date Change (if different) */}
                {pendingDrag?.session && pendingDrag?.newStart && 
                 parseUTCTimestamp(pendingDrag.session.startTime).toDateString() !== pendingDrag.newStart.toDateString() ? (
                  <View style={dragModalStyles.changeRow}>
                    <Ionicons name="calendar-outline" size={20} color="#8E8E93" />
                    <View style={dragModalStyles.changeContent}>
                      <Text style={dragModalStyles.changeLabel}>Date</Text>
                      <View style={dragModalStyles.changeValues}>
                        <Text style={dragModalStyles.oldValue}>
                          {formatDateObjectInTimezone(parseUTCTimestamp(pendingDrag.session.startTime), "EEE, MMM d")}
                        </Text>
                        <Ionicons name="arrow-forward" size={16} color={GlowColors.primary} />
                        <Text style={dragModalStyles.newValue}>
                          {formatDateObjectInTimezone(pendingDrag.newStart, "EEE, MMM d")}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* Court Change */}
                {pendingDrag?.newCourtName ? (
                  <View style={dragModalStyles.changeRow}>
                    <Ionicons name="tennisball-outline" size={20} color="#8E8E93" />
                    <View style={dragModalStyles.changeContent}>
                      <Text style={dragModalStyles.changeLabel}>Court</Text>
                      <View style={dragModalStyles.changeValues}>
                        <Text style={dragModalStyles.oldValue}>
                          {courts.find(c => c.id === pendingDrag?.session?.courtId)?.name || "Unassigned"}
                        </Text>
                        <Ionicons name="arrow-forward" size={16} color={GlowColors.primary} />
                        <Text style={dragModalStyles.newValue}>
                          {pendingDrag.newCourtName}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Actions */}
              <View style={dragModalStyles.actions}>
                <Pressable 
                  style={dragModalStyles.cancelButton} 
                  onPress={cancelPendingDrag}
                >
                  <Text style={dragModalStyles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={dragModalStyles.confirmButton} 
                  onPress={confirmPendingDrag}
                >
                  <LinearGradient
                    colors={[GlowColors.primary, GlowColors.primaryDark || "#9ACC2C"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={dragModalStyles.confirmGradient}
                  >
                    <Ionicons name="checkmark" size={20} color="#000" />
                    <Text style={dragModalStyles.confirmButtonText}>Confirm Move</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </View>
      </Modal>
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
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: "rgba(12, 12, 15, 0.98)",
    borderTopWidth: 3,
    borderTopColor: Colors.dark.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.primary + "30",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  headerGlass: {
    position: "relative",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    backgroundColor: "rgba(15, 15, 20, 0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 212, 255, 0.2)",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#00D4FF",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  headerGradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  toggleButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  undoButton: {
    borderWidth: 1,
    borderColor: Colors.dark.gold + "60",
    backgroundColor: Colors.dark.gold + "15",
  },
  toggleActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
      },
    }),
  },
  gridToggle: {
    paddingHorizontal: Spacing.sm,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  gridToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  dateNavButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
    }),
  },
  dateDisplay: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  todayBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
      },
    }),
  },
  todayBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
    letterSpacing: 1,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  viewButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: 8,
  },
  viewButtonActive: {
    backgroundColor: Colors.dark.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
    }),
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  viewButtonTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  viewToggleGaming: {
    flexDirection: "row",
    backgroundColor: "rgba(15, 15, 20, 0.85)",
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.25)",
    ...Platform.select({
      ios: {
        shadowColor: "#00D4FF",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  viewButtonGaming: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    borderRadius: 8,
    overflow: "hidden",
    minWidth: 60,
  },
  viewButtonGamingActive: {
    ...Platform.select({
      ios: {
        shadowColor: "#00D4FF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  viewButtonGamingGradient: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  viewButtonTextGaming: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.6)",
    letterSpacing: 0.5,
  },
  viewButtonTextGamingActive: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1A1A1A",
    letterSpacing: 1.5,
  },
  dateNavGaming: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  dateNavButtonGaming: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.35)",
    ...Platform.select({
      ios: {
        shadowColor: "#00D4FF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  dateDisplayGaming: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    backgroundColor: "rgba(15, 15, 20, 0.85)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.2)",
  },
  dateDisplayCollapsed: {
    borderColor: "rgba(0, 212, 255, 0.5)",
    backgroundColor: "rgba(0, 212, 255, 0.08)",
  },
  collapseIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 4,
  },
  collapseIndicatorExpanded: {
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  collapseHintText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#00D4FF",
    letterSpacing: 0.5,
  },
  dateTextGaming: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.8,
  },
  todayBadgeGaming: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#00D4FF",
    ...Platform.select({
      ios: {
        shadowColor: "#00D4FF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  todayBadgeTextGaming: {
    fontSize: 9,
    fontWeight: "800",
    color: "#1A1A1A",
    letterSpacing: 1.2,
  },
  fabContainer: {
    position: "absolute",
    bottom: 100,
    right: Spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#00D4FF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  fabGlow: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0, 212, 255, 0.25)",
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  courtHeaders: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
  },
  timeColumnHeader: {
    width: TIME_COLUMN_WIDTH,
  },
  filterSection: {
    backgroundColor: Backgrounds.card,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  locationFilterContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.gold + "15",
    maxHeight: 46,
  },
  locationFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  locationFilterChipActive: {
    backgroundColor: Colors.dark.gold + "20",
    borderColor: Colors.dark.gold,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.gold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
    }),
  },
  locationFilterText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  locationFilterTextActive: {
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  courtFilterContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    maxHeight: 46,
  },
  courtFilterContent: {
    gap: Spacing.sm,
    alignItems: "center",
  },
  courtFilterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  courtFilterChipActive: {
    backgroundColor: GlowColors.primary + "15",
    borderColor: GlowColors.primary + "60",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
    }),
  },
  courtFilterText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  courtFilterTextActive: {
    color: GlowColors.primary,
    fontWeight: "700",
  },
  courtHeader: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: Backgrounds.elevated,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  courtHeaderWithDivider: {
    borderLeftWidth: 3,
    borderLeftColor: "#FFFFFF",
  },
  courtHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  calendarScroll: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  calendarGrid: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingBottom: 200,
  },
  timeColumn: {
    width: TIME_COLUMN_WIDTH,
    backgroundColor: Backgrounds.root,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.15)",
  },
  timeSlot: {
    height: HOUR_HEIGHT_60,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingRight: 10,
    paddingTop: 2,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  courtLanesContainer: {
    flexDirection: "row",
    position: "relative",
    overflow: "visible",
  },
  courtLane: {
    position: "relative",
    backgroundColor: Backgrounds.elevated,
    overflow: "visible",
  },
  courtLaneWithDivider: {
    borderLeftWidth: 3,
    borderLeftColor: "#FFFFFF",
  },
  hourSlot: {
    height: HOUR_HEIGHT_60,
    position: "relative",
    borderBottomWidth: 2,
    borderBottomColor: "#FFFFFF",
    overflow: "visible",
  },
  hourSlotEven: {
    backgroundColor: Backgrounds.elevated,
  },
  hourSlotOdd: {
    backgroundColor: Backgrounds.card,
  },
  hourLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#FFFFFF",
  },
  halfHourLine: {
    position: "absolute",
    top: HOUR_HEIGHT_60 / 2,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  sessionBlock: {
    position: "absolute",
    left: 4,
    right: 4,
    borderRadius: 6,
    overflow: "hidden",
    borderLeftWidth: 3,
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
  sessionBlockActive: {
    borderLeftWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sessionGradient: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: "center",
  },
  sessionText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 0.3,
  },
  sessionTime: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(0, 0, 0, 0.9)",
    letterSpacing: 0.3,
  },
  blockedBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255, 68, 68, 0.12)",
    padding: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.3)",
    borderStyle: "dashed",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  blockedBlockOther: {
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
    justifyContent: "center",
    alignItems: "center",
  },
  blockedText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    textAlign: "center",
  },
  blockedTextCourt: {
    ...Typography.caption,
    color: "#FF4444",
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
  blockedReasonText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 9,
    textAlign: "center",
    marginTop: 2,
  },
  hourSlotSelected: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary + "60",
    borderWidth: 1,
    borderStyle: "dashed",
  },
  selectedCellOverlay: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "40",
    justifyContent: "center",
    alignItems: "center",
  },
  selectionToolbar: {
    position: "absolute",
    left: 12,
    right: 12,
    paddingVertical: 16,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "#1C2233",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    elevation: 20,
    zIndex: 9999,
    boxShadow: "0px -4px 20px rgba(0, 212, 255, 0.3)",
  },
  selectionToolbarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  selectionCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,68,68,0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.4)",
  },
  selectionCount: {
    ...Typography.body,
    color: "#FFF",
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  selectionBlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF4444",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  selectionBlockBtnText: {
    ...Typography.body,
    color: "#FFF",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 1,
  },
  blockModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  blockModalContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  blockModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "800",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 4,
  },
  blockModalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  blockModalSummary: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: 8,
  },
  blockModalSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockModalCourtName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  blockModalTimeRange: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  blockModalReasonLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  blockReasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: Spacing.xl,
  },
  blockReasonPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  blockReasonPillActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "20",
  },
  blockReasonPillText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  blockReasonPillTextActive: {
    color: Colors.dark.primary,
  },
  blockModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  blockModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  blockModalCancelText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  blockModalConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: "#FF4444",
    justifyContent: "center",
    alignItems: "center",
  },
  blockModalConfirmText: {
    ...Typography.body,
    color: "#1A1A1A",
    fontWeight: "700",
  },
  dateRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  datePickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  datePickerBtnText: {
    ...Typography.body,
    color: Colors.dark.textPrimary,
    fontSize: 13,
  },
  dateRangeArrow: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  inlineDatePicker: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.sm,
    padding: 12,
    marginBottom: 8,
  },
  datePickerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  datePickerCurrentDate: {
    ...Typography.body,
    color: Colors.dark.textPrimary,
    fontWeight: "600",
  },
  datePickerDone: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
  },
  datePickerDoneText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  weekdayRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  weekdayPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  weekdayPillActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary,
  },
  weekdayPillText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  weekdayPillTextActive: {
    color: Colors.dark.primary,
  },
  coachBlockStyle: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255, 165, 0, 0.15)",
    padding: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 165, 0, 0.4)",
    borderStyle: "dashed",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  coachBlockText: {
    ...Typography.caption,
    color: "#FFA500",
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    fontSize: 9,
  },
  busyElsewhereBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.gold + "15",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    borderStyle: "dashed",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  busyElsewhereText: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.gold,
    letterSpacing: 0.2,
  },
  travelTimeBlock: {
    position: "absolute",
    left: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.gold + "25",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "50",
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    zIndex: 5,
  },
  travelTimeBlockText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.gold,
    letterSpacing: 0.3,
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
  refreshIndicator: {
    position: "absolute",
    top: 120,
    right: Spacing.lg,
    backgroundColor: Backgrounds.elevated + "E0",
    padding: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  coachList: {
    width: "100%",
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  coachItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    color: Colors.dark.textMuted,
  },
  weekCardsContainer: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dayCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  dayCardToday: {
    borderColor: GlowColors.primary + "40",
    shadowColor: GlowColors.primary,
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
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  dayCardDayNameToday: {
    color: GlowColors.primary,
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
  overviewDayBlock: {
    marginBottom: Spacing.md,
  },
  overviewDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  overviewDayHeaderToday: {
    borderBottomColor: GlowColors.primary + "40",
  },
  overviewDayName: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    width: 36,
  },
  overviewDayNameToday: {
    color: GlowColors.primary,
  },
  overviewDayDate: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  overviewDayCount: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.full,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  overviewDayCountText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  overviewSessionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingLeft: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  overviewSessionRowPast: {
    opacity: 0.5,
  },
  overviewSessionAccent: {
    width: 3,
    height: 36,
    borderRadius: 2,
  },
  overviewSessionTime: {
    width: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  overviewTimeText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    fontSize: 12,
  },
  overviewTimePast: {
    color: Colors.dark.tabIconDefault,
  },
  overviewTimeDash: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontSize: 10,
  },
  overviewSessionInfo: {
    flex: 1,
    gap: 2,
  },
  overviewSessionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  overviewTypeLabel: {
    ...Typography.body,
    fontWeight: "700",
    fontSize: 13,
  },
  overviewLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF3B3020",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  overviewLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF3B30",
  },
  overviewLiveText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FF3B30",
    letterSpacing: 0.5,
  },
  overviewSessionDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  overviewPlayerText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontSize: 12,
  },
  overviewCourtChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  overviewCourtText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontSize: 11,
  },
  overviewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  overviewEmptyText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
  },
  weekPlannerHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: Backgrounds.card,
  },
  weekPlannerHeaderCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  weekPlannerHeaderCellToday: {
    backgroundColor: GlowColors.primary + "10",
  },
  weekPlannerDayLetter: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
  },
  weekPlannerDayLetterToday: {
    color: GlowColors.primary,
  },
  weekPlannerDateCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  weekPlannerDateCircleToday: {
    backgroundColor: GlowColors.primary,
  },
  weekPlannerDateNum: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  weekPlannerDateNumToday: {
    color: Colors.dark.backgroundRoot,
  },
  weekPlannerSessionCount: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  weekPlannerSessionCountEmpty: {
    fontSize: 10,
    color: Colors.dark.tabIconDefault,
  },
  weekPlannerDay: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  weekPlannerDayLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card + "80",
  },
  weekPlannerDayLabelToday: {
    backgroundColor: GlowColors.primary + "12",
  },
  weekPlannerDayText: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  weekPlannerDayTextToday: {
    color: GlowColors.primary,
  },
  weekPlannerDayDateText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontSize: 11,
  },
  weekPlannerNoSessions: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  weekPlannerNoSessionsText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    fontStyle: "italic",
    fontSize: 12,
  },
  weekPlannerSessions: {
    gap: 1,
  },
  weekPlannerSession: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    paddingLeft: Spacing.lg,
  },
  weekPlannerSessionPast: {
    opacity: 0.45,
  },
  weekPlannerSessionBar: {
    width: 3,
    borderRadius: 2,
    marginRight: Spacing.sm,
  },
  weekPlannerSessionContent: {
    flex: 1,
    gap: 1,
  },
  weekPlannerSessionRow1: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  weekPlannerTimeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  weekPlannerTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
  },
  weekPlannerTypeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  weekPlannerPlayerText: {
    fontSize: 12,
    color: Colors.dark.text,
  },
  weekPlannerCourtText: {
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  weekCalHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: Backgrounds.card,
  },
  weekCalTimeCol: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
  },
  weekCalTimeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
  },
  weekCalDayCol: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  weekCalDayColToday: {
    backgroundColor: GlowColors.primary + "12",
  },
  weekCalDayLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
  },
  weekCalDayLabelToday: {
    color: GlowColors.primary,
  },
  weekCalDateLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  weekCalDateLabelToday: {
    color: GlowColors.primary,
  },
  weekCalRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    minHeight: 56,
  },
  weekCalTimeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  weekCalCell: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255, 255, 255, 0.06)",
    padding: 2,
    gap: 2,
  },
  weekCalCellToday: {
    backgroundColor: GlowColors.primary + "06",
  },
  weekCalSessionBlock: {
    borderRadius: 4,
    borderLeftWidth: 3,
    padding: 4,
    minHeight: 40,
  },
  weekCalSessionPast: {
    opacity: 0.4,
  },
  weekCalSessionActive: {
    borderWidth: 1,
    borderColor: GlowColors.primary + "60",
  },
  weekCalSessionType: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  weekCalSessionPlayer: {
    fontSize: 10,
    color: Colors.dark.text,
    marginTop: 1,
  },
  weekCalLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FF3B30",
    position: "absolute",
    top: 3,
    right: 3,
  },
  monthDayHeaders: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  monthDayHeaderText: {
    flex: 1,
    fontSize: 10,
    color: Colors.dark.textMuted,
    textAlign: "center",
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
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
    borderColor: "rgba(255, 255, 255, 0.06)",
    minHeight: 80,
    justifyContent: "space-between",
  },
  monthDayEmpty: {
    flex: 1,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
    minHeight: 80,
  },
  monthDayToday: {
    backgroundColor: GlowColors.primary + "12",
  },
  monthDayWeekend: {
    backgroundColor: Backgrounds.elevated,
  },
  monthDaySelected: {
    borderColor: GlowColors.primary,
    borderWidth: 1,
  },
  monthDayNumber: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "500",
    alignSelf: "flex-start",
  },
  monthDayNumberWeekend: {
    color: Colors.dark.textMuted,
  },
  monthDayNumberToday: {
    color: GlowColors.primary,
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
  // Premium Month View styles (Glassmorphism)
  monthModeToggle: {
    flexDirection: "row",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: 3,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  monthModeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  monthModeButtonActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  monthModeText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  monthModeTextActive: {
    color: Backgrounds.root,
    fontWeight: "800",
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
    backgroundColor: Backgrounds.card,
    minHeight: 70,
    padding: 6,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  monthDayCardEmpty: {
    flex: 1,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.root,
    minHeight: 70,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
    opacity: 0.6,
  },
  monthDayCardWeekend: {
    backgroundColor: Backgrounds.elevated,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  monthDayCardToday: {
    borderWidth: 1,
    borderColor: GlowColors.primary + "60",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  monthDayCardSelected: {
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.xpCyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  monthDayCardNumber: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "700",
    letterSpacing: 0.5,
    zIndex: 2,
  },
  monthDayCardNumberWeekend: {
    color: "rgba(255, 255, 255, 0.4)",
  },
  monthDayCardNumberToday: {
    color: GlowColors.primary,
    fontWeight: "800",
    letterSpacing: 0.8,
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
    color: GlowColors.primary,
    fontWeight: "700",
    letterSpacing: 0.5,
    zIndex: 2,
    textShadowColor: GlowColors.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  monthAvailabilityIndicator: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: -6,
    marginLeft: -6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  monthAvailabilityOpen: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  monthAvailabilityLimited: {
    backgroundColor: Colors.dark.gold,
    borderColor: Colors.dark.gold,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.gold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  monthAvailabilityFull: {
    backgroundColor: Colors.dark.disabled,
    borderColor: Colors.dark.backgroundTertiary,
  },
  monthSlotsLabel: {
    position: "absolute",
    bottom: 4,
    right: 6,
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
    letterSpacing: 0.5,
    textShadowColor: Colors.dark.xpCyan,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  // Week mode toggle styles
  weekModeToggle: {
    flexDirection: "row",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.xs,
    padding: 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: GlowColors.primary,
  },
  weekModeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  weekModeTextActive: {
    color: Backgrounds.root,
    fontWeight: "700",
  },
  // Week Grid Styles (Premium Glassmorphism)
  weekGridHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: Backgrounds.card,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  weekTimeColumnHeader: {
    width: TIME_COLUMN_WIDTH,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.08)",
  },
  weekTimeHeaderText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  weekDayHeader: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.06)",
  },
  weekDayHeaderToday: {
    backgroundColor: GlowColors.primary + "10",
    borderBottomWidth: 2,
    borderBottomColor: GlowColors.primary,
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
    }),
  },
  weekDayName: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  weekDayNameToday: {
    color: GlowColors.primary,
  },
  weekDayNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.text,
    marginTop: 2,
  },
  weekDayNumberToday: {
    color: GlowColors.primary,
  },
  weekGridScroll: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  weekGridBody: {
    flexDirection: "row",
  },
  weekTimeColumn: {
    width: TIME_COLUMN_WIDTH,
    backgroundColor: Backgrounds.card,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.08)",
  },
  weekTimeSlot: {
    justifyContent: "flex-start",
    paddingTop: 4,
    alignItems: "center",
  },
  weekTimeText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  weekDayColumns: {
    flexDirection: "row",
    flex: 1,
  },
  weekDayColumn: {
    flex: 1,
    position: "relative",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.35)",
  },
  weekDayColumnToday: {
    backgroundColor: GlowColors.primary + "15",
  },
  weekHourSlot: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.25)",
  },
  weekHourLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  weekHalfHourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  weekSessionBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.xs,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  weekSessionBlockActive: {
    borderWidth: 1,
    borderColor: GlowColors.primary + "80",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  weekSessionGradient: {
    flex: 1,
    padding: 4,
    justifyContent: "center",
  },
  weekSessionText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#000000",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  weekSessionTime: {
    fontSize: 7,
    fontWeight: "600",
    color: "rgba(0, 0, 0, 0.85)",
    letterSpacing: 0,
    textAlign: "center",
    marginTop: 1,
  },
  weekNowLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.dark.error,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.error,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
      },
    }),
  },
  weekBlockedBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(100, 100, 100, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(100, 100, 100, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  weekBlockedText: {
    ...Typography.caption,
    fontSize: 8,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  // Availability mode styles - Energy Bands (Premium Glassmorphism)
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    minHeight: 280,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  energyBandToday: {
    borderColor: GlowColors.primary + "40",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  energyBandSelected: {
    borderColor: GlowColors.primary + "60",
    shadowColor: GlowColors.primary,
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
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  energyBandDayNameToday: {
    color: GlowColors.primary,
  },
  energyBandDate: {
    ...Typography.body,
    fontSize: 18,
    color: Colors.dark.text,
    fontWeight: "700",
    marginTop: 2,
  },
  energyBandDateToday: {
    color: GlowColors.primary,
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
    color: Colors.dark.textMuted,
  },
  energyTimeHintLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.disabled,
    marginHorizontal: Spacing.md,
    opacity: 0.3,
  },
  // Day Context Panel styles (Premium Glassmorphism)
  dayContextPanel: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  dayContextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  dayContextDate: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  dayContextTodayBadge: {
    fontSize: 9,
    color: Backgrounds.root,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
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
    color: Colors.dark.textMuted,
  },
  dayContextMeta: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  peakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.dark.xpCyan + "15",
    borderRadius: BorderRadius.xs,
  },
  peakPillText: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
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
    backgroundColor: GlowColors.primary + "10",
    borderRadius: BorderRadius.xs,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: GlowColors.primary + "15",
  },
  dayContextSlotTime: {
    ...Typography.caption,
    color: GlowColors.primary,
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
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  dayContextAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: GlowColors.primary + "15",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
    ...Platform.select({
      ios: {
        shadowColor: GlowColors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  dayContextActionText: {
    fontSize: 12,
    color: GlowColors.primary,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  dayContextActionDisabled: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderColor: Colors.dark.disabled,
  },
  dayContextActionTextDisabled: {
    color: Colors.dark.textMuted,
  },
});

const dragModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "90%",
    maxWidth: 360,
  },
  card: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GlowColors.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF6B35" + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },
  warningText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FF6B35",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sessionInfo: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sessionName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  changesContainer: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  changeContent: {
    flex: 1,
  },
  changeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  changeValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  oldValue: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  newValue: {
    fontSize: 14,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  confirmButton: {
    flex: 1.5,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  confirmGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
});
