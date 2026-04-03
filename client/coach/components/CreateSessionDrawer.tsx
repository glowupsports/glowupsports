import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image as RNImage,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Typography, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, apiFetch, getApiUrl, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useNetwork } from "@/context/NetworkContext";
import { showOfflineAlert } from "@/hooks/useOfflineGuard";

interface Player {
  id: string;
  name: string;
  email: string;
  ballLevel?: string | null;
  level?: string | number | null;
  skillLevel?: number | null;
  profilePhotoUrl?: string | null;
}

interface CreateSessionDrawerProps {
  visible: boolean;
  onClose: () => void;
  initialCourtId?: string;
  initialTime?: Date;
}

type SessionType = "private" | "semi_private" | "group" | "physical" | "activity";
type BallLevel = "blue" | "red" | "orange" | "green" | "yellow" | "glow";
type SkillLevel = 1 | 2 | 3;

const SESSION_TYPES: { value: SessionType; label: string; color: string }[] = [
  { value: "private", label: "Private", color: Colors.dark.primary },
  { value: "semi_private", label: "Semi-Private", color: Colors.dark.xpCyan },
  { value: "group", label: "Group", color: Colors.dark.orange },
  { value: "physical", label: "Physical", color: Colors.dark.gold },
  { value: "activity", label: "Activity", color: Colors.dark.error },
];

const BALL_LEVELS: { value: BallLevel; label: string; color: string }[] = [
  { value: "blue", label: "Blue", color: "#3B82F6" },
  { value: "red", label: "Red", color: "#FF4444" },
  { value: "orange", label: "Orange", color: "#FF851B" },
  { value: "green", label: "Green", color: "#2ECC40" },
  { value: "yellow", label: "Yellow", color: "#FFDC00" },
  { value: "glow", label: "Glow", color: "#00D4FF" },
];

const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 1, label: "Beginner" },
  { value: 2, label: "Intermediate" },
  { value: 3, label: "Advanced" },
];

const WEEK_COUNTS = [1, 5, 10, 15, 20];
const TRAVEL_TIMES = [0, 5, 10, 15, 20, 30];
const DURATIONS = [30, 45, 60, 90, 120];

