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
import { CalendarFilterOverlay } from "@/coach/components/calendar/CalendarFilterOverlay";
import { CalendarBlockModal } from "@/coach/components/calendar/CalendarBlockModal";
import { CalendarDragModal } from "@/coach/components/calendar/CalendarDragModal";
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

import { dimColors, DraggableSessionBlock, WeekDraggableSessionBlock, PulsingDot } from "@/coach/components/calendar/SessionBlocks";
import { styles } from "@/coach/components/calendar/calendarStyles";
export default function CalendarScreen() {
  const { coach, academy, calendarData, isLoading, isFetching, refetchCalendar, setCoach, focusMode, setFocusMode, timeGrid, setTimeGrid, selectedDate, setSelectedDate, viewMode, setViewMode } = useCoach();
  const route = useRoute<RouteProp<any>>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

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

  const setSelectedSession = useCallback((session: any) => {
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
                <Ionicons name="add" size={18} color={Colors.dark.backgroundRoot} />
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
              const typeLabel = session.sessionType === "private" || session.sessionType === "private_adjusted" ? "Private" :
                                session.sessionType === "semi_private" ? "Semi-Private" :
                                session.sessionType === "group" ? "Group" :
                                session.sessionType === "activity" ? "Activity" :
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
          <CalendarFilterOverlay
            visible={showFilterOverlay}
            onClose={() => setShowFilterOverlay(false)}
            allLocations={allLocations}
            locationFilteredCourts={locationFilteredCourts}
            selectedLocationFilter={selectedLocationFilter}
            setSelectedLocationFilter={setSelectedLocationFilter}
            selectedCourtFilter={selectedCourtFilter}
            setSelectedCourtFilter={setSelectedCourtFilter}
          />

          {/* Court Headers - Clean minimal style */}
          
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
          

          {/* Calendar Grid */}
          <ScrollView style={styles.calendarScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
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
                nestedScrollEnabled={true}
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
                        const typeLabel = session.sessionType === "private" || session.sessionType === "private_adjusted" ? "Private" :
                                          session.sessionType === "semi_private" ? "Semi" :
                                          session.sessionType === "group" ? "Group" :
                                          session.sessionType === "activity" ? "Activity" :
                                          session.sessionType === "physical" ? "Physical" : "";
                        const playerName = session.players?.[0]?.name?.split(" ")[0] || "";
                        const isAllHolidayCancelled = session.status === "cancelled" && session.skipReason === "all_players_on_holiday";
                        const sessionLabel = isAllHolidayCancelled
                          ? "Geannuleerd"
                          : (playerName ? `${typeLabel}\n${playerName}` : typeLabel);
                        const gradientColors = isAllHolidayCancelled
                          ? ["#4A4A6A", "#2E2E4E"]
                          : getSessionTypeGradient(session.sessionType);
                        return (
                          <React.Fragment key={session.id}>
                            <DraggableSessionBlock
                              session={session}
                              top={top}
                              height={height}
                              isPast={isAllHolidayCancelled ? true : isPast}
                              isActive={isAllHolidayCancelled ? false : isActive}
                              gradientColors={gradientColors}
                              sessionLabel={sessionLabel}
                              formattedTime={formatTimeInTimezone(session.startTime, academyTimezone)}
                              formattedEndTime={formatTimeInTimezone(session.endTime, academyTimezone)}
                              hourHeight={hourHeight}
                              courtLaneWidth={dynamicLaneWidth}
                              onTap={() => handleSessionTap(session)}
                              onLongPress={() => handleSessionLongPress(session)}
                              onDragEnd={(deltaY, deltaX) => handleSessionDragEnd(session, deltaY, deltaX, courtIndex)}
                              onDragUpdate={(deltaY, deltaX, isDragging) => checkDragConflict(session, deltaY, deltaX, courtIndex, isDragging)}
                              hasConflict={dragConflict === session.id}
                              onHoverIn={Platform.OS === 'web' ? () => setHoveredSession(session) : undefined}
                              onHoverOut={Platform.OS === 'web' ? () => setHoveredSession(null) : undefined}
                              onWebPress={Platform.OS === 'web' ? (clientX: number, clientY: number) => {
                                setPressedSession(prev => {
                                  if (prev?.id === session.id) {
                                    setPressedSessionPos(null);
                                    return null;
                                  }
                                  setPressedSessionPos({ x: clientX, y: clientY });
                                  return session;
                                });
                              } : undefined}
                            />
                            {isAllHolidayCancelled ? (
                              <View
                                style={{
                                  position: 'absolute',
                                  top: top + (height - 2) / 2 - 8,
                                  left: 4,
                                  right: 4,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 3,
                                  zIndex: 2,
                                }}
                                pointerEvents="none"
                              >
                                <Ionicons name="airplane" size={9} color="#A0A0C8" />
                                {height > 38 ? (
                                  <Text style={{ color: '#A0A0C8', fontSize: 8, fontWeight: '600' }} numberOfLines={1}>Iedereen op vakantie</Text>
                                ) : null}
                              </View>
                            ) : null}
                          </React.Fragment>
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

            {/* Calendar Grid - bands with absolute session positioning, gaps collapsed */}
            {(() => {
              const filteredSessions = selectedCourtFilter 
                ? ownSessions.filter(s => s.courtId === selectedCourtFilter)
                : ownSessions;

              const weekSessionsByDay: Record<number, typeof ownSessions> = {};
              
              const getTimeInTz = (isoStr: string) => {
                const d = parseUTCTimestamp(isoStr);
                const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hour12: false, timeZone: academyTimezone }).formatToParts(d);
                const hourPart = parts.find(p => p.type === "hour");
                const minutePart = parts.find(p => p.type === "minute");
                const h = parseInt(hourPart?.value || "0", 10);
                const m = parseInt(minutePart?.value || "0", 10);
                return h + m / 60;
              };

              const activeHoursSet = new Set<number>();

              weekDates.forEach((date, idx) => {
                const targetDateStr = formatDateObjectInTimezone(date, academyTimezone);
                const daySessions = filteredSessions.filter((s) => {
                  const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
                  return sessionDateStr === targetDateStr;
                });
                weekSessionsByDay[idx] = daySessions;
                daySessions.forEach(s => {
                  const startH = Math.floor(getTimeInTz(s.startTime));
                  const endH = Math.ceil(getTimeInTz(s.endTime));
                  for (let h = startH; h < endH; h++) {
                    activeHoursSet.add(h);
                  }
                });
              });

              const sortedHours = Array.from(activeHoursSet).sort((a, b) => a - b);

              if (sortedHours.length === 0) {
                return (
                  <View style={styles.overviewEmpty}>
                    <Ionicons name="calendar-outline" size={48} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.overviewEmptyText}>No lessons this week</Text>
                  </View>
                );
              }

              const bands: { start: number; end: number }[] = [];
              let bandStart = sortedHours[0];
              let bandEnd = sortedHours[0] + 1;
              for (let i = 1; i < sortedHours.length; i++) {
                if (sortedHours[i] === bandEnd) {
                  bandEnd = sortedHours[i] + 1;
                } else {
                  bands.push({ start: bandStart, end: bandEnd });
                  bandStart = sortedHours[i];
                  bandEnd = sortedHours[i] + 1;
                }
              }
              bands.push({ start: bandStart, end: bandEnd });

              const OVERVIEW_ROW_HEIGHT = 56;
              const colCount = 7;
              const timeColWidth = 48;

              return (
                <View>
                  {bands.map((band, bandIdx) => {
                    const bandHours: number[] = [];
                    for (let h = band.start; h < band.end; h++) bandHours.push(h);
                    const bandHeightRows = band.end - band.start;

                    return (
                      <React.Fragment key={band.start}>
                        {bandIdx > 0 ? (
                          <View style={{ height: 16, justifyContent: "center", alignItems: "center" }}>
                            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)", width: "90%" }} />
                          </View>
                        ) : null}
                        <View style={{ position: "relative", height: bandHeightRows * OVERVIEW_ROW_HEIGHT }}>
                          {bandHours.map((hour, hIdx) => {
                            const timeStr = `${hour.toString().padStart(2, "0")}:00`;
                            return (
                              <View key={hour} style={[styles.weekCalRow, { height: OVERVIEW_ROW_HEIGHT, position: "absolute", top: hIdx * OVERVIEW_ROW_HEIGHT, left: 0, right: 0 }]}>
                                <View style={styles.weekCalTimeCol}>
                                  <Text style={styles.weekCalTimeText}>{timeStr}</Text>
                                </View>
                                {weekDates.map((_, dayIdx) => {
                                  const isToday = weekDates[dayIdx].toDateString() === new Date().toDateString();
                                  return (
                                    <Pressable
                                      key={dayIdx}
                                      style={[styles.weekCalCell, isToday && styles.weekCalCellToday]}
                                      onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        const slotDate = weekDates[dayIdx];
                                        const slotTime = new Date(slotDate);
                                        slotTime.setHours(hour, 0, 0, 0);
                                        setSelectedSlot({ courtId: courts[0]?.id || "", time: slotTime });
                                        setShowCreateDrawer(true);
                                      }}
                                    />
                                  );
                                })}
                              </View>
                            );
                          })}

                          {weekDates.map((_, dayIdx) => {
                            const daySessions = weekSessionsByDay[dayIdx] || [];
                            return daySessions.map(session => {
                              const startFrac = getTimeInTz(session.startTime);
                              const endFrac = getTimeInTz(session.endTime);
                              if (startFrac < band.start || startFrac >= band.end) return null;
                              const durationHours = endFrac - startFrac;
                              const topOffset = (startFrac - band.start) * OVERVIEW_ROW_HEIGHT;
                              const blockHeight = Math.max(durationHours * OVERVIEW_ROW_HEIGHT, 28);

                              const gradientColors = getSessionTypeGradient(session.sessionType);
                              const typeLabel = session.sessionType === "private" || session.sessionType === "private_adjusted" ? "PVT" :
                                                session.sessionType === "semi_private" ? "SEMI" :
                                                session.sessionType === "group" ? "GRP" :
                                                session.sessionType === "activity" ? "ACT" :
                                                session.sessionType === "physical" ? "FIT" : "SES";
                              const playerName = session.players?.[0]?.name?.split(" ")[0] || "";
                              const now = new Date();
                              const sessionEnd = parseUTCTimestamp(session.endTime);
                              const sessionStart = parseUTCTimestamp(session.startTime);
                              const isPast = sessionEnd < now;
                              const isActive = now >= sessionStart && now < sessionEnd;
                              const showTitle = session.title && (session.sessionType === "activity" || session.sessionType === "physical");
                              const playerCount = session.players?.length || 0;
                              const extraPlayers = playerCount > 1 ? `, +${playerCount - 1}` : "";
                              const displayName = showTitle ? (session.title || "") : (playerName ? `${playerName}${extraPlayers}` : "");

                              return (
                                <Pressable
                                  key={session.id}
                                  style={[
                                    styles.weekCalSessionBlock,
                                    {
                                      position: "absolute",
                                      top: topOffset,
                                      left: timeColWidth + 2 + (dayIdx * ((screenWidth - timeColWidth - 16) / colCount)),
                                      width: ((screenWidth - timeColWidth - 16) / colCount) - 4,
                                      height: blockHeight,
                                      backgroundColor: gradientColors[0] + "30",
                                      borderLeftColor: gradientColors[0],
                                      zIndex: 10,
                                      overflow: "hidden",
                                    },
                                    isPast ? styles.weekCalSessionPast : null,
                                    isActive ? styles.weekCalSessionActive : null,
                                  ]}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setSelectedSessionForDetail(session as Session);
                                  }}
                                >
                                  <Text style={[styles.weekCalSessionType, { color: gradientColors[0] }]} numberOfLines={1}>{typeLabel}</Text>
                                  {displayName ? <Text style={styles.weekCalSessionPlayer} numberOfLines={1}>{displayName}</Text> : null}
                                  {isActive ? <View style={styles.weekCalLiveDot} /> : null}
                                </Pressable>
                              );
                            });
                          })}
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              );
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
          <ScrollView style={styles.weekGridScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
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
                            const typeLabel = session.sessionType === "private" || session.sessionType === "private_adjusted" ? "PRIVATE" :
                                              session.sessionType === "semi_private" ? "SEMI" :
                                              session.sessionType === "group" ? "GROUP" :
                                              session.sessionType === "activity" ? "ACT" :
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
                    <Text style={{ color: '#000', fontSize: 14, fontWeight: '800' }}>{playerInitial}</Text>
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

