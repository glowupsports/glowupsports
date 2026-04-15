import logger from "@/lib/logger";
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
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
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
import { CalendarBlockModal } from "@/coach/components/calendar/CalendarBlockModal";
import { CalendarDragModal } from "@/coach/components/calendar/CalendarDragModal";
import { CalendarMonthView } from "@/coach/components/calendar/CalendarMonthView";
import { CalendarDayViewOverview } from "@/coach/components/calendar/CalendarDayViewOverview";
import { CalendarWeekViewOverview } from "@/coach/components/calendar/CalendarWeekViewOverview";
import { CalendarWeekViewSlots } from "@/coach/components/calendar/CalendarWeekViewSlots";
import { CalendarDayViewSlots } from "@/coach/components/calendar/CalendarDayViewSlots";
import { TIME_COLUMN_WIDTH, MIN_COURT_LANE_WIDTH, HOUR_HEIGHT_60, HOUR_HEIGHT_30, START_HOUR, END_HOUR } from "@/coach/components/calendar/calendarConstants";
import { dimColors, DraggableSessionBlock, WeekDraggableSessionBlock, PulsingDot } from "@/coach/components/calendar/SessionBlocks";
import { styles } from "@/coach/components/calendar/calendarStyles";
type CalendarRouteParams = {
  Calendar: {
    openSessionId?: string;
    action?: "attendance" | "detail" | "extend" | "end";
    openWizard?: boolean;
  };
};

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  locationId?: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  ballLevel?: string | null;
  skillLevel?: number | null;
  isRecurring?: boolean | null;
  paymentStatus?: string | null;
  status: string | null;
  skipReason?: string | null;
  players?: Array<{ name: string }>;
  title?: string | null;
}

