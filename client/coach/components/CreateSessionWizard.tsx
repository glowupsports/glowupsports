import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Dimensions,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
  runOnJS,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Typography, Spacing, BorderRadius } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest, apiFetch, getApiUrl, getStaticAssetsUrl } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useNetwork } from "@/context/NetworkContext";
import { showOfflineAlert } from "@/hooks/useOfflineGuard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Player {
  id: string;
  name: string;
  email: string;
  ballLevel?: string | null;
  level?: string | number | null;
  skillLevel?: number | null;
  profilePhotoUrl?: string | null;
}

interface Coach {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  color?: string | null;
}

interface CreateSessionWizardProps {
  visible: boolean;
  onClose: () => void;
  initialCourtId?: string;
  initialTime?: Date;
  adminMode?: boolean;
  coaches?: Coach[];
  selectedCoachId?: string;
  onCoachIdChange?: (coachId: string) => void;
}

type SessionType = "private" | "semi_private" | "group" | "physical" | "activity";
type BallLevel = "red" | "orange" | "green" | "yellow" | "glow";
type SkillLevel = 1 | 2 | 3;

const SESSION_TYPE_CARDS: { 
  value: SessionType; 
  label: string; 
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  gradient: [string, string];
}[] = [
  { 
    value: "private", 
    label: "Private", 
    subtitle: "1 player · 1 coach",
    icon: "person",
    color: Colors.dark.primary,
    gradient: [Colors.dark.primary + "40", Colors.dark.primary + "10"],
  },
  { 
    value: "group", 
    label: "Group", 
    subtitle: "Multiple players · Fixed group",
    icon: "people",
    color: Colors.dark.orange,
    gradient: [Colors.dark.orange + "40", Colors.dark.orange + "10"],
  },
  { 
    value: "semi_private", 
    label: "Semi-Private", 
    subtitle: "2-3 players",
    icon: "people-outline",
    color: Colors.dark.xpCyan,
    gradient: [Colors.dark.xpCyan + "40", Colors.dark.xpCyan + "10"],
  },
  { 
    value: "physical", 
    label: "Physical", 
    subtitle: "Conditioning · Fitness",
    icon: "fitness",
    color: Colors.dark.gold,
    gradient: [Colors.dark.gold + "40", Colors.dark.gold + "10"],
  },
  { 
    value: "activity", 
    label: "Activity", 
    subtitle: "Events · Games · Fun",
    icon: "game-controller",
    color: "#FF6B9D",
    gradient: ["#FF6B9D40", "#FF6B9D10"],
  },
];

