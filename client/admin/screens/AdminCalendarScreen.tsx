import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, Platform, Modal, Alert, PanResponder } from "react-native";
import { useDesktop } from "@/hooks/useDesktop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles, RoleColors } from "@/constants/theme";
import { SportBadge } from "@/components/SportBadge";
import { SPORTS, type Sport } from "@shared/sportConfig";
import CreateSessionWizard from "@/coach/components/CreateSessionWizard";
import { TIME_COLUMN_WIDTH, START_HOUR } from "@/coach/components/calendar/calendarConstants";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import ReassignCoachModal from "@/admin/components/ReassignCoachModal";
import MarkAbsentSheet from "@/admin/components/MarkAbsentSheet";
const ADMIN_COLOR = RoleColors.admin;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HOUR_HEIGHT = 60;
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
  sport?: string | null;
  maxCapacity?: number;
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
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });
  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });
  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedDateStr = selectedDate.toISOString().split("T")[0];
  const { data: blockedSlots = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/blocked-slots", selectedDateStr],
    queryFn: () =>
      apiRequest("GET", `/api/admin/blocked-slots?date=${selectedDateStr}`).then((r) => r.json()),
  });
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [gridMode, setGridMode] = useState<"coach" | "court">("coach");
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<Sport | "all">("all");
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    coachId?: string;
    courtId?: string;
    hour: number;
    date: Date;
  } | null>(null);
  const [wizardCoachId, setWizardCoachId] = useState<string | undefined>(undefined);
  const [_currentTime, _setCurrentTime] = useState(new Date());
  const isDesktop = useDesktop();
  const [desktopSelectedSession, setDesktopSelectedSession] = useState<Session | null>(null);
  const [mobileSelectedSession, setMobileSelectedSession] = useState<Session | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
  const [anchorSessionId, setAnchorSessionId] = useState<string | null>(null);
  const [anchorSlotKey, setAnchorSlotKey] = useState<string | null>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const coachLanesRef = useRef<View>(null);
  const coachLanesAbsY = useRef(0);
  const coachLanesAbsX = useRef(0);
  const multiSelectRef = useRef(false);
  const gridModeRef = useRef<"coach" | "court">("coach");
  const coachesForDragRef = useRef<Coach[]>([]);
  const courtsForDragRef = useRef<Court[]>([]);
  const laneWidthRef = useRef(80);
  const [reassignTargetSessionId, setReassignTargetSessionId] = useState<string | null>(null);
  const [reassignTargetLabel, setReassignTargetLabel] = useState<string>("");
  const [reassignBatchIds, setReassignBatchIds] = useState<string[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [newMoveDate, setNewMoveDate] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; });
  const [markAbsentSheetVisible, setMarkAbsentSheetVisible] = useState(false);
  const [markAbsentCoachId, setMarkAbsentCoachId] = useState<string | null>(null);
  const [markAbsentCoachName, setMarkAbsentCoachName] = useState<string>("");

  const cancelMutation = useMutation({
    mutationFn: (session: Session) =>
      apiRequest("POST", `/api/coach/sessions/${session.id}/cancel`, {
        supervisorCoachId: session.coachId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setMobileSelectedSession(null);
      setDesktopSelectedSession(null);
    },
  });

  const batchCancelMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      for (const id of sessionIds) {
        const session = sessions.find(s => s.id === id);
        if (!session) continue;
        await apiRequest("POST", `/api/coach/sessions/${id}/cancel`, {
          supervisorCoachId: session.coachId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      exitMultiSelect();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Some sessions could not be cancelled. Please try again.");
    },
  });

  const blockSlotsMutation = useMutation({
    mutationFn: (slots: Array<{ date: string; hour: number; coachId?: string; courtId?: string }>) =>
      apiRequest("POST", "/api/admin/blocked-slots", { slots }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blocked-slots"] });
      exitMultiSelect();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to block the selected slots. Please try again.");
    },
  });

  const moveSessionsMutation = useMutation({
    mutationFn: ({ sessionIds, targetDate }: { sessionIds: string[]; targetDate: string }) =>
      apiRequest("PATCH", "/api/admin/sessions/batch-move", { sessionIds, targetDate }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      exitMultiSelect();
      setShowMoveModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Alert.alert("Error", "Failed to move some sessions. Please try again.");
    },
  });

  const handleCancelSession = (session: Session) => {
    Alert.alert(
      "Cancel Session",
      `Are you sure you want to cancel this ${session.sessionType || "session"}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Cancel Session",
          style: "destructive",
          onPress: () => cancelMutation.mutate(session),
        },
      ]
    );
  };

  const enterMultiSelect = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setMultiSelectMode(true);
    setSelectedSessionIds(new Set([sessionId]));
    setAnchorSessionId(sessionId);
    setMobileSelectedSession(null);
  };

  const enterSlotMultiSelect = (slotKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setMultiSelectMode(true);
    setSelectedSlotKeys(new Set([slotKey]));
    setAnchorSlotKey(slotKey);
    setMobileSelectedSession(null);
  };

  const exitMultiSelect = () => {
    setMultiSelectMode(false);
    setSelectedSessionIds(new Set());
    setSelectedSlotKeys(new Set());
    setAnchorSessionId(null);
    setAnchorSlotKey(null);
    setReassignBatchIds([]);
  };

  // Sync refs used by stable PanResponder callbacks
  useEffect(() => { multiSelectRef.current = multiSelectMode; }, [multiSelectMode]);
  useEffect(() => { gridModeRef.current = gridMode; }, [gridMode]);
  useEffect(() => { coachesForDragRef.current = selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches; }, [coaches, selectedCoachFilter, gridMode]);
  useEffect(() => { courtsForDragRef.current = courts; }, [courts]);
  useEffect(() => {
    const entities = gridMode === "court"
      ? courts
      : (selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches);
    laneWidthRef.current = Math.max(80, (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / Math.max(entities.length, 1));
  }, [coaches, courts, selectedCoachFilter, gridMode]);

  // Stable PanResponder for mobile drag-to-select slots (only activates in multiSelectMode)
  const slotDragPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => multiSelectRef.current && Platform.OS !== "web",
    onMoveShouldSetPanResponder: () => multiSelectRef.current && Platform.OS !== "web",
    onPanResponderGrant: () => {
      coachLanesRef.current?.measure((_x, _y, _w, _h, px, py) => {
        coachLanesAbsY.current = py;
        coachLanesAbsX.current = px;
      });
    },
    onPanResponderMove: (evt) => {
      if (!multiSelectRef.current) return;
      const { pageX, pageY } = evt.nativeEvent;
      const relY = pageY - coachLanesAbsY.current;
      const relX = pageX - coachLanesAbsX.current;
      const lw = laneWidthRef.current;
      if (lw <= 0) return;
      const mode = gridModeRef.current;
      const entities = mode === "coach" ? coachesForDragRef.current : courtsForDragRef.current;
      if (entities.length === 0) return;
      const colIdx = Math.max(0, Math.min(entities.length - 1, Math.floor(relX / lw)));
      const entity = entities[colIdx];
      const hour = START_HOUR + Math.max(0, Math.min(END_HOUR - START_HOUR, Math.floor(relY / HOUR_HEIGHT)));
      if (entity && hour >= START_HOUR && hour <= END_HOUR) {
        const slotKey = `H${hour}:${entity.id}`;
        setSelectedSlotKeys(prev => {
          if (prev.has(slotKey)) return prev;
          return new Set([...prev, slotKey]);
        });
      }
    },
  }), []);

  const toggleSessionSelection = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
        if (next.size === 0 && selectedSlotKeys.size === 0) {
          setMultiSelectMode(false);
        }
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const toggleSlotSelection = (slotKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSlotKeys(prev => {
      const next = new Set(prev);
      if (next.has(slotKey)) {
        next.delete(slotKey);
        if (next.size === 0 && selectedSessionIds.size === 0) setMultiSelectMode(false);
      } else {
        next.add(slotKey);
      }
      return next;
    });
  };

  const handleBatchCancel = () => {
    const count = selectedSessionIds.size;
    Alert.alert(
      "Cancel Sessions",
      `Cancel ${count} selected session${count !== 1 ? "s" : ""}? This cannot be undone.`,
      [
        { text: "No", style: "cancel" },
        {
          text: `Cancel ${count} Session${count !== 1 ? "s" : ""}`,
          style: "destructive",
          onPress: () => batchCancelMutation.mutate(Array.from(selectedSessionIds)),
        },
      ]
    );
  };

  const handleBatchReassign = () => {
    const selectedList = Array.from(selectedSessionIds);
    if (selectedList.length === 0) return;
    const firstSession = sessions.find(s => s.id === selectedList[0]);
    if (!firstSession) return;
    const label = `${selectedList.length} session${selectedList.length !== 1 ? "s" : ""} selected`;
    setReassignTargetLabel(label);
    setReassignTargetSessionId(selectedList[0]);
    setReassignBatchIds(selectedList);
    setShowReassignModal(true);
  };

  const handleSingleReassign = (session: Session) => {
    const label = `${session.sessionType || "Session"} at ${formatTime(session.startTime)}`;
    setReassignTargetLabel(label);
    setReassignTargetSessionId(session.id);
    setReassignBatchIds([session.id]);
    setShowReassignModal(true);
    setMobileSelectedSession(null);
  };

  const handleBlockSlots = () => {
    const count = selectedSlotKeys.size;
    if (count === 0) return;
    Alert.alert(
      "Block Selected Slots",
      `Block ${count} time slot${count !== 1 ? "s" : ""}? These will be marked unavailable for new bookings.`,
      [
        { text: "Keep Open", style: "cancel" },
        {
          text: `Block ${count} Slot${count !== 1 ? "s" : ""}`,
          style: "destructive",
          onPress: () => {
            const dateStr = selectedDate.toISOString().split("T")[0];
            const slots = Array.from(selectedSlotKeys).map((key) => {
              const [hourPart, entityId] = key.split(":");
              const hour = parseInt(hourPart.replace("H", ""), 10);
              return gridMode === "coach"
                ? { date: dateStr, hour, coachId: entityId }
                : { date: dateStr, hour, courtId: entityId };
            });
            blockSlotsMutation.mutate(slots);
          },
        },
      ]
    );
  };

  const handleMoveAll = () => {
    const count = selectedSessionIds.size;
    if (count === 0) return;
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setNewMoveDate(next);
    setShowMoveModal(true);
  };

  const isToday = useCallback((date: Date) => {
    return date.toDateString() === new Date().toDateString();
  }, []);

  // Update current time every minute for the time indicator line
  const handleSlotPress = (hour: number, coachId?: string, courtId?: string, date?: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedSlot({
      coachId,
      courtId,
      hour,
      date: date || selectedDate,
    });
    setWizardCoachId(coachId);
    setShowCreateSession(true);
  };

  const handleCloseWizard = () => {
    setShowCreateSession(false);
    setSelectedSlot(null);
    setWizardCoachId(undefined);
    queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
  };

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

  const sportFilteredSessions = useMemo(() => {
    if (sportFilter === "all") return sessions;
    return sessions.filter(s => (s.sport || "tennis") === sportFilter);
  }, [sessions, sportFilter]);

  const allTodaySessions = useMemo(() => {
    const today = selectedDate.toDateString();
    return sportFilteredSessions
      .filter((s) => new Date(s.startTime).toDateString() === today)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [sportFilteredSessions, selectedDate]);

  const todaySessions = useMemo(() => {
    if (selectedCoachFilter && gridMode === "coach") {
      return allTodaySessions.filter((s) => s.coachId === selectedCoachFilter);
    }
    return allTodaySessions;
  }, [allTodaySessions, selectedCoachFilter, gridMode]);

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
      
      let daySessions = sportFilteredSessions.filter((s) => {
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
  }, [sportFilteredSessions, selectedDate, selectedCoachFilter]);

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

  const isSlotOccupied = (hour: number, coachId?: string, courtId?: string) => {
    const sessionsToCheck = gridMode === "court" ? allTodaySessions : todaySessions;
    const sessionOccupied = sessionsToCheck.some((session) => {
      const startHour = new Date(session.startTime).getHours();
      const endHour = new Date(session.endTime).getHours();
      const sessionMatches = hour >= startHour && hour < endHour;
      if (gridMode === "coach") {
        return sessionMatches && session.coachId === coachId;
      } else {
        return sessionMatches && session.courtId === courtId;
      }
    });
    if (sessionOccupied) return true;
    // Also check DB-backed blocked slots
    const dateStr = selectedDate.toISOString().split("T")[0];
    return blockedSlots.some((slot: any) => {
      if (slot.date !== dateStr || slot.hour !== hour) return false;
      if (gridMode === "coach") return !slot.coachId || slot.coachId === coachId;
      return !slot.courtId || slot.courtId === courtId;
    });
  };

  const COURT_COLORS = [
    "#22C55E",
    "#3B82F6",
    "#A855F7",
    "#EC4899",
    "#14B8A6",
    "#EAB308",
    "#EF4444",
    "#F97316",
  ];

  const courtLaneWidth = Math.max(80, (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / Math.max(courts.length, 1));

  const now = new Date();
  const isTodaySelected = selectedDate.toDateString() === now.toDateString();
  const showTimeIndicator = isTodaySelected && now.getHours() >= START_HOUR && now.getHours() <= END_HOUR;
  const currentTimePosition = (now.getHours() - START_HOUR + now.getMinutes() / 60) * HOUR_HEIGHT;

  const renderDayView = () => (
    <View style={styles.calendarGrid}>
      <View style={styles.coachHeaderRow}>
        <View style={[styles.timeColumnHeader, { width: TIME_COLUMN_WIDTH }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.coachHeaders}>
            {gridMode === "coach" ? (
              (selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches).map((coach, index) => (
                <View key={coach.id} style={[styles.coachHeader, { width: coachLaneWidth }]}>
                  <View style={[styles.coachDot, { backgroundColor: COACH_COLORS[index % COACH_COLORS.length] }]} />
                  <Text style={styles.coachHeaderText} numberOfLines={1}>{coach.name}</Text>
                </View>
              ))
            ) : (
              courts.map((court, index) => (
                <View key={court.id} style={[styles.coachHeader, { width: courtLaneWidth }]}>
                  <View style={[styles.coachDot, { backgroundColor: COURT_COLORS[index % COURT_COLORS.length] }]} />
                  <Text style={styles.coachHeaderText} numberOfLines={1}>{court.name}</Text>
                </View>
              ))
            )}
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

          {showTimeIndicator ? (
            <View style={[styles.currentTimeIndicator, { top: currentTimePosition }]}>
              <View style={styles.currentTimeDot} />
              <View style={styles.currentTimeLine} />
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!(multiSelectMode && Platform.OS !== "web")}>
            <View
              ref={coachLanesRef}
              style={styles.coachLanesContainer}
              {...(Platform.OS !== "web" ? slotDragPanResponder.panHandlers : {})}
              onLayout={() => {
                coachLanesRef.current?.measure((_x, _y, _w, _h, px, py) => {
                  coachLanesAbsY.current = py;
                  coachLanesAbsX.current = px;
                });
              }}
            >
              {gridMode === "coach" ? (
                (selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches).map((coach, coachIndex) => {
                  const coachSessions = todaySessions.filter(s => s.coachId === coach.id);
                  return (
                    <View key={coach.id} style={[styles.coachLane, { width: coachLaneWidth }]}>
                      {hours.map((hour) => {
                        const occupied = isSlotOccupied(hour, coach.id, undefined);
                        const slotKey = `H${hour}:${coach.id}`;
                        const isSlotSelected = selectedSlotKeys.has(slotKey);
                        return (
                          <Pressable
                            key={hour}
                            style={[
                              styles.hourSlot,
                              styles.clickableSlot,
                              { height: HOUR_HEIGHT },
                              isSlotSelected && styles.slotSelected,
                            ]}
                            onPress={(e) => {
                              if (multiSelectMode) {
                                const isShift = Platform.OS === "web" && (e?.nativeEvent as any)?.shiftKey;
                                if (isShift && anchorSlotKey && anchorSlotKey.split(":")[1] === coach.id) {
                                  const anchorH = parseInt(anchorSlotKey.split(":")[0].replace("H", ""), 10);
                                  const lo = Math.min(anchorH, hour);
                                  const hi = Math.max(anchorH, hour);
                                  setSelectedSlotKeys(prev => {
                                    const next = new Set(prev);
                                    for (let h = lo; h <= hi; h++) next.add(`H${h}:${coach.id}`);
                                    return next;
                                  });
                                } else {
                                  toggleSlotSelection(slotKey);
                                }
                              } else if (!occupied) {
                                handleSlotPress(hour, coach.id, undefined);
                              }
                            }}
                            onLongPress={() => {
                              if (!occupied) enterSlotMultiSelect(slotKey);
                            }}
                          >
                            {!occupied ? (
                              <View style={styles.emptySlotIndicator}>
                                <Ionicons name="add" size={14} color={Colors.dark.textMuted + "40"} />
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}

                      {coachSessions.map((session) => {
                        const { top, height } = getSessionPosition(session);
                        const color = COACH_COLORS[coachIndex % COACH_COLORS.length];
                        const isSelected = selectedSessionIds.has(session.id);
                        return (
                          <Pressable
                            key={session.id}
                            style={[
                              styles.sessionBlock,
                              {
                                top,
                                height: height - 4,
                                opacity: session.status === "completed" || session.status === "cancelled" ? 0.6 : 1,
                              },
                              isSelected && styles.sessionBlockSelected,
                            ]}
                            onPress={(e) => {
                              const isShiftHeld = Platform.OS === "web" && (e?.nativeEvent as any)?.shiftKey;
                              if (isShiftHeld && anchorSessionId && multiSelectMode) {
                                const ordered = [...allTodaySessions].sort(
                                  (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                                );
                                const ai = ordered.findIndex(s => s.id === anchorSessionId);
                                const ti = ordered.findIndex(s => s.id === session.id);
                                if (ai !== -1 && ti !== -1) {
                                  const lo = Math.min(ai, ti);
                                  const hi = Math.max(ai, ti);
                                  setSelectedSessionIds(prev => {
                                    const next = new Set(prev);
                                    ordered.slice(lo, hi + 1).forEach(s => next.add(s.id));
                                    return next;
                                  });
                                }
                              } else if (multiSelectMode || isShiftHeld) {
                                if (!multiSelectMode) enterMultiSelect(session.id);
                                else toggleSessionSelection(session.id);
                              } else {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setMobileSelectedSession(session);
                              }
                            }}
                            onLongPress={() => enterMultiSelect(session.id)}
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
                              {session.sport && session.sport !== "tennis" ? (
                                <SportBadge sport={session.sport} size="sm" showLabel={false} />
                              ) : null}
                            </LinearGradient>
                          </Pressable>
                        );
                      })}

                      {blockedSlots
                        .filter((slot: any) => {
                          const dateStr = selectedDate.toISOString().split("T")[0];
                          return slot.date === dateStr && (!slot.coachId || slot.coachId === coach.id);
                        })
                        .map((slot: any) => {
                          const top = (slot.hour - START_HOUR) * HOUR_HEIGHT;
                          return (
                            <View
                              key={slot.id}
                              style={[styles.blockedSlotBlock, { top, height: HOUR_HEIGHT - 4 }]}
                              pointerEvents="none"
                            >
                              <Ionicons name="ban-outline" size={12} color="rgba(255,255,255,0.35)" />
                              <Text style={styles.blockedSlotText}>Blocked</Text>
                            </View>
                          );
                        })}
                    </View>
                  );
                })
              ) : (
                courts.map((court, courtIndex) => {
                  const courtSessions = allTodaySessions.filter(s => s.courtId === court.id);
                  return (
                    <View key={court.id} style={[styles.coachLane, { width: courtLaneWidth }]}>
                      {hours.map((hour) => {
                        const occupied = isSlotOccupied(hour, undefined, court.id);
                        const slotKey = `H${hour}:${court.id}`;
                        const isSlotSelected = selectedSlotKeys.has(slotKey);
                        return (
                          <Pressable
                            key={hour}
                            style={[
                              styles.hourSlot,
                              styles.clickableSlot,
                              { height: HOUR_HEIGHT },
                              isSlotSelected && styles.slotSelected,
                            ]}
                            onPress={(e) => {
                              if (multiSelectMode) {
                                const isShift = Platform.OS === "web" && (e?.nativeEvent as any)?.shiftKey;
                                if (isShift && anchorSlotKey && anchorSlotKey.split(":")[1] === court.id) {
                                  const anchorH = parseInt(anchorSlotKey.split(":")[0].replace("H", ""), 10);
                                  const lo = Math.min(anchorH, hour);
                                  const hi = Math.max(anchorH, hour);
                                  setSelectedSlotKeys(prev => {
                                    const next = new Set(prev);
                                    for (let h = lo; h <= hi; h++) next.add(`H${h}:${court.id}`);
                                    return next;
                                  });
                                } else {
                                  toggleSlotSelection(slotKey);
                                }
                              } else if (!occupied) {
                                handleSlotPress(hour, undefined, court.id);
                              }
                            }}
                            onLongPress={() => {
                              if (!occupied) enterSlotMultiSelect(slotKey);
                            }}
                          >
                            {!occupied ? (
                              <View style={styles.emptySlotIndicator}>
                                <Ionicons name="add" size={14} color={Colors.dark.textMuted + "40"} />
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}

                      {courtSessions.map((session) => {
                        const { top, height } = getSessionPosition(session);
                        const color = COURT_COLORS[courtIndex % COURT_COLORS.length];
                        const isSelected = selectedSessionIds.has(session.id);
                        return (
                          <Pressable
                            key={session.id}
                            style={[
                              styles.sessionBlock,
                              {
                                top,
                                height: height - 4,
                                opacity: session.status === "completed" || session.status === "cancelled" ? 0.6 : 1,
                              },
                              isSelected && styles.sessionBlockSelected,
                            ]}
                            onPress={(e) => {
                              const isShiftHeld = Platform.OS === "web" && (e?.nativeEvent as any)?.shiftKey;
                              if (isShiftHeld && anchorSessionId && multiSelectMode) {
                                const ordered = [...allTodaySessions].sort(
                                  (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                                );
                                const ai = ordered.findIndex(s => s.id === anchorSessionId);
                                const ti = ordered.findIndex(s => s.id === session.id);
                                if (ai !== -1 && ti !== -1) {
                                  const lo = Math.min(ai, ti);
                                  const hi = Math.max(ai, ti);
                                  setSelectedSessionIds(prev => {
                                    const next = new Set(prev);
                                    ordered.slice(lo, hi + 1).forEach(s => next.add(s.id));
                                    return next;
                                  });
                                }
                              } else if (multiSelectMode || isShiftHeld) {
                                if (!multiSelectMode) enterMultiSelect(session.id);
                                else toggleSessionSelection(session.id);
                              } else {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setMobileSelectedSession(session);
                              }
                            }}
                            onLongPress={() => enterMultiSelect(session.id)}
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
                                {getCoachName(session.coachId)}
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

                      {blockedSlots
                        .filter((slot: any) => {
                          const dateStr = selectedDate.toISOString().split("T")[0];
                          return slot.date === dateStr && (!slot.courtId || slot.courtId === court.id);
                        })
                        .map((slot: any) => {
                          const top = (slot.hour - START_HOUR) * HOUR_HEIGHT;
                          return (
                            <View
                              key={slot.id}
                              style={[styles.blockedSlotBlock, { top, height: HOUR_HEIGHT - 4 }]}
                              pointerEvents="none"
                            >
                              <Ionicons name="ban-outline" size={12} color="rgba(255,255,255,0.35)" />
                              <Text style={styles.blockedSlotText}>Blocked</Text>
                            </View>
                          );
                        })}
                    </View>
                  );
                })
              )}
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
                        opacity: session.status === "completed" || session.status === "cancelled" ? 0.6 : 1,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMobileSelectedSession(session);
                    }}
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

  const getBallLevelColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case "blue": return "#4FC3F7";
      case "red": return "#FF4D4D";
      case "orange": return "#FF851B";
      case "green": return "#C8FF3D";
      case "yellow": return "#FFD700";
      case "glow": return "#E040FB";
      default: return "#7C8290";
    }
  };

  if (sessionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isDesktop ? 0 : insets.top }]}>
        <TennisBallSpinner size="large" color={ADMIN_COLOR} />
      </View>
    );
  }

  if (isDesktop) {
    const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
    const HOUR_H = 56;

    return (
      <View style={calStyles.root}>
        <View style={calStyles.toolbar}>
          <Pressable style={calStyles.todayBtn} onPress={goToToday}>
            <Text style={calStyles.todayBtnText}>Today</Text>
          </Pressable>
          <Pressable onPress={() => navigateDate(-1)}>
            <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
          </Pressable>
          <Pressable onPress={() => navigateDate(1)}>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
          </Pressable>
          <Text style={calStyles.rangeText}>{formatWeekRange()}</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            style={calStyles.newSessionBtn}
            onPress={() => setShowCreateSession(true)}
          >
            <Ionicons name="add" size={16} color="#0B0D10" />
            <Text style={calStyles.newSessionBtnText}>New Session</Text>
          </Pressable>
        </View>

        <View style={calStyles.calendarArea}>
          <ScrollView style={calStyles.calendarScroll} showsVerticalScrollIndicator={false}>
            <View style={calStyles.weekGrid}>
              <View style={calStyles.timeGutter}>
                <View style={calStyles.dayHeaderCell} />
                {HOURS.map((h) => (
                  <View key={h} style={[calStyles.timeCell, { height: HOUR_H }]}>
                    <Text style={calStyles.timeText}>{`${h.toString().padStart(2, "0")}:00`}</Text>
                  </View>
                ))}
              </View>

              {weekDays.map(({ date, sessions: daySessions }) => {
                const isToday = date.toDateString() === new Date().toDateString();
                return (
                  <View key={date.toISOString()} style={calStyles.dayCol}>
                    <View style={[calStyles.dayHeaderCell, isToday && calStyles.dayHeaderToday]}>
                      <Text style={[calStyles.dayHeaderDay, isToday && calStyles.dayHeaderDayToday]}>
                        {date.toLocaleDateString("en-US", { weekday: "short" })}
                      </Text>
                      <Text style={[calStyles.dayHeaderDate, isToday && calStyles.dayHeaderDateToday]}>
                        {date.getDate()}
                      </Text>
                    </View>
                    <View style={[calStyles.dayBody, { height: HOURS.length * HOUR_H }]}>
                      {HOURS.map((h) => (
                        <Pressable
                          key={h}
                          style={[calStyles.hourSlot, { height: HOUR_H }]}
                          onPress={() => handleSlotPress(h, undefined, undefined, date)}
                        />
                      ))}
                      {daySessions.map((session) => {
                        const start = new Date(session.startTime);
                        const end = new Date(session.endTime);
                        const topOffset = (start.getHours() - START_HOUR + start.getMinutes() / 60) * HOUR_H;
                        const height = Math.max(20, ((end.getTime() - start.getTime()) / 3600000) * HOUR_H);
                        const color = getBallLevelColor(session.ballLevel);
                        const isSelected = desktopSelectedSession?.id === session.id;

                        return (
                          <Pressable
                            key={session.id}
                            style={[calStyles.sessionBlock, { top: topOffset, height, borderColor: color, borderLeftWidth: 3, ...(isSelected ? { borderColor: "#C8FF3D", borderWidth: 1 } : {}) }]}
                            onPress={() => setDesktopSelectedSession(isSelected ? null : session)}
                          >
                            <LinearGradient
                              colors={[`${color}30`, `${color}15`]}
                              style={calStyles.sessionBlockGradient}
                            >
                              <Text style={calStyles.sessionBlockTime} numberOfLines={1}>
                                {start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                              </Text>
                              <Text style={[calStyles.sessionBlockType, { color }]} numberOfLines={1}>
                                {session.sessionType || session.ballLevel || "Session"}
                              </Text>
                              {height > 36 ? (
                                <Text style={calStyles.sessionBlockCoach} numberOfLines={1}>
                                  {getCoachName(session.coachId)}
                                </Text>
                              ) : null}
                              {height > 52 ? (
                                <Text style={calStyles.sessionBlockCapacity} numberOfLines={1}>
                                  {session.players?.length ?? 0}/{session.maxCapacity ?? "?"} players
                                </Text>
                              ) : null}
                            </LinearGradient>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {desktopSelectedSession ? (
            <View style={calStyles.rightPanel}>
              <View style={calStyles.panelHeader}>
                <Text style={calStyles.panelTitle}>Session Details</Text>
                <Pressable onPress={() => setDesktopSelectedSession(null)}>
                  <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
                </Pressable>
              </View>
              <View style={calStyles.panelContent}>
                {(() => {
                  const s = desktopSelectedSession;
                  const start = new Date(s.startTime);
                  const end = new Date(s.endTime);
                  const color = getBallLevelColor(s.ballLevel);
                  return (
                    <>
                      <View style={[calStyles.panelColorBar, { backgroundColor: color }]} />
                      {[
                        { label: "Type", value: s.sessionType || "Session" },
                        { label: "Ball Level", value: s.ballLevel || "—" },
                        { label: "Coach", value: getCoachName(s.coachId) },
                        { label: "Court", value: getCourtName(s.courtId) },
                        { label: "Start", value: start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) },
                        { label: "End", value: end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) },
                        { label: "Status", value: s.status || "upcoming" },
                        { label: "Players", value: s.players?.length ? `${s.players.length} enrolled` : "0 enrolled" },
                      ].map(({ label, value }) => (
                        <View key={label} style={calStyles.panelRow}>
                          <Text style={calStyles.panelRowLabel}>{label}</Text>
                          <Text style={calStyles.panelRowValue}>{value}</Text>
                        </View>
                      ))}
                      {s.players && s.players.length > 0 ? (
                        <View style={calStyles.playerList}>
                          <Text style={calStyles.playerListTitle}>
                            Players ({s.players.length}/{s.maxCapacity ?? "?"})
                          </Text>
                          {s.players.map((p) => (
                            <View key={p.id} style={calStyles.playerListRow}>
                              <View style={calStyles.playerListDot} />
                              <Text style={calStyles.playerListName}>{p.name}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <View style={calStyles.quickActionsRow}>
                        <Pressable
                          style={calStyles.quickAction}
                          onPress={() => {
                            setSelectedSlot({
                              hour: new Date(s.startTime).getHours(),
                              coachId: s.coachId,
                              courtId: s.courtId,
                              date: new Date(s.startTime),
                            });
                            setShowCreateSession(true);
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={14} color="#C8FF3D" />
                          <Text style={calStyles.quickActionText}>New this slot</Text>
                        </Pressable>
                        {s.status !== "cancelled" && s.status !== "completed" ? (
                          <>
                            <Pressable
                              style={[calStyles.quickAction, { borderColor: "rgba(249,115,22,0.3)", backgroundColor: "rgba(249,115,22,0.08)" }]}
                              onPress={() => {
                                const label = `${s.sessionType || "Session"} at ${new Date(s.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
                                setReassignTargetLabel(label);
                                setReassignTargetSessionId(s.id);
                                setShowReassignModal(true);
                                setDesktopSelectedSession(null);
                              }}
                            >
                              <Ionicons name="swap-horizontal-outline" size={14} color={Colors.dark.orange} />
                              <Text style={[calStyles.quickActionText, { color: Colors.dark.orange }]}>Reassign Coach</Text>
                            </Pressable>
                            <Pressable
                              style={[calStyles.quickAction, { borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.08)" }]}
                              onPress={() => handleCancelSession(s)}
                              disabled={cancelMutation.isPending}
                            >
                              <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                              <Text style={[calStyles.quickActionText, { color: "#EF4444" }]}>
                                {cancelMutation.isPending ? "Cancelling..." : "Cancel Session"}
                              </Text>
                            </Pressable>
                          </>
                        ) : null}
                        <Pressable
                          style={[calStyles.quickAction, { borderColor: "rgba(255,133,27,0.3)", backgroundColor: "rgba(255,133,27,0.08)" }]}
                          onPress={() => setDesktopSelectedSession(null)}
                        >
                          <Ionicons name="close-outline" size={14} color={Colors.dark.orange} />
                          <Text style={[calStyles.quickActionText, { color: Colors.dark.orange }]}>Dismiss</Text>
                        </Pressable>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
          ) : null}
        </View>

        {showCreateSession ? (
          <CreateSessionWizard
            visible={showCreateSession}
            onClose={handleCloseWizard}
            initialDate={selectedSlot?.date || selectedDate}
            selectedCoachId={wizardCoachId}
          />
        ) : null}
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
        <View style={styles.headerToggles}>
          
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
      </View>

      {viewMode === "day" ? (
        <View style={styles.gridModeToggle}>
          <Pressable
            style={[styles.gridModeButton, gridMode === "coach" && styles.gridModeButtonActive]}
            onPress={() => { setGridMode("coach"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="people" size={14} color={gridMode === "coach" ? Colors.dark.text : Colors.dark.textMuted} />
            <Text style={[styles.gridModeText, gridMode === "coach" && styles.gridModeTextActive]}>Coaches</Text>
          </Pressable>
          <Pressable
            style={[styles.gridModeButton, gridMode === "court" && styles.gridModeButtonActive]}
            onPress={() => { setGridMode("court"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="tennisball" size={14} color={gridMode === "court" ? Colors.dark.text : Colors.dark.textMuted} />
            <Text style={[styles.gridModeText, gridMode === "court" && styles.gridModeTextActive]}>Courts</Text>
          </Pressable>
        </View>
      ) : null}

      
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.coachFilter}
        contentContainerStyle={styles.coachFilterContent}
      >
        <Pressable
          style={[styles.filterChip, sportFilter === "all" && styles.filterChipActive]}
          onPress={() => { setSportFilter("all"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Text style={[styles.filterChipText, sportFilter === "all" && styles.filterChipTextActive]}>All Sports</Text>
        </Pressable>
        {SPORTS.map((sport) => (
          <Pressable
            key={sport}
            style={[styles.filterChip, sportFilter === sport && styles.filterChipActive]}
            onPress={() => { setSportFilter(sport); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <SportBadge sport={sport} size="sm" showLabel={false} />
            <Text style={[styles.filterChipText, sportFilter === sport && styles.filterChipTextActive]}>
              {sport.charAt(0).toUpperCase() + sport.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.calendarContainer, { paddingBottom: insets.bottom + 80 }]}>
        {viewMode === "day" ? renderDayView() : renderWeekView()}
      </View>

      
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 90 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSelectedSlot(null);
            setShowCreateSession(true);
          }}
        >
          <LinearGradient
            colors={[ADMIN_COLOR, "#EA580C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
          </LinearGradient>
        </Pressable>
      

      <CreateSessionWizard
        visible={showCreateSession}
        onClose={handleCloseWizard}
        adminMode={true}
        coaches={coaches}
        selectedCoachId={wizardCoachId}
        onCoachIdChange={setWizardCoachId}
        initialTime={selectedSlot ? (() => {
          const date = new Date(selectedSlot.date);
          date.setHours(selectedSlot.hour, 0, 0, 0);
          return date;
        })() : undefined}
        initialCourtId={selectedSlot?.courtId}
      />

      {multiSelectMode ? (
        <View style={[styles.multiSelectBar, { bottom: insets.bottom + 90 }]}>
          <Pressable style={styles.multiSelectExit} onPress={exitMultiSelect}>
            <Ionicons name="close" size={18} color={Colors.dark.textMuted} />
          </Pressable>
          <Text style={styles.multiSelectCount}>
            {selectedSessionIds.size + selectedSlotKeys.size}{" "}
            {selectedSlotKeys.size > 0 && selectedSessionIds.size === 0
              ? `slot${selectedSlotKeys.size !== 1 ? "s" : ""}`
              : selectedSlotKeys.size > 0
              ? `selected (${selectedSlotKeys.size} slot${selectedSlotKeys.size !== 1 ? "s" : ""})`
              : "selected"}
          </Text>
          <View style={styles.multiSelectActions}>
            {selectedSlotKeys.size > 0 ? (
              <Pressable
                style={[styles.multiSelectAction, { backgroundColor: "rgba(156,163,175,0.15)" }]}
                onPress={handleBlockSlots}
                disabled={blockSlotsMutation.isPending}
              >
                {blockSlotsMutation.isPending ? (
                  <TennisBallSpinner size="small" color={Colors.dark.textMuted} />
                ) : (
                  <Ionicons name="ban" size={16} color={Colors.dark.textMuted} />
                )}
                <Text style={[styles.multiSelectActionText, { color: Colors.dark.textMuted }]}>Block</Text>
              </Pressable>
            ) : null}
            {selectedSessionIds.size > 0 ? (
              <Pressable
                style={[styles.multiSelectAction, { backgroundColor: "rgba(99,102,241,0.15)" }]}
                onPress={handleMoveAll}
              >
                <Ionicons name="calendar-outline" size={16} color="#818CF8" />
                <Text style={[styles.multiSelectActionText, { color: "#818CF8" }]}>Move</Text>
              </Pressable>
            ) : null}
            {selectedSessionIds.size > 0 ? (
              <Pressable
                style={[styles.multiSelectAction, { backgroundColor: `${Colors.dark.orange}20` }]}
                onPress={handleBatchReassign}
              >
                <Ionicons name="swap-horizontal" size={16} color={Colors.dark.orange} />
                <Text style={[styles.multiSelectActionText, { color: Colors.dark.orange }]}>Reassign</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.multiSelectAction, { backgroundColor: `${Colors.dark.error}20` }]}
              onPress={handleBatchCancel}
              disabled={selectedSessionIds.size === 0 || batchCancelMutation.isPending}
            >
              {batchCancelMutation.isPending ? (
                <TennisBallSpinner size="small" color={Colors.dark.error} />
              ) : (
                <Ionicons name="close-circle" size={16} color={Colors.dark.error} />
              )}
              <Text style={[styles.multiSelectActionText, { color: Colors.dark.error }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ReassignCoachModal
        visible={showReassignModal}
        sessionId={reassignTargetSessionId}
        sessionLabel={reassignTargetLabel}
        batchSessionIds={reassignBatchIds}
        onClose={() => {
          setShowReassignModal(false);
          setReassignTargetSessionId(null);
          setReassignBatchIds([]);
          exitMultiSelect();
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
          exitMultiSelect();
        }}
      />

      <Modal
        visible={showMoveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveModal(false)}
      >
        <View style={styles.moveModalOverlay}>
          <View style={styles.moveModalSheet}>
            <View style={styles.moveModalHeader}>
              <Text style={styles.moveModalTitle}>Move Sessions</Text>
              <Pressable onPress={() => setShowMoveModal(false)}>
                <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.moveModalSubtitle}>
              Move {selectedSessionIds.size} session{selectedSessionIds.size !== 1 ? "s" : ""} to a new date.
            </Text>

            <View style={styles.moveDateRow}>
              <Ionicons name="calendar-outline" size={18} color="#818CF8" />
              <Text style={styles.moveDateLabel}>Target date</Text>
              <Pressable
                style={styles.moveDateBtn}
                onPress={() => {
                  const prev = new Date(newMoveDate);
                  prev.setDate(prev.getDate() - 1);
                  if (prev > selectedDate) setNewMoveDate(prev);
                }}
              >
                <Ionicons name="chevron-back" size={16} color={Colors.dark.textMuted} />
              </Pressable>
              <Text style={styles.moveDateValue}>
                {newMoveDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </Text>
              <Pressable
                style={styles.moveDateBtn}
                onPress={() => {
                  const next = new Date(newMoveDate);
                  next.setDate(next.getDate() + 1);
                  setNewMoveDate(next);
                }}
              >
                <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <View style={styles.moveModalActions}>
              <Pressable style={styles.moveCancelBtn} onPress={() => setShowMoveModal(false)}>
                <Text style={styles.moveCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.moveConfirmBtn, moveSessionsMutation.isPending && { opacity: 0.6 }]}
                onPress={() => {
                  const dateStr = newMoveDate.toISOString().split("T")[0];
                  moveSessionsMutation.mutate({ sessionIds: Array.from(selectedSessionIds), targetDate: dateStr });
                }}
                disabled={moveSessionsMutation.isPending}
              >
                {moveSessionsMutation.isPending ? (
                  <TennisBallSpinner size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
                <Text style={styles.moveConfirmText}>
                  {moveSessionsMutation.isPending ? "Moving..." : "Confirm Move"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={mobileSelectedSession !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setMobileSelectedSession(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMobileSelectedSession(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {mobileSelectedSession ? (
              <>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {mobileSelectedSession.sessionType || "Session"}
                  </Text>
                  <Pressable onPress={() => setMobileSelectedSession(null)}>
                    <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
                {[
                  { label: "Coach", value: getCoachName(mobileSelectedSession.coachId) },
                  { label: "Court", value: getCourtName(mobileSelectedSession.courtId) },
                  {
                    label: "Time",
                    value: `${formatTime(mobileSelectedSession.startTime)} – ${formatTime(mobileSelectedSession.endTime)}`,
                  },
                  { label: "Status", value: mobileSelectedSession.status || "upcoming" },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>{label}</Text>
                    <Text style={styles.modalRowValue}>{value}</Text>
                  </View>
                ))}
                <View style={styles.playersSection}>
                  <Text style={styles.playersSectionTitle}>
                    Players ({mobileSelectedSession.players?.length ?? 0}{mobileSelectedSession.maxCapacity ? `/${mobileSelectedSession.maxCapacity}` : ""})
                  </Text>
                  {mobileSelectedSession.players && mobileSelectedSession.players.length > 0 ? (
                    <ScrollView
                      style={styles.playersScrollList}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {mobileSelectedSession.players.map((p) => (
                        <View key={p.id} style={styles.playerSheetRow}>
                          <View style={styles.playerSheetDot} />
                          <Text style={styles.playerSheetName}>{p.name}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={styles.playersEmptyText}>No players enrolled</Text>
                  )}
                </View>
                {mobileSelectedSession.status !== "cancelled" && mobileSelectedSession.status !== "completed" ? (
                  <View style={styles.modalActions}>
                    <Pressable
                      style={styles.changeCoachButton}
                      onPress={() => handleSingleReassign(mobileSelectedSession)}
                    >
                      <Ionicons name="swap-horizontal-outline" size={16} color="#0B0D10" />
                      <Text style={styles.changeCoachButtonText}>Change Coach</Text>
                    </Pressable>
                    {mobileSelectedSession.coachId ? (
                      <Pressable
                        style={styles.markAbsentButton}
                        onPress={() => {
                          const coachId = mobileSelectedSession.coachId ?? null;
                          const coachName = getCoachName(mobileSelectedSession.coachId);
                          setMarkAbsentCoachId(coachId);
                          setMarkAbsentCoachName(coachName);
                          setMobileSelectedSession(null);
                          setMarkAbsentSheetVisible(true);
                        }}
                      >
                        <Ionicons name="person-remove-outline" size={16} color={Colors.dark.error} />
                        <Text style={styles.markAbsentButtonText}>Mark Coach Absent</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.cancelSessionButton, cancelMutation.isPending && styles.cancelButtonDisabled]}
                      onPress={() => handleCancelSession(mobileSelectedSession)}
                      disabled={cancelMutation.isPending}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={Colors.dark.error} />
                      <Text style={styles.cancelSessionButtonText}>
                        {cancelMutation.isPending ? "Cancelling..." : "Cancel Session"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <MarkAbsentSheet
        visible={markAbsentSheetVisible}
        coachId={markAbsentCoachId}
        coachName={markAbsentCoachName}
        onClose={() => {
          setMarkAbsentSheetVisible(false);
          setMarkAbsentCoachId(null);
          setMarkAbsentCoachName("");
        }}
      />
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
    position: "relative",
  },
  currentTimeIndicator: {
    position: "absolute",
    left: TIME_COLUMN_WIDTH,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 100,
  },
  currentTimeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.error,
    marginLeft: -5,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.dark.error,
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
  clickableSlot: {
    justifyContent: "center",
    alignItems: "center",
  },
  emptySlotIndicator: {
    opacity: 0,
  },
  headerToggles: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  gridModeToggle: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  gridModeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  gridModeButtonActive: {
    backgroundColor: ADMIN_COLOR,
  },
  gridModeText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  gridModeTextActive: {
    color: Colors.dark.text,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: ADMIN_COLOR,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  fabGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    color: Colors.dark.text,
    textTransform: "uppercase",
  },
  sessionTime: {
    fontSize: 8,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: 1,
  },
  sessionCourt: {
    fontSize: 7,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  sessionPlayers: {
    fontSize: 7,
    fontWeight: "500",
    color: Colors.dark.textMuted,
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
    color: Colors.dark.text,
    textTransform: "uppercase",
  },
  weekSessionTime: {
    fontSize: 6,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.textMuted + "60",
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  modalRow: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  modalRowLabel: {
    flex: 1,
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  modalRowValue: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  modalActions: {
    flexDirection: "column",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  changeCoachButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
  },
  changeCoachButtonText: {
    ...Typography.body,
    color: "#0B0D10",
    fontWeight: "700",
  },
  markAbsentButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: `${Colors.dark.error}15`,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.error}40`,
  },
  markAbsentButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "700",
  },
  cancelSessionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.error}60`,
  },
  cancelSessionButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  playersSection: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playersSectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  playersScrollList: {
    maxHeight: 140,
  },
  playerSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 5,
  },
  playerSheetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  playerSheetName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontSize: 14,
  },
  playersEmptyText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  sessionBlockSelected: {
    borderWidth: 2,
    borderColor: "#C8FF3D",
  },
  multiSelectBar: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}60`,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.orange,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  multiSelectExit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  multiSelectCount: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    flex: 1,
  },
  multiSelectActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  multiSelectAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  multiSelectActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  slotSelected: {
    backgroundColor: "rgba(99,102,241,0.18)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.5)",
  },
  blockedSlotBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dotted",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    overflow: "hidden",
  },
  blockedSlotText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  moveModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  moveModalSheet: {
    backgroundColor: "#16191F",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  moveModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  moveModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  moveModalSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginBottom: 24,
  },
  moveDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  moveDateLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  moveDateValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  moveDateBtn: {
    padding: 4,
  },
  moveModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  moveCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  moveCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  moveConfirmBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#4F46E5",
  },
  moveConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

const calStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0D10",
    flexDirection: "column",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 12,
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  todayBtnText: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  rangeText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    marginLeft: 4,
  },
  newSessionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#C8FF3D",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newSessionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B0D10",
  },
  calendarArea: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  calendarScroll: {
    flex: 1,
    overflow: "auto" as any,
  },
  weekGrid: {
    flexDirection: "row",
    minWidth: 700,
  },
  timeGutter: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.07)",
  },
  dayCol: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.05)",
  },
  dayHeaderCell: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  dayHeaderToday: {
    backgroundColor: "rgba(200,255,61,0.05)",
  },
  dayHeaderDay: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dayHeaderDayToday: {
    color: "#C8FF3D",
  },
  dayHeaderDate: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: 2,
  },
  dayHeaderDateToday: {
    color: "#C8FF3D",
  },
  dayBody: {
    position: "relative",
    overflow: "hidden",
  },
  timeCell: {
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingRight: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  timeText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    textAlign: "right",
  },
  hourSlot: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  sessionBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  sessionBlockGradient: {
    flex: 1,
    padding: 4,
  },
  sessionBlockTime: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  sessionBlockType: {
    fontSize: 11,
    fontWeight: "700",
  },
  sessionBlockCoach: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  rightPanel: {
    width: 280,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#11141A",
    overflow: "auto" as any,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  panelContent: {
    padding: 16,
  },
  panelColorBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  panelRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  panelRowLabel: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  panelRowValue: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  playerList: {
    marginTop: 16,
  },
  playerListTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  playerListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  playerListDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C8FF3D",
  },
  playerListName: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  sessionBlockCapacity: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    marginTop: 1,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.3)",
    backgroundColor: "rgba(200,255,61,0.08)",
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C8FF3D",
  },
});