export default function CreateSessionDrawer({
  visible,
  onClose,
  initialCourtId,
  initialTime,
}: CreateSessionDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach, refetchCalendar } = useCoach();
  const { isOffline, logOfflineAttempt } = useNetwork();

  const [sessionType, setSessionType] = useState<SessionType>("private");
  const [duration, setDuration] = useState(60);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [weekCount, setWeekCount] = useState(10);
  const [ballLevel, setBallLevel] = useState<BallLevel | null>(null);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const [travelTime, setTravelTime] = useState(0);
  const [notes, setNotes] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [weekAvailability, setWeekAvailability] = useState<{ week: number; date: Date; available: boolean; conflict?: string }[]>([]);
  const [isCheckingWeeks, setIsCheckingWeeks] = useState(false);
  
  // Player filtering states
  const [filterBallLevel, setFilterBallLevel] = useState<BallLevel | null>(null);
  const [filterSkillLevel, setFilterSkillLevel] = useState<SkillLevel | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Get ball level color
  const getBallLevelColor = (level: string | null | undefined): string => {
    switch (level?.toLowerCase()) {
      case "blue": return "#3B82F6";
      case "red": return "#EF4444";
      case "orange": return "#F97316";
      case "green": return "#22C55E";
      case "yellow": return "#EAB308";
      case "adult":
      case "glow": return "#00E5FF"; // Cyan for adult players
      default: return Colors.dark.disabled;
    }
  };

  // Get skill level label (handles both string and number)
  const getSkillLevelLabel = (level: string | number | null | undefined): string => {
    const lvl = typeof level === 'number' ? String(level) : level;
    switch (lvl) {
      case "1": return "Beg";
      case "2": return "Int";
      case "3": return "Adv";
      case "beginner": return "Beg";
      case "intermediate": return "Int";
      case "advanced": return "Adv";
      default: return "";
    }
  };

  useEffect(() => {
    if (visible) {
      if (initialCourtId) setSelectedCourtId(initialCourtId);
      if (initialTime) setStartTime(initialTime);
      setConflicts([]);
    }
  }, [visible, initialCourtId, initialTime]);

  interface SessionTemplate {
    id: string;
    name: string;
    sessionType: string;
    duration: number;
    ballLevel: string | null;
    skillLevel: number | null;
    notes: string | null;
  }

  const { data: courts = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/courts"],
    enabled: visible,
  });

  const { data: playersData } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: visible,
  });
  const players = Array.isArray(playersData) ? playersData : [];

  // Normalize skill level to number (handles both numeric and string values)
  const normalizeSkillLevel = (level: string | number | null | undefined): number | null => {
    if (level === null || level === undefined) return null;
    if (typeof level === 'number') return level;
    // Handle string numeric values
    const parsed = parseInt(level, 10);
    if (!isNaN(parsed)) return parsed;
    // Handle string text values
    const normalized = level.toLowerCase();
    if (normalized === 'beginner') return 1;
    if (normalized === 'intermediate') return 2;
    if (normalized === 'advanced') return 3;
    return null;
  };

  // Filter players based on search, ball level, and skill level
  const filteredPlayers = players.filter(p => {
    // Always apply name search
    const matchesSearch = p.name.toLowerCase().includes(playerSearch.toLowerCase());
    if (!matchesSearch) return false;
    
    // Filter by ball level if selected
    if (filterBallLevel && p.ballLevel !== filterBallLevel) return false;
    
    // Filter by skill level if selected (check both skillLevel and level fields)
    if (filterSkillLevel) {
      // Try skillLevel first, then fall back to level
      const rawSkill = p.skillLevel ?? p.level;
      const playerSkill = normalizeSkillLevel(rawSkill);
      if (playerSkill === null || playerSkill !== filterSkillLevel) return false;
    }
    
    return true;
  });

  const { data: templates = [] } = useQuery<SessionTemplate[]>({
    queryKey: ["/api/coach/templates", coach?.id],
    queryFn: async () => {
      if (!coach?.id) return [];
      const res = await apiFetch(`/api/coach/templates?coachId=${coach.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: visible && !!coach?.id,
  });

  // Fetch coach sessions for the selected day to show blocked time slots
  interface ExistingSession {
    id: string;
    startTime: string;
    endTime: string;
    duration?: number;
    courtId?: string;
    blocked?: boolean;
  }

  interface CalendarData {
    ownSessions: ExistingSession[];
    blockedSessions: ExistingSession[];
  }

  // Use local date components for query key to avoid timezone issues
  const selectedDateString = `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, '0')}-${String(startTime.getDate()).padStart(2, '0')}`;
  
  const { data: calendarData } = useQuery<CalendarData>({
    queryKey: ["/api/coach/calendar/day", coach?.id, selectedDateString],
    queryFn: async () => {
      if (!coach?.id) return { ownSessions: [], blockedSessions: [] };
      
      // Use the correct API parameter: date (ISO date string)
      const res = await apiFetch(
        `/api/coach/calendar?date=${selectedDateString}&view=day`
      );
      if (!res.ok) return { ownSessions: [], blockedSessions: [] };
      const data = await res.json();
      return {
        ownSessions: data.ownSessions || [],
        blockedSessions: data.blockedSessions || [],
      };
    },
    enabled: visible && !!coach?.id,
  });

  // Coach's own sessions (blocks ALL time slots regardless of court)
  const coachSessions = calendarData?.ownSessions || [];
  
  // Other coaches' sessions on the SELECTED court
  const courtBlockedSessions = selectedCourtId 
    ? (calendarData?.blockedSessions || []).filter(s => s.courtId === selectedCourtId)
    : [];

  // Calculate blocked time slots based on existing sessions
  const getBlockedTimeSlots = useCallback((): Set<string> => {
    const blocked = new Set<string>();
    
    const slotTimes = [
      "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
      "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
      "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
    ];
    
    // Helper to check if a session overlaps with a time slot
    const checkSessionOverlap = (session: ExistingSession) => {
      const sessionStartStr = session.startTime;
      const sessionEndStr = session.endTime;
      const sessionStart = new Date(sessionStartStr.endsWith("Z") ? sessionStartStr : sessionStartStr + "Z");
      const sessionEnd = new Date(sessionEndStr.endsWith("Z") ? sessionEndStr : sessionEndStr + "Z");
      
      for (const time of slotTimes) {
        const [hours, mins] = time.split(":").map(Number);
        const slotStart = new Date(startTime);
        slotStart.setHours(hours, mins, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + duration);
        
        // Overlap: slotStart < sessionEnd AND slotEnd > sessionStart
        if (slotStart < sessionEnd && slotEnd > sessionStart) {
          blocked.add(time);
        }
      }
    };
    
    // Block slots for coach's own sessions (can't double book coach)
    for (const session of coachSessions) {
      checkSessionOverlap(session);
    }
    
    // Block slots for other coaches' sessions on the selected court (can't double book court)
    for (const session of courtBlockedSessions) {
      checkSessionOverlap(session);
    }
    
    return blocked;
  }, [coachSessions, courtBlockedSessions, startTime, duration]);

  const blockedSlots = getBlockedTimeSlots();

  const applyTemplate = (template: SessionTemplate) => {
    setSessionType(template.sessionType as SessionType);
    setDuration(template.duration);
    if (template.ballLevel) setBallLevel(template.ballLevel as BallLevel);
    if (template.skillLevel) setSkillLevel(template.skillLevel as SkillLevel);
    if (template.notes) setNotes(template.notes);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      return apiRequest("POST", "/api/coach/sessions", sessionData);
    },
    onSuccess: (data: any) => {
      refetchCalendar();
      // Invalidate all calendar queries (including ones with query params in the key)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/coach/calendar');
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
      onClose();
      resetForm();
      
      if (data && typeof data === "object" && data.summary && Array.isArray(data.summary.skippedWeeks) && data.summary.skippedWeeks.length > 0) {
        Alert.alert(
          "Sessions Created",
          `Created ${data.summary.created} of ${data.summary.requested} sessions. Skipped weeks ${data.summary.skippedWeeks.join(", ")} due to conflicts.`
        );
      }
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create session");
    },
  });

  const createGuestMutation = useMutation({
    mutationFn: async (name: string): Promise<Player> => {
      const response = await apiRequest("POST", "/api/players", {
        name: `${name} (Guest)`,
        coachId: coach?.id,
        membershipType: "guest",
      });
      const player: Player = await response.json();
      return player;
    },
    onSuccess: (newPlayer: Player) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setSelectedPlayers((prev) => {
        if (prev.some((p) => p.id === newPlayer.id)) return prev;
        return [...prev, newPlayer];
      });
      setGuestName("");
      setShowGuestInput(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create guest player");
    },
  });

  const handleAddGuest = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "CreateSessionDrawer", action: "add_guest" });
      showOfflineAlert();
      return;
    }
    if (!guestName.trim()) return;
    createGuestMutation.mutate(guestName.trim());
  };

  const resetForm = () => {
    setSessionType("private");
    setDuration(60);
    setSelectedCourtId(null);
    setSelectedPlayers([]);
    setGuestName("");
    setShowGuestInput(false);
    setIsRecurring(false);
    setWeekCount(10);
    setBallLevel(null);
    setSkillLevel(null);
    setTravelTime(0);
    setNotes("");
    setConflicts([]);
    // Reset player filters
    setFilterBallLevel(null);
    setFilterSkillLevel(null);
    setShowAllPlayers(false);
    setPlayerSearch("");
  };

  const checkConflicts = async () => {
    if (!selectedCourtId || !coach?.id) return;

    setIsChecking(true);
    try {
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + duration);

      const params = new URLSearchParams({
        courtId: selectedCourtId,
        coachId: coach.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });
      selectedPlayers.forEach(p => params.append("playerIds", p.id));

      const response = await apiFetch(`/api/coach/sessions/check-conflict?${params.toString()}`);

      if (!response.ok) {
        console.error("Conflict check failed:", response.statusText);
        return;
      }

      const data = await response.json();
      if (data.conflicts && data.conflicts.length > 0) {
        setConflicts(data.conflicts);
      } else {
        setConflicts([]);
      }
    } catch (error) {
      console.error("Conflict check failed:", error);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (visible && selectedCourtId && startTime) {
      const timer = setTimeout(checkConflicts, 500);
      return () => clearTimeout(timer);
    }
  }, [visible, selectedCourtId, startTime, duration, selectedPlayers]);

  // Check availability for all weeks when recurring is enabled (parallel requests)
  const checkWeekAvailability = useCallback(async () => {
    if (!isRecurring || !selectedCourtId || !coach?.id || weekCount <= 1) {
      setWeekAvailability([]);
      return;
    }

    setIsCheckingWeeks(true);

    try {
      // Build all week dates first
      const weeks = Array.from({ length: weekCount }, (_, week) => {
        const weekStart = new Date(startTime.getTime() + week * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + duration * 60000);
        return { week: week + 1, weekStart, weekEnd };
      });

      // Make all API calls in parallel
      const checkPromises = weeks.map(async ({ week, weekStart, weekEnd }) => {
        const params = new URLSearchParams({
          courtId: selectedCourtId!,
          coachId: coach!.id,
          startTime: weekStart.toISOString(),
          endTime: weekEnd.toISOString(),
        });

        try {
          const response = await apiFetch(`/api/coach/sessions/check-conflict?${params.toString()}`);
          if (!response.ok) {
            return { week, date: weekStart, available: true };
          }

          const data = await response.json();
          const hasConflict = data.conflicts && data.conflicts.length > 0;
          return {
            week,
            date: weekStart,
            available: !hasConflict,
            conflict: hasConflict ? data.conflicts[0] : undefined,
          };
        } catch {
          return { week, date: weekStart, available: true };
        }
      });

      const availability = await Promise.all(checkPromises);
      setWeekAvailability(availability);
    } finally {
      setIsCheckingWeeks(false);
    }
  }, [isRecurring, selectedCourtId, coach?.id, weekCount, startTime, duration]);

  useEffect(() => {
    if (visible && isRecurring && selectedCourtId && weekCount > 1) {
      const timer = setTimeout(checkWeekAvailability, 600);
      return () => clearTimeout(timer);
    } else {
      setWeekAvailability([]);
    }
  }, [visible, isRecurring, selectedCourtId, weekCount, startTime, duration, checkWeekAvailability]);

  const handleSubmit = async () => {
    if (isOffline) {
      await logOfflineAttempt({ screen: "CreateSessionDrawer", action: "create_session" });
      showOfflineAlert();
      return;
    }

    if (!selectedCourtId) {
      Alert.alert("Error", "Please select a court");
      return;
    }

    if (conflicts.length > 0) {
      Alert.alert("Conflict", "There are scheduling conflicts. Please resolve them first.");
      return;
    }

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    const sessionData = {
      coachId: coach?.id,
      courtId: selectedCourtId,
      startTime: startTime.toISOString(),
      duration,
      sessionType,
      ballLevel,
      skillLevel,
      travelTime,
      status: "scheduled",
      notes,
      playerIds: selectedPlayers.map((p) => p.id),
      isRecurring,
      weekCount: isRecurring ? weekCount : 1,
    };

    createSessionMutation.mutate(sessionData);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const adjustTime = (minutes: number) => {
    const newTime = new Date(startTime);
    newTime.setMinutes(newTime.getMinutes() + minutes);
    setStartTime(newTime);
  };

  const selectDate = (date: Date) => {
    const newTime = new Date(startTime);
    newTime.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setStartTime(newTime);
    setShowCalendar(false);
  };

  const getCalendarDays = () => {
    const year = startTime.getFullYear();
    const month = startTime.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    
    const startPadding = (firstDay.getDay() + 6) % 7;
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    
    return days;
  };

  const changeMonth = (delta: number) => {
    const newTime = new Date(startTime);
    newTime.setMonth(newTime.getMonth() + delta);
    setStartTime(newTime);
  };

  const togglePlayer = (player: Player) => {
    setSelectedPlayers((prev) => {
      const exists = prev.find((p) => p.id === player.id);
      if (exists) {
        return prev.filter((p) => p.id !== player.id);
      }
      return [...prev, player];
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>New Session</Text>
          <Pressable
            onPress={handleSubmit}
            disabled={createSessionMutation.isPending || conflicts.length > 0}
            style={[
              styles.submitButton,
              (createSessionMutation.isPending || conflicts.length > 0) && styles.submitDisabled,
            ]}
          >
            {createSessionMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <Text style={styles.submitText}>Book</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Step 1: Date Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Select Date</Text>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCalendar(!showCalendar); }} style={styles.dateButton}>
              <Ionicons name="calendar-outline" size={18} color={Colors.dark.primary} />
              <Text style={styles.dateButtonText}>
                {startTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.dark.tabIconDefault} />
            </Pressable>
          </View>

          {/* Calendar Picker */}
          {showCalendar ? (
            <View style={styles.calendarContainer}>
              <View style={styles.calendarHeader}>
                <Pressable onPress={() => changeMonth(-1)} style={styles.calendarNavButton}>
                  <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                </Pressable>
                <Text style={styles.calendarMonthText}>
                  {startTime.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </Text>
                <Pressable onPress={() => changeMonth(1)} style={styles.calendarNavButton}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
                </Pressable>
              </View>
              <View style={styles.calendarWeekHeaders}>
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                  <Text key={i} style={styles.calendarWeekDay}>{day}</Text>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {getCalendarDays().map((day, i) => {
                  if (!day) {
                    return <View key={i} style={styles.calendarDayEmpty} />;
                  }
                  const isSelected = day.toDateString() === startTime.toDateString();
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <Pressable
                      key={i}
                      onPress={() => selectDate(day)}
                      style={[
                        styles.calendarDay,
                        isSelected && styles.calendarDaySelected,
                        isToday && !isSelected && styles.calendarDayToday,
                      ]}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        isSelected && styles.calendarDayTextSelected,
                      ]}>
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Step 2: Court Selection - Compact */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="location" size={12} color={Colors.dark.xpCyan} /> Court
            </Text>
            <View style={styles.optionsRow}>
              {courts.map((court) => (
                <Pressable
                  key={court.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCourtId(court.id);
                  }}
                  style={[
                    styles.courtChip,
                    selectedCourtId === court.id && styles.courtChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.courtChipText,
                      selectedCourtId === court.id && styles.courtChipTextActive,
                    ]}
                  >
                    {court.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            {courts.length === 0 ? (
              <Text style={styles.noPlayersText}>No courts available</Text>
            ) : null}
          </View>

          {/* Step 3: Duration - Select BEFORE time to filter properly */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="time" size={12} color={Colors.dark.xpCyan} /> Duration
            </Text>
            <View style={styles.optionsRow}>
              {DURATIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setDuration(d);
                  }}
                  style={[
                    styles.durationChip,
                    duration === d && styles.durationChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      duration === d && styles.durationChipTextActive,
                    ]}
                  >
                    {d}m
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Step 4: Available Time Slots ONLY - Hide blocked ones */}
          {selectedCourtId ? (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="flash" size={12} color={Colors.dark.primary} /> Available Times
                </Text>
                <View style={styles.availableBadge}>
                  <Text style={styles.availableBadgeText}>
                    {[
                      "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
                      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
                      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
                      "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
                      "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
                    ].filter(t => !blockedSlots.has(t)).length} slots
                  </Text>
                </View>
              </View>
              <View style={styles.timeSlotGrid}>
                {[
                  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
                  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
                  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
                  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
                  "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
                ].filter(time => !blockedSlots.has(time)).map((time) => {
                  const [hours, mins] = time.split(":").map(Number);
                  const isSelected = startTime.getHours() === hours && startTime.getMinutes() === mins;
                  return (
                    <Pressable
                      key={time}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        const newTime = new Date(startTime);
                        newTime.setHours(hours, mins, 0, 0);
                        setStartTime(newTime);
                      }}
                      style={[
                        styles.timeSlot,
                        isSelected && styles.timeSlotSelected,
                      ]}
                    >
                      <Text style={[
                        styles.timeSlotText,
                        isSelected && styles.timeSlotTextSelected,
                      ]}>
                        {time}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              
              {/* Show message if no slots available */}
              {[
                "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
                "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
                "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
                "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
                "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
              ].filter(t => !blockedSlots.has(t)).length === 0 ? (
                <View style={styles.noSlotsBox}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.dark.error} />
                  <Text style={styles.noSlotsText}>No available slots for {duration}m session</Text>
                  <Text style={styles.noSlotsHint}>Try a different date or shorter duration</Text>
                </View>
              ) : null}
              
              {/* Conflict check indicator */}
              {isChecking ? (
                <View style={styles.conflictBox}>
                  <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                  <Text style={styles.checkingText}>Checking...</Text>
                </View>
              ) : conflicts.length > 0 ? (
                <View style={[styles.conflictBox, styles.conflictError]}>
                  <Ionicons name="warning" size={16} color={Colors.dark.error} />
                  <Text style={styles.conflictText}>{conflicts[0]}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="flash" size={12} color={Colors.dark.textMuted} /> Available Times
              </Text>
              <View style={styles.selectCourtFirst}>
                <Ionicons name="arrow-up" size={14} color={Colors.dark.textMuted} />
                <Text style={styles.selectCourtFirstText}>Select court first</Text>
              </View>
            </View>
          )}

          {/* Step 5: Session Type - Compact row */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="fitness" size={12} color={Colors.dark.xpCyan} /> Type
            </Text>
            <View style={styles.optionsRow}>
              {SESSION_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSessionType(type.value);
                  }}
                  style={[
                    styles.typeChip,
                    sessionType === type.value && {
                      backgroundColor: type.color,
                      borderColor: type.color,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      sessionType === type.value && styles.typeChipTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Quick Templates - Only if available */}
          {templates.length > 0 ? (
            <View style={styles.templatesRow}>
              <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
              {templates.slice(0, 3).map((template) => (
                <Pressable
                  key={template.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    applyTemplate(template);
                  }}
                  style={styles.templateChipCompact}
                >
                  <Text style={styles.templateChipText}>{template.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Player Selection with Filters */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="people" size={12} color={Colors.dark.xpCyan} /> Players
              </Text>
              <View style={styles.playerHeaderRight}>
                {(filterBallLevel || filterSkillLevel) ? (
                  <Pressable
                    onPress={() => {
                      setFilterBallLevel(null);
                      setFilterSkillLevel(null);
                    }}
                    style={styles.clearFiltersBtn}
                  >
                    <Text style={styles.clearFiltersBtnText}>Clear</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setShowGuestInput(!showGuestInput)}
                  style={styles.addGuestButton}
                >
                  <Ionicons name="person-add-outline" size={14} color={Colors.dark.xpCyan} />
                </Pressable>
              </View>
            </View>
            
            {/* Compact Filter Row */}
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Ball:</Text>
              {BALL_LEVELS.map((level) => (
                <Pressable
                  key={level.value}
                  onPress={() => setFilterBallLevel(filterBallLevel === level.value ? null : level.value)}
                  style={[
                    styles.filterChip,
                    filterBallLevel === level.value && { backgroundColor: level.color, borderColor: level.color },
                  ]}
                >
                  <Text style={[
                    styles.filterChipText,
                    filterBallLevel === level.value && styles.filterChipTextActive,
                  ]}>
                    {level.label.slice(0, 3)}
                  </Text>
                </Pressable>
              ))}
            </View>
            
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Skill:</Text>
              {SKILL_LEVELS.map((level) => (
                <Pressable
                  key={level.value}
                  onPress={() => setFilterSkillLevel(filterSkillLevel === level.value ? null : level.value)}
                  style={[
                    styles.filterChip,
                    filterSkillLevel === level.value && styles.filterChipActive,
                  ]}
                >
                  <Text style={[
                    styles.filterChipText,
                    filterSkillLevel === level.value && styles.filterChipTextActive,
                  ]}>
                    {level.label.slice(0, 3)}
                  </Text>
                </Pressable>
              ))}
            </View>
            
            {/* Player count indicator */}
            <Text style={styles.playerCountText}>
              {filteredPlayers.length} of {players.length} players
              {(filterBallLevel || filterSkillLevel) ? " (filtered)" : ""}
            </Text>
            
            {showGuestInput && (
              <View style={styles.guestInputRow}>
                <TextInput
                  style={styles.guestInput}
                  placeholder="Guest name..."
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  value={guestName}
                  onChangeText={setGuestName}
                  onSubmitEditing={handleAddGuest}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={handleAddGuest}
                  disabled={!guestName.trim() || createGuestMutation.isPending}
                  style={[
                    styles.guestAddBtn,
                    (!guestName.trim() || createGuestMutation.isPending) && styles.guestAddBtnDisabled,
                  ]}
                >
                  {createGuestMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
                  )}
                </Pressable>
              </View>
            )}
            
            {/* Player Search */}
            <View style={styles.playerSearchContainer}>
              <Ionicons name="search" size={16} color={Colors.dark.tabIconDefault} />
              <TextInput
                style={styles.playerSearchInput}
                placeholder="Search players..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={playerSearch}
                onChangeText={setPlayerSearch}
              />
              {playerSearch.length > 0 && (
                <Pressable onPress={() => setPlayerSearch("")}>
                  <Ionicons name="close-circle" size={16} color={Colors.dark.tabIconDefault} />
                </Pressable>
              )}
            </View>
            
            <View style={styles.playerList}>
              {filteredPlayers.map((player) => {
                const isSelected = selectedPlayers.some((p) => p.id === player.id);
                const isGuest = player.name.includes("(Guest)");
                const ballColor = getBallLevelColor(player.ballLevel);
                const skillLabel = getSkillLevelLabel(player.skillLevel ?? player.level);
                
                return (
                  <Pressable
                    key={player.id}
                    onPress={() => togglePlayer(player)}
                    style={[
                      styles.playerItem,
                      isSelected && styles.playerItemActive,
                    ]}
                  >
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={20}
                      color={isSelected ? Colors.dark.primary : Colors.dark.disabled}
                    />
                    {/* Player Avatar with Ball Level Color */}
                    {player.profilePhotoUrl ? (
                      Platform.OS === 'web' ? (
                        <RNImage
                          source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                          style={styles.playerAvatarPhoto}
                          resizeMode="cover"
                        />
                      ) : (
                        <Image
                          source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                          style={styles.playerAvatarPhoto}
                          contentFit="cover"
                        />
                      )
                    ) : (
                      <View style={[
                        styles.playerAvatar,
                        isGuest ? styles.playerAvatarGuest : { backgroundColor: ballColor }
                      ]}>
                        <Text style={styles.playerAvatarText}>{player.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.name}</Text>
                      {(player.ballLevel || skillLabel) && !isGuest ? (
                        <View style={styles.playerMeta}>
                          {player.ballLevel ? (
                            <View style={styles.playerLevelBadge}>
                              <View style={[styles.levelDot, { backgroundColor: ballColor }]} />
                              <Text style={[styles.levelText, { color: ballColor }]}>
                                {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)}
                              </Text>
                            </View>
                          ) : null}
                          {skillLabel ? (
                            <Text style={styles.skillText}>{skillLabel}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {filteredPlayers.length === 0 && playerSearch.length > 0 && (
                <Text style={styles.noPlayersText}>No players match "{playerSearch}"</Text>
              )}
              {players.length === 0 && (
                <Text style={styles.noPlayersText}>No players available</Text>
              )}
            </View>
          </View>

          {/* More Options - Collapsible */}
          <Pressable 
            onPress={() => setShowMoreOptions(!showMoreOptions)}
            style={styles.moreOptionsHeader}
          >
            <View style={styles.moreOptionsLeft}>
              <Ionicons name="settings-outline" size={14} color={Colors.dark.xpCyan} />
              <Text style={styles.moreOptionsTitle}>More Options</Text>
            </View>
            <View style={styles.moreOptionsRight}>
              {(isRecurring || travelTime > 0 || notes.trim()) ? (
                <View style={styles.moreOptionsBadge}>
                  <Text style={styles.moreOptionsBadgeText}>
                    {[
                      isRecurring ? "Recurring" : null,
                      travelTime > 0 ? "Travel" : null,
                      notes.trim() ? "Notes" : null
                    ].filter((x): x is string => x !== null).join(", ")}
                  </Text>
                </View>
              ) : null}
              <Ionicons 
                name={showMoreOptions ? "chevron-up" : "chevron-down"} 
                size={18} 
                color={Colors.dark.textMuted} 
              />
            </View>
          </Pressable>

          {showMoreOptions ? (
            <>
              {/* Recurring Options */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recurring</Text>
                <View style={styles.optionsRow}>
                  <Pressable
                    onPress={() => setIsRecurring(false)}
                    style={[
                      styles.optionChip,
                      !isRecurring && styles.optionChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        !isRecurring && styles.optionChipTextActive,
                      ]}
                    >
                      One-time
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setIsRecurring(true)}
                    style={[
                      styles.optionChip,
                      isRecurring && styles.optionChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        isRecurring && styles.optionChipTextActive,
                      ]}
                    >
                      Weekly
                    </Text>
                  </Pressable>
                </View>
                {isRecurring ? (
                  <View style={styles.weekCountSection}>
                    <Text style={styles.weekCountLabel}>Number of weeks:</Text>
                    <View style={styles.optionsRow}>
                      {WEEK_COUNTS.map((weeks) => (
                        <Pressable
                          key={weeks}
                          onPress={() => setWeekCount(weeks)}
                          style={[
                            styles.optionChip,
                            weekCount === weeks && styles.optionChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionChipText,
                              weekCount === weeks && styles.optionChipTextActive,
                            ]}
                          >
                            {weeks}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    
                    {/* Week Availability Preview */}
                    {selectedCourtId && weekCount > 1 ? (
                      <View style={styles.weekPreviewSection}>
                        <Text style={styles.weekPreviewTitle}>Week Availability:</Text>
                        {isCheckingWeeks ? (
                          <View style={styles.weekPreviewLoading}>
                            <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
                            <Text style={styles.weekPreviewLoadingText}>Checking {weekCount} weeks...</Text>
                          </View>
                        ) : weekAvailability.length > 0 ? (
                          <View style={styles.weekPreviewGrid}>
                            {weekAvailability.map((w) => (
                              <View
                                key={w.week}
                                style={[
                                  styles.weekPreviewItem,
                                  w.available ? styles.weekPreviewAvailable : styles.weekPreviewConflict,
                                ]}
                              >
                                <Text style={[
                                  styles.weekPreviewWeekNum,
                                  !w.available && styles.weekPreviewConflictText,
                                ]}>
                                  W{w.week}
                                </Text>
                                <Text style={[
                                  styles.weekPreviewDate,
                                  !w.available && styles.weekPreviewConflictText,
                                ]}>
                                  {w.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </Text>
                                {!w.available ? (
                                  <Ionicons name="close-circle" size={12} color={Colors.dark.error} style={styles.weekPreviewIcon} />
                                ) : (
                                  <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} style={styles.weekPreviewIcon} />
                                )}
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {weekAvailability.filter(w => !w.available).length > 0 ? (
                          <View style={styles.weekConflictSummary}>
                            <Ionicons name="warning" size={14} color={Colors.dark.orange} />
                            <Text style={styles.weekConflictSummaryText}>
                              {weekAvailability.filter(w => !w.available).length} week(s) will be skipped due to conflicts
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Travel Time */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Travel Time</Text>
                <View style={styles.optionsRow}>
                  {TRAVEL_TIMES.map((time) => (
                    <Pressable
                      key={time}
                      onPress={() => setTravelTime(time)}
                      style={[
                        styles.optionChip,
                        travelTime === time && styles.optionChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          travelTime === time && styles.optionChipTextActive,
                        ]}
                      >
                        {time === 0 ? "None" : `${time}m`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Notes */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <TextInput
                  style={styles.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add notes..."
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  submitButton: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 80,
    alignItems: "center",
    shadowColor: GlowColors.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  submitDisabled: {
    backgroundColor: Colors.dark.disabled,
  },
  submitText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  addGuestButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
  },
  addGuestText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
  },
  guestInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  guestInput: {
    flex: 1,
    height: 44,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  guestAddBtn: {
    width: 44,
    height: 44,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  guestAddBtnDisabled: {
    opacity: 0.5,
  },
  timeSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  timeAdjust: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  timeDisplay: {
    alignItems: "center",
  },
  timeText: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  dateText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Backgrounds.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  dateButtonText: {
    ...Typography.body,
    color: Colors.dark.primary,
    flex: 1,
  },
  timeSlotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  timeSlot: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    minWidth: 52,
    alignItems: "center",
  },
  timeSlotSelected: {
    backgroundColor: GlowColors.primary,
  },
  timeSlotText: {
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
  },
  timeSlotTextSelected: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  timeSlotBlocked: {
    backgroundColor: Colors.dark.backgroundRoot,
    opacity: 0.5,
    borderColor: Colors.dark.error + "40",
  },
  timeSlotTextBlocked: {
    color: Colors.dark.disabled,
    textDecorationLine: "line-through",
  },
  blockedIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
  },
  selectCourtFirst: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  selectCourtFirstText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  filterLabel: {
    ...Typography.small,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  seeAllButtonActive: {
    backgroundColor: Colors.dark.xpCyan,
    borderColor: Colors.dark.xpCyan,
  },
  seeAllText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
  },
  seeAllTextActive: {
    color: Colors.dark.text,
  },
  activeFiltersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  activeFiltersText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  clearFiltersButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  clearFiltersText: {
    ...Typography.small,
    color: Colors.dark.error,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  templateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.xpCyan + "15",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
    gap: Spacing.xs,
  },
  templateChipText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
  },
  optionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  optionChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  optionChipText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  optionChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  typeChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  typeChipTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  courtChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  courtChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  courtChipText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  courtChipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  conflictBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  conflictError: {
    backgroundColor: "rgba(255, 77, 77, 0.1)",
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  conflictOk: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  conflictContent: {
    flex: 1,
  },
  conflictTitle: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  conflictText: {
    ...Typography.small,
    color: Colors.dark.error,
    marginTop: 2,
  },
  checkingText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
  },
  okText: {
    ...Typography.body,
    color: Colors.dark.primary,
  },
  playerList: {
    gap: Spacing.sm,
  },
  playerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  playerItemActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  noPlayersText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  playerSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  playerSearchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    padding: 0,
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  playerAvatarGuest: {
    backgroundColor: Colors.dark.xpCyan,
  },
  playerAvatarText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  playerAvatarPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  playerInfo: {
    flex: 1,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  playerLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  levelText: {
    ...Typography.small,
    fontSize: 11,
    fontWeight: "500",
  },
  skillText: {
    ...Typography.small,
    fontSize: 11,
    color: Colors.dark.tabIconDefault,
  },
  recurringWeeks: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  recurringLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  weeksSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.xs,
  },
  weekAdjust: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  weeksText: {
    ...Typography.body,
    color: Colors.dark.text,
    minWidth: 24,
    textAlign: "center",
  },
  notesInput: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  levelChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  levelChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  levelChipTextActive: {
    color: Colors.dark.text,
  },
  weekCountSection: {
    marginTop: Spacing.md,
  },
  weekCountLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  weekPreviewSection: {
    marginTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  weekPreviewTitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  weekPreviewLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  weekPreviewLoadingText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  weekPreviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  weekPreviewItem: {
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.sm,
    minWidth: 50,
    position: "relative",
  },
  weekPreviewAvailable: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  weekPreviewConflict: {
    backgroundColor: Colors.dark.error + "20",
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  weekPreviewWeekNum: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  weekPreviewDate: {
    fontSize: 9,
    color: Colors.dark.textMuted,
  },
  weekPreviewConflictText: {
    color: Colors.dark.error,
  },
  weekPreviewIcon: {
    position: "absolute",
    top: 2,
    right: 2,
  },
  weekConflictSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  weekConflictSummaryText: {
    fontSize: 11,
    color: Colors.dark.orange,
  },
  calendarContainer: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  calendarNavButton: {
    padding: Spacing.sm,
  },
  calendarMonthText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  calendarWeekHeaders: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  calendarWeekDay: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: "14.28%",
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.full,
  },
  calendarDayEmpty: {
    width: "14.28%",
    aspectRatio: 1,
  },
  calendarDaySelected: {
    backgroundColor: GlowColors.primary,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  calendarDayText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  calendarDayTextSelected: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  // New gaming-styled duration chips
  durationChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    minWidth: 50,
    alignItems: "center",
  },
  durationChipActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
    shadowColor: GlowColors.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  durationChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  durationChipTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  // Available time badge
  availableBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  availableBadgeText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  // No slots box
  noSlotsBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  noSlotsText: {
    ...Typography.body,
    color: Colors.dark.error,
    textAlign: "center",
  },
  noSlotsHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  // Compact templates row
  templatesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.md,
  },
  templateChipCompact: {
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  // More options collapsible
  moreOptionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  moreOptionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  moreOptionsTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  moreOptionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  moreOptionsBadge: {
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  moreOptionsBadgeText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontSize: 10,
  },
  // Compact filter row
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  filterLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    width: 36,
    fontSize: 10,
  },
  filterChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  filterChipActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  filterChipText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  playerHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  playerCountText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
    marginBottom: Spacing.sm,
  },
  clearFiltersBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.error + "20",
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  clearFiltersBtnText: {
    fontSize: 10,
    color: Colors.dark.error,
    fontWeight: "600",
  },
});
