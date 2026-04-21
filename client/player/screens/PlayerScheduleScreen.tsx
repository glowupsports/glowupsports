import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Modal, Platform } from "react-native";
import { openDirections } from "@/lib/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useScheduleFocus } from "@/player/context/ScheduleFocusContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/coach/context/AuthContext";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, withTiming, interpolate } from "react-native-reanimated";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors, TextColors } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { GuidedEmptyState } from "@/components/GuidedEmptyState";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { useSport, SPORT_DEFINITIONS, getSportColor, getSportLabel, getSportIcon, type Sport } from "@/player/context/SportContext";
import { SportSwitcherChips } from "@/player/components/SportSwitcherChips";
import { usePlayer } from "@/player/context/PlayerContext";
import { useFamily } from "@/player/context/FamilyContext";
import LessonBalanceCard from "@/player/components/LessonBalanceCard";
import NextLessonCard from "@/player/components/NextLessonCard";
import FamilyChildSwitcher from "@/player/components/FamilyChildSwitcher";
import * as Calendar from "expo-calendar";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const ProTennisColors = new Proxy({} as Record<string, string>, {
  get(_t, prop: string) {
    switch (prop) {
      case 'midnightBlue':
      case 'backgroundPrimary':
        return Backgrounds.root;
      case 'surfaceCard':
      case 'cardBackground':
        return Backgrounds.card;
      case 'surfaceElevated':
      case 'backgroundSecondary':
        return Backgrounds.elevated;
      case 'border':
        return Backgrounds.surface;
      case 'neonGreen':
      case 'electricGreen':
        return GlowColors.primary;
      case 'neonCyan': return '#00E5FF';
      case 'neonPurple': return '#E040FB';
      case 'neonOrange': return '#FF8A00';
      case 'gold': return '#FFD700';
      case 'vacationBlue': return '#4DA3FF';
      case 'error': return '#FF4D4D';
      case 'success': return '#00E676';
      case 'white':
      case 'textPrimary':
        return TextColors.primary;
      case 'textSecondary': return TextColors.secondary;
      case 'textMuted': return TextColors.muted;
      default:
        if (typeof console !== 'undefined') console.warn('ProTennisColors: missing key', prop);
        return undefined;
    }
  },
});

interface SessionData {
  id: string;
  sessionId: string;
  attendanceStatus: string;
  session: {
    id: string;
    startTime: string;
    endTime: string;
    sessionType: string;
    courtName: string | null;
    title: string;
    locationId?: string | null;
    locationName?: string | null;
    locationAddress?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
  } | null;
  coachName: string | null;
}

interface CourtBookingData {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  courtName: string;
  status: string;
}

interface MatchData {
  id: string;
  matchDate: string;
  matchTime?: string;
  opponentName?: string;
  courtName?: string;
  status: string;
  matchType?: string;
}

interface VacationData {
  active: boolean;
  activeVacation?: { id: string; startDate: string; endDate: string };
  upcomingVacation?: { id: string; startDate: string; endDate: string };
  holidays: Array<{ id: string; startDate: string; endDate: string }>;
}

interface ScheduledItem {
  id: string;
  sessionId?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: "private" | "group" | "semi_private" | "court" | "match";
  title: string;
  subtitle: string;
  coachName: string;
  courtName: string;
  locationId?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  status: "upcoming" | "completed" | "cancelled";
  attendanceStatus?: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isVacation: boolean;
  items: ScheduledItem[];
}

interface AttendanceRecord {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  status: "present" | "absent" | "late" | "vacation";
  coachName: string;
  courtName: string;
}