interface BlockedSession {
  id: string;
  courtId: string | null;
  startTime: string;
  endTime: string;
  blocked?: true;
  blockedReason?: string;
  isCourtBlock?: boolean;
}

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
export default function CalendarScreen() {
  const { coach, academy, calendarData, isLoading, isFetching, refetchCalendar, setCoach, focusMode, setFocusMode, timeGrid, setTimeGrid, selectedDate, setSelectedDate, viewMode, setViewMode } = useCoach();
  const route = useRoute<RouteProp<any>>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const queryClient = useQueryClient();

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
  const [hoveredSession, setHoveredSession] = useState<any | null>(null);
  const [pressedSession, setPressedSession] = useState<any | null>(null);
  const [pressedSessionPos, setPressedSessionPos] = useState<{ x: number; y: number } | null>(null);
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
  const [showFilterOverlay, setShowFilterOverlay] = useState(false);
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
  
  const availableWidth = screenWidth - TIME_COLUMN_WIDTH - Spacing.lg * 2;
  const evenWidth = courts.length > 0 ? availableWidth / courts.length : availableWidth;
  const needsHorizontalScroll = evenWidth < MIN_COURT_LANE_WIDTH;
  const dynamicLaneWidth = needsHorizontalScroll ? MIN_COURT_LANE_WIDTH : evenWidth;
  const totalCourtsWidth = courts.length * dynamicLaneWidth;

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
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.includes("/api/coach/calendar");
        },
        refetchType: "all",
      });
      refetchCalendar();
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
    
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    const newStart = new Date(originalStart);
    newStart.setMinutes(newStart.getMinutes() + Math.round(hoursChanged * 60));
    newStart.setMinutes(Math.round(newStart.getMinutes() / 30) * 30);
    newStart.setSeconds(0);
    newStart.setMilliseconds(0);

    const newEnd = new Date(newStart.getTime() + durationMs);

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
    
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    const newStart = new Date(originalStart.getTime());
    newStart.setDate(originalStart.getDate() + daysChanged);
    newStart.setMinutes(originalStart.getMinutes() + minutesChanged);
    newStart.setMinutes(Math.round(newStart.getMinutes() / 30) * 30);
    newStart.setSeconds(0);
    newStart.setMilliseconds(0);

    const newEnd = new Date(newStart.getTime() + durationMs);
    
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

  const setSelectedSession = useCallback((_session: Session | null) => {
    setSelectedSessionForAttendance(null);
    setSelectedSessionForDetail(null);
    setSelectedSessionForFeedback(null);
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
  const slotReservations = calendarData?.slotReservations || [];

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
    
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    const newStart = new Date(originalStart);
    newStart.setMinutes(newStart.getMinutes() + Math.round(hoursChanged * 60));
    newStart.setMinutes(Math.round(newStart.getMinutes() / 30) * 30);
    newStart.setSeconds(0);
    newStart.setMilliseconds(0);

    const newEnd = new Date(newStart.getTime() + durationMs);

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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to unblock court");
    },
  });

  const handleBlockedSlotPress = (session: BlockedSession) => {
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
    logger.log("Extend session:", session.id);
  };

  const handleEndSession = (session: Session) => {
    logger.log("End session:", session.id);
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
              { text: "Yes, Cancel", style: "destructive", onPress: async () => {
                try {
                  await apiRequest("POST", `/api/coach/sessions/${session.id}/cancel`, { reason: "Cancelled by coach" });
                  queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
                  queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
                  setSelectedSession(null);
                  Alert.alert("Session Cancelled", "The session has been cancelled and players have been notified.");
                } catch (err: any) {
                  Alert.alert("Error", err.message || "Failed to cancel session");
                }
              }},
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
      case "private_adjusted":
        return "#00D4FF";
      case "semi_private":
        return "#FF6B35";
      case "group":
        return "#FFD700";
      case "physical":
        return "#9B59B6";
      case "activity":
        return "#00E5A0";
      default:
        return "#00D4FF";
    }
  };

  const getSessionTypeGradient = (type: string): [string, string] => {
    switch (type) {
      case "private":
      case "private_adjusted":
        return ["#00D4FF", "#0097B8"];
      case "semi_private":
        return ["#FF6B35", "#CC4A1A"];
      case "group":
        return ["#FFD700", "#CC9900"];
      case "physical":
        return ["#9B59B6", "#6C3483"];
      case "activity":
        return ["#00E5A0", "#00B37D"];
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
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerBookButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowCreateDrawer(true);
              }}
            >
              <LinearGradient
                colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerBookButtonGradient}
              >
                <Ionicons name="add" size={18} color={Colors.dark.buttonText} />
                <Text style={styles.headerBookButtonText}>Book</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, isExporting && styles.toggleActive]}
              onPress={exportCalendarToICS}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <Ionicons name="download-outline" size={16} color={Colors.dark.primary} />
              )}
            </Pressable>
            {viewMode === "day" && dayMode === "slots" && lastMove ? (
              <Pressable
                style={[styles.toggleButton, styles.undoButton]}
                onPress={undoLastMove}
              >
                <Ionicons name="arrow-undo-outline" size={16} color={Colors.dark.gold} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            {viewMode === "day" && dayMode === "slots" ? (
              <>
                <Pressable
                  style={[styles.toggleButton, focusMode && styles.toggleActive]}
                  onPress={() => setFocusMode(!focusMode)}
                >
                  <Ionicons name="eye-outline" size={16} color={focusMode ? Colors.dark.backgroundRoot : Colors.dark.text} />
                </Pressable>
                <Pressable
                  style={styles.gridToggle}
                  onPress={() => setTimeGrid(timeGrid === 30 ? 60 : 30)}
                >
                  <Text style={styles.gridToggleText}>{timeGrid}m</Text>
                </Pressable>
              </>
            ) : null}
            {viewMode === "day" && dayMode === "slots" && (allLocations.length > 0 || allCourts.length > 1) ? (
              <Pressable
                style={styles.toggleButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowFilterOverlay(true);
                }}
              >
                <Ionicons name="funnel-outline" size={16} color={Colors.dark.primary} />
                {(selectedLocationFilter || selectedCourtFilter) ? <View style={styles.filterDot} /> : null}
              </Pressable>
            ) : null}
          </View>
        </View>

        
        <View style={styles.compactDateRow}>
          <Pressable
            style={styles.dateNavButtonGaming}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (viewMode === "day") changeDate(-1);
              else if (viewMode === "week") changeWeek(-1);
              else changeMonth(-1);
            }}
          >
            <Ionicons name="chevron-back" size={20} color="#00D4FF" />
          </Pressable>
          <Pressable style={styles.dateDisplayCompact} onPress={goToToday}>
            <Text style={styles.dateTextGaming}>
              {viewMode === "day" && formatDate(selectedDate)}
              {viewMode === "week" && formatWeekRange(weekDates)}
              {viewMode === "month" && formatMonthYear(selectedDate)}
            </Text>
            {selectedDate.toDateString() === new Date().toDateString() && viewMode === "day" ? (
              <View style={styles.todayBadgeGaming}>
                <Text style={styles.todayBadgeTextGaming}>TODAY</Text>
              </View>
            ) : null}
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
            <Ionicons name="chevron-forward" size={20} color="#00D4FF" />
          </Pressable>
        </View>
        

        <View style={styles.togglesRow}>
          
          <View style={styles.viewToggleCompact}>
            {(["day", "week", "month"] as const).map((mode) => {
              const modeLabels = { day: "Day", week: "Week", month: "Month" };
              return (
              <Pressable
                key={mode}
                style={[styles.viewButtonCompact, viewMode === mode && styles.viewButtonCompactActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setViewMode(mode);
                }}
              >
                <Text style={[styles.viewButtonTextCompact, viewMode === mode && styles.viewButtonTextCompactActive]}>
                  {modeLabels[mode]}
                </Text>
              </Pressable>
              );
            })}
          </View>
          

          {viewMode === "day" ? (
            <View style={styles.viewToggleCompact}>
              <Pressable
                style={[styles.viewButtonCompact, dayMode === "overview" && styles.viewButtonCompactActive]}
                onPress={() => setDayMode("overview")}
              >
                <Ionicons name="list-outline" size={12} color={dayMode === "overview" ? "#1A1A1A" : Colors.dark.textMuted} />
                <Text style={[styles.viewButtonTextCompact, { marginLeft: 4 }, dayMode === "overview" && styles.viewButtonTextCompactActive]}>List</Text>
              </Pressable>
              <Pressable
                style={[styles.viewButtonCompact, dayMode === "slots" && styles.viewButtonCompactActive]}
                onPress={() => setDayMode("slots")}
              >
                <Ionicons name="grid-outline" size={12} color={dayMode === "slots" ? "#1A1A1A" : Colors.dark.textMuted} />
                <Text style={[styles.viewButtonTextCompact, { marginLeft: 4 }, dayMode === "slots" && styles.viewButtonTextCompactActive]}>Slots</Text>
              </Pressable>
            </View>
          ) : null}
          {viewMode === "week" ? (
            <View style={styles.viewToggleCompact}>
              <Pressable
                style={[styles.viewButtonCompact, weekMode === "overview" && styles.viewButtonCompactActive]}
                onPress={() => setWeekMode("overview")}
              >
                <Ionicons name="analytics-outline" size={12} color={weekMode === "overview" ? "#1A1A1A" : Colors.dark.textMuted} />
                <Text style={[styles.viewButtonTextCompact, { marginLeft: 4 }, weekMode === "overview" && styles.viewButtonTextCompactActive]}>Overview</Text>
              </Pressable>
              <Pressable
                style={[styles.viewButtonCompact, weekMode === "availability" && styles.viewButtonCompactActive]}
                onPress={() => setWeekMode("availability")}
              >
                <Ionicons name="time-outline" size={12} color={weekMode === "availability" ? "#1A1A1A" : Colors.dark.textMuted} />
                <Text style={[styles.viewButtonTextCompact, { marginLeft: 4 }, weekMode === "availability" && styles.viewButtonTextCompactActive]}>Availability</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {/* DAY VIEW - OVERVIEW MODE (Compact Lesson List for selected date) */}
      {viewMode === "day" && dayMode === "overview" && (
        <CalendarDayViewOverview
          selectedDate={selectedDate}
          getSessionsForDate={getSessionsForDate}
          courts={courts}
          academyTimezone={academyTimezone}
          setSelectedSessionForDetail={(s) => setSelectedSessionForDetail(s as Session)}
        />
      )}
      {/* DAY VIEW - SLOTS MODE */}
      {viewMode === "day" && dayMode === "slots" && (
        <CalendarDayViewSlots
          courtHeaderScrollRef={courtHeaderScrollRef}
          courtLanesScrollRef={courtLanesScrollRef}
          showFilterOverlay={showFilterOverlay}
          setShowFilterOverlay={setShowFilterOverlay}
          allLocations={allLocations}
          locationFilteredCourts={locationFilteredCourts}
          selectedLocationFilter={selectedLocationFilter}
          setSelectedLocationFilter={setSelectedLocationFilter}
          selectedCourtFilter={selectedCourtFilter}
          setSelectedCourtFilter={setSelectedCourtFilter}
          courts={courts}
          dynamicLaneWidth={dynamicLaneWidth}
          totalCourtsWidth={totalCourtsWidth}
          hours={hours}
          hourHeight={hourHeight}
          timeGrid={timeGrid}
          formatTime={formatTime}
          isCellSelected={isCellSelected}
          handleSlotPress={handleSlotPress}
          handleSlotLongPress={handleSlotLongPress}
          ownSessions={ownSessions}
          selectedDate={selectedDate}
          academyTimezone={academyTimezone}
          getSessionPosition={getSessionPosition}
          handleSessionTap={handleSessionTap}
          handleSessionLongPress={handleSessionLongPress}
          handleSessionDragEnd={handleSessionDragEnd}
          checkDragConflict={checkDragConflict}
          dragConflict={dragConflict}
          setHoveredSession={setHoveredSession}
          setPressedSession={setPressedSession}
          setPressedSessionPos={setPressedSessionPos}
          blockedSessions={blockedSessions}
          handleBlockedSlotPress={handleBlockedSlotPress}
          coachBlocks={coachBlocks}
          crossLocationBusyBlocks={crossLocationBusyBlocks}
          travelTimeBlocks={travelTimeBlocks}
          focusBaseHour={focusBaseHour}
          nowPosition={nowPosition}
          isToday={isToday}
          START_HOUR={START_HOUR}
        />
      )}
      {/* WEEK VIEW - OVERVIEW MODE (Week Calendar Grid - sessions only, no empty slots) */}
      {viewMode === "week" && weekMode === "overview" && (
        <CalendarWeekViewOverview
          allCourts={allCourts}
          selectedCourtFilter={selectedCourtFilter}
          setSelectedCourtFilter={setSelectedCourtFilter}
          weekDates={weekDates}
          handleDateSelect={handleDateSelect}
          ownSessions={ownSessions}
          academyTimezone={academyTimezone}
          screenWidth={screenWidth}
          setSelectedSessionForDetail={(s) => setSelectedSessionForDetail(s as Session)}
          courts={courts}
          setSelectedSlot={setSelectedSlot}
          setShowCreateDrawer={setShowCreateDrawer}
        />
      )}
      {/* WEEK VIEW - SLOTS MODE (Playtomic-style Time Grid) */}
      {viewMode === "week" && weekMode === "availability" && (
        <CalendarWeekViewSlots
          weekDates={weekDates}
          setSelectedDate={setSelectedDate}
          setViewMode={setViewMode}
          hourHeight={hourHeight}
          START_HOUR={START_HOUR}
          END_HOUR={END_HOUR}
          formatTime={formatTime}
          timeGrid={timeGrid}
          getSessionsForDate={getSessionsForDate}
          blockedSessions={blockedSessions}
          academyTimezone={academyTimezone}
          courts={courts}
          allLocations={allLocations}
          screenWidth={screenWidth}
          TIME_COLUMN_WIDTH={TIME_COLUMN_WIDTH}
          handleSessionTap={handleSessionTap}
          handleSessionLongPress={handleSessionLongPress}
          handleWeekSessionDragEnd={handleWeekSessionDragEnd}
          setSelectedSlot={setSelectedSlot}
          setShowCreateDrawer={setShowCreateDrawer}
          coachBlocks={coachBlocks}
          slotReservations={slotReservations}
        />
      )}
      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <CalendarMonthView
          monthMode={monthMode}
          setMonthMode={setMonthMode}
          monthDates={monthDates}
          selectedDate={selectedDate}
          handleDateSelect={handleDateSelect}
          getDayStats={getDayStats}
          getSessionsForDate={getSessionsForDate}
          courts={courts}
          setSelectedSlot={setSelectedSlot}
          setShowCreateDrawer={setShowCreateDrawer}
          formatTime={formatTime}
          bottomInset={insets.bottom}
        />
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
        </>
      )}

      {/* Block Action Modal - Enhanced with date range & weekday selector */}
      <CalendarBlockModal
        visible={showBlockActionModal}
        onClose={() => setShowBlockActionModal(false)}
        selectedCells={selectedCells}
        onConfirm={(data) => coachBlockMutation.mutate(data)}
        isConfirming={coachBlockMutation.isPending}
      />

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
      <CalendarDragModal
        pendingDrag={pendingDrag}
        onCancel={cancelPendingDrag}
        onConfirm={confirmPendingDrag}
        courts={courts}
      />


      {/* Web hover/press popup */}
      {Platform.OS === 'web' && (hoveredSession || pressedSession) && (() => {
        const popupSession = pressedSession || hoveredSession;
        const typeLabel = popupSession.sessionType === 'private' || popupSession.sessionType === 'private_adjusted' ? 'Private' :
          popupSession.sessionType === 'semi_private' ? 'Semi-Private' :
          popupSession.sessionType === 'group' ? 'Group' :
          popupSession.sessionType === 'activity' ? 'Activity' :
          popupSession.sessionType === 'physical' ? 'Physical' : 'Session';
        const accentColor = getSessionTypeGradient(popupSession.sessionType)?.[0] || '#C8FF3D';
        const playerName = popupSession.players?.[0]?.name || '';
        const playerInitial = playerName ? playerName.charAt(0).toUpperCase() : '?';
        const courtName = allCourts.find((c: any) => c.id === popupSession.courtId)?.name || '';
        const timeRange = `${formatTimeInTimezone(popupSession.startTime, academyTimezone)} – ${formatTimeInTimezone(popupSession.endTime, academyTimezone)}`;
        const attendance = popupSession.players?.[0]?.attendanceStatus;
        const attendanceColor = attendance === 'Present' ? '#00E676' : attendance === 'Late' ? '#FFB300' : attendance === 'Absent' ? '#FF4444' : null;
        const coachName = coach?.name || '';
        const POPUP_W = 240;
        const POPUP_H = 190;
        const MARGIN = 12;
        let popLeft: number | undefined;
        let popTop: number | undefined;
        let popRight: number | undefined;
        let popBottom: number | undefined;
        if (pressedSessionPos) {
          const winW = typeof window !== 'undefined' ? window.innerWidth : 400;
          const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
          const rawLeft = pressedSessionPos.x + MARGIN;
          const rawTop = pressedSessionPos.y + MARGIN;
          if (rawLeft + POPUP_W > winW - MARGIN) {
            popRight = winW - pressedSessionPos.x + MARGIN;
          } else {
            popLeft = rawLeft;
          }
          if (rawTop + POPUP_H > winH - MARGIN) {
            popBottom = winH - pressedSessionPos.y + MARGIN;
          } else {
            popTop = rawTop;
          }
        } else {
          popBottom = 24;
          popRight = 24;
        }
        return (
          <Pressable
            style={{ position: 'fixed' as any, inset: 0, zIndex: 998 } as any}
            onPress={() => { setPressedSession(null); setPressedSessionPos(null); }}
            pointerEvents={pressedSession ? 'auto' : 'none'}
          >
            <View
              style={[
                { position: 'absolute' as any, zIndex: 999 },
                popLeft !== undefined ? { left: popLeft } : {},
                popRight !== undefined ? { right: popRight } : {},
                popTop !== undefined ? { top: popTop } : {},
                popBottom !== undefined ? { bottom: popBottom } : {},
                Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } as any : {},
              ]}
              {...(Platform.OS === 'web' ? { onClick: (e: any) => e.stopPropagation() } as any : {})}
            >
              <View style={{
                backgroundColor: '#141C2B',
                borderRadius: 14,
                padding: 14,
                minWidth: POPUP_W,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                  <View style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: accentColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ color: Colors.dark.buttonText, fontSize: 14, fontWeight: '800' }}>{playerInitial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 }}>{playerName || 'No player'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor }} />
                      <Text style={{ color: accentColor, fontSize: 11, fontWeight: '600' }}>{typeLabel}</Text>
                    </View>
                  </View>
                  {attendanceColor ? (
                    <View style={{ backgroundColor: attendanceColor + '22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: attendanceColor + '66' }}>
                      <Text style={{ color: attendanceColor, fontSize: 10, fontWeight: '700' }}>{attendance}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="clock" size={11} color="rgba(255,255,255,0.4)" />
                    <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>{timeRange}</Text>
                  </View>
                  {courtName ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="map-pin" size={11} color="rgba(255,255,255,0.4)" />
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{courtName}</Text>
                    </View>
                  ) : null}
                  {coachName ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="user" size={11} color="rgba(255,255,255,0.4)" />
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{coachName}</Text>
                    </View>
                  ) : null}
                  {popupSession.players && popupSession.players.length > 1 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="users" size={11} color="rgba(255,255,255,0.4)" />
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{popupSession.players.length} players</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </Pressable>
        );
      })()}
    </View>
  );
}

