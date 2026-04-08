import logger from "@/lib/logger";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Dimensions, Platform, Switch, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  FadeIn,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiFetch, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { BaselineFlowCard } from "./BaselineFlowCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SKIP_INTRO_KEY = "premium_session_wizard_skip_intro";

type FlowStep = 
  | "intro" 
  | "session-type"
  | "schedule-pattern"
  | "group-level" 
  | "players" 
  | "date-time" 
  | "session-setup"
  | "court" 
  | "summary" 
  | "complete";

type SessionType = "private" | "semi_private" | "group" | "physical" | "activity";
type BallLevel = "blue" | "red" | "orange" | "green" | "yellow" | "glow";
type SkillLevel = 1 | 2 | 3;
type SchedulePattern = "one-time" | "recurring" | "flexible";

interface Player {
  id: string;
  name: string;
  email?: string;
  ballLevel?: string | null;
  skillLevel?: number | null;
  profilePhotoUrl?: string | null;
  totalXp?: number;
  level?: number;
  streak?: number;
  pillars?: {
    forehand?: number;
    backhand?: number;
    serve?: number;
    volley?: number;
    movement?: number;
    tactics?: number;
  };
  isGuest?: boolean;
}

interface Court {
  id: string;
  name: string;
}

interface Coach {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  color?: string | null;
}

interface FlexibleDate {
  date: string;
  time: string | null;
}

interface PremiumSessionWizardProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: (session: any) => void;
  initialDate?: Date;
  initialCourtId?: string;
  adminMode?: boolean;
  coaches?: Coach[];
  selectedCoachId?: string;
  onCoachIdChange?: (coachId: string) => void;
  createSeriesMode?: boolean;
}

const SESSION_TYPES = [
  { 
    id: "private" as SessionType, 
    label: "Private", 
    subtitle: "1 player · 1 coach",
    icon: "person" as const,
    color: GlowColors.primary,
  },
  { 
    id: "group" as SessionType, 
    label: "Group", 
    subtitle: "Multiple players · Same level",
    icon: "people" as const,
    color: Colors.dark.orange,
  },
  { 
    id: "semi_private" as SessionType, 
    label: "Semi-Private", 
    subtitle: "2-3 players",
    icon: "people-outline" as const,
    color: Colors.dark.xpCyan,
  },
  { 
    id: "physical" as SessionType, 
    label: "Physical", 
    subtitle: "Conditioning · Fitness",
    icon: "fitness" as const,
    color: Colors.dark.gold,
  },
  { 
    id: "activity" as SessionType, 
    label: "Activity", 
    subtitle: "Events · Games · Fun",
    icon: "game-controller" as const,
    color: "#FF6B9D",
  },
];

const BALL_LEVELS = [
  { id: "blue" as BallLevel, label: "Blue", color: "#3B82F6", description: "Starter", image: "blue_tennis_ball_icon.png" },
  { id: "red" as BallLevel, label: "Red", color: Colors.dark.ballRed, description: "Beginners", image: "red_tennis_ball_icon.png" },
  { id: "orange" as BallLevel, label: "Orange", color: Colors.dark.ballOrange, description: "Developing", image: "orange_tennis_ball_icon.png" },
  { id: "green" as BallLevel, label: "Green", color: Colors.dark.ballGreen, description: "Intermediate", image: "green_tennis_ball_icon.png" },
  { id: "yellow" as BallLevel, label: "Yellow", color: Colors.dark.ballYellow, description: "Advanced", image: "yellow_tennis_ball_icon.png" },
  { id: "glow" as BallLevel, label: "Glow", color: "#C8FF3D", description: "Elite", image: "yellow_tennis_ball_icon.png" },
];

const SKILL_LEVELS = [
  { value: 1 as SkillLevel, label: "Beginner" },
  { value: 2 as SkillLevel, label: "Intermediate" },
  { value: 3 as SkillLevel, label: "Advanced" },
];

const DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
];

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00",
];

const WEEK_COUNTS = [1, 2, 5, 10, 15, 20, 30];
const MAX_PLAYERS_OPTIONS = [2, 3, 4, 6, 8, 10, 12];

const getXpProgress = (totalXp: number, level: number): number => {
  const xpPerLevel = 100 + (level - 1) * 50;
  const currentLevelXp = totalXp % xpPerLevel;
  return Math.min((currentLevelXp / xpPerLevel) * 100, 100);
};