function NeonBorderCard({ children, accentColor = ProTennisColors.neonCyan, style, onPress }: { children: React.ReactNode; accentColor?: string; style?: any; onPress?: () => void }) {
  const content = (
    <View style={[styles.neonCard, style]}>
      <View style={[styles.neonCardGlow, { shadowColor: accentColor }]} />
      <LinearGradient
        colors={[accentColor + "15", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.neonCardGradient}
      />
      <View style={[styles.neonCardBorder, { borderColor: accentColor + "40" }]}>
        {children}
      </View>
    </View>
  );
  
  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

function QuickActionButton({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function StatCard({ icon, label, value, color, subtext }: { icon: string; label: string; value: string | number; color: string; subtext?: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: color + "20" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subtext ? <Text style={styles.statSubtext}>{subtext}</Text> : null}
    </View>
  );
}

export default function PlayerScheduleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const track = useTrackFeature();
  const queryClient = useQueryClient();
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const { isMultiSport, activeSports, activeSport, setActiveSport } = useSport();
  const { playerId: profilePlayerId } = usePlayer();
  const { activePlayerId } = useFamily();
  const playerId = activePlayerId || profilePlayerId;
  const { logout, isGuest } = useAuth();
  const [showSportPickerModal, setShowSportPickerModal] = useState(false);
  const [sportPickerDestination, setSportPickerDestination] = useState<"LessonBooking" | "CourtBooking" | "OpenMatches">("OpenMatches");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attendanceFilterMonth, setAttendanceFilterMonth] = useState(new Date());
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [vacationStartDate, setVacationStartDate] = useState<Date | null>(null);
  const [vacationEndDate, setVacationEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarLinkCopied, setCalendarLinkCopied] = useState(false);

  // Scroll-to-session support: when the home screen requests focus on a
  // specific upcoming session, scroll to its row in the upcoming list.
  const scrollViewRef = useRef<ScrollView | null>(null);
  const upcomingItemOffsets = useRef<Map<string, number>>(new Map());
  const upcomingListOffset = useRef<number>(0);
  const { focusSessionId, focusToken, clearFocusSession } = useScheduleFocus();
  const handleUpcomingItemLayout = useCallback((id: string, y: number) => {
    upcomingItemOffsets.current.set(id, y);
  }, []);
  useEffect(() => {
    if (!focusSessionId) return;
    // Retry until the target row has been laid out (handles cold-load /
    // network latency where data isn't rendered yet). Give up after ~5s.
    let attempts = 0;
    const maxAttempts = 25;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryScroll = () => {
      const innerY = upcomingItemOffsets.current.get(focusSessionId);
      if (innerY != null && scrollViewRef.current) {
        const targetY = Math.max(0, upcomingListOffset.current + innerY - 80);
        scrollViewRef.current.scrollTo({ y: targetY, animated: true });
        clearFocusSession();
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        clearFocusSession();
        return;
      }
      timer = setTimeout(tryScroll, 200);
    };
    timer = setTimeout(tryScroll, 200);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [focusSessionId, focusToken, clearFocusSession]);

  // Walkthrough effect - only run once on mount using ref to prevent re-triggers
  const walkthroughTriggered = React.useRef(false);
  useEffect(() => {
    if (!walkthroughTriggered.current && !hasSeenScreen("Schedule")) {
      walkthroughTriggered.current = true;
      const timer = setTimeout(() => {
        startWalkthrough("Schedule");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);


  const { data: rawSessions, isLoading: sessionsLoading, error: sessionsError } = useQuery<SessionData[]>({
    queryKey: ["/api/player/me/sessions"],
    enabled: !isGuest,
  });

  const { data: courtBookings } = useQuery<CourtBookingData[]>({
    queryKey: ["/api/player/me/court-bookings"],
  });

  const { data: matches } = useQuery<MatchData[]>({
    queryKey: ["/api/player/me/matches"],
  });

  const { data: vacationData } = useQuery<VacationData>({
    queryKey: ["/api/player/me/vacation"],
  });

  const { data: profileData } = useQuery<{ player: { attendanceStreak?: number; lastLatitude?: number | null; lastLongitude?: number | null } }>({
    queryKey: ["/api/player/me"],
  });

  const playerLat = profileData?.player?.lastLatitude ?? null;
  const playerLng = profileData?.player?.lastLongitude ?? null;

  const [travelTimeMap, setTravelTimeMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (playerLat == null || playerLng == null) return;
    const upcoming = (rawSessions || []).filter(s => {
      if (!s.session?.startTime) return false;
      return new Date(s.session.startTime) > new Date();
    });
    const locDests: Array<{ id: string; lat: number; lng: number }> = [];
    const seen = new Set<string>();
    for (const s of upcoming) {
      const lat = s.session?.locationLat;
      const lng = s.session?.locationLng;
      if (lat != null && lng != null) {
        const key = `${lat},${lng}`;
        if (!seen.has(key)) {
          seen.add(key);
          locDests.push({ id: key, lat, lng });
        }
      }
    }
    if (locDests.length === 0) return;
    const controller = new AbortController();
    const fetchTravelTimes = async () => {
      try {
        const destsJson = encodeURIComponent(JSON.stringify(locDests));
        const url = new URL(`/api/maps/distance-matrix?originLat=${playerLat}&originLng=${playerLng}&destinations=${destsJson}`, getApiUrl()).toString();
        const res = await fetch(url, { credentials: "include", headers: getAuthHeaders(), signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const newMap = new Map<string, number>();
        for (const r of data.results || []) {
          if (r.durationMinutes != null) {
            newMap.set(r.id, r.durationMinutes);
          }
        }
        setTravelTimeMap(newMap);
      } catch { }
    };
    fetchTravelTimes();
    return () => controller.abort();
  }, [playerLat, playerLng, rawSessions]);

  const createVacationMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string }) => {
      return apiRequest("/api/player/me/vacation", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      setShowVacationModal(false);
      setVacationStartDate(null);
      setVacationEndDate(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const cancelVacationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/player/me/vacation/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const attendanceStreak = profileData?.player?.attendanceStreak || 0;

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const allItems: ScheduledItem[] = useMemo(() => {
    const now = new Date();
    const items: ScheduledItem[] = [];
    
    const formatTime = (date: Date) => {
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${mins}`;
    };
    
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    if (rawSessions) {
      for (const s of rawSessions) {
        if (!s.session?.startTime) continue;
        const startDate = new Date(s.session.startTime);
        const endDate = s.session.endTime ? new Date(s.session.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);
        const isPast = startDate < now;
        const isCancelled = s.attendanceStatus === "cancelled";

        items.push({
          id: s.id,
          sessionId: s.sessionId,
          date: formatDate(startDate),
          startTime: formatTime(startDate),
          endTime: formatTime(endDate),
          type: (s.session.sessionType as any) || "private",
          title: s.session.title || getTypeLabel(s.session.sessionType),
          subtitle: s.coachName || "Coach",
          coachName: s.coachName || "Coach",
          courtName: s.session.courtName || "Court",
          locationId: s.session.locationId || null,
          locationName: s.session.locationName || null,
          locationAddress: s.session.locationAddress || null,
          locationLat: s.session.locationLat ?? null,
          locationLng: s.session.locationLng ?? null,
          status: isCancelled ? "cancelled" : (isPast ? "completed" : "upcoming"),
          attendanceStatus: s.attendanceStatus,
        });
      }
    }

    if (courtBookings) {
      for (const b of courtBookings) {
        const bookingDate = new Date(b.date);
        const isPast = bookingDate < now;
        items.push({
          id: `court-${b.id}`,
          date: b.date.split('T')[0],
          startTime: b.startTime || "00:00",
          endTime: b.endTime || "01:00",
          type: "court",
          title: "Court Booking",
          subtitle: b.courtName || "Court",
          coachName: "",
          courtName: b.courtName || "Court",
          status: b.status === "cancelled" ? "cancelled" : (isPast ? "completed" : "upcoming"),
        });
      }
    }

    if (matches) {
      for (const m of matches) {
        const matchDate = new Date(m.matchDate);
        const isPast = matchDate < now;
        items.push({
          id: `match-${m.id}`,
          date: m.matchDate.split('T')[0],
          startTime: m.matchTime || "00:00",
          endTime: m.matchTime ? addHour(m.matchTime) : "01:00",
          type: "match",
          title: m.matchType === "open" ? "Open Match" : "Match",
          subtitle: m.opponentName || m.courtName || "TBD",
          coachName: "",
          courtName: m.courtName || "Court",
          status: m.status === "cancelled" ? "cancelled" : (isPast ? "completed" : "upcoming"),
        });
      }
    }
    
    return items.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.startTime}`);
      const dateB = new Date(`${b.date}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    });
  }, [rawSessions, courtBookings, matches]);

  const addHour = (time: string) => {
    const [hours, mins] = time.split(':').map(Number);
    const newHours = (hours + 1) % 24;
    return `${newHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const allAttendanceRecords: AttendanceRecord[] = useMemo(() => {
    return allItems
      .filter(item => item.status === "completed" && (item.type === "private" || item.type === "group" || item.type === "semi_private"))
      .map(item => ({
        id: item.id,
        date: item.date,
        time: item.startTime,
        title: item.title,
        type: item.type,
        status: (item.attendanceStatus === "present" || item.attendanceStatus === "attended" ? "present" :
                item.attendanceStatus === "absent" || item.attendanceStatus === "no_show" ? "absent" :
                item.attendanceStatus === "late" ? "late" : "present") as any,
        coachName: item.coachName,
        courtName: item.courtName,
      }))
      .reverse();
  }, [allItems]);

  const filteredAttendanceRecords = useMemo(() => {
    const filterYear = attendanceFilterMonth.getFullYear();
    const filterMonth = attendanceFilterMonth.getMonth();
    return allAttendanceRecords.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate.getFullYear() === filterYear && recordDate.getMonth() === filterMonth;
    });
  }, [allAttendanceRecords, attendanceFilterMonth]);

  const attendanceStats = useMemo(() => {
    const lessons = allItems.filter(item => item.status === "completed" && (item.type === "private" || item.type === "group" || item.type === "semi_private"));
    const attended = lessons.filter(s => s.attendanceStatus === "present" || s.attendanceStatus === "attended").length;
    const missed = lessons.filter(s => s.attendanceStatus === "absent" || s.attendanceStatus === "no_show").length;
    const total = attended + missed;
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;
    
    return {
      totalSessions: lessons.length,
      attended,
      missed,
      percentage,
      streak: attendanceStreak,
    };
  }, [allItems, attendanceStreak]);

  const upcomingSessionLocations = useMemo(() => {
    const seen = new Set<string>();
    const locs: { id: string; name: string }[] = [];
    for (const item of allItems) {
      if (item.status === "upcoming" && item.locationName) {
        const key = item.locationId || item.locationName;
        if (!seen.has(key)) {
          seen.add(key);
          locs.push({ id: key, name: item.locationName });
        }
      }
    }
    return locs;
  }, [allItems]);

  const upcomingItems = useMemo(() => {
    const upcoming = allItems.filter(s => s.status === "upcoming");
    const filtered = selectedLocationFilter
      ? upcoming.filter(s => (s.locationId || s.locationName) === selectedLocationFilter)
      : upcoming;
    const limit = 5;
    const base = filtered.slice(0, limit);
    // Ensure a focused session (from home tap) is rendered even if it falls
    // outside the default visible window, so scroll-to-row can succeed.
    if (focusSessionId) {
      const inBase = base.some(i => (i.sessionId || i.id) === focusSessionId);
      if (!inBase) {
        const target = filtered.find(i => (i.sessionId || i.id) === focusSessionId);
        if (target) base.push(target);
      }
    }
    return base;
  }, [allItems, selectedLocationFilter, focusSessionId]);

  const nextSession = upcomingItems.find(i => i.type !== "court" && i.type !== "match");

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    return allItems.filter(s => s.date.startsWith(monthStr) && s.status !== "cancelled").length;
  }, [allItems]);

  const isDateInVacation = (date: Date): boolean => {
    if (!vacationData?.holidays?.length) return false;
    const dateStr = formatLocalDate(date);
    return vacationData.holidays.some(h => {
      const start = h.startDate.split('T')[0];
      const end = h.endDate.split('T')[0];
      return dateStr >= start && dateStr <= end;
    });
  };

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: CalendarDay[] = [];

    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        isVacation: false,
        items: [],
      });
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateStr = formatLocalDate(date);
      const dayItems = allItems.filter((s) => s.date === dateStr);
      const selectedStr = formatLocalDate(selectedDate);
      
      days.push({
        date,
        isCurrentMonth: true,
        isToday: formatLocalDate(date) === formatLocalDate(today),
        isSelected: dateStr === selectedStr,
        isVacation: isDateInVacation(date),
        items: dayItems,
      });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        isVacation: false,
        items: [],
      });
    }

    return days;
  }, [currentMonth, allItems, selectedDate, vacationData]);

  const selectedDateItems = useMemo(() => {
    const dateStr = formatLocalDate(selectedDate);
    return allItems.filter((s) => s.date === dateStr);
  }, [selectedDate, allItems]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "private": return ProTennisColors.neonGreen;
      case "group": return ProTennisColors.gold;
      case "semi_private": return ProTennisColors.neonOrange;
      case "court": return ProTennisColors.neonCyan;
      case "match": return ProTennisColors.neonPurple;
      default: return ProTennisColors.neonCyan;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "private": return t("player.schedule.privateLessonLabel");
      case "group": return t("player.schedule.groupLessonLabel");
      case "semi_private": return t("player.schedule.semiPrivateLabel");
      case "court": return t("player.schedule.courtBookingLabel");
      case "match": return t("player.schedule.matchLabel");
      default: return t("player.schedule.trainingLabel");
    }
  };

  const getNextSessionCountdown = () => {
    if (!nextSession) return null;
    const sessionDate = new Date(`${nextSession.date}T${nextSession.startTime}`);
    const now = new Date();
    const diff = sessionDate.getTime() - now.getTime();
    
    if (diff < 0) return "Now";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "Soon";
  };

  const navigateMonth = (direction: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
  };

  const handleDayPress = (day: CalendarDay) => {
    if (!day.isCurrentMonth) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(day.date);
  };

  const openWithSportPicker = (dest: "LessonBooking" | "CourtBooking" | "OpenMatches") => {
    if (isMultiSport && activeSports.length > 1) {
      setSportPickerDestination(dest);
      setShowSportPickerModal(true);
    } else {
      if (dest === "OpenMatches") {
        navigation.navigate("Play", { screen: "OpenMatches" });
      } else if (dest === "LessonBooking") {
        navigation.navigate("LessonBooking", { sport: activeSport });
      } else {
        navigation.navigate(dest);
      }
    }
  };

  const handleBookLesson = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openWithSportPicker("LessonBooking");
  };

  const handleBookCourt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openWithSportPicker("CourtBooking");
  };

  const handleFindMatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openWithSportPicker("OpenMatches");
  };

  const handleSportPicked = (sport: Sport) => {
    setActiveSport(sport);
    setShowSportPickerModal(false);
    if (sportPickerDestination === "OpenMatches") {
      navigation.navigate("Play", { screen: "OpenMatches" });
    } else if (sportPickerDestination === "LessonBooking") {
      navigation.navigate("LessonBooking", { sport });
    } else {
      navigation.navigate(sportPickerDestination);
    }
  };

  const handleSetVacation = () => {
    track("schedule:vacation_mode");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowVacationModal(true);
  };

  const handleSaveVacation = () => {
    if (!vacationStartDate || !vacationEndDate) {
      Alert.alert("Missing Dates", "Please select both start and end dates.");
      return;
    }
    if (vacationEndDate < vacationStartDate) {
      Alert.alert("Invalid Dates", "End date must be after start date.");
      return;
    }
    createVacationMutation.mutate({
      startDate: vacationStartDate.toISOString(),
      endDate: vacationEndDate.toISOString(),
    });
  };

  const handleCancelVacation = (id: string) => {
    Alert.alert(
      "Cancel Vacation",
      "Are you sure you want to cancel this vacation period?",
      [
        { text: "Keep", style: "cancel" },
        { text: "Cancel Vacation", style: "destructive", onPress: () => cancelVacationMutation.mutate(id) },
      ]
    );
  };

  const formatSelectedDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const selectedStr = formatLocalDate(selectedDate);
    const todayStr = formatLocalDate(today);
    const tomorrowStr = formatLocalDate(tomorrow);
    
    if (selectedStr === todayStr) return "Today";
    if (selectedStr === tomorrowStr) return "Tomorrow";
    
    return selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const formatVacationDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getAttendanceColor = (status: string) => {
    switch (status) {
      case "present": return ProTennisColors.neonGreen;
      case "absent": return ProTennisColors.error;
      case "late": return ProTennisColors.neonOrange;
      case "vacation": return ProTennisColors.vacationBlue;
      default: return ProTennisColors.textMuted;
    }
  };

  const { data: icsTokenData } = useQuery<{ token: string }>({
    queryKey: ["/api/player/me/calendar-token"],
    enabled: !!playerId,
  });

  const getIcsUrl = (): string | null => {
    if (!playerId || !icsTokenData?.token) return null;
    const base = getApiUrl();
    return new URL(`/api/player/calendar/${playerId}/sessions.ics?token=${icsTokenData.token}`, base).toString();
  };

  const handleOpenCalendarSubscribe = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCalendarModal(true);
  };

  const handleSubscribeGoogleCalendar = async () => {
    const url = getIcsUrl();
    if (!url) { Alert.alert("Not ready", "Your calendar link is loading."); return; }
    const gcalUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`;
    await Linking.openURL(gcalUrl);
  };

  const handleSubscribeAppleCalendar = async () => {
    const url = getIcsUrl();
    if (!url) { Alert.alert("Not ready", "Your calendar link is loading."); return; }
    const webcalUrl = url.replace(/^https?:\/\//, "webcal://");
    await Linking.openURL(webcalUrl);
  };

  const handleCopyCalendarLink = async () => {
    const url = getIcsUrl();
    if (!url) { Alert.alert("Not ready", "Your calendar link is loading."); return; }
    await Clipboard.setStringAsync(url);
    setCalendarLinkCopied(true);
    setTimeout(() => setCalendarLinkCopied(false), 2500);
  };

  const handleAddSessionToCalendar = async (item: ScheduledItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow calendar access to add sessions.");
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      let calendarId: string | null = null;
      if (Platform.OS === "ios") {
        const defaultCal = calendars.find((c) => c.allowsModifications && c.source?.name === "Default") || calendars.find((c) => c.allowsModifications);
        calendarId = defaultCal?.id || null;
      } else {
        const primary = calendars.find((c) => c.isPrimary && c.allowsModifications) || calendars.find((c) => c.allowsModifications);
        calendarId = primary?.id || null;
      }

      if (!calendarId) {
        Alert.alert("No Calendar", "Could not find a writable calendar on your device.");
        return;
      }

      const startDate = new Date(`${item.date}T${item.startTime}`);
      const endDate = new Date(`${item.date}T${item.endTime}`);
      const description = item.coachName ? `Coach: ${item.coachName}` : "";

      await Calendar.createEventAsync(calendarId, {
        title: item.title,
        startDate,
        endDate,
        location: item.locationAddress || item.locationName || item.courtName || undefined,
        notes: description,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Added to Calendar", `"${item.title}" has been added to your calendar.`);
    } catch (error) {
      console.error("[Calendar] Add event error:", error);
      Alert.alert("Error", "Could not add the session to your calendar.");
    }
  };

  if (sessionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={ProTennisColors.neonCyan} />
        <Text style={styles.loadingText}>{t("player.schedule.loadingSchedule")}</Text>
      </View>
    );
  }

  if (isGuest) {
    type GuestIconName = React.ComponentProps<typeof Ionicons>["name"];
    const guestFeatures: Array<{ icon: GuestIconName; text: string }> = [
      { icon: "calendar-outline", text: "View & track your upcoming sessions" },
      { icon: "airplane-outline", text: "Log vacation & holiday blocks" },
      { icon: "stats-chart-outline", text: "See your attendance stats & streaks" },
      { icon: "link-outline", text: "Sync sessions to your calendar" },
    ];
    return (
      <View style={[styles.container, styles.centered, styles.guestContainer]}>
        <View style={styles.guestAvatarRing}>
          <Ionicons name="calendar" size={52} color={Colors.dark.primary} />
        </View>
        <Text style={styles.guestBrand}>Glow Up Sports</Text>
        <Text style={styles.guestTitle}>Browsing as Guest</Text>
        <Text style={styles.guestSubtitle}>Sign in to see your full schedule</Text>
        <View style={styles.guestFeatureList}>
          {guestFeatures.map((f) => (
            <View key={f.text} style={styles.guestFeatureRow}>
              <Ionicons name={f.icon} size={18} color={Colors.dark.primary} />
              <Text style={styles.guestFeatureText}>{f.text}</Text>
            </View>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.guestCta, { opacity: pressed ? 0.85 : 1 }]}
          onPress={logout}
        >
          <LinearGradient
            colors={[Colors.dark.primary, "#9AE66E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.guestCtaGradient}
          >
            <Ionicons name="person-add-outline" size={20} color={Colors.dark.buttonText} />
            <Text style={styles.guestCtaText}>Create Account / Sign In</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  if (sessionsError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={48} color={ProTennisColors.error} />
        <Text style={styles.errorText}>{t("player.schedule.unableToLoadSchedule")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 180 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={styles.screenTitleRow}>
            <Text style={styles.screenTitle}>My Schedule</Text>
            <Pressable style={styles.calendarHeaderBtn} onPress={handleOpenCalendarSubscribe}>
              <Feather name="calendar" size={20} color={ProTennisColors.neonCyan} />
            </Pressable>
          </View>
          {isMultiSport ? <SportSwitcherChips style={{ marginTop: Spacing.sm, marginBottom: Spacing.xs }} /> : null}
        </Animated.View>

        <FamilyChildSwitcher />

        <LessonBalanceCard
          playerId={playerId}
          onBuyCredits={() => {
            if (playerId) {
              navigation.navigate("ParentCreditStore", { playerId });
            }
          }}
        />

        <NextLessonCard
          nextSession={nextSession}
          onBookLesson={handleBookLesson}
          getTypeLabel={getTypeLabel}
          getTypeColor={getTypeColor}
        />

        <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <View style={styles.quickActionsRow}>
              <QuickActionButton icon="book" label={t("player.schedule.bookLesson")} color={ProTennisColors.neonGreen} onPress={handleBookLesson} />
              <QuickActionButton icon="grid" label={t("player.schedule.bookCourt")} color={ProTennisColors.neonCyan} onPress={handleBookCourt} />
              <QuickActionButton icon="users" label={t("player.schedule.findMatch")} color={ProTennisColors.neonPurple} onPress={handleFindMatch} />
              <QuickActionButton icon="sun" label={t("player.schedule.vacation")} color={ProTennisColors.vacationBlue} onPress={handleSetVacation} />
            </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatCard
              icon="check-circle"
              label={t("player.schedule.attendance")}
              value={`${attendanceStats.percentage}%`}
              color={attendanceStats.percentage >= 80 ? ProTennisColors.neonGreen : ProTennisColors.neonOrange}
              subtext={`${attendanceStats.streak} ${t("player.schedule.streak")}`}
            />
          </ScrollView>
        </Animated.View>

        {(vacationData?.activeVacation || vacationData?.upcomingVacation) ? (
          <Animated.View entering={FadeInDown.delay(250).duration(400)}>
            <NeonBorderCard accentColor={ProTennisColors.vacationBlue}>
              <View style={styles.vacationCard}>
                <View style={styles.vacationHeader}>
                  <View style={styles.vacationIconContainer}>
                    <Feather name="sun" size={20} color={ProTennisColors.vacationBlue} />
                  </View>
                  <View style={styles.vacationInfo}>
                    <Text style={styles.vacationTitle}>
                      {vacationData.activeVacation ? t("player.schedule.onVacation") : t("player.schedule.upcomingVacation")}
                    </Text>
                    <Text style={styles.vacationDates}>
                      {formatVacationDate(vacationData.activeVacation?.startDate || vacationData.upcomingVacation!.startDate)} - {formatVacationDate(vacationData.activeVacation?.endDate || vacationData.upcomingVacation!.endDate)}
                    </Text>
                  </View>
                  <Pressable 
                    style={styles.vacationCancelButton}
                    onPress={() => handleCancelVacation(vacationData.activeVacation?.id || vacationData.upcomingVacation!.id)}
                  >
                    <Feather name="x" size={18} color={ProTennisColors.error} />
                  </Pressable>
                </View>
              </View>
            </NeonBorderCard>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <NeonBorderCard accentColor={ProTennisColors.neonPurple} style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => navigateMonth(-1)} style={styles.monthNavButton}>
                <Feather name="chevron-left" size={24} color={ProTennisColors.white} />
              </Pressable>
              <Text style={styles.monthTitle}>
                {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
              </Text>
              <Pressable onPress={() => navigateMonth(1)} style={styles.monthNavButton}>
                <Feather name="chevron-right" size={24} color={ProTennisColors.white} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <Text key={day} style={styles.weekdayLabel}>{day}</Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day, index) => {
                const hasLesson = day.items.some(s => s.type === "private" || s.type === "group" || s.type === "semi_private");
                const hasCourt = day.items.some(s => s.type === "court");
                const hasMatch = day.items.some(s => s.type === "match");
                
                return (
                  <Pressable
                    key={index}
                    style={[
                      styles.calendarDay,
                      !day.isCurrentMonth && styles.calendarDayOtherMonth,
                      day.isToday && styles.calendarDayToday,
                      day.isSelected && styles.calendarDaySelected,
                      day.isVacation && styles.calendarDayVacation,
                    ]}
                    onPress={() => handleDayPress(day)}
                  >
                    <Text style={[
                      styles.calendarDayText,
                      !day.isCurrentMonth && styles.calendarDayTextOther,
                      day.isToday && styles.calendarDayTextToday,
                      day.isSelected && styles.calendarDayTextSelected,
                    ]}>
                      {day.date.getDate()}
                    </Text>
                    {day.items.length > 0 && day.isCurrentMonth ? (
                      <View style={styles.sessionDots}>
                        {hasLesson ? <View style={[styles.sessionDot, { backgroundColor: ProTennisColors.neonGreen }]} /> : null}
                        {hasCourt ? <View style={[styles.sessionDot, { backgroundColor: ProTennisColors.neonCyan }]} /> : null}
                        {hasMatch ? <View style={[styles.sessionDot, { backgroundColor: ProTennisColors.neonPurple }]} /> : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ProTennisColors.neonGreen }]} />
                <Text style={styles.legendText}>{t("player.schedule.lesson")}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ProTennisColors.neonCyan }]} />
                <Text style={styles.legendText}>{t("player.schedule.court")}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ProTennisColors.neonPurple }]} />
                <Text style={styles.legendText}>{t("player.schedule.matchLabel")}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: ProTennisColors.vacationBlue }]} />
                <Text style={styles.legendText}>{t("player.schedule.vacation")}</Text>
              </View>
            </View>
          </NeonBorderCard>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{formatSelectedDate()}</Text>
            <Text style={styles.sectionCount}>{selectedDateItems.length} {selectedDateItems.length === 1 ? t("player.schedule.item") : t("player.schedule.items")}</Text>
          </View>

          {selectedDateItems.length === 0 ? (
            <GuidedEmptyState
              icon="calendar-outline"
              title={t("player.schedule.noSessionsYet")}
              description={t("player.schedule.noSessionsDesc")}
              tips={[
                t("player.schedule.askCoachAboutSessions"),
                t("player.schedule.checkOpenSessions"),
                t("player.schedule.sessionsUpdateAutomatically"),
              ]}
              actionLabel={t("player.schedule.bookLesson")}
              onAction={handleBookLesson}
              compact
            />
          ) : (
            <View style={styles.sessionsList}>
              {selectedDateItems.map((item, index) => (
                <Animated.View key={item.id} entering={FadeIn.delay(index * 100).duration(300)}>
                  <NeonBorderCard accentColor={getTypeColor(item.type)} style={styles.sessionCard}>
                    <View style={styles.sessionCardContent}>
                      <View style={styles.sessionTime}>
                        <Text style={styles.sessionTimeText}>{item.startTime}</Text>
                        <View style={styles.sessionTimeLine} />
                        <Text style={styles.sessionTimeText}>{item.endTime}</Text>
                      </View>
                      <View style={styles.sessionInfo}>
                        <View style={[styles.sessionTypeBadge, { backgroundColor: getTypeColor(item.type) + "25" }]}>
                          <Text style={[styles.sessionTypeText, { color: getTypeColor(item.type) }]}>
                            {getTypeLabel(item.type)}
                          </Text>
                        </View>
                        <Text style={styles.sessionTitle}>{item.title}</Text>
                        <View style={styles.sessionMeta}>
                          <Feather name={item.type === "court" ? "map-pin" : item.type === "match" ? "users" : "user"} size={12} color={ProTennisColors.textSecondary} />
                          <Text style={styles.sessionMetaText}>{item.subtitle}</Text>
                        </View>
                        {(item.locationName || item.locationAddress || item.locationLat) ? (
                          <Pressable
                            style={styles.sessionMeta}
                            onPress={() => openDirections({ lat: item.locationLat, lng: item.locationLng, label: item.locationName, address: item.locationAddress })}
                          >
                            <Feather name="navigation" size={12} color={item.locationLat ? ProTennisColors.neonGreen : ProTennisColors.neonCyan} />
                            <Text style={[styles.sessionMetaText, { color: item.locationLat ? ProTennisColors.neonGreen : ProTennisColors.neonCyan }]}>
                              {item.locationAddress || item.locationName}
                            </Text>
                            {item.locationLat != null && item.locationLng != null && travelTimeMap.get(`${item.locationLat},${item.locationLng}`) != null ? (
                              <View style={styles.travelTimePill}>
                                <Feather name="clock" size={9} color={ProTennisColors.neonCyan} />
                                <Text style={styles.travelTimePillText}>~{travelTimeMap.get(`${item.locationLat},${item.locationLng}`)} min</Text>
                              </View>
                            ) : null}
                          </Pressable>
                        ) : null}
                        {item.status === "upcoming" && (item.locationLat || item.locationAddress || item.locationName) ? (
                          <Pressable
                            style={styles.getDirectionsButton}
                            onPress={() => openDirections({ lat: item.locationLat, lng: item.locationLng, label: item.locationName, address: item.locationAddress })}
                          >
                            <Feather name="map-pin" size={11} color={ProTennisColors.midnightBlue} />
                            <Text style={styles.getDirectionsText}>Get Directions</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {item.status === "completed" ? (
                        <View style={[styles.sessionStatus, { backgroundColor: ProTennisColors.neonGreen + "20" }]}>
                          <Feather name="check" size={16} color={ProTennisColors.neonGreen} />
                        </View>
                      ) : item.status === "cancelled" ? (
                        <View style={[styles.sessionStatus, { backgroundColor: ProTennisColors.error + "20" }]}>
                          <Feather name="x" size={16} color={ProTennisColors.error} />
                        </View>
                      ) : (
                        <View style={[styles.sessionStatus, { backgroundColor: getTypeColor(item.type) + "20" }]}>
                          <Feather name="clock" size={16} color={getTypeColor(item.type)} />
                        </View>
                      )}
                    </View>
                  </NeonBorderCard>
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>

        {upcomingItems.length > 0 || upcomingSessionLocations.length > 1 ? (
          <Animated.View
            entering={FadeInDown.delay(500).duration(400)}
            onLayout={(e) => { upcomingListOffset.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("player.schedule.upcoming")}</Text>
              <Text style={styles.sectionCount}>{upcomingItems.length} scheduled</Text>
            </View>
            {upcomingSessionLocations.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.locationFilterScroll}
              >
                <Pressable
                  style={[styles.locationFilterChip, selectedLocationFilter === null && styles.locationFilterChipActive]}
                  onPress={() => setSelectedLocationFilter(null)}
                >
                  <Text style={[styles.locationFilterChipText, selectedLocationFilter === null && styles.locationFilterChipTextActive]}>All</Text>
                </Pressable>
                {upcomingSessionLocations.map((loc) => (
                  <Pressable
                    key={loc.id}
                    style={[styles.locationFilterChip, selectedLocationFilter === loc.id && styles.locationFilterChipActive]}
                    onPress={() => setSelectedLocationFilter(selectedLocationFilter === loc.id ? null : loc.id)}
                  >
                    <Feather name="map-pin" size={12} color={selectedLocationFilter === loc.id ? ProTennisColors.neonGreen : ProTennisColors.textSecondary} />
                    <Text style={[styles.locationFilterChipText, selectedLocationFilter === loc.id && styles.locationFilterChipTextActive]} numberOfLines={1}>{loc.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.upcomingList}>
              {upcomingItems.map((item, index) => (
                <View
                  key={item.id}
                  style={styles.upcomingItem}
                  onLayout={(e) => handleUpcomingItemLayout(item.sessionId || item.id, e.nativeEvent.layout.y)}
                >
                  <View style={[styles.upcomingDot, { backgroundColor: getTypeColor(item.type) }]} />
                  <View style={styles.upcomingInfo}>
                    <Text style={styles.upcomingTitle}>{item.title}</Text>
                    <Text style={styles.upcomingMeta}>
                      {new Date(item.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {item.startTime}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.addToCalBtn}
                    onPress={() => handleAddSessionToCalendar(item)}
                  >
                    <Feather name="calendar" size={16} color={ProTennisColors.neonCyan} />
                  </Pressable>
                  <View style={[styles.upcomingBadge, { backgroundColor: getTypeColor(item.type) + "20" }]}>
                    <Text style={[styles.upcomingBadgeText, { color: getTypeColor(item.type) }]}>
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1).replace('_', '-')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(600).duration(400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("player.schedule.attendanceHistory")}</Text>
          </View>
          <NeonBorderCard accentColor={ProTennisColors.neonGreen} onPress={() => { track("schedule:session_detail"); setShowAttendanceModal(true); }}>
            <View style={styles.attendanceStats}>
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceValue, { color: ProTennisColors.neonGreen }]}>{attendanceStats.attended}</Text>
                <Text style={styles.attendanceLabel}>{t("player.schedule.attended")}</Text>
              </View>
              <View style={styles.attendanceDivider} />
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceValue, { color: ProTennisColors.error }]}>{attendanceStats.missed}</Text>
                <Text style={styles.attendanceLabel}>{t("player.schedule.missed")}</Text>
              </View>
              <View style={styles.attendanceDivider} />
              <View style={styles.attendanceStat}>
                <Text style={[styles.attendanceValue, { color: ProTennisColors.gold }]}>{attendanceStats.streak}</Text>
                <Text style={styles.attendanceLabel}>{t("player.schedule.streak")}</Text>
              </View>
            </View>
            <View style={styles.attendanceProgressContainer}>
              <View style={styles.attendanceProgressBg}>
                <LinearGradient
                  colors={[ProTennisColors.neonGreen, ProTennisColors.neonCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.attendanceProgressFill, { width: `${attendanceStats.percentage}%` }]}
                />
              </View>
              <View style={styles.attendanceTapRow}>
                <Text style={styles.attendancePercentage}>{attendanceStats.percentage}% {t("player.schedule.attendanceRate")}</Text>
                <View style={styles.attendanceTapHint}>
                  <Feather name="chevron-right" size={16} color={ProTennisColors.neonGreen} />
                  <Text style={styles.attendanceTapText}>{t("player.schedule.seeAll")}</Text>
                </View>
              </View>
            </View>
          </NeonBorderCard>
        </Animated.View>
      </ScrollView>

      <Modal
        visible={showVacationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVacationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("player.schedule.setVacation")}</Text>
              <Pressable onPress={() => setShowVacationModal(false)}>
                <Feather name="x" size={24} color={ProTennisColors.white} />
              </Pressable>
            </View>
            
            <Text style={styles.modalSubtitle}>{t("player.schedule.lessonsWillBePaused")}</Text>

            <Pressable style={styles.datePickerButton} onPress={() => setShowStartPicker(true)}>
              <Feather name="calendar" size={18} color={ProTennisColors.neonCyan} />
              <Text style={styles.datePickerLabel}>{t("player.schedule.startDate")}</Text>
              <Text style={styles.datePickerValue}>
                {vacationStartDate ? vacationStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : t("player.schedule.selectDate")}
              </Text>
            </Pressable>

            {showStartPicker ? (
              <DateTimePicker
                value={vacationStartDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={(event, date) => {
                  setShowStartPicker(Platform.OS === "ios");
                  if (date) setVacationStartDate(date);
                }}
                themeVariant="dark"
              />
            ) : null}

            <Pressable style={styles.datePickerButton} onPress={() => setShowEndPicker(true)}>
              <Feather name="calendar" size={18} color={ProTennisColors.neonCyan} />
              <Text style={styles.datePickerLabel}>{t("player.schedule.endDate")}</Text>
              <Text style={styles.datePickerValue}>
                {vacationEndDate ? vacationEndDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : t("player.schedule.selectDate")}
              </Text>
            </Pressable>

            {showEndPicker ? (
              <DateTimePicker
                value={vacationEndDate || vacationStartDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={vacationStartDate || new Date()}
                onChange={(event, date) => {
                  setShowEndPicker(Platform.OS === "ios");
                  if (date) setVacationEndDate(date);
                }}
                themeVariant="dark"
              />
            ) : null}

            <Pressable 
              style={[styles.saveVacationButton, (!vacationStartDate || !vacationEndDate) && styles.saveVacationButtonDisabled]}
              onPress={handleSaveVacation}
              disabled={!vacationStartDate || !vacationEndDate || createVacationMutation.isPending}
            >
              <LinearGradient
                colors={[ProTennisColors.vacationBlue, "#2196F3"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveVacationButtonGradient}
              >
                {createVacationMutation.isPending ? (
                  <ActivityIndicator color={ProTennisColors.white} />
                ) : (
                  <>
                    <Feather name="sun" size={18} color={ProTennisColors.white} />
                    <Text style={styles.saveVacationButtonText}>{t("player.schedule.setVacation")}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAttendanceModal}
        animationType="slide"
        onRequestClose={() => setShowAttendanceModal(false)}
      >
        <View style={styles.attendanceModalContainer}>
          <View style={[styles.attendanceModalHeader, { paddingTop: insets.top + Spacing.md }]}>
            <View style={styles.attendanceModalTitleRow}>
              <Text style={styles.attendanceModalTitle}>{t("player.schedule.attendanceHistory")}</Text>
              <Pressable onPress={() => setShowAttendanceModal(false)} style={styles.attendanceModalClose}>
                <Feather name="x" size={24} color={ProTennisColors.white} />
              </Pressable>
            </View>
            <View style={styles.attendanceMonthNav}>
              <Pressable 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAttendanceFilterMonth(new Date(attendanceFilterMonth.getFullYear(), attendanceFilterMonth.getMonth() - 1, 1));
                }} 
                style={styles.attendanceMonthButton}
              >
                <Feather name="chevron-left" size={24} color={ProTennisColors.white} />
              </Pressable>
              <Text style={styles.attendanceMonthTitle}>
                {attendanceFilterMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </Text>
              <Pressable 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAttendanceFilterMonth(new Date(attendanceFilterMonth.getFullYear(), attendanceFilterMonth.getMonth() + 1, 1));
                }} 
                style={styles.attendanceMonthButton}
              >
                <Feather name="chevron-right" size={24} color={ProTennisColors.white} />
              </Pressable>
            </View>
            <View style={styles.attendanceModalStats}>
              <View style={styles.attendanceModalStatItem}>
                <Text style={[styles.attendanceModalStatValue, { color: ProTennisColors.neonGreen }]}>
                  {filteredAttendanceRecords.filter(r => r.status === "present").length}
                </Text>
                <Text style={styles.attendanceModalStatLabel}>{t("player.schedule.present")}</Text>
              </View>
              <View style={styles.attendanceModalStatItem}>
                <Text style={[styles.attendanceModalStatValue, { color: ProTennisColors.error }]}>
                  {filteredAttendanceRecords.filter(r => r.status === "absent").length}
                </Text>
                <Text style={styles.attendanceModalStatLabel}>{t("player.schedule.absent")}</Text>
              </View>
              <View style={styles.attendanceModalStatItem}>
                <Text style={[styles.attendanceModalStatValue, { color: ProTennisColors.neonOrange }]}>
                  {filteredAttendanceRecords.filter(r => r.status === "late").length}
                </Text>
                <Text style={styles.attendanceModalStatLabel}>{t("player.schedule.late")}</Text>
              </View>
              <View style={styles.attendanceModalStatItem}>
                <Text style={[styles.attendanceModalStatValue, { color: ProTennisColors.white }]}>
                  {filteredAttendanceRecords.length}
                </Text>
                <Text style={styles.attendanceModalStatLabel}>{t("player.schedule.total")}</Text>
              </View>
            </View>
          </View>
          <ScrollView 
            style={styles.attendanceModalList}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            showsVerticalScrollIndicator={false}
          >
            {filteredAttendanceRecords.length === 0 ? (
              <View style={styles.attendanceEmptyState}>
                <Feather name="calendar" size={48} color={ProTennisColors.textMuted} />
                <Text style={styles.attendanceEmptyText}>{t("player.schedule.noLessonsIn")} {attendanceFilterMonth.toLocaleDateString("en-US", { month: "long" })}</Text>
              </View>
            ) : (
              filteredAttendanceRecords.map((record, index) => (
                <Animated.View key={record.id} entering={FadeIn.delay(index * 50).duration(200)}>
                  <View style={styles.attendanceRecordCard}>
                    <View style={[styles.attendanceRecordStatus, { backgroundColor: getAttendanceColor(record.status) }]} />
                    <View style={styles.attendanceRecordContent}>
                      <View style={styles.attendanceRecordTop}>
                        <Text style={styles.attendanceRecordTitle}>{record.title}</Text>
                        <View style={[styles.attendanceRecordBadge, { backgroundColor: getAttendanceColor(record.status) + "20" }]}>
                          <Text style={[styles.attendanceRecordBadgeText, { color: getAttendanceColor(record.status) }]}>
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.attendanceRecordDetails}>
                        <View style={styles.attendanceRecordDetail}>
                          <Feather name="calendar" size={12} color={ProTennisColors.textSecondary} />
                          <Text style={styles.attendanceRecordDetailText}>
                            {new Date(record.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          </Text>
                        </View>
                        <View style={styles.attendanceRecordDetail}>
                          <Feather name="clock" size={12} color={ProTennisColors.textSecondary} />
                          <Text style={styles.attendanceRecordDetailText}>{record.time}</Text>
                        </View>
                        {record.coachName ? (
                          <View style={styles.attendanceRecordDetail}>
                            <Feather name="user" size={12} color={ProTennisColors.textSecondary} />
                            <Text style={styles.attendanceRecordDetailText}>{record.coachName}</Text>
                          </View>
                        ) : null}
                        {record.courtName ? (
                          <View style={styles.attendanceRecordDetail}>
                            <Feather name="map-pin" size={12} color={ProTennisColors.textSecondary} />
                            <Text style={styles.attendanceRecordDetailText}>{record.courtName}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </Animated.View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showSportPickerModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSportPickerModal(false)}
      >
        <View style={styles.sportPickerOverlay}>
          <View style={styles.sportPickerSheet}>
            <Text style={styles.sportPickerTitle}>
              {sportPickerDestination === "LessonBooking"
                ? "Book Lesson In"
                : sportPickerDestination === "CourtBooking"
                ? "Book Court In"
                : "Find a Match In"}
            </Text>
            {SPORT_DEFINITIONS.filter(s => activeSports.includes(s.key)).map(sport => (
              <Pressable
                key={sport.key}
                style={[styles.sportPickerOption, activeSport === sport.key && { borderColor: getSportColor(sport.key) }]}
                onPress={() => handleSportPicked(sport.key)}
              >
                <View style={[styles.sportPickerDot, { backgroundColor: getSportColor(sport.key) }]} />
                <Text style={[styles.sportPickerOptionText, activeSport === sport.key && { color: getSportColor(sport.key) }]}>
                  {getSportLabel(sport.key)}
                </Text>
                {activeSport === sport.key ? (
                  <Feather name="check" size={18} color={getSportColor(sport.key)} />
                ) : null}
              </Pressable>
            ))}
            <Pressable style={styles.sportPickerCancel} onPress={() => setShowSportPickerModal(false)}>
              <Text style={styles.sportPickerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCalendarModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <Pressable style={styles.calendarModalOverlay} onPress={() => setShowCalendarModal(false)}>
          <Pressable style={[styles.calendarModalSheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={() => {}}>
            <View style={styles.calendarModalHandle} />
            <View style={styles.calendarModalHeader}>
              <Feather name="calendar" size={22} color={ProTennisColors.neonCyan} />
              <Text style={styles.calendarModalTitle}>Sync My Sessions</Text>
            </View>
            <Text style={styles.calendarModalSubtitle}>
              Subscribe to get all your upcoming sessions automatically in your calendar.
            </Text>

            <Pressable style={styles.calendarOptionBtn} onPress={handleSubscribeGoogleCalendar}>
              <View style={[styles.calendarOptionIcon, { backgroundColor: "#4285F420" }]}>
                <Feather name="globe" size={20} color="#4285F4" />
              </View>
              <View style={styles.calendarOptionInfo}>
                <Text style={styles.calendarOptionTitle}>Subscribe in Google Calendar</Text>
                <Text style={styles.calendarOptionDesc}>Opens Google Calendar to add your session feed</Text>
              </View>
              <Feather name="chevron-right" size={18} color={ProTennisColors.textMuted} />
            </Pressable>

            <Pressable style={styles.calendarOptionBtn} onPress={handleSubscribeAppleCalendar}>
              <View style={[styles.calendarOptionIcon, { backgroundColor: ProTennisColors.neonGreen + "20" }]}>
                <Feather name="smartphone" size={20} color={ProTennisColors.neonGreen} />
              </View>
              <View style={styles.calendarOptionInfo}>
                <Text style={styles.calendarOptionTitle}>Subscribe in Apple Calendar</Text>
                <Text style={styles.calendarOptionDesc}>Opens Apple Calendar to subscribe on iOS</Text>
              </View>
              <Feather name="chevron-right" size={18} color={ProTennisColors.textMuted} />
            </Pressable>

            <Pressable style={styles.calendarOptionBtn} onPress={handleCopyCalendarLink}>
              <View style={[styles.calendarOptionIcon, { backgroundColor: ProTennisColors.neonPurple + "20" }]}>
                <Feather name={calendarLinkCopied ? "check" : "link"} size={20} color={calendarLinkCopied ? ProTennisColors.neonGreen : ProTennisColors.neonPurple} />
              </View>
              <View style={styles.calendarOptionInfo}>
                <Text style={styles.calendarOptionTitle}>{calendarLinkCopied ? "Copied!" : "Copy Calendar Link"}</Text>
                <Text style={styles.calendarOptionDesc}>Paste into any calendar app that supports ICS</Text>
              </View>
              {calendarLinkCopied ? (
                <Feather name="check" size={18} color={ProTennisColors.neonGreen} />
              ) : (
                <Feather name="copy" size={18} color={ProTennisColors.textMuted} />
              )}
            </Pressable>

            <Pressable style={styles.calendarModalClose} onPress={() => setShowCalendarModal(false)}>
              <Text style={styles.calendarModalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ProTennisColors.midnightBlue,
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: ProTennisColors.textSecondary,
    fontSize: 14,
  },
  errorText: {
    marginTop: Spacing.md,
    color: ProTennisColors.error,
    fontSize: 16,
    fontWeight: "600",
  },
  guestContainer: {
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  guestAvatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "60",
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  guestBrand: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Colors.dark.primary,
    textAlign: "center",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: TextColors.primary,
    textAlign: "center",
  },
  guestSubtitle: {
    fontSize: 14,
    color: ProTennisColors.textSecondary,
    textAlign: "center",
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  guestFeatureList: {
    width: "100%",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  guestFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  guestFeatureText: {
    fontSize: 15,
    color: TextColors.primary,
    flex: 1,
  },
  guestCta: {
    width: "100%",
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  guestCtaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  guestCtaText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.dark.buttonText,
  },
  screenTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: Spacing.lg,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: ProTennisColors.white,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  calendarHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ProTennisColors.neonCyan + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  addToCalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ProTennisColors.neonCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.xs,
  },
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  calendarModalSheet: {
    backgroundColor: ProTennisColors.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  calendarModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: ProTennisColors.border,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  calendarModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  calendarModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  calendarModalSubtitle: {
    fontSize: 13,
    color: ProTennisColors.textSecondary,
    marginBottom: Spacing.lg,
  },
  calendarOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  calendarOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarOptionInfo: {
    flex: 1,
  },
  calendarOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  calendarOptionDesc: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    marginTop: 2,
  },
  calendarModalClose: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
  calendarModalCloseText: {
    fontSize: 15,
    color: ProTennisColors.textSecondary,
    fontWeight: "600",
  },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  quickAction: {
    alignItems: "center",
    width: 75,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
    textAlign: "center",
  },
  statsRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    backgroundColor: ProTennisColors.surfaceCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: 110,
    alignItems: "center",
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: ProTennisColors.white,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  statSubtext: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
    marginTop: 2,
  },
  neonCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    position: "relative",
  },
  neonCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  neonCardGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
  },
  neonCardBorder: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    backgroundColor: ProTennisColors.surfaceCard,
    overflow: "hidden",
  },
  vacationCard: {
    padding: Spacing.md,
  },
  vacationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  vacationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ProTennisColors.vacationBlue + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  vacationInfo: {
    flex: 1,
  },
  vacationTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  vacationDates: {
    fontSize: 13,
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  vacationCancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ProTennisColors.error + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarCard: {},
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  monthNavButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: ProTennisColors.surfaceElevated,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.white,
    letterSpacing: 1,
  },
  weekdayRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.border,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
    textTransform: "uppercase",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  calendarDayOtherMonth: {
    opacity: 0.3,
  },
  calendarDayToday: {
    backgroundColor: ProTennisColors.neonPurple + "30",
    borderRadius: 8,
  },
  calendarDaySelected: {
    backgroundColor: ProTennisColors.neonCyan,
    borderRadius: 8,
  },
  calendarDayVacation: {
    backgroundColor: ProTennisColors.vacationBlue + "20",
    borderRadius: 8,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  calendarDayTextOther: {
    color: ProTennisColors.textMuted,
  },
  calendarDayTextToday: {
    color: ProTennisColors.neonPurple,
    fontWeight: "800",
  },
  calendarDayTextSelected: {
    color: ProTennisColors.midnightBlue,
    fontWeight: "800",
  },
  sessionDots: {
    flexDirection: "row",
    gap: 2,
    marginTop: 2,
  },
  sessionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: ProTennisColors.border,
    flexWrap: "wrap",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: ProTennisColors.textSecondary,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  sectionCount: {
    fontSize: 13,
    color: ProTennisColors.textMuted,
  },
  emptyDay: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyDayIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ProTennisColors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyDayText: {
    fontSize: 15,
    color: ProTennisColors.textMuted,
    marginBottom: Spacing.md,
  },
  emptyDayButton: {
    backgroundColor: ProTennisColors.neonGreen,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
  },
  emptyDayButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
  },
  sessionsList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  sessionCard: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  sessionCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sessionTime: {
    alignItems: "center",
    width: 50,
  },
  sessionTimeText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
  sessionTimeLine: {
    width: 1,
    height: 16,
    backgroundColor: ProTennisColors.border,
    marginVertical: 2,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTypeBadge: {
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  sessionTypeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.white,
    marginBottom: 4,
  },
  sessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sessionMetaText: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
  },
  getDirectionsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: ProTennisColors.neonGreen,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  getDirectionsText: {
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.midnightBlue,
  },
  travelTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: ProTennisColors.neonCyan + "20",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    marginLeft: 4,
  },
  travelTimePillText: {
    fontSize: 10,
    color: ProTennisColors.neonCyan,
    fontWeight: "600",
  },
  sessionStatus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  locationFilterScroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  locationFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
    backgroundColor: "transparent",
  },
  locationFilterChipActive: {
    borderColor: ProTennisColors.neonGreen,
    backgroundColor: ProTennisColors.neonGreen + "15",
  },
  locationFilterChipText: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
  },
  locationFilterChipTextActive: {
    color: ProTennisColors.neonGreen,
  },
  upcomingList: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  upcomingItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceCard,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  upcomingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.md,
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  upcomingMeta: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  upcomingBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  upcomingBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  attendanceStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.border,
  },
  attendanceStat: {
    alignItems: "center",
    flex: 1,
  },
  attendanceValue: {
    fontSize: 28,
    fontWeight: "800",
  },
  attendanceLabel: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  attendanceDivider: {
    width: 1,
    backgroundColor: ProTennisColors.border,
  },
  attendanceProgressContainer: {
    padding: Spacing.md,
  },
  attendanceProgressBg: {
    height: 8,
    backgroundColor: ProTennisColors.surfaceElevated,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  attendanceProgressFill: {
    height: "100%",
    borderRadius: 4,
  },
  attendancePercentage: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    textAlign: "center",
  },
  attendanceHistoryList: {
    borderTopWidth: 1,
    borderTopColor: ProTennisColors.border,
    paddingTop: Spacing.sm,
  },
  attendanceHistoryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  attendanceStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  attendanceHistoryInfo: {
    flex: 1,
  },
  attendanceHistoryTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  attendanceHistoryDate: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
    marginTop: 1,
  },
  attendanceHistoryStatus: {
    fontSize: 11,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: ProTennisColors.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: ProTennisColors.white,
  },
  modalSubtitle: {
    fontSize: 14,
    color: ProTennisColors.textSecondary,
    marginBottom: Spacing.lg,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: ProTennisColors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  datePickerLabel: {
    flex: 1,
    fontSize: 14,
    color: ProTennisColors.textSecondary,
  },
  datePickerValue: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  saveVacationButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  saveVacationButtonDisabled: {
    opacity: 0.5,
  },
  saveVacationButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
  },
  saveVacationButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  attendanceTapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attendanceTapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attendanceTapText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.neonGreen,
  },
  attendanceModalContainer: {
    flex: 1,
    backgroundColor: ProTennisColors.midnightBlue,
  },
  attendanceModalHeader: {
    backgroundColor: ProTennisColors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: ProTennisColors.border,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  attendanceModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  attendanceModalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: ProTennisColors.white,
  },
  attendanceModalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ProTennisColors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  attendanceMonthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  attendanceMonthButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ProTennisColors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  attendanceMonthTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: ProTennisColors.white,
    minWidth: 160,
    textAlign: "center",
  },
  attendanceModalStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.sm,
  },
  attendanceModalStatItem: {
    alignItems: "center",
  },
  attendanceModalStatValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  attendanceModalStatLabel: {
    fontSize: 11,
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  attendanceModalList: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  attendanceEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  attendanceEmptyText: {
    fontSize: 16,
    color: ProTennisColors.textMuted,
    marginTop: Spacing.md,
  },
  attendanceRecordCard: {
    flexDirection: "row",
    backgroundColor: ProTennisColors.surfaceCard,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ProTennisColors.border,
  },
  attendanceRecordStatus: {
    width: 4,
  },
  attendanceRecordContent: {
    flex: 1,
    padding: Spacing.md,
  },
  attendanceRecordTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  attendanceRecordTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: ProTennisColors.white,
    flex: 1,
  },
  attendanceRecordBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  attendanceRecordBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  attendanceRecordDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  attendanceRecordDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attendanceRecordDetailText: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
  },
  sportPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  sportPickerSheet: {
    backgroundColor: ProTennisColors.surfaceElevated,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
  },
  sportPickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: ProTennisColors.white,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  sportPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    marginBottom: Spacing.sm,
  },
  sportPickerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sportPickerOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  sportPickerCancel: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  sportPickerCancelText: {
    fontSize: 15,
    color: ProTennisColors.textSecondary,
  },
}));