const BALL_LEVELS: { value: BallLevel; label: string; color: string }[] = [
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

const WEEK_COUNTS = [1, 2, 5, 10, 15, 20, 30];
const TRAVEL_TIMES = [0, 5, 10, 15, 20, 30];
const DURATIONS = [30, 45, 60, 90, 120];
const MAX_PLAYERS_OPTIONS = [2, 3, 4, 6, 8, 10, 12];

const TOTAL_SLIDES = 6;
const ADMIN_TOTAL_SLIDES = 7;
const SLIDE_TITLES = [
  "Choose Session Type",
  "Schedule Pattern",
  "When & Where",
  "Session Setup",
  "Players",
  "Confirm",
];
const ADMIN_SLIDE_TITLES = [
  "Select Coach",
  "Choose Session Type",
  "Schedule Pattern",
  "When & Where",
  "Session Setup",
  "Players",
  "Confirm",
];

export default function CreateSessionWizard({
  visible,
  onClose,
  initialCourtId,
  initialTime,
  adminMode = false,
  coaches = [],
  selectedCoachId,
  onCoachIdChange,
}: CreateSessionWizardProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach: currentCoach, refetchCalendar } = useCoach();
  const { isOffline } = useNetwork();
  
  const totalSlides = adminMode ? ADMIN_TOTAL_SLIDES : TOTAL_SLIDES;
  const slideTitles = adminMode ? ADMIN_SLIDE_TITLES : SLIDE_TITLES;
  
  const effectiveCoach = adminMode 
    ? coaches.find(c => c.id === selectedCoachId) 
    : currentCoach;

  // Current slide (0-5)
  const [currentSlide, setCurrentSlide] = useState(0);
  
  // Slide 0: Session Type
  const [sessionType, setSessionType] = useState<SessionType>("private");
  
  // Slide 1: Recurring
  const [isRecurring, setIsRecurring] = useState(false);
  const [weekCount, setWeekCount] = useState(10);
  
  // Slide 2: When & Where
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [startTime, setStartTime] = useState<string | null>(null);
  
  // Slide 3: Session Setup
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [ballLevel, setBallLevel] = useState<BallLevel | null>(null);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const [isOpenGroup, setIsOpenGroup] = useState(true);
  
  // Slide 4: Players
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [visibleToPlayers, setVisibleToPlayers] = useState(true);
  const [enableWaitlist, setEnableWaitlist] = useState(false);
  
  // Slide 5: Extras
  const [travelTime, setTravelTime] = useState(0);
  const [notes, setNotes] = useState("");
  
  // Loading states
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [multiWeekBlockedSlots, setMultiWeekBlockedSlots] = useState<Set<string>>(new Set());
  
  // Calendar modal state
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  // Animation values
  const slideProgress = useSharedValue(0);
  const glowPulse = useSharedValue(0);

  // Fetch courts
  const { data: courts = [] } = useQuery<{ id: string; name: string; locationId?: string }[]>({
    queryKey: ["/api/courts"],
    enabled: visible,
  });

  // Fetch travel times
  const { data: travelTimes = [] } = useQuery<Array<{
    id: string;
    fromLocationId: string;
    toLocationId: string;
    travelTimeMinutes: number;
  }>>({
    queryKey: ["/api/coach/travel-times"],
    enabled: visible,
  });

  // Fetch players
  const { data: playersData } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: visible,
  });
  const players = Array.isArray(playersData) ? playersData : [];

  // Date string for API
  const selectedDateString = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // Fetch calendar data for selected date
  interface ExistingSession {
    id: string;
    startTime: string;
    endTime: string;
    duration?: number;
    courtId?: string;
  }

  const { data: calendarData } = useQuery<{ ownSessions: ExistingSession[]; blockedSessions: ExistingSession[] }>({
    queryKey: ["/api/coach/calendar/day", effectiveCoach?.id, selectedDateString],
    queryFn: async () => {
      if (!effectiveCoach?.id) return { ownSessions: [], blockedSessions: [] };
      const coachIdParam = adminMode ? `&coachId=${effectiveCoach.id}` : '';
      const res = await apiFetch(`/api/coach/calendar?date=${selectedDateString}&view=day${coachIdParam}`);
      if (!res.ok) return { ownSessions: [], blockedSessions: [] };
      const data = await res.json();
      return {
        ownSessions: data.ownSessions || [],
        blockedSessions: data.blockedSessions || [],
      };
    },
    enabled: visible && !!effectiveCoach?.id && currentSlide >= (adminMode ? 3 : 2),
  });

  // Calculate blocked time slots
  const blockedSlots = useMemo((): Set<string> => {
    const blocked = new Set<string>();
    if (!calendarData) return blocked;

    const slotTimes = [
      "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
      "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
      "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
    ];

    const checkSessionOverlap = (session: ExistingSession) => {
      const sessionStartStr = session.startTime;
      const sessionEndStr = session.endTime;
      const sessionStart = new Date(sessionStartStr.endsWith("Z") ? sessionStartStr : sessionStartStr + "Z");
      const sessionEnd = new Date(sessionEndStr.endsWith("Z") ? sessionEndStr : sessionEndStr + "Z");
      
      for (const time of slotTimes) {
        const [hours, mins] = time.split(":").map(Number);
        const slotStart = new Date(selectedDate);
        slotStart.setHours(hours, mins, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + duration);
        
        if (slotStart < sessionEnd && slotEnd > sessionStart) {
          blocked.add(time);
        }
      }
    };
    
    // Block coach's own sessions
    for (const session of calendarData.ownSessions || []) {
      checkSessionOverlap(session);
    }
    
    // Block court sessions if court selected
    if (selectedCourtId) {
      for (const session of (calendarData.blockedSessions || []).filter(s => s.courtId === selectedCourtId)) {
        checkSessionOverlap(session);
      }
    }
    
    return blocked;
  }, [calendarData, selectedCourtId, selectedDate, duration]);

  // Calculate travel time conflicts for time slots
  const travelTimeConflicts = useMemo((): Map<string, { warning: string; minutes: number }> => {
    const conflicts = new Map<string, { warning: string; minutes: number }>();
    if (!calendarData || !selectedCourtId || travelTimes.length === 0) return conflicts;

    const selectedCourt = courts.find(c => c.id === selectedCourtId);
    const selectedLocationId = selectedCourt?.locationId;
    if (!selectedLocationId) return conflicts;

    const ownSessions = calendarData.ownSessions || [];
    if (ownSessions.length === 0) return conflicts;

    const slotTimes = [
      "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
      "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
      "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
    ];

    for (const time of slotTimes) {
      const [hours, mins] = time.split(":").map(Number);
      const slotStart = new Date(selectedDate);
      slotStart.setHours(hours, mins, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + duration);

      // Check each existing session for travel time conflicts
      for (const session of ownSessions) {
        const sessionCourt = courts.find(c => c.id === session.courtId);
        const sessionLocationId = sessionCourt?.locationId;
        if (!sessionLocationId || sessionLocationId === selectedLocationId) continue;

        // Find travel time between locations
        const travelTime = travelTimes.find(t =>
          (t.fromLocationId === sessionLocationId && t.toLocationId === selectedLocationId) ||
          (t.fromLocationId === selectedLocationId && t.toLocationId === sessionLocationId)
        );
        if (!travelTime) continue;

        const sessionStart = new Date(session.startTime.endsWith("Z") ? session.startTime : session.startTime + "Z");
        const sessionEnd = new Date(session.endTime.endsWith("Z") ? session.endTime : session.endTime + "Z");

        // Check if new session would end too close to existing session start (need travel time before)
        const gapBefore = (sessionStart.getTime() - slotEnd.getTime()) / 60000;
        if (gapBefore >= 0 && gapBefore < travelTime.travelTimeMinutes) {
          conflicts.set(time, {
            warning: `Need ${travelTime.travelTimeMinutes}min travel before next session`,
            minutes: travelTime.travelTimeMinutes,
          });
          break;
        }

        // Check if new session would start too close after existing session ends (need travel time after)
        const gapAfter = (slotStart.getTime() - sessionEnd.getTime()) / 60000;
        if (gapAfter >= 0 && gapAfter < travelTime.travelTimeMinutes) {
          conflicts.set(time, {
            warning: `Need ${travelTime.travelTimeMinutes}min travel after previous session`,
            minutes: travelTime.travelTimeMinutes,
          });
          break;
        }
      }
    }

    return conflicts;
  }, [calendarData, selectedCourtId, travelTimes, courts, selectedDate, duration]);

  // Generate dates for recurring weeks
  const recurringDates = useMemo(() => {
    if (!isRecurring || weekCount <= 1) return [];
    const dates: string[] = [];
    for (let week = 1; week < weekCount; week++) {
      const futureDate = new Date(selectedDate);
      futureDate.setDate(futureDate.getDate() + (week * 7));
      const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
      dates.push(dateStr);
    }
    return dates;
  }, [isRecurring, weekCount, selectedDate]);

  // Fetch multi-week availability when recurring and court selected
  useEffect(() => {
    const fetchMultiWeekAvailability = async () => {
      if (!isRecurring || !selectedCourtId || recurringDates.length === 0) {
        setMultiWeekBlockedSlots(new Set());
        return;
      }
      
      setIsCheckingAvailability(true);
      try {
        const res = await apiFetch("/api/coach/sessions/multi-week-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dates: recurringDates, courtId: selectedCourtId }),
        });
        
        if (!res.ok) {
          setMultiWeekBlockedSlots(new Set());
          return;
        }
        
        const data = await res.json();
        const blockedTimes = new Set<string>();
        
        const slotTimes = [
          "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
          "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
          "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
          "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
          "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
        ];
        
        // For each future week, check which slots are blocked
        for (const dateStr of recurringDates) {
          const availability = data[dateStr];
          if (!availability) continue;
          
          const allBlocked = [...(availability.blockedSlots || []), ...(availability.coachBlocked || [])];
          
          for (const blocked of allBlocked) {
            const blockStart = new Date(blocked.start);
            const blockEnd = new Date(blocked.end);
            
            // Check each time slot against this blocked period
            for (const time of slotTimes) {
              const [hours, mins] = time.split(":").map(Number);
              // Use the original selected date to match time slot format
              const slotDate = new Date(selectedDate);
              slotDate.setHours(hours, mins, 0, 0);
              const slotEnd = new Date(slotDate);
              slotEnd.setMinutes(slotEnd.getMinutes() + duration);
              
              // Map to the future week's date for comparison
              const [y, m, d] = dateStr.split("-").map(Number);
              const futureSlotStart = new Date(y, m - 1, d, hours, mins, 0, 0);
              const futureSlotEnd = new Date(futureSlotStart);
              futureSlotEnd.setMinutes(futureSlotEnd.getMinutes() + duration);
              
              // Check overlap
              if (futureSlotStart < blockEnd && futureSlotEnd > blockStart) {
                blockedTimes.add(time);
              }
            }
          }
        }
        
        setMultiWeekBlockedSlots(blockedTimes);
      } catch (error) {
        console.error("Failed to fetch multi-week availability:", error);
        setMultiWeekBlockedSlots(new Set());
      } finally {
        setIsCheckingAvailability(false);
      }
    };
    
    fetchMultiWeekAvailability();
  }, [isRecurring, selectedCourtId, recurringDates, duration, selectedDate]);

  // Available time slots (HIDDEN if blocked - includes both current day, future recurring days, AND travel time conflicts)
  const availableSlots = useMemo(() => {
    const allSlots = [
      "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
      "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
      "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
    ];
    // Filter out slots blocked on current day, future recurring weeks, AND travel time conflicts (HIDDEN, not just warned)
    return allSlots.filter(time => 
      !blockedSlots.has(time) && 
      !multiWeekBlockedSlots.has(time) &&
      !travelTimeConflicts.has(time)
    );
  }, [blockedSlots, multiWeekBlockedSlots, travelTimeConflicts]);

  // Reset form on close
  const resetForm = useCallback(() => {
    setCurrentSlide(0);
    setSessionType("private");
    setIsRecurring(false);
    setWeekCount(10);
    setSelectedDate(new Date());
    setSelectedCourtId(null);
    setDuration(60);
    setStartTime(null);
    setMaxPlayers(4);
    setBallLevel(null);
    setSkillLevel(null);
    setIsOpenGroup(true);
    setSelectedPlayers([]);
    setPlayerSearch("");
    setVisibleToPlayers(true);
    setEnableWaitlist(false);
    setTravelTime(0);
    setNotes("");
    setMultiWeekBlockedSlots(new Set());
  }, []);

  useEffect(() => {
    if (visible) {
      slideProgress.value = 0;
      if (initialCourtId) setSelectedCourtId(initialCourtId);
      if (initialTime) {
        setSelectedDate(initialTime);
        const hours = initialTime.getHours().toString().padStart(2, "0");
        const mins = initialTime.getMinutes().toString().padStart(2, "0");
        setStartTime(`${hours}:${mins}`);
      }
    } else {
      resetForm();
    }
  }, [visible]);

  // Clear startTime when court changes (to revalidate against new court's blocked slots)
  useEffect(() => {
    // Only clear if court was actively changed (not initial mount)
    if (visible && selectedCourtId !== initialCourtId) {
      setStartTime(null);
    }
  }, [selectedCourtId]);

  // Clear startTime if it becomes blocked (due to multi-week availability updates)
  useEffect(() => {
    if (startTime && !availableSlots.includes(startTime)) {
      setStartTime(null);
      // Could show a toast here: "Selected time is no longer available"
    }
  }, [availableSlots, startTime]);

  // Animate slide progress
  useEffect(() => {
    slideProgress.value = withSpring(currentSlide / (totalSlides - 1), {
      damping: 20,
      stiffness: 90,
    });
  }, [currentSlide, totalSlides]);

  // Glow pulse animation
  useEffect(() => {
    const pulse = () => {
      glowPulse.value = withTiming(1, { duration: 1500 }, () => {
        glowPulse.value = withTiming(0, { duration: 1500 }, () => {
          runOnJS(pulse)();
        });
      });
    };
    if (visible) pulse();
  }, [visible]);

  // Navigation
  const goNext = useCallback(() => {
    if (currentSlide < totalSlides - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentSlide(prev => prev + 1);
    }
  }, [currentSlide, totalSlides]);

  const goBack = useCallback(() => {
    if (currentSlide > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentSlide(prev => prev - 1);
    }
  }, [currentSlide]);

  // Can proceed to next slide?
  const canProceed = useMemo(() => {
    if (adminMode) {
      switch (currentSlide) {
        case 0: return !!selectedCoachId;
        case 1: return !!sessionType;
        case 2: return true; // Recurring is optional
        case 3: return !!selectedCourtId && !!startTime;
        case 4: return true; // Setup has defaults
        case 5: return true; // Players optional
        case 6: return true; // Confirm
        default: return false;
      }
    } else {
      switch (currentSlide) {
        case 0: return !!sessionType;
        case 1: return true; // Recurring is optional
        case 2: return !!selectedCourtId && !!startTime;
        case 3: return true; // Setup has defaults
        case 4: return true; // Players optional
        case 5: return true; // Confirm
        default: return false;
      }
    }
  }, [currentSlide, sessionType, selectedCourtId, startTime, adminMode, selectedCoachId]);

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (sessionData: any) => {
      const endpoint = adminMode ? "/api/admin/sessions" : "/api/coach/sessions";
      return apiRequest("POST", endpoint, sessionData);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!adminMode) {
        refetchCalendar();
      }
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key !== 'string') return false;
          if (adminMode) {
            // Match all admin series and calendar queries including those with query params
            const baseKey = key.split('?')[0];
            return baseKey === '/api/admin/series' || 
                   baseKey.startsWith('/api/admin/series/') || 
                   baseKey.startsWith('/api/admin/calendar');
          }
          return key.startsWith('/api/coach/calendar');
        }
      });
      onClose();
      resetForm();
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to create session");
    },
  });

  // Handle create session
  const handleCreate = useCallback(() => {
    if (isOffline) {
      showOfflineAlert();
      return;
    }

    if (adminMode && !effectiveCoach?.id) {
      Alert.alert("Error", "Please select a coach");
      return;
    }

    if (!selectedCourtId || !startTime) {
      Alert.alert("Error", "Please select a court and time");
      return;
    }

    const [hours, mins] = startTime.split(":").map(Number);
    const sessionStart = new Date(selectedDate);
    sessionStart.setHours(hours, mins, 0, 0);
    
    const sessionEnd = new Date(sessionStart);
    sessionEnd.setMinutes(sessionEnd.getMinutes() + duration);

    const sessionData = {
      coachId: effectiveCoach?.id,
      courtId: selectedCourtId,
      startTime: sessionStart.toISOString(),
      endTime: sessionEnd.toISOString(),
      duration,
      sessionType,
      ballLevel,
      skillLevel,
      notes: notes || null,
      travelTime,
      playerIds: selectedPlayers.map(p => p.id),
      isRecurring,
      weekCount: isRecurring ? weekCount : 1,
      maxPlayers: sessionType === "private" ? 1 : maxPlayers,
      isOpen: isOpenGroup,
      visibleToPlayers,
      enableWaitlist,
    };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    createSessionMutation.mutate(sessionData);
  }, [
    isOffline, selectedCourtId, startTime, selectedDate, duration,
    sessionType, ballLevel, skillLevel, notes, travelTime,
    selectedPlayers, effectiveCoach, isRecurring, weekCount, maxPlayers,
    isOpenGroup, visibleToPlayers, enableWaitlist
  ]);

  // Progress bar animated style
  const progressStyle = useAnimatedStyle(() => ({
    width: `${slideProgress.value * 100}%`,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.02]) }],
  }));

  // Render slide content
  const renderSlideContent = () => {
    if (adminMode) {
      switch (currentSlide) {
        case 0:
          return renderCoachSelectionSlide();
        case 1:
          return renderSessionTypeSlide();
        case 2:
          return renderRecurringSlide();
        case 3:
          return renderWhenWhereSlide();
        case 4:
          return renderSessionSetupSlide();
        case 5:
          return renderPlayersSlide();
        case 6:
          return renderConfirmSlide();
        default:
          return null;
      }
    } else {
      switch (currentSlide) {
        case 0:
          return renderSessionTypeSlide();
        case 1:
          return renderRecurringSlide();
        case 2:
          return renderWhenWhereSlide();
        case 3:
          return renderSessionSetupSlide();
        case 4:
          return renderPlayersSlide();
        case 5:
          return renderConfirmSlide();
        default:
          return null;
      }
    }
  };
  
  const renderCoachSelectionSlide = () => (
    <View style={styles.slideContent}>
      <Text style={styles.slideSubtitle}>Select the coach for this session</Text>
      <ScrollView style={styles.coachList} showsVerticalScrollIndicator={false}>
        {coaches.map(coachItem => (
          <Pressable
            key={coachItem.id}
            style={[
              styles.coachOption,
              selectedCoachId === coachItem.id && styles.coachOptionSelected,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCoachIdChange?.(coachItem.id);
            }}
          >
            <View style={styles.coachOptionLeft}>
              {coachItem.profilePhotoUrl ? (
                <Image
                  source={{ uri: `${getStaticAssetsUrl()}${coachItem.profilePhotoUrl}` }}
                  style={styles.coachOptionAvatar}
                />
              ) : (
                <LinearGradient
                  colors={[coachItem.color || Colors.dark.primary, Colors.dark.xpCyan]}
                  style={styles.coachOptionAvatar}
                >
                  <Text style={styles.coachOptionAvatarText}>
                    {coachItem.name.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
              <Text style={styles.coachOptionName}>{coachItem.name}</Text>
            </View>
            {selectedCoachId === coachItem.id && (
              <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  // SLIDE 0: Session Type
  const renderSessionTypeSlide = () => (
    <View style={styles.slideContent}>
      <Text style={styles.slideSubtitle}>What kind of session?</Text>
      <View style={styles.sessionTypeGrid}>
        {SESSION_TYPE_CARDS.map((type) => {
          const isSelected = sessionType === type.value;
          return (
            <Pressable
              key={type.value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSessionType(type.value);
              }}
              style={[
                styles.sessionTypeCard,
                isSelected && { borderColor: type.color, borderWidth: 2 },
              ]}
            >
              <LinearGradient
                colors={isSelected ? type.gradient : [Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
                style={styles.sessionTypeCardGradient}
              >
                {isSelected && (
                  <View style={[styles.glowOrb, { backgroundColor: type.color }]} />
                )}
                <View style={[styles.sessionTypeIcon, { backgroundColor: type.color + "30" }]}>
                  <Ionicons name={type.icon} size={32} color={type.color} />
                </View>
                <Text style={[styles.sessionTypeLabel, isSelected && { color: type.color }]}>
                  {type.label}
                </Text>
                <Text style={styles.sessionTypeSubtitle}>{type.subtitle}</Text>
                {isSelected && (
                  <View style={[styles.selectedBadge, { backgroundColor: type.color }]}>
                    <Ionicons name="checkmark" size={12} color={Colors.dark.backgroundRoot} />
                  </View>
                )}
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // SLIDE 1: Recurring
  const renderRecurringSlide = () => (
    <View style={styles.slideContent}>
      <Text style={styles.slideSubtitle}>How often?</Text>
      
      <View style={styles.recurringToggleRow}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsRecurring(false);
          }}
          style={[
            styles.recurringOption,
            !isRecurring && styles.recurringOptionActive,
          ]}
        >
          <LinearGradient
            colors={!isRecurring ? [Colors.dark.primary + "40", Colors.dark.primary + "10"] : ["transparent", "transparent"]}
            style={styles.recurringOptionGradient}
          >
            <Ionicons 
              name="calendar-outline" 
              size={40} 
              color={!isRecurring ? Colors.dark.primary : Colors.dark.textMuted} 
            />
            <Text style={[styles.recurringOptionLabel, !isRecurring && styles.recurringOptionLabelActive]}>
              One-Time
            </Text>
            <Text style={styles.recurringOptionSubtitle}>Single session</Text>
          </LinearGradient>
        </Pressable>
        
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsRecurring(true);
          }}
          style={[
            styles.recurringOption,
            isRecurring && styles.recurringOptionActive,
          ]}
        >
          <LinearGradient
            colors={isRecurring ? [Colors.dark.xpCyan + "40", Colors.dark.xpCyan + "10"] : ["transparent", "transparent"]}
            style={styles.recurringOptionGradient}
          >
            <Ionicons 
              name="repeat" 
              size={40} 
              color={isRecurring ? Colors.dark.xpCyan : Colors.dark.textMuted} 
            />
            <Text style={[styles.recurringOptionLabel, isRecurring && { color: Colors.dark.xpCyan }]}>
              Weekly
            </Text>
            <Text style={styles.recurringOptionSubtitle}>Repeating series</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {isRecurring && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.weekCountSection}>
          <Text style={styles.weekCountLabel}>Number of weeks</Text>
          <View style={styles.weekCountRow}>
            {WEEK_COUNTS.map((count) => (
              <Pressable
                key={count}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setWeekCount(count);
                }}
                style={[
                  styles.weekCountChip,
                  weekCount === count && styles.weekCountChipActive,
                ]}
              >
                <Text style={[
                  styles.weekCountChipText,
                  weekCount === count && styles.weekCountChipTextActive,
                ]}>
                  {count}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.weekCountHint}>
            {weekCount} sessions total
          </Text>
        </Animated.View>
      )}
    </View>
  );

  // SLIDE 2: When & Where
  const renderWhenWhereSlide = () => {
    // Generate next 14 days
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    return (
      <View style={styles.slideContent}>
        {/* Date Selection */}
        <View style={styles.section}>
          <View style={styles.dateLabelRow}>
            <Text style={styles.sectionLabel}>Date</Text>
            {/* Prominent Calendar Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setCalendarViewDate(selectedDate);
                setShowCalendarModal(true);
              }}
              style={styles.calendarBtnProminent}
            >
              <LinearGradient
                colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.calendarBtnGradient}
              >
                <Ionicons name="calendar" size={16} color={Colors.dark.backgroundRoot} />
                <Text style={styles.calendarBtnText}>Pick Date</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
            {days.map((day, idx) => {
              const isSelected = day.toDateString() === selectedDate.toDateString();
              const isToday = idx === 0;
              return (
                <Pressable
                  key={idx}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDate(day);
                    setStartTime(null); // Reset time when date changes
                  }}
                  style={[styles.dateCard, isSelected && styles.dateCardActive]}
                >
                  <Text style={[styles.dateDayName, isSelected && styles.dateDayNameActive]}>
                    {isToday ? "Today" : day.toLocaleDateString("en", { weekday: "short" })}
                  </Text>
                  <Text style={[styles.dateNumber, isSelected && styles.dateNumberActive]}>
                    {day.getDate()}
                  </Text>
                  <Text style={[styles.dateMonth, isSelected && styles.dateMonthActive]}>
                    {day.toLocaleDateString("en", { month: "short" })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Court Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Court</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courtScroll}>
            {courts.map((court) => {
              const isSelected = selectedCourtId === court.id;
              return (
                <Pressable
                  key={court.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCourtId(court.id);
                    setStartTime(null); // Reset time when court changes
                  }}
                  style={[styles.courtChip, isSelected && styles.courtChipActive]}
                >
                  <Ionicons 
                    name="location" 
                    size={16} 
                    color={isSelected ? Colors.dark.backgroundRoot : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.courtChipText, isSelected && styles.courtChipTextActive]}>
                    {court.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Duration */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Duration</Text>
          <View style={styles.durationRow}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDuration(d);
                  setStartTime(null); // Reset time when duration changes
                }}
                style={[styles.durationChip, duration === d && styles.durationChipActive]}
              >
                <Text style={[styles.durationChipText, duration === d && styles.durationChipTextActive]}>
                  {d}m
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Available Times - ONLY SHOW AVAILABLE SLOTS */}
        {selectedCourtId ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Available Times</Text>
              <View style={styles.slotCountBadge}>
                <Text style={styles.slotCountText}>{availableSlots.length} slots</Text>
              </View>
            </View>
            
            {availableSlots.length > 0 ? (
              <View style={styles.timeGrid}>
                {availableSlots.map((time) => {
                  const isSelected = startTime === time;
                  return (
                    <Pressable
                      key={time}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setStartTime(time);
                      }}
                      style={[styles.timeSlot, isSelected && styles.timeSlotActive]}
                    >
                      <Text style={[styles.timeSlotText, isSelected && styles.timeSlotTextActive]}>
                        {time}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noSlotsBox}>
                <Ionicons name="calendar-outline" size={32} color={Colors.dark.error} />
                <Text style={styles.noSlotsText}>No available slots</Text>
                <Text style={styles.noSlotsHint}>Try a different date or duration</Text>
              </View>
            )}

          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.selectCourtPrompt}>
              <Ionicons name="arrow-up" size={20} color={Colors.dark.textMuted} />
              <Text style={styles.selectCourtText}>Select a court first</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  // SLIDE 3: Session Setup
  const renderSessionSetupSlide = () => {
    const showMaxPlayers = sessionType !== "private";
    const showLevels = sessionType !== "activity";
    const showOpenClosed = sessionType === "group" || sessionType === "semi_private";

    return (
      <View style={styles.slideContent}>
        <Text style={styles.slideSubtitle}>Configure your {SESSION_TYPE_CARDS.find(t => t.value === sessionType)?.label} session</Text>

        {/* Max Players */}
        {showMaxPlayers && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Max Players</Text>
            <View style={styles.optionRow}>
              {MAX_PLAYERS_OPTIONS.filter(n => {
                if (sessionType === "semi_private") return n <= 3;
                return true;
              }).map((count) => (
                <Pressable
                  key={count}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMaxPlayers(count);
                  }}
                  style={[styles.optionChip, maxPlayers === count && styles.optionChipActive]}
                >
                  <Text style={[styles.optionChipText, maxPlayers === count && styles.optionChipTextActive]}>
                    {count}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Ball Level */}
        {showLevels && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Ball Level</Text>
            <View style={styles.optionRow}>
              {BALL_LEVELS.map((level) => (
                <Pressable
                  key={level.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBallLevel(ballLevel === level.value ? null : level.value);
                  }}
                  style={[
                    styles.ballLevelChip,
                    { borderColor: level.color + "60" },
                    ballLevel === level.value && { backgroundColor: level.color, borderColor: level.color },
                  ]}
                >
                  <View style={[styles.ballDot, { backgroundColor: level.color }]} />
                  <Text style={[
                    styles.ballLevelText,
                    ballLevel === level.value && { color: Colors.dark.backgroundRoot },
                  ]}>
                    {level.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Skill Level */}
        {showLevels && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Skill Level</Text>
            <View style={styles.optionRow}>
              {SKILL_LEVELS.map((level) => (
                <Pressable
                  key={level.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSkillLevel(skillLevel === level.value ? null : level.value);
                  }}
                  style={[styles.optionChip, skillLevel === level.value && styles.optionChipActive]}
                >
                  <Text style={[styles.optionChipText, skillLevel === level.value && styles.optionChipTextActive]}>
                    {level.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Open/Closed Group */}
        {showOpenClosed && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Group Type</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsOpenGroup(true);
                }}
                style={[styles.toggleOption, isOpenGroup && styles.toggleOptionActive]}
              >
                <Ionicons name="lock-open" size={20} color={isOpenGroup ? Colors.dark.backgroundRoot : Colors.dark.textMuted} />
                <Text style={[styles.toggleOptionText, isOpenGroup && styles.toggleOptionTextActive]}>Open</Text>
                <Text style={styles.toggleOptionHint}>Players can join</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsOpenGroup(false);
                }}
                style={[styles.toggleOption, !isOpenGroup && styles.toggleOptionActive]}
              >
                <Ionicons name="lock-closed" size={20} color={!isOpenGroup ? Colors.dark.backgroundRoot : Colors.dark.textMuted} />
                <Text style={[styles.toggleOptionText, !isOpenGroup && styles.toggleOptionTextActive]}>Closed</Text>
                <Text style={styles.toggleOptionHint}>Invite only</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  // SLIDE 4: Players
  const renderPlayersSlide = () => {
    const filteredPlayers = players.filter(p => 
      p.name.toLowerCase().includes(playerSearch.toLowerCase())
    );

    return (
      <View style={styles.slideContent}>
        <Text style={styles.slideSubtitle}>Add players (optional)</Text>

        {/* Visibility Toggle */}
        <View style={styles.visibilityRow}>
          <View style={styles.visibilityLeft}>
            <Ionicons name="eye" size={20} color={Colors.dark.primary} />
            <Text style={styles.visibilityLabel}>Visible to players</Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setVisibleToPlayers(!visibleToPlayers);
            }}
            style={[styles.toggleSwitch, visibleToPlayers && styles.toggleSwitchActive]}
          >
            <View style={[styles.toggleKnob, visibleToPlayers && styles.toggleKnobActive]} />
          </Pressable>
        </View>

        {/* Waitlist Toggle (for groups) */}
        {(sessionType === "group" || sessionType === "semi_private") && (
          <View style={styles.visibilityRow}>
            <View style={styles.visibilityLeft}>
              <Ionicons name="time" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.visibilityLabel}>Enable waitlist</Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEnableWaitlist(!enableWaitlist);
              }}
              style={[styles.toggleSwitch, enableWaitlist && styles.toggleSwitchActive]}
            >
              <View style={[styles.toggleKnob, enableWaitlist && styles.toggleKnobActive]} />
            </Pressable>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players..."
            placeholderTextColor={Colors.dark.textMuted}
            value={playerSearch}
            onChangeText={setPlayerSearch}
          />
        </View>

        {/* Selected Players */}
        {selectedPlayers.length > 0 && (
          <View style={styles.selectedPlayersRow}>
            {selectedPlayers.map(player => (
              <Pressable
                key={player.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
                }}
                style={styles.selectedPlayerChip}
              >
                <Text style={styles.selectedPlayerName}>{player.name}</Text>
                <Ionicons name="close" size={14} color={Colors.dark.error} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Player List */}
        <ScrollView style={styles.playerList} showsVerticalScrollIndicator={false}>
          {filteredPlayers.map(player => {
            const isSelected = selectedPlayers.some(p => p.id === player.id);
            return (
              <Pressable
                key={player.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (isSelected) {
                    setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
                  } else {
                    setSelectedPlayers(prev => [...prev, player]);
                  }
                }}
                style={[styles.playerRow, isSelected && styles.playerRowSelected]}
              >
                <View style={styles.playerAvatar}>
                  {player.profilePhotoUrl ? (
                    <Image source={{ uri: `${getStaticAssetsUrl()}${player.profilePhotoUrl}` }} style={styles.playerAvatarImage} />
                  ) : (
                    <Ionicons name="person" size={20} color={Colors.dark.textMuted} />
                  )}
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  <View style={styles.playerMeta}>
                    {player.ballLevel && (
                      <View style={[styles.playerBall, { backgroundColor: BALL_LEVELS.find(b => b.value === player.ballLevel)?.color || Colors.dark.disabled }]} />
                    )}
                  </View>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // SLIDE 5: Confirm
  const renderConfirmSlide = () => {
    const selectedCourt = courts.find(c => c.id === selectedCourtId);
    const typeCard = SESSION_TYPE_CARDS.find(t => t.value === sessionType);

    return (
      <View style={styles.slideContent}>
        <Text style={styles.slideSubtitle}>Review your session</Text>

        <Animated.View style={[styles.summaryCard, glowStyle]}>
          <LinearGradient
            colors={[typeCard?.color + "20" || Colors.dark.primary + "20", Colors.dark.backgroundSecondary]}
            style={styles.summaryCardGradient}
          >
            {/* Session Type Badge */}
            <View style={[styles.summaryTypeBadge, { backgroundColor: typeCard?.color }]}>
              <Ionicons name={typeCard?.icon || "tennisball"} size={16} color={Colors.dark.backgroundRoot} />
              <Text style={styles.summaryTypeBadgeText}>{typeCard?.label}</Text>
            </View>

            {/* Location & Time */}
            <View style={styles.summaryRow}>
              <Ionicons name="location" size={18} color={Colors.dark.primary} />
              <Text style={styles.summaryText}>{selectedCourt?.name || "No court"}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.summaryText}>
                {selectedDate.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Ionicons name="time" size={18} color={Colors.dark.gold} />
              <Text style={styles.summaryText}>
                {startTime || "No time"} · {duration}min
              </Text>
            </View>

            {/* Recurring Badge */}
            {isRecurring && (
              <View style={styles.summaryRow}>
                <Ionicons name="repeat" size={18} color={Colors.dark.orange} />
                <Text style={styles.summaryText}>
                  Weekly for {weekCount} weeks
                </Text>
              </View>
            )}

            {/* Players */}
            {selectedPlayers.length > 0 && (
              <View style={styles.summaryRow}>
                <Ionicons name="people" size={18} color="#FF6B9D" />
                <Text style={styles.summaryText}>
                  {selectedPlayers.length} player{selectedPlayers.length > 1 ? "s" : ""}
                </Text>
              </View>
            )}

            {/* Ball Level */}
            {ballLevel && (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryBall, { backgroundColor: BALL_LEVELS.find(b => b.value === ballLevel)?.color }]} />
                <Text style={styles.summaryText}>
                  {ballLevel.charAt(0).toUpperCase() + ballLevel.slice(1)} Ball
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Travel Time */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Travel Time (optional)</Text>
          <View style={styles.optionRow}>
            {TRAVEL_TIMES.map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTravelTime(t);
                }}
                style={[styles.optionChip, travelTime === t && styles.optionChipActive]}
              >
                <Text style={[styles.optionChipText, travelTime === t && styles.optionChipTextActive]}>
                  {t === 0 ? "None" : `${t}m`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add notes for this session..."
            placeholderTextColor={Colors.dark.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>
      </View>
    );
  };

  return (
    <>
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{slideTitles[currentSlide]}</Text>
            <Text style={styles.headerSubtitle}>Step {currentSlide + 1} of {totalSlides}</Text>
          </View>

          <View style={styles.headerRight} />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, progressStyle]}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.progressGradient}
              />
            </Animated.View>
          </View>
        </View>

        {/* Slide Content */}
        <KeyboardAwareScrollViewCompat 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderSlideContent()}
        </KeyboardAwareScrollViewCompat>

        {/* Navigation Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {currentSlide > 0 && (
            <Pressable onPress={goBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          )}
          
          <View style={{ flex: 1 }} />
          
          {currentSlide < totalSlides - 1 ? (
            <Pressable
              onPress={goNext}
              disabled={!canProceed}
              style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            >
              <LinearGradient
                colors={canProceed ? [Colors.dark.primary, Colors.dark.xpCyan] : [Colors.dark.disabled, Colors.dark.disabled]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.nextBtnGradient}
              >
                <Text style={styles.nextBtnText}>Next</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleCreate}
              disabled={createSessionMutation.isPending}
              style={styles.createBtn}
            >
              <LinearGradient
                colors={[Colors.dark.primary, "#00FF88"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createBtnGradient}
              >
                {createSessionMutation.isPending ? (
                  <ActivityIndicator color={Colors.dark.backgroundRoot} />
                ) : (
                  <>
                    <Ionicons name="flash" size={20} color={Colors.dark.backgroundRoot} />
                    <Text style={styles.createBtnText}>Create Session</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>

    {/* Calendar Picker Modal */}
    <Modal
      visible={showCalendarModal}
      animationType="fade"
      transparent
      onRequestClose={() => setShowCalendarModal(false)}
    >
      <View style={styles.calendarModalOverlay}>
        <View style={styles.calendarModalContent}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.calendarModalHeaderLine}
          />
          
          {/* Modal Header */}
          <View style={styles.calendarModalHeader}>
            <Text style={styles.calendarModalTitle}>SELECT DATE</Text>
            <Pressable
              onPress={() => setShowCalendarModal(false)}
              style={styles.calendarModalCloseBtn}
            >
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          
          {/* Month Navigation */}
          <View style={styles.calendarMonthNav}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const newDate = new Date(calendarViewDate);
                newDate.setMonth(newDate.getMonth() - 1);
                setCalendarViewDate(newDate);
              }}
              style={styles.calendarNavBtn}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.dark.xpCyan} />
            </Pressable>
            <Text style={styles.calendarMonthTitle}>
              {calendarViewDate.toLocaleDateString("en", { month: "long", year: "numeric" })}
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const newDate = new Date(calendarViewDate);
                newDate.setMonth(newDate.getMonth() + 1);
                setCalendarViewDate(newDate);
              }}
              style={styles.calendarNavBtn}
            >
              <Ionicons name="chevron-forward" size={24} color={Colors.dark.xpCyan} />
            </Pressable>
          </View>
          
          {/* Weekday Headers */}
          <View style={styles.calendarWeekdayRow}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <Text key={day} style={styles.calendarWeekdayText}>{day}</Text>
            ))}
          </View>
          
          {/* Calendar Days Grid */}
          <View style={styles.calendarDaysGrid}>
            {(() => {
              const year = calendarViewDate.getFullYear();
              const month = calendarViewDate.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              const days = [];
              // Empty cells for days before first day of month
              for (let i = 0; i < firstDay; i++) {
                days.push(<View key={`empty-${i}`} style={styles.calendarDayCell} />);
              }
              // Days of the month
              for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(year, month, d);
                const isPast = date < today;
                const isSelected = date.toDateString() === selectedDate.toDateString();
                const isToday = date.toDateString() === today.toDateString();
                
                days.push(
                  <Pressable
                    key={d}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setSelectedDate(date);
                      setStartTime(null);
                      setShowCalendarModal(false);
                    }}
                    style={[
                      styles.calendarDayCell,
                      isSelected && styles.calendarDayCellSelected,
                      isToday && !isSelected && styles.calendarDayCellToday,
                    ]}
                  >
                    {isSelected ? (
                      <LinearGradient
                        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                        style={styles.calendarDayGradient}
                      >
                        <Text style={styles.calendarDayTextSelected}>{d}</Text>
                      </LinearGradient>
                    ) : (
                      <Text style={[
                        styles.calendarDayText,
                        isToday && styles.calendarDayTextToday,
                      ]}>
                        {d}
                      </Text>
                    )}
                  </Pressable>
                );
              }
              return days;
            })()}
          </View>
          
          {/* Quick Select Buttons */}
          <View style={styles.calendarQuickSelect}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const today = new Date();
                setSelectedDate(today);
                setStartTime(null);
                setShowCalendarModal(false);
              }}
              style={styles.calendarQuickBtn}
            >
              <Text style={styles.calendarQuickBtnText}>Today</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);
                setSelectedDate(nextWeek);
                setStartTime(null);
                setShowCalendarModal(false);
              }}
              style={styles.calendarQuickBtn}
            >
              <Text style={styles.calendarQuickBtnText}>Next Week</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const nextMonth = new Date();
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                setSelectedDate(nextMonth);
                setStartTime(null);
                setShowCalendarModal(false);
              }}
              style={styles.calendarQuickBtn}
            >
              <Text style={styles.calendarQuickBtnText}>Next Month</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  headerSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  progressContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressGradient: {
    flex: 1,
    borderRadius: 3,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  slideContent: {
    flex: 1,
  },
  slideSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xl,
    textAlign: "center",
  },
  
  // Session Type Cards
  sessionTypeGrid: {
    gap: Spacing.md,
  },
  sessionTypeCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sessionTypeCardGradient: {
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    position: "relative",
  },
  glowOrb: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.3,
  },
  sessionTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTypeLabel: {
    ...Typography.h3,
    color: Colors.dark.text,
    flex: 1,
  },
  sessionTypeSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    position: "absolute",
    bottom: Spacing.md,
    left: 84,
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // Recurring
  recurringToggleRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  recurringOption: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  recurringOptionActive: {
    borderWidth: 2,
  },
  recurringOptionGradient: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  recurringOptionLabel: {
    ...Typography.h3,
    color: Colors.dark.textMuted,
  },
  recurringOptionLabelActive: {
    color: Colors.dark.primary,
  },
  recurringOptionSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  weekCountSection: {
    marginTop: Spacing.xl,
    alignItems: "center",
  },
  weekCountLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  weekCountRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  weekCountChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  weekCountChipActive: {
    backgroundColor: Colors.dark.xpCyan,
    borderColor: Colors.dark.xpCyan,
  },
  weekCountChipText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  weekCountChipTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  weekCountHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },

  // When & Where
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  dateScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  dateCard: {
    width: 70,
    paddingVertical: Spacing.md,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateCardActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  dateDayName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  dateDayNameActive: {
    color: Colors.dark.backgroundRoot,
  },
  dateNumber: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginVertical: 2,
  },
  dateNumberActive: {
    color: Colors.dark.backgroundRoot,
  },
  dateMonth: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  dateMonthActive: {
    color: Colors.dark.backgroundRoot,
  },
  courtScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  courtChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  courtChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  courtChipText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  courtChipTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  durationRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  durationChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  durationChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  durationChipText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  durationChipTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  slotCountBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  slotCountText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  timeSlot: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minWidth: 65,
    alignItems: "center",
  },
  timeSlotActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  timeSlotWarning: {
    borderColor: Colors.dark.gold,
    backgroundColor: Colors.dark.gold + "15",
  },
  travelWarningBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.gold + "40",
    borderRadius: 8,
    padding: 2,
  },
  travelConflictWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
    gap: Spacing.sm,
  },
  travelConflictTextContainer: {
    flex: 1,
    gap: 2,
  },
  travelConflictTitle: {
    ...Typography.caption,
    color: Colors.dark.gold,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  travelConflictText: {
    ...Typography.caption,
    color: Colors.dark.text,
    opacity: 0.9,
  },
  timeSlotText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  timeSlotTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  noSlotsBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.sm,
  },
  noSlotsText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
  noSlotsHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  selectCourtPrompt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  selectCourtText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },

  // Session Setup
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  optionChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  optionChipText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  optionChipTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  ballLevelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
  },
  ballDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ballLevelText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  toggleRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  toggleOption: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  toggleOptionActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  toggleOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  toggleOptionTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  toggleOptionHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },

  // Players
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  visibilityLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  visibilityLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.disabled,
    padding: 2,
    justifyContent: "center",
  },
  toggleSwitchActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.text,
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
  },
  selectedPlayersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  selectedPlayerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  selectedPlayerName: {
    ...Typography.small,
    color: Colors.dark.primary,
  },
  playerList: {
    flex: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  playerRowSelected: {
    backgroundColor: Colors.dark.primary + "20",
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  playerAvatarImage: {
    width: 40,
    height: 40,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 2,
  },
  playerBall: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Confirm
  summaryCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  summaryCardGradient: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  summaryTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  summaryTypeBadgeText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  summaryText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  summaryBall: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  notesInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  backBtnText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  nextBtn: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  nextBtnDisabled: {
    opacity: 0.5,
  },
  nextBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  nextBtnText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  createBtn: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  createBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  createBtnText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },

  // Date Label Row with Calendar Button
  dateLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  calendarBtnProminent: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  calendarBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  calendarBtnText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },

  // Calendar Picker Button (legacy)
  calendarPickerBtn: {
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  calendarPickerGradient: {
    width: 70,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  calendarPickerText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },

  // Calendar Modal
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  calendarModalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  calendarModalHeaderLine: {
    height: 3,
  },
  calendarModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  calendarModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  calendarModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  calendarNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthTitle: {
    ...Typography.h3,
    color: Colors.dark.xpCyan,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  calendarWeekdayRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  calendarWeekdayText: {
    flex: 1,
    textAlign: "center",
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  calendarDaysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: Spacing.sm,
  },
  calendarDayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayCellSelected: {
    borderRadius: 999,
    overflow: "hidden",
  },
  calendarDayCellToday: {
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan,
    borderRadius: 999,
  },
  calendarDayCellPast: {
    opacity: 0.3,
  },
  calendarDayGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  calendarDayText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  calendarDayTextSelected: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  calendarDayTextToday: {
    color: Colors.dark.xpCyan,
  },
  calendarDayTextPast: {
    color: Colors.dark.textMuted,
  },
  calendarQuickSelect: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  calendarQuickBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  calendarQuickBtnText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  coachList: {
    flex: 1,
    marginTop: Spacing.md,
  },
  coachOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  coachOptionSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  coachOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  coachOptionAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  coachOptionAvatarText: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  coachOptionName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
});