const extractTimeString = (d?: Date): string | null => {
  if (!d) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const extractDateString = (d?: Date): string | null => {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function PremiumSessionWizard({ 
  visible, 
  onClose, 
  onComplete, 
  initialDate,
  initialCourtId,
  adminMode = false,
  coaches = [],
  selectedCoachId,
  onCoachIdChange,
  createSeriesMode = false,
}: PremiumSessionWizardProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach: currentCoach, refetchCalendar } = useCoach();
  
  const effectiveCoach = adminMode 
    ? coaches.find(c => c.id === selectedCoachId) 
    : currentCoach;
  
  const [step, setStep] = useState<FlowStep>("intro");
  const [skipIntro, setSkipIntro] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [groupLevel, setGroupLevel] = useState<BallLevel | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerBallFilter, setPlayerBallFilter] = useState<BallLevel | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(extractTimeString(initialDate));
  const isPrefilledTime = useRef<boolean>(!!extractTimeString(initialDate));
  const [duration, setDuration] = useState(60);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(initialCourtId || null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [createdSession, setCreatedSession] = useState<any>(null);
  
  const [schedulePattern, setSchedulePattern] = useState<SchedulePattern>(createSeriesMode ? "recurring" : "one-time");
  const [weekCount, setWeekCount] = useState(10);
  const [flexibleDates, setFlexibleDates] = useState<FlexibleDate[]>(() => {
    const dateStr = extractDateString(initialDate);
    return dateStr ? [{ date: dateStr, time: extractTimeString(initialDate) }] : [];
  });
  const [flexibleCalendarMonth, setFlexibleCalendarMonth] = useState(initialDate || new Date());
  
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null);
  const [sessionBallLevel, setSessionBallLevel] = useState<BallLevel | null>(null);
  const [ballLevelOverride, setBallLevelOverride] = useState(false);
  const [isOpenGroup, setIsOpenGroup] = useState(true);
  const [visibleToPlayers, setVisibleToPlayers] = useState(true);
  const [notes, setNotes] = useState("");
  
  const isRecurring = schedulePattern === "recurring";
  const isFlexible = schedulePattern === "flexible";
  
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [multiWeekBlockedSlots, setMultiWeekBlockedSlots] = useState<Set<string>>(new Set());
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [showCourtChange, setShowCourtChange] = useState(false);
  
  // Guest player modal
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestBallLevel, setGuestBallLevel] = useState<BallLevel | null>(null);
  const [isCreatingGuest, setIsCreatingGuest] = useState(false);
  
  const successScale = useSharedValue(0);

  useEffect(() => {
    const loadSkipIntroSetting = async () => {
      try {
        const saved = await AsyncStorage.getItem(SKIP_INTRO_KEY);
        if (saved === "true") {
          setSkipIntro(true);
        }
      } catch (e) {
        logger.log("Error loading skip intro setting:", e);
      }
    };
    loadSkipIntroSetting();
  }, []);

  useEffect(() => {
    if (createSeriesMode && visible) {
      setSchedulePattern("recurring");
    }
  }, [createSeriesMode, visible]);
  
  // Auto-populate session ball level from selected players when entering session-setup
  useEffect(() => {
    if (step === "session-setup" && selectedPlayers.length > 0 && !sessionBallLevel) {
      // Find the most common ball level among selected players
      const ballLevelCounts: Record<string, number> = {};
      for (const player of selectedPlayers) {
        if (player.ballLevel) {
          const level = player.ballLevel.toUpperCase();
          ballLevelCounts[level] = (ballLevelCounts[level] || 0) + 1;
        }
      }
      const mostCommonLevel = Object.entries(ballLevelCounts).sort((a, b) => b[1] - a[1])[0];
      if (mostCommonLevel) {
        setSessionBallLevel(mostCommonLevel[0].toLowerCase() as BallLevel);
      }
    }
  }, [step, selectedPlayers, sessionBallLevel]);

  const { data: playersData = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: visible,
  });

  const { data: courtsData = [] } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
    enabled: visible,
  });

  const players = Array.isArray(playersData) ? playersData : [];
  const courts = Array.isArray(courtsData) ? courtsData : [];

  const selectedDateString = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

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
    enabled: visible && !!effectiveCoach?.id && step === "date-time",
  });

  const TIME_SLOTS = [
    "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
    "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
    "19:00", "19:30", "20:00", "20:30", "21:00",
  ];

  const TRAVEL_TIME_MINUTES = 15;

  const blockedSlots = useMemo((): Set<string> => {
    const blocked = new Set<string>();
    if (!calendarData) return blocked;

    const checkSessionOverlap = (session: ExistingSession, requireTravelTime = false) => {
      const sessionStart = new Date(session.startTime.endsWith("Z") ? session.startTime : session.startTime + "Z");
      const sessionEnd = new Date(session.endTime.endsWith("Z") ? session.endTime : session.endTime + "Z");
      
      const effectiveSessionStart = requireTravelTime 
        ? new Date(sessionStart.getTime() - TRAVEL_TIME_MINUTES * 60 * 1000) 
        : sessionStart;
      const effectiveSessionEnd = requireTravelTime 
        ? new Date(sessionEnd.getTime() + TRAVEL_TIME_MINUTES * 60 * 1000) 
        : sessionEnd;
      
      for (const time of TIME_SLOTS) {
        const [hours, mins] = time.split(":").map(Number);
        const slotStart = new Date(selectedDate);
        slotStart.setHours(hours, mins, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + duration);
        
        if (slotStart < effectiveSessionEnd && slotEnd > effectiveSessionStart) {
          blocked.add(time);
        }
      }
    };
    
    for (const session of calendarData.ownSessions || []) {
      const isDifferentCourt = !!(selectedCourtId && session.courtId && session.courtId !== selectedCourtId);
      checkSessionOverlap(session, isDifferentCourt);
    }
    
    if (selectedCourtId) {
      for (const session of (calendarData.blockedSessions || []).filter(s => s.courtId === selectedCourtId)) {
        checkSessionOverlap(session, false);
      }
    }
    
    return blocked;
  }, [calendarData, selectedCourtId, selectedDate, duration]);

  const availableSlots = useMemo(() => {
    return TIME_SLOTS.filter(time => 
      !blockedSlots.has(time) && 
      !multiWeekBlockedSlots.has(time)
    );
  }, [blockedSlots, multiWeekBlockedSlots]);

  useEffect(() => {
    if (selectedTime && !availableSlots.includes(selectedTime)) {
      if (isPrefilledTime.current && availableSlots.length > 0) {
        const [h, m] = selectedTime.split(":").map(Number);
        const targetMins = h * 60 + m;
        let nearestSlot = availableSlots[0];
        let minDiff = Infinity;
        for (const slot of availableSlots) {
          const [sh, sm] = slot.split(":").map(Number);
          const diff = Math.abs(sh * 60 + sm - targetMins);
          if (diff < minDiff) {
            minDiff = diff;
            nearestSlot = slot;
          }
        }
        setSelectedTime(nearestSlot);
      } else {
        setSelectedTime(null);
      }
    }
  }, [availableSlots, selectedTime]);

  useEffect(() => {
    const checkMultiWeekAvailability = async () => {
      if (!isRecurring || !effectiveCoach?.id || !selectedCourtId || step !== "date-time") {
        setMultiWeekBlockedSlots(new Set());
        return;
      }
      
      setIsCheckingAvailability(true);
      const blocked = new Set<string>();
      
      try {
        const weekPromises = Array.from({ length: weekCount - 1 }, (_, i) => i + 1).map(async (week) => {
          const futureDate = new Date(selectedDate);
          futureDate.setDate(futureDate.getDate() + (week * 7));
          const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
          const coachIdParam = adminMode ? `&coachId=${effectiveCoach!.id}` : '';
          try {
            const res = await apiFetch(`/api/coach/calendar?date=${dateStr}&view=day${coachIdParam}`);
            if (!res.ok) return { futureDate, sessions: [] as ExistingSession[] };
            const data = await res.json();
            return {
              futureDate,
              sessions: [
                ...(data.ownSessions || []),
                ...(data.blockedSessions || []).filter((s: ExistingSession) => s.courtId === selectedCourtId),
              ] as ExistingSession[],
            };
          } catch {
            return { futureDate, sessions: [] as ExistingSession[] };
          }
        });

        const weekResults = await Promise.all(weekPromises);

        for (const { futureDate, sessions } of weekResults) {
          for (const time of TIME_SLOTS) {
            const [hours, mins] = time.split(":").map(Number);
            const slotStart = new Date(futureDate);
            slotStart.setHours(hours, mins, 0, 0);
            const slotEnd = new Date(slotStart);
            slotEnd.setMinutes(slotEnd.getMinutes() + duration);
            
            for (const session of sessions) {
              const sessionStart = new Date(session.startTime.endsWith("Z") ? session.startTime : session.startTime + "Z");
              const sessionEnd = new Date(session.endTime.endsWith("Z") ? session.endTime : session.endTime + "Z");
              
              if (slotStart < sessionEnd && slotEnd > sessionStart) {
                blocked.add(time);
                break;
              }
            }
          }
        }
      } catch (e) {
        logger.log("Error checking multi-week availability:", e);
      }
      
      setMultiWeekBlockedSlots(blocked);
      setIsCheckingAvailability(false);
    };
    
    checkMultiWeekAvailability();
  }, [isRecurring, weekCount, selectedDate, selectedCourtId, effectiveCoach?.id, duration, step, adminMode]);

  const filteredPlayers = useMemo(() => {
    let result = players;
    
    // Filter by group level for group sessions
    if (sessionType === "group" && groupLevel && !showAllPlayers) {
      result = result.filter(p => p.ballLevel?.toLowerCase() === groupLevel);
    }
    
    // Filter by ball level filter chips (for non-group sessions or when showing all)
    if (playerBallFilter) {
      result = result.filter(p => p.ballLevel?.toLowerCase() === playerBallFilter);
    }
    
    if (playerSearch) {
      const query = playerSearch.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(query));
    }
    
    return result;
  }, [players, sessionType, groupLevel, playerSearch, showAllPlayers, playerBallFilter]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
      
      const payload: any = {
        sessionType,
        date: dateStr,
        startTime: selectedTime,
        duration,
        courtId: selectedCourtId,
        playerIds: selectedPlayers.map(p => p.id),
        ballLevel: groupLevel || (selectedPlayers[0]?.ballLevel || "green"),
        coachId: effectiveCoach?.id,
        maxPlayers,
        skillLevel,
        isOpenGroup,
        visibleToPlayers,
        notes: notes.trim() || null,
      };
      
      if (isRecurring) {
        payload.isRecurring = true;
        payload.weekCount = weekCount;
      } else if (isFlexible && flexibleDates.length > 0) {
        payload.isFlexible = true;
        payload.flexibleDates = flexibleDates;
      }
      
      return apiRequest("POST", "/api/coach/sessions", payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      refetchCalendar?.();
      setCreatedSession(data);
      setShowSuccessAnimation(true);
      successScale.value = withSequence(
        withSpring(1.2, { damping: 8 }),
        withSpring(1, { damping: 12 })
      );
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setStep("complete");
      }, 1500);
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not create session",
        error.message || "An error occurred while creating the session. Please try again."
      );
    },
  });

  useEffect(() => {
    if (visible) {
      const initialStep = skipIntro ? "session-type" : "intro";
      setStep(initialStep);
      setSessionType(null);
      setGroupLevel(null);
      setSelectedPlayers([]);
      setPlayerSearch("");
      setSelectedDate(initialDate || new Date());
      const prefilledTime = extractTimeString(initialDate);
      setSelectedTime(prefilledTime);
      isPrefilledTime.current = !!prefilledTime;
      setDuration(60);
      setSelectedCourtId(initialCourtId || null);
      setShowSuccessAnimation(false);
      setCreatedSession(null);
      setSchedulePattern(createSeriesMode ? "recurring" : "one-time");
      setWeekCount(10);
      const dateStr = extractDateString(initialDate);
      setFlexibleDates(dateStr ? [{ date: dateStr, time: extractTimeString(initialDate) }] : []);
      setFlexibleCalendarMonth(initialDate || new Date());
      setDatePickerMonth(initialDate || new Date());
      setMaxPlayers(4);
      setSkillLevel(null);
      setBallLevelOverride(false);
      setIsOpenGroup(true);
      setVisibleToPlayers(true);
      setNotes("");
      setDontShowAgain(false);
      setShowGuestModal(false);
      setGuestName("");
      setGuestBallLevel(null);
    }
  }, [visible, initialDate, skipIntro, createSeriesMode]);

  const toggleFlexibleDate = (dateStr: string) => {
    setFlexibleDates(prev => {
      const exists = prev.find(d => d.date === dateStr);
      if (exists) {
        return prev.filter(d => d.date !== dateStr);
      } else {
        return [...prev, { date: dateStr, time: null }].sort((a, b) => a.date.localeCompare(b.date));
      }
    });
  };

  const getFlexibleCalendarDays = () => {
    const year = flexibleCalendarMonth.getFullYear();
    const month = flexibleCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPadding; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const getTotalSteps = () => {
    let steps = 6; // Removed session-setup step (ball level page)
    if (sessionType === "group") steps += 1;
    return steps;
  };

  const getCurrentStepNumber = () => {
    const hasGroupLevel = sessionType === "group";
    switch (step) {
      case "intro": return 1;
      case "session-type": return 2;
      case "schedule-pattern": return 3;
      case "group-level": return 4;
      case "players": return hasGroupLevel ? 5 : 4;
      case "court": return hasGroupLevel ? 6 : 5;
      case "date-time": return hasGroupLevel ? 7 : 6;
      case "summary": return getTotalSteps();
      default: return 1;
    }
  };

  const handleNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (step === "intro" && dontShowAgain) {
      try {
        await AsyncStorage.setItem(SKIP_INTRO_KEY, "true");
        setSkipIntro(true);
      } catch (e) {
        logger.log("Error saving skip intro setting:", e);
      }
    }
    
    switch (step) {
      case "intro":
        setStep("session-type");
        break;
      case "session-type":
        setStep("schedule-pattern");
        break;
      case "schedule-pattern":
        if (sessionType === "group") {
          setStep("group-level");
        } else {
          setStep("players");
        }
        break;
      case "group-level":
        setStep("players");
        break;
      case "players":
        setStep("court");
        break;
      case "court":
        setStep("date-time");
        break;
      case "date-time":
        setStep("summary");
        break;
      case "summary":
        saveMutation.mutate();
        break;
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (step) {
      case "session-type":
        if (!skipIntro) setStep("intro");
        break;
      case "schedule-pattern":
        setStep("session-type");
        break;
      case "group-level":
        setStep("schedule-pattern");
        break;
      case "players":
        if (sessionType === "group") {
          setStep("group-level");
        } else {
          setStep("schedule-pattern");
        }
        break;
      case "court":
        setStep("players");
        break;
      case "date-time":
        setStep("court");
        break;
      case "summary":
        setStep("date-time");
        break;
    }
  };

  const canProceed = () => {
    switch (step) {
      case "intro": return true;
      case "session-type": return sessionType !== null;
      case "schedule-pattern": 
        if (isFlexible) return flexibleDates.length > 0;
        return true;
      case "group-level": return groupLevel !== null;
      case "players": 
        if (sessionType === "private") return selectedPlayers.length === 1;
        if (sessionType === "semi_private") return selectedPlayers.length >= 1 && selectedPlayers.length <= 3;
        return selectedPlayers.length > 0;
      case "date-time": return selectedTime !== null;
      case "court": return true;
      case "summary": return true;
      default: return false;
    }
  };

  const handleClose = () => {
    if (step === "complete" && createdSession) {
      onComplete?.(createdSession);
    }
    onClose();
  };

  const togglePlayer = (player: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isSelected = selectedPlayers.some(p => p.id === player.id);
    if (isSelected) {
      setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
    } else {
      if (sessionType === "private" && selectedPlayers.length >= 1) {
        setSelectedPlayers([player]);
      } else if (sessionType === "semi_private" && selectedPlayers.length >= 3) {
        return;
      } else {
        setSelectedPlayers(prev => [...prev, player]);
      }
    }
  };

  const getLevelColor = (level: string | null | undefined) => {
    const levelColors: Record<string, string> = {
      blue: "#3B82F6",
      red: Colors.dark.ballRed,
      orange: Colors.dark.ballOrange,
      green: Colors.dark.ballGreen,
      yellow: Colors.dark.ballYellow,
      glow: "#C8FF3D",
    };
    return levelColors[level?.toLowerCase() || ""] || Colors.dark.tabIconDefault;
  };

  const getLevelTextColor = (level: string | null | undefined) => {
    const l = level?.toLowerCase();
    if (l === "yellow" || l === "green") return "#000";
    return getLevelColor(level);
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  const successAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const renderIntroCard = () => (
    <BaselineFlowCard
      title="New Session"
      subtitle="Quick & Easy Setup"
      icon="calendar"
      iconColor={Colors.dark.xpCyan}
      step={1}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      showBack={false}
      nextLabel="Let's Go"
      glowColor={Colors.dark.xpCyan}
    >
      <View style={styles.introContent}>
        <View style={styles.introIconWrapper}>
          <LinearGradient
            colors={[Colors.dark.xpCyan + "30", Colors.dark.xpCyan + "10"]}
            style={styles.introIconGradient}
          >
            <Ionicons name="calendar" size={64} color={Colors.dark.xpCyan} />
          </LinearGradient>
        </View>
        <Text style={styles.introTitle}>Schedule a Session</Text>
        <Text style={styles.introDescription}>
          Create a new training session in just a few simple steps. We'll guide you through the setup.
        </Text>
        <View style={styles.introFeatures}>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.introFeatureText}>Choose session type</Text>
          </View>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.introFeatureText}>Select players</Text>
          </View>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.introFeatureText}>Pick date & time</Text>
          </View>
        </View>
        
        <Pressable 
          style={styles.skipIntroRow}
          onPress={() => setDontShowAgain(!dontShowAgain)}
        >
          <View style={[styles.skipCheckbox, dontShowAgain && styles.skipCheckboxChecked]}>
            {dontShowAgain ? <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} /> : null}
          </View>
          <Text style={styles.skipIntroText}>Don't show this intro again</Text>
        </Pressable>
      </View>
    </BaselineFlowCard>
  );

  const renderSessionTypeCard = () => {
    const selectedTypeData = SESSION_TYPES.find(t => t.id === sessionType);
    
    return (
      <BaselineFlowCard
        title="Session Type"
        subtitle="What kind of session?"
        icon="apps"
        iconColor={selectedTypeData?.color || Colors.dark.xpCyan}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={!skipIntro ? handleBack : undefined}
        showBack={!skipIntro}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor={selectedTypeData?.color || Colors.dark.xpCyan}
      >
        <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.sessionTypeList}>
            {SESSION_TYPES.map((type) => (
              <Pressable
                key={type.id}
                style={[
                  styles.sessionTypeCard,
                  sessionType === type.id && styles.sessionTypeCardSelected,
                  sessionType === type.id && { borderColor: type.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSessionType(type.id);
                  if (type.id !== "group") {
                    setGroupLevel(null);
                  }
                }}
              >
                <View style={[styles.sessionTypeIcon, { backgroundColor: type.color + "20" }]}>
                  <Ionicons name={type.icon} size={24} color={type.color} />
                </View>
                <View style={styles.sessionTypeInfo}>
                  <Text style={[
                    styles.sessionTypeLabel,
                    sessionType === type.id && { color: type.color }
                  ]}>
                    {type.label}
                  </Text>
                  <Text style={styles.sessionTypeSubtitle}>{type.subtitle}</Text>
                </View>
                {sessionType === type.id ? (
                  <View style={[styles.sessionTypeCheck, { backgroundColor: type.color }]}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </BaselineFlowCard>
    );
  };

  const renderSchedulePatternCard = () => (
    <BaselineFlowCard
      title="Schedule Pattern"
      subtitle="How often?"
      icon="repeat"
      iconColor={isRecurring ? Colors.dark.xpCyan : isFlexible ? Colors.dark.orange : Colors.dark.primary}
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      nextDisabled={!canProceed()}
      glowColor={isRecurring ? Colors.dark.xpCyan : isFlexible ? Colors.dark.orange : Colors.dark.primary}
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.schedulePatternRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSchedulePattern("one-time");
            }}
            style={[
              styles.schedulePatternOption,
              schedulePattern === "one-time" && styles.schedulePatternOptionActive,
            ]}
          >
            <LinearGradient
              colors={schedulePattern === "one-time" ? [Colors.dark.primary + "40", Colors.dark.primary + "10"] : ["transparent", "transparent"]}
              style={styles.schedulePatternGradient}
            >
              <Ionicons 
                name="calendar-outline" 
                size={28} 
                color={schedulePattern === "one-time" ? Colors.dark.primary : Colors.dark.textMuted} 
              />
              <Text style={[styles.schedulePatternLabel, schedulePattern === "one-time" && { color: Colors.dark.primary }]}>
                One-Time
              </Text>
              <Text style={styles.schedulePatternSubtitle}>Single</Text>
            </LinearGradient>
          </Pressable>
          
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSchedulePattern("recurring");
            }}
            style={[
              styles.schedulePatternOption,
              schedulePattern === "recurring" && styles.schedulePatternOptionActive,
            ]}
          >
            <LinearGradient
              colors={schedulePattern === "recurring" ? [Colors.dark.xpCyan + "40", Colors.dark.xpCyan + "10"] : ["transparent", "transparent"]}
              style={styles.schedulePatternGradient}
            >
              <Ionicons 
                name="repeat" 
                size={28} 
                color={schedulePattern === "recurring" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
              />
              <Text style={[styles.schedulePatternLabel, schedulePattern === "recurring" && { color: Colors.dark.xpCyan }]}>
                Weekly
              </Text>
              <Text style={styles.schedulePatternSubtitle}>Fixed day</Text>
            </LinearGradient>
          </Pressable>
          
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSchedulePattern("flexible");
            }}
            style={[
              styles.schedulePatternOption,
              schedulePattern === "flexible" && styles.schedulePatternOptionActive,
            ]}
          >
            <LinearGradient
              colors={schedulePattern === "flexible" ? [Colors.dark.orange + "40", Colors.dark.orange + "10"] : ["transparent", "transparent"]}
              style={styles.schedulePatternGradient}
            >
              <Ionicons 
                name="calendar-number-outline" 
                size={28} 
                color={schedulePattern === "flexible" ? Colors.dark.orange : Colors.dark.textMuted} 
              />
              <Text style={[styles.schedulePatternLabel, schedulePattern === "flexible" && { color: Colors.dark.orange }]}>
                Flexible
              </Text>
              <Text style={styles.schedulePatternSubtitle}>Pick dates</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {isRecurring ? (
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
        ) : null}
        
        {isFlexible ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.flexibleSection}>
            <Text style={styles.weekCountLabel}>Select dates ({flexibleDates.length} selected)</Text>
            
            <View style={styles.flexibleMonthNav}>
              <Pressable
                onPress={() => {
                  const prev = new Date(flexibleCalendarMonth);
                  prev.setMonth(prev.getMonth() - 1);
                  setFlexibleCalendarMonth(prev);
                }}
                style={styles.flexibleMonthBtn}
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.flexibleMonthLabel}>
                {flexibleCalendarMonth.toLocaleDateString("en", { month: "long", year: "numeric" })}
              </Text>
              <Pressable
                onPress={() => {
                  const next = new Date(flexibleCalendarMonth);
                  next.setMonth(next.getMonth() + 1);
                  setFlexibleCalendarMonth(next);
                }}
                style={styles.flexibleMonthBtn}
              >
                <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
            
            <View style={styles.flexibleDayHeaders}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <Text key={d} style={styles.flexibleDayHeader}>{d}</Text>
              ))}
            </View>
            
            <View style={styles.flexibleCalendarGrid}>
              {getFlexibleCalendarDays().map((day, idx) => {
                if (!day) {
                  return <View key={`empty-${idx}`} style={styles.flexibleDayCell} />;
                }
                const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                const isSelected = flexibleDates.some(d => d.date === dateStr);
                const isToday = day.toDateString() === new Date().toDateString();
                
                return (
                  <Pressable
                    key={dateStr}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      toggleFlexibleDate(dateStr);
                    }}
                    style={[
                      styles.flexibleDayCell,
                      isSelected && styles.flexibleDayCellSelected,
                      isToday && styles.flexibleDayCellToday,
                    ]}
                  >
                    <Text style={[
                      styles.flexibleDayText,
                      isSelected && styles.flexibleDayTextSelected,
                    ]}>
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            
            {flexibleDates.length > 0 ? (
              <View style={styles.flexibleSummary}>
                <Text style={styles.flexibleSummaryLabel}>
                  {flexibleDates.length} date{flexibleDates.length !== 1 ? 's' : ''} selected
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.flexibleChipsScroll}>
                  {flexibleDates.slice(0, 10).map(fd => {
                    const [y, m, d] = fd.date.split('-').map(Number);
                    const date = new Date(y, m - 1, d);
                    return (
                      <Pressable
                        key={fd.date}
                        onPress={() => toggleFlexibleDate(fd.date)}
                        style={styles.flexibleChip}
                      >
                        <Text style={styles.flexibleChipText}>
                          {date.toLocaleDateString("en", { month: "short", day: "numeric" })}
                        </Text>
                        <Ionicons name="close-circle" size={14} color={Colors.dark.orange} />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderGroupLevelCard = () => {
    const selectedLevelData = BALL_LEVELS.find(l => l.id === groupLevel);
    
    return (
      <BaselineFlowCard
        title="Group Level"
        subtitle="Filter players by level"
        icon="star"
        iconColor={selectedLevelData?.color || Colors.dark.orange}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor={selectedLevelData?.color || Colors.dark.orange}
      >
        <View style={styles.groupLevelContent}>
          <Text style={styles.levelQuestion}>
            What level is this group session?
          </Text>
          
          <View style={styles.ballLevelGrid}>
            {BALL_LEVELS.map((level) => {
              const playerCount = players.filter(p => p.ballLevel?.toLowerCase() === level.id).length;
              
              return (
                <Pressable
                  key={level.id}
                  style={[
                    styles.ballLevelCard,
                    groupLevel === level.id && styles.ballLevelCardSelected,
                    groupLevel === level.id && { borderColor: level.color },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setGroupLevel(level.id);
                    setSelectedPlayers([]);
                  }}
                >
                  <View style={[styles.ballDot, { backgroundColor: level.color }]} />
                  <Text style={[
                    styles.ballLevelLabel,
                    groupLevel === level.id && { color: level.color }
                  ]}>
                    {level.label}
                  </Text>
                  <Text style={styles.ballLevelDesc}>{level.description}</Text>
                  <Text style={styles.playerCountBadge}>{playerCount} players</Text>
                  {groupLevel === level.id ? (
                    <View style={[styles.ballCheck, { backgroundColor: level.color }]}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          
          {groupLevel ? (
            <View style={styles.levelInfo}>
              <Ionicons name="information-circle" size={18} color={Colors.dark.textMuted} />
              <Text style={styles.levelInfoText}>
                Only {groupLevel.toUpperCase()} players will be shown in the next step
              </Text>
            </View>
          ) : null}
        </View>
      </BaselineFlowCard>
    );
  };

  const renderPlayersCard = () => {
    const typeData = SESSION_TYPES.find(t => t.id === sessionType);
    const maxPlayersForType = sessionType === "private" ? 1 : sessionType === "semi_private" ? 2 : 6;
    
    return (
      <BaselineFlowCard
        title="Select Players"
        subtitle={`${selectedPlayers.length}/${maxPlayersForType} selected`}
        icon="people"
        iconColor={typeData?.color || GlowColors.primary}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor={typeData?.color || GlowColors.primary}
      >
        <View style={styles.playersContent}>
          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.textMuted}
              value={playerSearch}
              onChangeText={setPlayerSearch}
            />
            {playerSearch ? (
              <Pressable onPress={() => setPlayerSearch("")}>
                <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            ) : null}
          </View>
          
          {/* Ball Level Filter Chips */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.ballFilterRow}
            contentContainerStyle={styles.ballFilterContent}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPlayerBallFilter(null);
              }}
              style={[
                styles.ballFilterChip,
                !playerBallFilter && styles.ballFilterChipActive,
              ]}
            >
              <Text style={[
                styles.ballFilterChipText,
                !playerBallFilter && styles.ballFilterChipTextActive,
              ]}>All</Text>
            </Pressable>
            {BALL_LEVELS.map((level) => (
              <Pressable
                key={level.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPlayerBallFilter(playerBallFilter === level.id ? null : level.id);
                }}
                style={[
                  styles.ballFilterChip,
                  { borderColor: level.color + "60" },
                  playerBallFilter === level.id && { 
                    backgroundColor: level.color + "20",
                    borderColor: level.color,
                  },
                ]}
              >
                <View style={[styles.ballFilterDot, { backgroundColor: level.color }]} />
                <Text style={[
                  styles.ballFilterChipText,
                  playerBallFilter === level.id && { color: level.color },
                ]}>{level.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          
          {/* Add Guest Player Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowGuestModal(true);
            }}
            style={styles.addGuestButton}
          >
            <Ionicons name="person-add" size={18} color={Colors.dark.primary} />
            <Text style={styles.addGuestButtonText}>Add Guest Player</Text>
          </Pressable>

          {sessionType === "group" && groupLevel ? (
            <View style={styles.filterRow}>
              <View style={[styles.filterBadge, { backgroundColor: getLevelColor(groupLevel) + "20", flex: 1 }]}>
                <View style={[styles.filterDot, { backgroundColor: getLevelColor(groupLevel) }]} />
                <Text style={[styles.filterText, { color: getLevelColor(groupLevel) }]}>
                  {showAllPlayers ? "All levels" : `${groupLevel.toUpperCase()} only`}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.showAllToggle,
                  showAllPlayers && styles.showAllToggleActive,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAllPlayers(!showAllPlayers);
                }}
              >
                <Ionicons 
                  name={showAllPlayers ? "filter" : "filter-outline"} 
                  size={16} 
                  color={showAllPlayers ? Colors.dark.primary : "#FFFFFF"} 
                />
                <Text style={[
                  styles.showAllText,
                  showAllPlayers && { color: Colors.dark.primary },
                ]}>
                  {showAllPlayers ? "Filtered" : "Show All"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Selected Players (including guests) */}
          {selectedPlayers.length > 0 ? (
            <View style={styles.selectedPlayersRow}>
              {selectedPlayers.map(player => (
                <Pressable
                  key={player.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
                  }}
                  style={[styles.selectedPlayerChip, player.isGuest && styles.selectedPlayerChipGuest]}
                >
                  {player.isGuest ? (
                    <View style={styles.guestBadge}>
                      <Text style={styles.guestBadgeText}>GUEST</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.selectedPlayerName, player.isGuest && { color: Colors.dark.orange }]}>{player.name}</Text>
                  <Ionicons name="close" size={14} color={Colors.dark.error} />
                </Pressable>
              ))}
            </View>
          ) : null}
          
          <ScrollView style={styles.playersList} showsVerticalScrollIndicator={false}>
            {filteredPlayers.length === 0 ? (
              <View style={styles.emptyPlayers}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyPlayersText}>No players found</Text>
              </View>
            ) : (
              filteredPlayers.map((player) => {
                const isSelected = selectedPlayers.some(p => p.id === player.id);
                const levelColor = getLevelColor(player.ballLevel);
                const xpProgress = player.totalXp && player.level ? getXpProgress(player.totalXp, player.level) : 0;
                
                return (
                  <Pressable
                    key={player.id}
                    style={[
                      styles.playerCard,
                      isSelected && styles.playerCardSelected,
                      isSelected && { borderColor: levelColor },
                    ]}
                    onPress={() => togglePlayer(player)}
                  >
                    {player.profilePhotoUrl ? (
                      <Image
                        source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                        style={styles.playerAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.playerAvatarPlaceholder, { backgroundColor: levelColor + "30" }]}>
                        <Text style={[styles.playerInitial, { color: getLevelTextColor(player.ballLevel) }]}>
                          {player.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.name}</Text>
                      <View style={styles.playerMeta}>
                        <View style={[styles.playerLevelBadge, { backgroundColor: levelColor + "20" }]}>
                          <View style={[styles.playerLevelDot, { backgroundColor: levelColor }]} />
                          <Text style={[styles.playerLevelText, { color: getLevelTextColor(player.ballLevel) }]}>
                            {(player.ballLevel || "").toUpperCase()}
                            {player.skillLevel ? `_${player.skillLevel}` : ""}
                          </Text>
                        </View>
                        {player.level ? (
                          <View style={styles.playerXpBadge}>
                            <Ionicons name="flash" size={10} color={Colors.dark.xpCyan} />
                            <Text style={styles.playerXpText}>Lvl {player.level}</Text>
                          </View>
                        ) : null}
                        {player.streak && player.streak > 0 ? (
                          <View style={styles.playerStreakBadge}>
                            <Ionicons name="flame" size={10} color={Colors.dark.orange} />
                            <Text style={styles.playerStreakText}>{player.streak}</Text>
                          </View>
                        ) : null}
                      </View>
                      {player.totalXp && player.level ? (
                        <View style={styles.xpProgressBar}>
                          <View style={[styles.xpProgressFill, { width: `${xpProgress}%` }]} />
                        </View>
                      ) : null}
                    </View>
                    <View style={[
                      styles.playerCheckbox,
                      isSelected && { backgroundColor: levelColor, borderColor: levelColor },
                    ]}>
                      {isSelected ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </BaselineFlowCard>
    );
  };

  const [datePickerMonth, setDatePickerMonth] = useState(initialDate || new Date());
  
  const getDatePickerDays = () => {
    const year = datePickerMonth.getFullYear();
    const month = datePickerMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPadding; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const renderDateTimeCard = () => {
    const courtName = selectedCourtId ? courts.find(c => c.id === selectedCourtId)?.name : null;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedSelectedDate = `${dayNames[selectedDate.getDay()]}, ${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;
    
    return (
      <BaselineFlowCard
        title="Date & Time"
        subtitle={courtName ? `Court: ${courtName}` : "Select when"}
        icon="time"
        iconColor="#8B5CF6"
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor="#8B5CF6"
      >
        <ScrollView style={styles.cardScrollFull} contentContainerStyle={styles.cardScrollFullContent} showsVerticalScrollIndicator={false}>
          {courtName ? (
            <Pressable 
              style={styles.courtChangeChip}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCourtChange(!showCourtChange);
              }}
            >
              <View style={styles.selectedDateInfo}>
                <Ionicons name="tennisball" size={18} color={Colors.dark.gold} />
                <Text style={styles.courtChangeText}>{courtName}</Text>
              </View>
              <Ionicons 
                name="swap-horizontal" 
                size={18} 
                color={Colors.dark.gold} 
              />
            </Pressable>
          ) : null}
          
          {showCourtChange ? (
            <View style={styles.courtChangeList}>
              {courts.map((court) => (
                <Pressable
                  key={court.id}
                  style={[
                    styles.courtChangeItem,
                    selectedCourtId === court.id && styles.courtChangeItemSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCourtId(court.id);
                    setShowCourtChange(false);
                  }}
                >
                  <Text style={styles.courtChangeItemText}>{court.name}</Text>
                  {selectedCourtId === court.id ? (
                    <Ionicons name="checkmark" size={16} color={Colors.dark.gold} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          
          <Pressable 
            style={styles.selectedDateChip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsCalendarExpanded(!isCalendarExpanded);
            }}
          >
            <View style={styles.selectedDateInfo}>
              <Ionicons name="calendar" size={20} color="#8B5CF6" />
              <Text style={styles.selectedDateText}>{formattedSelectedDate}</Text>
            </View>
            <Ionicons 
              name={isCalendarExpanded ? "chevron-up" : "chevron-down"} 
              size={20} 
              color="#FFFFFF" 
            />
          </Pressable>
          
          {isCalendarExpanded ? (
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerNav}>
                <Pressable
                  onPress={() => {
                    const prev = new Date(datePickerMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setDatePickerMonth(prev);
                  }}
                  style={styles.datePickerNavBtn}
                >
                  <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.datePickerMonthLabel}>
                  {datePickerMonth.toLocaleDateString("en", { month: "long", year: "numeric" })}
                </Text>
                <Pressable
                  onPress={() => {
                    const next = new Date(datePickerMonth);
                    next.setMonth(next.getMonth() + 1);
                    setDatePickerMonth(next);
                  }}
                  style={styles.datePickerNavBtn}
                >
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
              
              <View style={styles.datePickerDayHeaders}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <Text key={d} style={styles.datePickerDayHeader}>{d}</Text>
                ))}
              </View>
              
              <View style={styles.datePickerGrid}>
                {getDatePickerDays().map((day, idx) => {
                  if (!day) {
                    return <View key={`empty-${idx}`} style={styles.datePickerCell} />;
                  }
                  const isSelected = day.toDateString() === selectedDate.toDateString();
                  const isToday = day.toDateString() === new Date().toDateString();
                  
                  return (
                    <Pressable
                      key={day.toISOString()}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDate(day);
                        setIsCalendarExpanded(false);
                      }}
                      style={[
                        styles.datePickerCell,
                        isSelected && styles.datePickerCellSelected,
                        isToday && !isSelected && styles.datePickerCellToday,
                      ]}
                    >
                      <Text style={[
                        styles.datePickerDayText,
                        isSelected && styles.datePickerDayTextSelected,
                      ]}>
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          
          <Text style={styles.sectionLabel}>Duration</Text>
          <View style={styles.durationGrid}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d.value}
                style={[
                  styles.durationCard,
                  duration === d.value && styles.durationCardSelected,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDuration(d.value);
                }}
              >
                <Text style={[
                  styles.durationText,
                  duration === d.value && styles.durationTextSelected,
                ]}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>
          
          {isRecurring ? (
            <View style={styles.recurringBanner}>
              <Ionicons name="repeat" size={16} color="#8B5CF6" />
              <Text style={styles.recurringBannerText}>
                Checking availability for {weekCount} weeks
              </Text>
              {isCheckingAvailability ? (
                <ActivityIndicator size="small" color="#8B5CF6" />
              ) : null}
            </View>
          ) : null}
          
          <View style={styles.availableTimesHeader}>
            <Text style={styles.sectionLabel}>Available Times</Text>
            <View style={styles.slotCountRow}>
              {isCheckingAvailability ? (
                <Text style={styles.slotCountTextMuted}>Checking...</Text>
              ) : (
                <Text style={styles.slotCountText}>{availableSlots.length} slots</Text>
              )}
            </View>
          </View>
          
          {isCheckingAvailability ? (
            <View style={styles.noSlotsContainer}>
              <ActivityIndicator size="large" color="#8B5CF6" />
              <Text style={styles.noSlotsText}>Checking {weekCount} weeks...</Text>
            </View>
          ) : availableSlots.length > 0 ? (
            <View style={styles.timeGrid}>
              {availableSlots.map((time) => (
                <Pressable
                  key={time}
                  style={[
                    styles.timeSlot,
                    selectedTime === time && styles.timeSlotSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    isPrefilledTime.current = false;
                    setSelectedTime(time);
                  }}
                >
                  <Text style={[
                    styles.timeSlotText,
                    selectedTime === time && styles.timeSlotTextSelected,
                  ]}>
                    {time}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.noSlotsContainer}>
              <Ionicons name="calendar-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.noSlotsText}>No available time slots</Text>
              <Text style={styles.noSlotsHint}>Try a different date or court</Text>
            </View>
          )}
        </ScrollView>
      </BaselineFlowCard>
    );
  };

  const renderSessionSetupCard = () => (
    <BaselineFlowCard
      title="Session Setup"
      subtitle="Additional options"
      icon="settings"
      iconColor={Colors.dark.gold}
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      glowColor={Colors.dark.gold}
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        {sessionType === "group" ? (
          <>
            <Text style={styles.sectionLabel}>Max Players</Text>
            <View style={styles.maxPlayersRow}>
              {MAX_PLAYERS_OPTIONS.map((count) => (
                <Pressable
                  key={count}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMaxPlayers(count);
                  }}
                  style={[
                    styles.maxPlayerChip,
                    maxPlayers === count && styles.maxPlayerChipActive,
                  ]}
                >
                  <Text style={[
                    styles.maxPlayerChipText,
                    maxPlayers === count && styles.maxPlayerChipTextActive,
                  ]}>
                    {count}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        
        <Text style={styles.sectionLabel}>Ball Level</Text>
        <View style={styles.sessionBallLevelRow}>
          {BALL_LEVELS.map((level) => (
            <Pressable
              key={level.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSessionBallLevel(sessionBallLevel === level.id ? null : level.id);
              }}
              style={[
                styles.sessionBallLevelChip,
                sessionBallLevel === level.id && styles.sessionBallLevelChipActive,
                sessionBallLevel === level.id && { borderColor: level.color },
              ]}
            >
              <Image
                source={{ uri: `${getStaticAssetsUrl()}/images/${level.image}` }}
                style={styles.sessionBallImage}
                contentFit="contain"
              />
              <Text style={[
                styles.sessionBallLevelText,
                sessionBallLevel === level.id && { color: level.color },
              ]}>
                {level.label}
              </Text>
            </Pressable>
          ))}
        </View>
        
        {sessionType === "group" ? (
          <>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Open Group</Text>
                <Text style={styles.toggleHint}>Allow players to join this session</Text>
              </View>
              <Switch
                value={isOpenGroup}
                onValueChange={setIsOpenGroup}
                trackColor={{ false: "#2A2F3A", true: Colors.dark.primary + "60" }}
                thumbColor={isOpenGroup ? Colors.dark.primary : "#666"}
              />
            </View>
            
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Visible to Players</Text>
                <Text style={styles.toggleHint}>Show in player schedules</Text>
              </View>
              <Switch
                value={visibleToPlayers}
                onValueChange={setVisibleToPlayers}
                trackColor={{ false: "#2A2F3A", true: Colors.dark.primary + "60" }}
                thumbColor={visibleToPlayers ? Colors.dark.primary : "#666"}
              />
            </View>
          </>
        ) : null}
        
        <Text style={styles.sectionLabel}>Notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Add session notes..."
          placeholderTextColor={Colors.dark.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderCourtCard = () => (
    <BaselineFlowCard
      title="Court"
      subtitle="Where is the session?"
      icon="location"
      iconColor={Colors.dark.gold}
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      glowColor={Colors.dark.gold}
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        <Pressable
          style={[
            styles.courtCard,
            selectedCourtId === null && styles.courtCardSelected,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedCourtId(null);
          }}
        >
          <Ionicons name="help-circle-outline" size={24} color={Colors.dark.textMuted} />
          <Text style={styles.courtName}>No specific court</Text>
          {selectedCourtId === null ? (
            <View style={[styles.courtCheck, { backgroundColor: Colors.dark.gold }]}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
        
        {courts.map((court) => (
          <Pressable
            key={court.id}
            style={[
              styles.courtCard,
              selectedCourtId === court.id && styles.courtCardSelected,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedCourtId(court.id);
            }}
          >
            <Ionicons name="tennisball" size={24} color={Colors.dark.gold} />
            <Text style={styles.courtName}>{court.name}</Text>
            {selectedCourtId === court.id ? (
              <View style={[styles.courtCheck, { backgroundColor: Colors.dark.gold }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>
        ))}
        
        {courts.length === 0 ? (
          <View style={styles.noCourts}>
            <Text style={styles.noCourtsText}>No courts available</Text>
          </View>
        ) : null}
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderSummaryCard = () => {
    const typeData = SESSION_TYPES.find(t => t.id === sessionType);
    const levelColor = groupLevel ? getLevelColor(groupLevel) : (typeData?.color || GlowColors.primary);
    const courtName = selectedCourtId ? courts.find(c => c.id === selectedCourtId)?.name : "No specific court";
    
    const getScheduleLabel = () => {
      if (isRecurring) return `Weekly x ${weekCount} weeks`;
      if (isFlexible) return `${flexibleDates.length} selected dates`;
      return "One-time";
    };
    
    return (
      <BaselineFlowCard
        title="Summary"
        subtitle="Review & confirm"
        icon="checkmark-circle"
        iconColor={GlowColors.primary}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={saveMutation.isPending ? "Creating..." : "Create Session"}
        nextDisabled={saveMutation.isPending}
        glowColor={GlowColors.primary}
      >
        <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: typeData?.color + "20" }]}>
                <Ionicons name={typeData?.icon || "calendar"} size={20} color={typeData?.color} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Session Type</Text>
                <Text style={styles.summaryValue}>{typeData?.label}</Text>
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: isRecurring ? Colors.dark.xpCyan + "20" : isFlexible ? Colors.dark.orange + "20" : Colors.dark.primary + "20" }]}>
                <Ionicons name="repeat" size={20} color={isRecurring ? Colors.dark.xpCyan : isFlexible ? Colors.dark.orange : Colors.dark.primary} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Schedule</Text>
                <Text style={styles.summaryValue}>{getScheduleLabel()}</Text>
              </View>
            </View>
            
            {sessionType === "group" && groupLevel ? (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIcon, { backgroundColor: levelColor + "20" }]}>
                  <View style={[styles.summaryDot, { backgroundColor: levelColor }]} />
                </View>
                <View style={styles.summaryInfo}>
                  <Text style={styles.summaryLabel}>Group Level</Text>
                  <Text style={[styles.summaryValue, { color: getLevelTextColor(groupLevel) }]}>
                    {groupLevel.toUpperCase()}
                  </Text>
                </View>
              </View>
            ) : null}
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: "#3B82F620" }]}>
                <Ionicons name="people" size={20} color="#3B82F6" />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Players</Text>
                <Text style={styles.summaryValue}>
                  {selectedPlayers.map(p => p.name).join(", ") || "None selected"}
                </Text>
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: "#8B5CF620" }]}>
                <Ionicons name="calendar" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Date & Time</Text>
                {isFlexible && flexibleDates.length > 0 ? (
                  <View>
                    {flexibleDates.slice(0, 3).map((fd, idx) => {
                      const dateStr = typeof fd === 'string' ? fd : fd.date;
                      const d = new Date(dateStr + 'T12:00:00');
                      return (
                        <Text key={idx} style={styles.summaryValue}>
                          {formatDate(d)} at {selectedTime || "Not set"}
                        </Text>
                      );
                    })}
                    {flexibleDates.length > 3 ? (
                      <Text style={[styles.summaryValue, { color: Colors.dark.textMuted }]}>
                        +{flexibleDates.length - 3} more dates
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.summaryValue}>
                    {formatDate(selectedDate)} at {selectedTime || "Not set"}
                  </Text>
                )}
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: "#EC489920" }]}>
                <Ionicons name="time" size={20} color="#EC4899" />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>{duration} minutes</Text>
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="location" size={20} color={Colors.dark.gold} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Court</Text>
                <Text style={styles.summaryValue}>{courtName}</Text>
              </View>
            </View>
            
            {notes.trim() ? (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIcon, { backgroundColor: "#6B728020" }]}>
                  <Ionicons name="document-text" size={20} color="#6B7280" />
                </View>
                <View style={styles.summaryInfo}>
                  <Text style={styles.summaryLabel}>Notes</Text>
                  <Text style={styles.summaryValue}>{notes}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </BaselineFlowCard>
    );
  };

  const renderCompleteCard = () => (
    <View style={styles.completeContainer}>
      <View style={styles.completeCard}>
        <LinearGradient
          colors={[GlowColors.primary + "30", "transparent"]}
          style={styles.completeGlow}
        />
        <View style={styles.completeIconWrapper}>
          <Ionicons name="checkmark-circle" size={80} color={GlowColors.primary} />
        </View>
        <Text style={styles.completeTitle}>Session Created!</Text>
        <Text style={styles.completeSubtitle}>
          {isRecurring 
            ? `${weekCount} weekly sessions scheduled` 
            : isFlexible 
              ? `${flexibleDates.length} sessions scheduled`
              : "Your session has been scheduled"
          }
        </Text>
        <Pressable style={styles.completeDoneButton} onPress={handleClose}>
          <Text style={styles.completeDoneText}>Done</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    if (showSuccessAnimation) {
      return (
        <Animated.View style={[styles.successOverlay, successAnimatedStyle]}>
          <View style={styles.successContent}>
            <Ionicons name="checkmark-circle" size={100} color={GlowColors.primary} />
            <Text style={styles.successText}>Session Created!</Text>
          </View>
        </Animated.View>
      );
    }

    switch (step) {
      case "intro": return renderIntroCard();
      case "session-type": return renderSessionTypeCard();
      case "schedule-pattern": return renderSchedulePatternCard();
      case "group-level": return renderGroupLevelCard();
      case "players": return renderPlayersCard();
      case "date-time": return renderDateTimeCard();
      case "court": return renderCourtCard();
      case "summary": return renderSummaryCard();
      case "complete": return renderCompleteCard();
      default: return null;
    }
  };

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>New Session</Text>
            {sessionType && step !== "intro" && step !== "complete" ? (
              <Text style={styles.headerSubtitle}>
                {SESSION_TYPES.find(t => t.id === sessionType)?.label}
              </Text>
            ) : null}
          </View>
          <View style={styles.headerRight} />
        </View>
        
        <View style={styles.content}>
          {renderCurrentStep()}
        </View>
      </View>
    </Modal>

    {/* Add Guest Player Modal */}
    <Modal
      visible={showGuestModal}
      animationType="fade"
      transparent
      onRequestClose={() => setShowGuestModal(false)}
    >
      <View style={styles.guestModalOverlay}>
        <View style={styles.guestModalContent}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.guestModalHeaderLine}
          />
          
          <View style={styles.guestModalHeader}>
            <Text style={styles.guestModalTitle}>ADD GUEST PLAYER</Text>
            <Pressable
              onPress={() => {
                setShowGuestModal(false);
                setGuestName("");
                setGuestBallLevel(null);
              }}
              style={styles.guestModalCloseBtn}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.guestModalBody}>
            <Text style={styles.guestModalLabel}>Guest Name</Text>
            <TextInput
              style={styles.guestModalInput}
              placeholder="Enter guest name..."
              placeholderTextColor={Colors.dark.textMuted}
              value={guestName}
              onChangeText={setGuestName}
              autoFocus
            />

            <Text style={[styles.guestModalLabel, { marginTop: Spacing.lg }]}>Ball Level (Optional)</Text>
            <View style={styles.guestBallLevels}>
              {BALL_LEVELS.map(level => (
                <Pressable
                  key={level.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setGuestBallLevel(guestBallLevel === level.id ? null : level.id);
                  }}
                  style={[
                    styles.guestBallOption,
                    guestBallLevel === level.id && { borderColor: level.color, backgroundColor: level.color + "20" }
                  ]}
                >
                  <View style={[styles.guestBallDot, { backgroundColor: level.color }]} />
                  <Text style={[
                    styles.guestBallOptionText,
                    guestBallLevel === level.id && { color: "#FFFFFF" }
                  ]}>
                    {level.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={async () => {
                if (!guestName.trim() || isCreatingGuest) return;
                
                setIsCreatingGuest(true);
                try {
                  // Create the player in the database
                  const response = await apiRequest("POST", "/api/players", {
                    name: guestName.trim(),
                    ballLevel: guestBallLevel,
                    status: "active",
                  });
                  
                  const savedPlayer = await response.json();
                  
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  
                  // Add the saved player to selected players
                  setSelectedPlayers(prev => [...prev, {
                    id: savedPlayer.id,
                    name: savedPlayer.name,
                    email: savedPlayer.email || "",
                    ballLevel: savedPlayer.ballLevel,
                  }]);
                  
                  // Invalidate players query to refresh the list
                  queryClient.invalidateQueries({ queryKey: ["/api/players"] });
                  
                  setGuestName("");
                  setGuestBallLevel(null);
                  setShowGuestModal(false);
                } catch (error) {
                  console.error("Failed to create guest player:", error);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  Alert.alert("Error", "Failed to add guest player. Please try again.");
                } finally {
                  setIsCreatingGuest(false);
                }
              }}
              disabled={!guestName.trim() || isCreatingGuest}
              style={[styles.guestModalAddBtn, (!guestName.trim() || isCreatingGuest) && styles.guestModalAddBtnDisabled]}
            >
              <LinearGradient
                colors={guestName.trim() && !isCreatingGuest ? [Colors.dark.primary, "#00FF88"] : [Colors.dark.disabled, Colors.dark.disabled]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.guestModalAddBtnGradient}
              >
                {isCreatingGuest ? (
                  <ActivityIndicator size="small" color="#0B0D10" />
                ) : (
                  <Ionicons name="person-add" size={18} color={guestName.trim() ? "#0B0D10" : Colors.dark.textMuted} />
                )}
                <Text style={[styles.guestModalAddBtnText, (!guestName.trim() || isCreatingGuest) && { color: Colors.dark.textMuted }]}>
                  {isCreatingGuest ? "Adding..." : "Add Guest"}
                </Text>
              </LinearGradient>
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
    backgroundColor: "#0B0D10",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.xpCyan,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingBottom: Spacing.lg,
  },
  cardScroll: {
    maxHeight: 420,
  },
  cardScrollLarge: {
    maxHeight: 450,
  },
  datePickerContainer: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  datePickerNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  datePickerNavBtn: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  datePickerMonthLabel: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  datePickerDayHeaders: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  datePickerDayHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  datePickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  datePickerCell: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  datePickerCellSelected: {
    backgroundColor: "#8B5CF6" + "40",
    borderRadius: BorderRadius.sm,
  },
  datePickerCellToday: {
    borderWidth: 1.5,
    borderColor: "#8B5CF6",
    borderRadius: BorderRadius.sm,
  },
  datePickerDayText: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  datePickerDayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  cardScrollFull: {
    flex: 1,
  },
  cardScrollFullContent: {
    flexGrow: 1,
  },
  selectedDateChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "#8B5CF6" + "40",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  selectedDateInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  selectedDateText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  availableTimesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  slotCountText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  noSlotsContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  noSlotsText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  noSlotsHint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  recurringBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#8B5CF6" + "20",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "#8B5CF6" + "40",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  recurringBannerText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },
  slotCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  slotCountTextMuted: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  showAllToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  showAllToggleActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary + "60",
  },
  showAllText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  courtChangeChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.gold + "40",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  courtChangeText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  courtChangeList: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  courtChangeItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  courtChangeItemSelected: {
    backgroundColor: Colors.dark.gold + "15",
  },
  courtChangeItemText: {
    fontSize: FontSizes.md,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  introContent: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  introIconWrapper: {
    marginBottom: Spacing.lg,
  },
  introIconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
  },
  introDescription: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  introFeatures: {
    gap: Spacing.sm,
  },
  introFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  introFeatureText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  skipIntroRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  skipCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipCheckboxChecked: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  skipIntroText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  sessionTypeList: {
    gap: Spacing.sm,
  },
  sessionTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.md,
  },
  sessionTypeCardSelected: {
    backgroundColor: Backgrounds.card,
  },
  sessionTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  sessionTypeInfo: {
    flex: 1,
  },
  sessionTypeLabel: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  sessionTypeSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  sessionTypeCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  schedulePatternRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  schedulePatternOption: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
  },
  schedulePatternOptionActive: {
    borderColor: "transparent",
  },
  schedulePatternGradient: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
    gap: Spacing.xs,
  },
  schedulePatternLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  schedulePatternSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  weekCountSection: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  weekCountLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: Spacing.md,
  },
  weekCountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  weekCountChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#2A2F3A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  weekCountChipActive: {
    backgroundColor: Colors.dark.xpCyan + "20",
    borderColor: Colors.dark.xpCyan,
  },
  weekCountChipText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  weekCountChipTextActive: {
    color: Colors.dark.xpCyan,
  },
  weekCountHint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  flexibleSection: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  flexibleMonthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  flexibleMonthBtn: {
    padding: Spacing.sm,
  },
  flexibleMonthLabel: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  flexibleDayHeaders: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  flexibleDayHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  flexibleCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingBottom: Spacing.md,
  },
  flexibleDayCell: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  flexibleDayCellSelected: {
    backgroundColor: Colors.dark.orange + "30",
    borderRadius: BorderRadius.sm,
  },
  flexibleDayCellToday: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    borderRadius: BorderRadius.sm,
  },
  flexibleDayText: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
  },
  flexibleDayTextSelected: {
    color: Colors.dark.orange,
    fontWeight: "700",
  },
  flexibleSummary: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  flexibleSummaryLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  flexibleChipsScroll: {
    flexDirection: "row",
  },
  flexibleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.orange + "20",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  flexibleChipText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.orange,
    fontWeight: "500",
  },
  groupLevelContent: {
    paddingVertical: Spacing.md,
  },
  levelQuestion: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.lg,
    fontWeight: "500",
  },
  ballLevelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  ballLevelCard: {
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2 - Spacing.sm * 2) / 2 - 4,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.md,
    alignItems: "center",
  },
  ballLevelCardSelected: {
    backgroundColor: Backgrounds.card,
  },
  ballDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: Spacing.sm,
  },
  ballLevelLabel: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  ballLevelDesc: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  playerCountBadge: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  ballCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  levelInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    backgroundColor: Backgrounds.card,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  levelInfoText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  playersContent: {
    flex: 1,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    marginLeft: Spacing.sm,
  },
  ballFilterRow: {
    marginBottom: Spacing.md,
    maxHeight: 40,
  },
  ballFilterContent: {
    gap: Spacing.sm,
    alignItems: "center",
  },
  ballFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: "#1A1F2A",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.4)",
    height: 36,
  },
  ballFilterChipActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary,
  },
  ballFilterChipText: {
    fontSize: FontSizes.xs,
    color: "#FFFFFF",
  },
  ballFilterChipTextActive: {
    color: GlowColors.primary,
  },
  ballFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  playersList: {
    flex: 1,
  },
  emptyPlayers: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyPlayersText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.35)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playerCardSelected: {
    backgroundColor: Backgrounds.card,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: Spacing.md,
  },
  playerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  playerInitial: {
    fontSize: 18,
    fontWeight: "700",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  playerLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  playerLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  playerLevelText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  playerXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  playerXpText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  playerStreakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  playerStreakText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.orange,
  },
  xpProgressBar: {
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 1.5,
    marginTop: 6,
    overflow: "hidden",
  },
  xpProgressFill: {
    height: "100%",
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: 1.5,
  },
  playerCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  durationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  durationCard: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  durationCardSelected: {
    borderColor: "#8B5CF6",
    backgroundColor: "#8B5CF620",
  },
  durationText: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  durationTextSelected: {
    color: "#8B5CF6",
    fontWeight: "700",
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  timeSlot: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  timeSlotSelected: {
    borderColor: "#8B5CF6",
    backgroundColor: "#8B5CF620",
  },
  timeSlotText: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
  },
  timeSlotTextSelected: {
    color: "#8B5CF6",
    fontWeight: "600",
  },
  maxPlayersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  maxPlayerChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#2A2F3A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  maxPlayerChipActive: {
    backgroundColor: Colors.dark.gold + "20",
    borderColor: Colors.dark.gold,
  },
  maxPlayerChipText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  maxPlayerChipTextActive: {
    color: Colors.dark.gold,
  },
  skillLevelRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  skillLevelChip: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: "#2A2F3A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
  },
  skillLevelChipActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  skillLevelChipText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  skillLevelChipTextActive: {
    color: Colors.dark.primary,
  },
  sessionBallLevelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  sessionBallLevelChip: {
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2 - Spacing.sm * 2) / 3 - 4,
    paddingVertical: Spacing.sm,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
  },
  sessionBallLevelChipActive: {
    backgroundColor: "rgba(200, 255, 61, 0.1)",
  },
  sessionBallImage: {
    width: 32,
    height: 32,
    marginBottom: Spacing.xs,
  },
  sessionBallLevelText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  toggleHint: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  notesInput: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    minHeight: 80,
    textAlignVertical: "top",
  },
  courtCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  courtCardSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: Colors.dark.gold + "10",
  },
  courtName: {
    flex: 1,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  courtCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  noCourts: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  noCourtsText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  summaryCard: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  summaryDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  completeContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  completeCard: {
    width: "100%",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.xl,
    padding: Spacing["2xl"],
    alignItems: "center",
    borderWidth: 2,
    borderColor: GlowColors.primary + "50",
    overflow: "hidden",
  },
  completeGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  completeIconWrapper: {
    marginBottom: Spacing.lg,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
  },
  completeSubtitle: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  completeDoneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#1A1F2A",
    borderWidth: 1.5,
    borderColor: GlowColors.primary + "60",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  completeDoneText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  successOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  successContent: {
    alignItems: "center",
  },
  successText: {
    fontSize: 24,
    fontWeight: "700",
    color: GlowColors.primary,
    marginTop: Spacing.lg,
  },
  // Add Guest Button styles
  addGuestButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    borderStyle: "dashed",
    marginBottom: Spacing.sm,
  },
  addGuestButtonText: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  // Selected players row
  selectedPlayersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  selectedPlayerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  selectedPlayerChipGuest: {
    backgroundColor: Colors.dark.orange + "20",
    borderColor: Colors.dark.orange,
  },
  selectedPlayerName: {
    fontSize: FontSizes.xs,
    color: Colors.dark.primary,
  },
  guestBadge: {
    backgroundColor: Colors.dark.orange,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  guestBadgeText: {
    fontSize: 8,
    color: "#0B0D10",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  // Guest Modal styles
  guestModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  guestModalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  guestModalHeaderLine: {
    height: 3,
  },
  guestModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  guestModalTitle: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 1,
  },
  guestModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  guestModalBody: {
    padding: Spacing.lg,
  },
  guestModalLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  guestModalInput: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    backgroundColor: "#0B0D10",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  guestBallLevels: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  guestBallOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#0B0D10",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  guestBallDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  guestBallOptionText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  guestModalAddBtn: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  guestModalAddBtnDisabled: {
    opacity: 0.6,
  },
  guestModalAddBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  guestModalAddBtnText: {
    fontSize: FontSizes.md,
    color: "#0B0D10",
    fontWeight: "700",
  },
});
