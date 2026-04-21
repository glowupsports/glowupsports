import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  I18nManager,
  useWindowDimensions,
} from "react-native";
import { openDirections } from "@/lib/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useScheduleFocus } from "@/player/context/ScheduleFocusContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/coach/context/AuthContext";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, withTiming, interpolate } from "react-native-reanimated";
import PagerView from "react-native-pager-view";
import { Image as ExpoImage } from "expo-image";
import {
  Colors,
  Spacing,
  BorderRadius,
  Backgrounds,
  GlowColors,
  TextColors,
} from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders, getStaticAssetsUrl } from "@/lib/query-client";
import { GuidedEmptyState } from "@/components/GuidedEmptyState";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import {
  useSport,
  SPORT_DEFINITIONS,
  getSportColor,
  getSportLabel,
  type Sport,
} from "@/player/context/SportContext";
import { SportSwitcherChips } from "@/player/components/SportSwitcherChips";
import { usePlayer } from "@/player/context/PlayerContext";
import { useFamily } from "@/player/context/FamilyContext";
import FamilyChildSwitcher from "@/player/components/FamilyChildSwitcher";
import * as Calendar from "expo-calendar";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import {
  ScheduleTabBar,
  StatsBand,
  PaymentsTab,
  HistoryTab,
  LogPaymentSheet,
  DebtExplainerSheet,
  PaymentDetailModal,
  type ScheduleTab,
  type AcademyPaymentInfo,
  type PlayerPayment,
  type HistoryItem,
} from "./PlayerScheduleTabs";

// -----------------------------------------------------------------------------
// Theme color helper (legacy palette accessor used elsewhere in this file)
// -----------------------------------------------------------------------------
const ProTennisColors = new Proxy({} as Record<string, string>, {
  get(_t, prop: string) {
    switch (prop) {
      case "midnightBlue":
      case "backgroundPrimary":
        return Backgrounds.root;
      case "surfaceCard":
      case "cardBackground":
        return Backgrounds.card;
      case "surfaceElevated":
      case "backgroundSecondary":
        return Backgrounds.elevated;
      case "border":
        return Backgrounds.surface;
      case "neonGreen":
      case "electricGreen":
        return GlowColors.primary;
      case "neonCyan":
        return "#00E5FF";
      case "neonPurple":
        return "#E040FB";
      case "neonOrange":
        return "#FF8A00";
      case "gold":
        return "#FFD700";
      case "vacationBlue":
        return "#4DA3FF";
      case "error":
        return "#FF4D4D";
      case "success":
        return "#00E676";
      case "white":
      case "textPrimary":
        return TextColors.primary;
      case "textSecondary":
        return TextColors.secondary;
      case "textMuted":
        return TextColors.muted;
      default:
        return undefined;
    }
  },
});

// Event-type colors for the week stripe bars / hero accent.
// Direction D palette: green = lesson, blue = court, purple = match.
const EVENT_COLORS = {
  lesson: "#00E676", // green
  court: "#4DA3FF", // blue
  match: "#E040FB", // purple
} as const;

function getEventColor(type: string): string {
  if (type === "court") return EVENT_COLORS.court;
  if (type === "match") return EVENT_COLORS.match;
  return EVENT_COLORS.lesson; // private/group/semi_private
}

// -----------------------------------------------------------------------------
// Data interfaces (subset preserved from previous screen)
// -----------------------------------------------------------------------------
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

interface V2WalletData {
  v2Enabled: boolean;
  balance?: { group: number; semi_private: number; private: number };
}

interface ProfileMeData {
  player?: {
    id?: string;
    name?: string;
    displayName?: string | null;
    profilePhotoUrl?: string | null;
    attendanceStreak?: number;
    lastLatitude?: number | null;
    lastLongitude?: number | null;
  };
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------
const formatLocalDate = (date: Date) => {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (date: Date, n: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const startOfWeekMonday = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Monday = 1. JS getDay: Sun=0 Mon=1 ... Sat=6.
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const addHour = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  const newHours = (hours + 1) % 24;
  return `${newHours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

// Number of weeks rendered around today inside the pager.
const WEEKS_BEHIND = 4;
const WEEKS_AHEAD = 8;
const TOTAL_WEEKS = WEEKS_BEHIND + 1 + WEEKS_AHEAD;

// -----------------------------------------------------------------------------
// Main screen
// -----------------------------------------------------------------------------
export default function PlayerScheduleScreen() {
  const { t, i18n } = useTranslation();
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
  const { width: screenWidth } = useWindowDimensions();

  // Modals / sheets
  const [sportPickerDestination, setSportPickerDestination] = useState<"LessonBooking" | "CourtBooking" | "OpenMatches">("OpenMatches");
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showSportPickerModal, setShowSportPickerModal] = useState(false);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [showBookSheet, setShowBookSheet] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarLinkCopied, setCalendarLinkCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ScheduleTab>("sessions");
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [historyPaymentDetail, setHistoryPaymentDetail] =
    useState<PlayerPayment | null>(null);
  const [showDebtSheet, setShowDebtSheet] = useState(false);
  const [showBankSheet, setShowBankSheet] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/court-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/matches"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/vacation"] }),
        playerId
          ? queryClient.invalidateQueries({ queryKey: [`/api/parent/payments/${playerId}`] })
          : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, playerId]);

  // Selected day (default = today). Week pager position.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const baseWeekStart = useMemo(() => startOfWeekMonday(today), [today]);
  const initialWeekIndex = WEEKS_BEHIND;
  const [weekIndex, setWeekIndex] = useState(initialWeekIndex);
  const pagerRef = useRef<PagerView | null>(null);

  // Walkthrough trigger (run once)
  const walkthroughTriggered = useRef(false);
  useEffect(() => {
    if (!walkthroughTriggered.current && !hasSeenScreen("Schedule")) {
      walkthroughTriggered.current = true;
      const timer = setTimeout(() => startWalkthrough("Schedule"), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Data queries
  // ---------------------------------------------------------------------------
  const { data: rawSessions, isLoading: sessionsLoading, error: sessionsError } =
    useQuery<SessionData[]>({
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

  const { data: profileData } = useQuery<ProfileMeData>({
    queryKey: ["/api/player/me"],
  });

  // V2 wallet for the balance chip (preferred). Falls back to credits-summary.
  const { data: v2Wallet } = useQuery<V2WalletData>({
    queryKey: [`/api/v2/credits/wallet/${playerId ?? ""}`],
    enabled: !!playerId,
  });

  const { data: legacyCredits } = useQuery<{
    credits?: { group?: number; private?: number; semi_private?: number };
  }>({
    queryKey: [`/api/players/${playerId}/credits-summary`],
    enabled: !!playerId && !v2Wallet?.v2Enabled,
  });

  // Player payments (used by Payments + History tabs and pending badge).
  const { data: paymentsData } = useQuery<{ payments: PlayerPayment[] }>({
    queryKey: [`/api/parent/payments/${playerId ?? ""}`],
    enabled: !!playerId,
    refetchInterval: (query) => {
      const list = query.state.data?.payments || [];
      return list.some((p) => p.status === "pending") ? 15_000 : false;
    },
  });
  const playerPayments = paymentsData?.payments || [];

  // Academy payment info (bank details + accepted methods) — drives Log payment sheet.
  const { data: academyPaymentInfo } = useQuery<AcademyPaymentInfo>({
    queryKey: [`/api/parent/academy-payment-info/${playerId ?? ""}`],
    enabled: !!playerId,
  });

  const lessonBalance: number = (() => {
    if (v2Wallet?.v2Enabled && v2Wallet.balance) {
      return (
        (v2Wallet.balance.group || 0) +
        (v2Wallet.balance.semi_private || 0) +
        (v2Wallet.balance.private || 0)
      );
    }
    const c = legacyCredits?.credits;
    if (c) return (c.group || 0) + (c.semi_private || 0) + (c.private || 0);
    return 0;
  })();

  // ---------------------------------------------------------------------------
  // Travel time map (kept from previous version, used in hero)
  // ---------------------------------------------------------------------------
  const playerLat = profileData?.player?.lastLatitude ?? null;
  const playerLng = profileData?.player?.lastLongitude ?? null;
  const [travelTimeMap, setTravelTimeMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (playerLat == null || playerLng == null) return;
    const upcoming = (rawSessions || []).filter((s) => {
      if (!s.session?.startTime) return false;
      return new Date(s.session.startTime) > new Date();
    });
    const seen = new Set<string>();
    const locDests: Array<{ id: string; lat: number; lng: number }> = [];
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
    (async () => {
      try {
        const destsJson = encodeURIComponent(JSON.stringify(locDests));
        const url = new URL(
          `/api/maps/distance-matrix?originLat=${playerLat}&originLng=${playerLng}&destinations=${destsJson}`,
          getApiUrl(),
        ).toString();
        const res = await fetch(url, {
          credentials: "include",
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const m = new Map<string, number>();
        for (const r of data.results || []) {
          if (r.durationMinutes != null) m.set(r.id, r.durationMinutes);
        }
        setTravelTimeMap(m);
      } catch {
        /* noop */
      }
    })();
    return () => controller.abort();
  }, [playerLat, playerLng, rawSessions]);

  const attendanceStreak = profileData?.player?.attendanceStreak || 0;

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatTime = (date: Date) => {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const allItems: ScheduledItem[] = useMemo(() => {
    const now = new Date();
    const items: ScheduledItem[] = [];

    if (rawSessions) {
      for (const s of rawSessions) {
        if (!s.session?.startTime) continue;
        const startDate = new Date(s.session.startTime);
        const endDate = s.session.endTime
          ? new Date(s.session.endTime)
          : new Date(startDate.getTime() + 60 * 60 * 1000);
        const isPast = startDate < now;
        const isCancelled = s.attendanceStatus === "cancelled";
        items.push({
          id: s.id,
          sessionId: s.sessionId,
          date: formatLocalDate(startDate),
          startTime: formatTime(startDate),
          endTime: formatTime(endDate),
          type: (s.session.sessionType as any) || "private",
          title: s.session.title || getTypeLabel(s.session.sessionType),
          subtitle: s.coachName || "Coach",
          coachName: s.coachName || "",
          courtName: s.session.courtName || "",
          locationId: s.session.locationId || null,
          locationName: s.session.locationName || null,
          locationAddress: s.session.locationAddress || null,
          locationLat: s.session.locationLat ?? null,
          locationLng: s.session.locationLng ?? null,
          status: isCancelled ? "cancelled" : isPast ? "completed" : "upcoming",
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
          date: b.date.split("T")[0],
          startTime: b.startTime || "00:00",
          endTime: b.endTime || "01:00",
          type: "court",
          title: t("player.schedule.courtBookingLabel"),
          subtitle: b.courtName || "",
          coachName: "",
          courtName: b.courtName || "",
          status: b.status === "cancelled" ? "cancelled" : isPast ? "completed" : "upcoming",
        });
      }
    }

    if (matches) {
      for (const m of matches) {
        const matchDate = new Date(m.matchDate);
        const isPast = matchDate < now;
        items.push({
          id: `match-${m.id}`,
          date: m.matchDate.split("T")[0],
          startTime: m.matchTime || "00:00",
          endTime: m.matchTime ? addHour(m.matchTime) : "01:00",
          type: "match",
          title: m.matchType === "open" ? t("player.schedule.openMatchLabel") : t("player.schedule.matchLabel"),
          subtitle: m.opponentName || m.courtName || "",
          coachName: "",
          courtName: m.courtName || "",
          status: m.status === "cancelled" ? "cancelled" : isPast ? "completed" : "upcoming",
        });
      }
    }

    return items.sort((a, b) => {
      const da = new Date(`${a.date}T${a.startTime}`).getTime();
      const db = new Date(`${b.date}T${b.startTime}`).getTime();
      return da - db;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSessions, courtBookings, matches, i18n.language]);

  // ---------------------------------------------------------------------------
  // Derived stats (lessons / hours this month, payment totals, debt count)
  // ---------------------------------------------------------------------------
  const monthStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let lessons = 0;
    let hours = 0;
    if (rawSessions) {
      for (const s of rawSessions) {
        if (!s.session?.startTime) continue;
        const start = new Date(s.session.startTime);
        if (start < monthStart || start > now) continue;
        const isLesson = ["private", "group", "semi_private"].includes(
          (s.session.sessionType as string) || "",
        );
        if (!isLesson) continue;
        if (s.attendanceStatus === "cancelled" || s.attendanceStatus === "missed") continue;
        const end = s.session.endTime
          ? new Date(s.session.endTime)
          : new Date(start.getTime() + 60 * 60 * 1000);
        lessons += 1;
        hours += Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
      }
    }
    return { lessons, hours };
  }, [rawSessions]);

  const paymentTotals = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let pendingCount = 0;
    let currency = academyPaymentInfo?.currency || "AED";
    for (const p of playerPayments) {
      const amt = parseFloat(p.amount) || 0;
      if (p.currency) currency = p.currency;
      if (p.status === "confirmed") confirmed += amt;
      else if (p.status === "pending") {
        pending += amt;
        pendingCount += 1;
      }
    }
    return { confirmed, pending, pendingCount, currency };
  }, [playerPayments, academyPaymentInfo]);

  const debtLessons = lessonBalance < 0 ? Math.abs(lessonBalance) : 0;

  // Overdrawing sessions: most recent N attended lessons where N = debtLessons.
  // Each is priced at academy default lesson price (settings) for an AED total.
  const overdrawingSessions = useMemo(() => {
    if (debtLessons <= 0 || !rawSessions) return [];
    const price = academyPaymentInfo?.defaultLessonPrice ?? 100;
    const now = new Date();
    const attended = rawSessions
      .filter((s) => {
        if (!s.session?.startTime) return false;
        const start = new Date(s.session.startTime);
        if (start > now) return false;
        if (
          s.attendanceStatus === "cancelled" ||
          s.attendanceStatus === "missed"
        ) {
          return false;
        }
        const type = (s.session.sessionType as string) || "";
        return ["private", "group", "semi_private"].includes(type);
      })
      .map((s) => ({
        id: String(s.id),
        title: s.session?.title || "Lesson",
        date: new Date(s.session!.startTime!),
        price,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, debtLessons);
    return attended;
  }, [rawSessions, debtLessons, academyPaymentInfo]);

  const amountDue = useMemo(
    () => overdrawingSessions.reduce((sum, s) => sum + s.price, 0),
    [overdrawingSessions],
  );

  const historyItems: HistoryItem[] = useMemo(() => {
    const out: HistoryItem[] = [];
    const now = new Date();
    if (courtBookings) {
      for (const b of courtBookings) {
        const start = new Date(`${b.date.split("T")[0]}T${b.startTime || "00:00"}`);
        if (start >= now) continue;
        out.push({
          key: `cb-${b.id}`,
          date: start,
          kind: "session",
          title: t("player.schedule.courtBookingLabel"),
          subtitle: b.courtName || "",
          status: b.status === "cancelled" ? "Cancelled" : "Played",
          accentColor: EVENT_COLORS.court,
          sessionType: "court",
          sessionId: `court-${b.id}`,
        });
      }
    }
    if (matches) {
      for (const m of matches) {
        const start = new Date(`${m.matchDate.split("T")[0]}T${m.matchTime || "00:00"}`);
        if (start >= now) continue;
        out.push({
          key: `m-${m.id}`,
          date: start,
          kind: "session",
          title:
            m.matchType === "open"
              ? t("player.schedule.openMatchLabel")
              : t("player.schedule.matchLabel"),
          subtitle: m.opponentName || m.courtName || "",
          status: m.status === "cancelled" ? "Cancelled" : "Played",
          accentColor: EVENT_COLORS.match,
          sessionType: "match",
          sessionId: `match-${m.id}`,
        });
      }
    }
    if (rawSessions) {
      for (const s of rawSessions) {
        if (!s.session?.startTime) continue;
        const start = new Date(s.session.startTime);
        if (start >= now) continue;
        const type = (s.session.sessionType as string) || "private";
        const accent =
          type === "court"
            ? EVENT_COLORS.court
            : type === "match"
              ? EVENT_COLORS.match
              : EVENT_COLORS.lesson;
        const status =
          s.attendanceStatus === "cancelled"
            ? "Cancelled"
            : s.attendanceStatus === "missed"
              ? "Missed"
              : "Attended";
        out.push({
          key: `s-${s.id}`,
          date: start,
          kind: "session",
          title: s.session.title || getTypeLabel(type),
          subtitle: s.coachName || s.session.courtName || "",
          status,
          accentColor: accent,
          sessionType:
            type === "match" ? "match" : type === "court" ? "court" : "training",
          sessionId: s.session.id,
        });
      }
    }
    for (const p of playerPayments) {
      const date = new Date(p.paymentDate || p.createdAt);
      const accent =
        p.status === "confirmed"
          ? "#22C55E"
          : p.status === "pending"
            ? "#FBBF24"
            : "#EF4444";
      out.push({
        key: `p-${p.id}`,
        date,
        kind: "payment",
        title: `${p.currency} ${parseFloat(p.amount).toFixed(2)} payment`,
        subtitle:
          p.paymentMethod === "bank_transfer"
            ? "Bank transfer"
            : p.paymentMethod === "cash"
              ? "Cash"
              : "Payment",
        status: p.status.charAt(0).toUpperCase() + p.status.slice(1),
        accentColor: accent,
        payment: p,
      });
    }
    return out.sort((a, b) => b.date.getTime() - a.date.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSessions, courtBookings, matches, playerPayments, i18n.language]);

  // Index events by date string for cheap lookup.
  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduledItem[]>();
    for (const item of allItems) {
      const arr = map.get(item.date) || [];
      arr.push(item);
      map.set(item.date, arr);
    }
    return map;
  }, [allItems]);

  // ---------------------------------------------------------------------------
  // Vacation helpers
  // ---------------------------------------------------------------------------
  const isDateInVacation = useCallback(
    (date: Date): boolean => {
      if (!vacationData?.holidays?.length) return false;
      const dateStr = formatLocalDate(date);
      return vacationData.holidays.some((h) => {
        const start = h.startDate.split("T")[0];
        const end = h.endDate.split("T")[0];
        return dateStr >= start && dateStr <= end;
      });
    },
    [vacationData],
  );

  // ---------------------------------------------------------------------------
  // Focus handling: when home shortcut requests a session, find its date and
  // select that day in the week stripe (jumping the pager if needed).
  // ---------------------------------------------------------------------------
  const { focusSessionId, focusToken, clearFocusSession } = useScheduleFocus();
  useEffect(() => {
    if (!focusSessionId) return;
    const target = allItems.find((i) => (i.sessionId || i.id) === focusSessionId);
    if (!target) return;
    const targetDate = new Date(`${target.date}T00:00:00`);
    const targetWeekStart = startOfWeekMonday(targetDate);
    const diffMs = targetWeekStart.getTime() - baseWeekStart.getTime();
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    const targetIndex = WEEKS_BEHIND + diffWeeks;
    if (targetIndex >= 0 && targetIndex < TOTAL_WEEKS) {
      setWeekIndex(targetIndex);
      pagerRef.current?.setPage(targetIndex);
    }
    setSelectedDate(targetDate);
    clearFocusSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSessionId, focusToken, allItems]);

  // ---------------------------------------------------------------------------
  // Selected day events / next event countdown
  // ---------------------------------------------------------------------------
  const selectedDateStr = formatLocalDate(selectedDate);
  const selectedDayItems = useMemo(
    () =>
      (itemsByDate.get(selectedDateStr) || [])
        .slice()
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [itemsByDate, selectedDateStr],
  );

  const nextSessionGlobal = useMemo(
    () => allItems.find((i) => i.status === "upcoming"),
    [allItems],
  );

  // ---------------------------------------------------------------------------
  // Helpers used by labels / colors (kept compatible with previous logic)
  // ---------------------------------------------------------------------------
  function getTypeLabel(type: string): string {
    switch (type) {
      case "private":
        return t("player.schedule.privateLessonLabel");
      case "group":
        return t("player.schedule.groupLessonLabel");
      case "semi_private":
        return t("player.schedule.semiPrivateLabel");
      case "court":
        return t("player.schedule.courtBookingLabel");
      case "match":
        return t("player.schedule.matchLabel");
      default:
        return t("player.schedule.trainingLabel");
    }
  }

  // ---------------------------------------------------------------------------
  // Sport picker -> destination
  // ---------------------------------------------------------------------------
  const openWithSportPicker = (
    dest: "LessonBooking" | "CourtBooking" | "OpenMatches",
  ) => {
    if (isMultiSport && activeSports.length > 1) {
      setSportPickerDestination(dest);
      setShowSportPickerModal(true);
    } else {
      if (dest === "OpenMatches") navigation.navigate("Play", { screen: "OpenMatches" });
      else if (dest === "LessonBooking")
        navigation.navigate("LessonBooking", { sport: activeSport });
      else navigation.navigate(dest);
    }
  };

  const handleBookLesson = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowBookSheet(false);
    openWithSportPicker("LessonBooking");
  };
  const handleBookCourt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowBookSheet(false);
    openWithSportPicker("CourtBooking");
  };
  const handleFindMatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowBookSheet(false);
    openWithSportPicker("OpenMatches");
  };

  const handleSportPicked = (sport: Sport) => {
    setActiveSport(sport);
    setShowSportPickerModal(false);
    if (sportPickerDestination === "OpenMatches")
      navigation.navigate("Play", { screen: "OpenMatches" });
    else if (sportPickerDestination === "LessonBooking")
      navigation.navigate("LessonBooking", { sport });
    else navigation.navigate(sportPickerDestination);
  };

  const handleOpenHolidays = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerHolidays");
  };

  // ---------------------------------------------------------------------------
  // Calendar subscribe
  // ---------------------------------------------------------------------------
  const { data: icsTokenData } = useQuery<{ token: string }>({
    queryKey: ["/api/player/me/calendar-token"],
    enabled: !!playerId,
  });
  const getIcsUrl = (): string | null => {
    if (!playerId || !icsTokenData?.token) return null;
    const base = getApiUrl();
    return new URL(
      `/api/player/calendar/${playerId}/sessions.ics?token=${icsTokenData.token}`,
      base,
    ).toString();
  };
  const handleSubscribeGoogle = async () => {
    const url = getIcsUrl();
    if (!url) return;
    await Linking.openURL(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`,
    );
  };
  const handleSubscribeApple = async () => {
    const url = getIcsUrl();
    if (!url) return;
    await Linking.openURL(url.replace(/^https?:\/\//, "webcal://"));
  };
  const handleCopyCalendarLink = async () => {
    const url = getIcsUrl();
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCalendarLinkCopied(true);
    setTimeout(() => setCalendarLinkCopied(false), 2500);
  };

  const handleAddToDeviceCalendar = async (item: ScheduledItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("common.permission"), t("player.schedule.calendarPermissionRequired"));
        return;
      }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      let calendarId: string | null = null;
      if (Platform.OS === "ios") {
        const def =
          calendars.find((c) => c.allowsModifications && c.source?.name === "Default") ||
          calendars.find((c) => c.allowsModifications);
        calendarId = def?.id || null;
      } else {
        const primary =
          calendars.find((c) => c.isPrimary && c.allowsModifications) ||
          calendars.find((c) => c.allowsModifications);
        calendarId = primary?.id || null;
      }
      if (!calendarId) return;
      const startDate = new Date(`${item.date}T${item.startTime}`);
      const endDate = new Date(`${item.date}T${item.endTime}`);
      await Calendar.createEventAsync(calendarId, {
        title: item.title,
        startDate,
        endDate,
        location: item.locationAddress || item.locationName || item.courtName || undefined,
        notes: item.coachName ? `Coach: ${item.coachName}` : "",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* noop */
    }
  };

  // ---------------------------------------------------------------------------
  // Loading / guest / error states (kept similar to previous)
  // ---------------------------------------------------------------------------
  if (sessionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={EVENT_COLORS.lesson} />
        <Text style={styles.loadingText}>{t("player.schedule.loadingSchedule")}</Text>
      </View>
    );
  }

  if (isGuest) {
    return <GuestState onSignIn={logout} />;
  }

  if (sessionsError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={48} color={ProTennisColors.error} />
        <Text style={styles.errorText}>{t("player.schedule.unableToLoadSchedule")}</Text>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Sticky header content
  // ---------------------------------------------------------------------------
  const playerName =
    profileData?.player?.displayName ||
    profileData?.player?.name ||
    t("player.schedule.mySchedule");
  const profilePhotoUrl = profileData?.player?.profilePhotoUrl;
  const streak = profileData?.player?.attendanceStreak || 0;

  return (
    <View style={styles.container}>
      {/* Sticky top bar */}
      <View style={[styles.stickyTop, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable
          style={styles.avatarWrapper}
          onPress={() => navigation.navigate("Profile")}
        >
          {streak > 0 ? <View style={styles.streakRing} /> : null}
          {profilePhotoUrl ? (
            <ExpoImage
              source={{ uri: `${getStaticAssetsUrl()}${profilePhotoUrl}` }}
              style={styles.avatarImg}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {playerName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={styles.nameWrapper}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.nameText} numberOfLines={1}>
            {playerName}
          </Text>
          {streak > 0 ? (
            <View style={styles.streakChip}>
              <Feather name="zap" size={10} color="#FFD700" />
              <Text style={styles.streakChipText}>{streak}</Text>
            </View>
          ) : null}
        </Pressable>

        {lessonBalance >= 0 ? (
          <BalanceChip
            balance={lessonBalance}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("payments");
            }}
          />
        ) : null}

        <Pressable
          style={styles.iconButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMonthCursor(selectedDate);
            setShowMonthModal(true);
          }}
          hitSlop={8}
        >
          <Feather name="calendar" size={20} color={EVENT_COLORS.court} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={EVENT_COLORS.lesson}
            colors={[EVENT_COLORS.lesson]}
          />
        }
      >
        <FamilyChildSwitcher />
        {isMultiSport ? (
          <SportSwitcherChips
            style={{ marginTop: Spacing.xs, marginBottom: Spacing.sm }}
          />
        ) : null}

        {/* Week stripe (swipeable pager) */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <PagerView
            ref={pagerRef}
            style={[styles.pager, { width: screenWidth }]}
            initialPage={initialWeekIndex}
            onPageSelected={(e) => {
              setWeekIndex(e.nativeEvent.position);
              Haptics.selectionAsync();
            }}
          >
            {Array.from({ length: TOTAL_WEEKS }).map((_, idx) => {
              const weekStart = addDays(baseWeekStart, (idx - WEEKS_BEHIND) * 7);
              return (
                <View key={idx} style={styles.weekPage}>
                  <WeekStripe
                    weekStart={weekStart}
                    today={today}
                    selectedDate={selectedDate}
                    itemsByDate={itemsByDate}
                    isVacation={isDateInVacation}
                    onSelectDay={(d) => {
                      Haptics.selectionAsync();
                      setSelectedDate(d);
                    }}
                  />
                </View>
              );
            })}
          </PagerView>
        </Animated.View>

        {/* Stats band + tab bar */}
        <StatsBand
          lessonsThisMonth={monthStats.lessons}
          hoursThisMonth={monthStats.hours}
          walletBalance={lessonBalance}
          currency={paymentTotals.currency}
          debt={debtLessons}
          amountDue={amountDue}
          onWalletPress={() => {
            Haptics.selectionAsync();
            if (lessonBalance < 0) setShowDebtSheet(true);
            else setActiveTab("payments");
          }}
          onDebtPress={() => {
            Haptics.selectionAsync();
            setShowDebtSheet(true);
          }}
        />
        <ScheduleTabBar
          active={activeTab}
          onChange={setActiveTab}
          paymentsBadge={paymentTotals.pendingCount}
        />

        {/* Active vacation banner (kept) */}
        {activeTab === "sessions" && (vacationData?.activeVacation || vacationData?.upcomingVacation) ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.vacationBanner}>
            <View style={styles.vacationBannerInner}>
              <View style={styles.vacationIcon}>
                <Feather name="sun" size={16} color={EVENT_COLORS.court} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vacationBannerTitle}>
                  {vacationData.activeVacation
                    ? t("player.schedule.onVacation")
                    : t("player.schedule.upcomingVacation")}
                </Text>
                <Text style={styles.vacationBannerDates}>
                  {formatVacationRange(
                    vacationData.activeVacation?.startDate ||
                      vacationData.upcomingVacation!.startDate,
                    vacationData.activeVacation?.endDate ||
                      vacationData.upcomingVacation!.endDate,
                  )}
                </Text>
              </View>
              <Pressable
                onPress={handleOpenHolidays}
                hitSlop={8}
                style={styles.vacationCancelBtn}
              >
                <Feather name="chevron-right" size={20} color={ProTennisColors.textSecondary} />
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {/* Hero card (sessions tab only) */}
        {activeTab === "sessions" ? (
        <DayHero
          selectedDate={selectedDate}
          items={selectedDayItems}
          isVacation={isDateInVacation(selectedDate)}
          travelTimeMap={travelTimeMap}
          onBookLesson={handleBookLesson}
          onFindMatch={handleFindMatch}
          onAddToCalendar={handleAddToDeviceCalendar}
          onOpenDirections={(it) =>
            openDirections({
              lat: it.locationLat,
              lng: it.locationLng,
              label: it.locationName,
              address: it.locationAddress,
            })
          }
          onPressEvent={(it) => {
            Haptics.selectionAsync();
            if (it.type === "match") {
              const matchId = it.id.startsWith("match-") ? it.id.slice("match-".length) : it.id;
              navigation.navigate("MatchDetail", { matchId });
            } else if (it.type === "court") {
              navigation.navigate("MyCourtBookings");
            } else {
              const sessionId = it.sessionId || it.id;
              navigation.navigate("TrainingDetail", { sessionId });
            }
          }}
          getTypeLabel={getTypeLabel}
        />
        ) : null}

        {activeTab === "payments" ? (
          <PaymentsTab
            playerId={playerId}
            onLogPayment={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowLogPayment(true);
            }}
            onShowBankDetails={() => {
              Haptics.selectionAsync();
              setShowBankSheet(true);
            }}
            totals={{
              confirmed: paymentTotals.confirmed,
              pending: paymentTotals.pending,
              currency: paymentTotals.currency,
            }}
          />
        ) : null}

        {activeTab === "history" ? (
          <HistoryTab
            items={historyItems}
            onSelectItem={(item) => {
              Haptics.selectionAsync();
              if (item.kind === "payment" && item.payment) {
                setHistoryPaymentDetail(item.payment);
                return;
              }
              if (item.kind === "session" && item.sessionId) {
                if (item.sessionType === "match") {
                  const matchId = item.sessionId.startsWith("match-")
                    ? item.sessionId.slice("match-".length)
                    : item.sessionId;
                  navigation.navigate("MatchDetail", { matchId });
                } else if (item.sessionType === "court") {
                  navigation.navigate("MyCourtBookings");
                } else {
                  navigation.navigate("TrainingDetail", {
                    sessionId: item.sessionId,
                  });
                }
              }
            }}
          />
        ) : null}
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowBookSheet(true);
        }}
      >
        <LinearGradient
          colors={[EVENT_COLORS.lesson, "#9AE66E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Feather name="plus" size={22} color="#0A0A0A" />
          <Text style={styles.fabText}>{t("player.schedule.book")}</Text>
        </LinearGradient>
      </Pressable>

      {/* Calendar subscribe shortcut floats next to FAB on long-press */}
      <Pressable
        style={[styles.calendarSubscribeBtn, { bottom: insets.bottom + 28 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowCalendarModal(true);
        }}
      >
        <Feather name="rss" size={16} color={EVENT_COLORS.court} />
      </Pressable>

      {/* Book action sheet */}
      <Modal
        visible={showBookSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookSheet(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowBookSheet(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t("player.schedule.bookSheetTitle")}</Text>
            <BookOption
              icon="book"
              color={EVENT_COLORS.lesson}
              title={t("player.schedule.bookLesson")}
              subtitle={t("player.schedule.bookLessonDesc")}
              onPress={handleBookLesson}
            />
            <BookOption
              icon="grid"
              color={EVENT_COLORS.court}
              title={t("player.schedule.bookCourt")}
              subtitle={t("player.schedule.bookCourtDesc")}
              onPress={handleBookCourt}
            />
            <BookOption
              icon="users"
              color={EVENT_COLORS.match}
              title={t("player.schedule.findMatch")}
              subtitle={t("player.schedule.findMatchDesc")}
              onPress={handleFindMatch}
            />
            <Pressable
              style={styles.sheetCancel}
              onPress={() => setShowBookSheet(false)}
            >
              <Text style={styles.sheetCancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Month modal */}
      <Modal
        visible={showMonthModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMonthModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowMonthModal(false)}>
          <Pressable
            style={[styles.monthSheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <MonthGrid
              cursor={monthCursor}
              today={today}
              selectedDate={selectedDate}
              itemsByDate={itemsByDate}
              isVacation={isDateInVacation}
              onPrev={() =>
                setMonthCursor(
                  new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
                )
              }
              onNext={() =>
                setMonthCursor(
                  new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
                )
              }
              onSelectDay={(d) => {
                setSelectedDate(d);
                // Move pager to that week.
                const ws = startOfWeekMonday(d);
                const diffMs = ws.getTime() - baseWeekStart.getTime();
                const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
                const idx = WEEKS_BEHIND + diffWeeks;
                if (idx >= 0 && idx < TOTAL_WEEKS) {
                  setWeekIndex(idx);
                  pagerRef.current?.setPage(idx);
                }
                setShowMonthModal(false);
                Haptics.selectionAsync();
              }}
              onClose={() => setShowMonthModal(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sport picker (kept) */}
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
                ? t("player.schedule.bookLesson")
                : sportPickerDestination === "CourtBooking"
                  ? t("player.schedule.bookCourt")
                  : t("player.schedule.findMatch")}
            </Text>
            {SPORT_DEFINITIONS.filter((s) => activeSports.includes(s.key)).map((sport) => (
              <Pressable
                key={sport.key}
                style={[
                  styles.sportPickerOption,
                  activeSport === sport.key && {
                    borderColor: getSportColor(sport.key),
                  },
                ]}
                onPress={() => handleSportPicked(sport.key)}
              >
                <View
                  style={[
                    styles.sportPickerDot,
                    { backgroundColor: getSportColor(sport.key) },
                  ]}
                />
                <Text
                  style={[
                    styles.sportPickerOptionText,
                    activeSport === sport.key && { color: getSportColor(sport.key) },
                  ]}
                >
                  {getSportLabel(sport.key)}
                </Text>
                {activeSport === sport.key ? (
                  <Feather name="check" size={18} color={getSportColor(sport.key)} />
                ) : null}
              </Pressable>
            ))}
            <Pressable
              style={styles.sportPickerCancel}
              onPress={() => setShowSportPickerModal(false)}
            >
              <Text style={styles.sportPickerCancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Calendar subscribe modal */}
      <Modal
        visible={showCalendarModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowCalendarModal(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t("player.schedule.syncMySessions")}</Text>
            <BookOption
              icon="globe"
              color="#4285F4"
              title={t("player.schedule.subscribeGoogle")}
              subtitle={t("player.schedule.subscribeGoogleDesc")}
              onPress={handleSubscribeGoogle}
            />
            <BookOption
              icon="smartphone"
              color={EVENT_COLORS.lesson}
              title={t("player.schedule.subscribeApple")}
              subtitle={t("player.schedule.subscribeAppleDesc")}
              onPress={handleSubscribeApple}
            />
            <BookOption
              icon={calendarLinkCopied ? "check" : "link"}
              color={EVENT_COLORS.match}
              title={
                calendarLinkCopied
                  ? t("common.copied")
                  : t("player.schedule.copyCalendarLink")
              }
              subtitle={t("player.schedule.copyCalendarLinkDesc")}
              onPress={handleCopyCalendarLink}
            />
            <Pressable
              style={styles.sheetCancel}
              onPress={() => setShowCalendarModal(false)}
            >
              <Text style={styles.sheetCancelText}>{t("common.close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Log a payment sheet */}
      <LogPaymentSheet
        visible={showLogPayment}
        onClose={() => setShowLogPayment(false)}
        playerId={playerId}
        paymentInfo={academyPaymentInfo || null}
      />

      {/* Bank details quick view (reuses LogPaymentSheet's bank box via a mini sheet) */}
      <Modal
        visible={showBankSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBankSheet(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowBankSheet(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Academy payment details</Text>
            {academyPaymentInfo ? (
              <View style={{ paddingTop: Spacing.sm }}>
                {academyPaymentInfo.acceptsCash ? (
                  <Text style={{ color: TextColors.secondary, marginBottom: Spacing.sm }}>
                    Cash accepted in person.
                  </Text>
                ) : null}
                {academyPaymentInfo.acceptsBankTransfer ? (
                  <View>
                    {academyPaymentInfo.bankAccountHolder ? (
                      <Text style={{ color: TextColors.primary, marginBottom: 4 }}>
                        Account holder: {academyPaymentInfo.bankAccountHolder}
                      </Text>
                    ) : null}
                    {academyPaymentInfo.bankName ? (
                      <Text style={{ color: TextColors.primary, marginBottom: 4 }}>
                        Bank: {academyPaymentInfo.bankName}
                      </Text>
                    ) : null}
                    {academyPaymentInfo.bankIban ? (
                      <Text style={{ color: TextColors.primary, marginBottom: 4 }}>
                        IBAN: {academyPaymentInfo.bankIban}
                      </Text>
                    ) : null}
                    {academyPaymentInfo.bankAccountNumber ? (
                      <Text style={{ color: TextColors.primary, marginBottom: 4 }}>
                        Account: {academyPaymentInfo.bankAccountNumber}
                      </Text>
                    ) : null}
                    {academyPaymentInfo.bankSwiftCode ? (
                      <Text style={{ color: TextColors.primary, marginBottom: 4 }}>
                        SWIFT: {academyPaymentInfo.bankSwiftCode}
                      </Text>
                    ) : null}
                    {academyPaymentInfo.paymentInstructions ? (
                      <Text style={{ color: TextColors.muted, marginTop: Spacing.sm, fontStyle: "italic" }}>
                        {academyPaymentInfo.paymentInstructions}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: TextColors.muted }}>No payment details available.</Text>
            )}
            <Pressable
              style={styles.sheetCancel}
              onPress={() => setShowBankSheet(false)}
            >
              <Text style={styles.sheetCancelText}>{t("common.close")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment detail (opened from History tab) */}
      <PaymentDetailModal
        payment={historyPaymentDetail}
        onClose={() => setHistoryPaymentDetail(null)}
      />

      {/* Debt explainer */}
      <DebtExplainerSheet
        visible={showDebtSheet}
        onClose={() => setShowDebtSheet(false)}
        onLogPayment={() => {
          setActiveTab("payments");
          setShowLogPayment(true);
        }}
        debt={debtLessons}
        currency={paymentTotals.currency}
        overdrawingSessions={overdrawingSessions}
        amountDue={amountDue}
      />
    </View>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================
function BalanceChip({
  balance,
  onPress,
}: {
  balance: number;
  onPress: () => void;
}) {
  let color = TextColors.muted;
  if (balance <= 0) color = "#FF4D4D";
  else if (balance < 5) color = "#FFC107";
  else color = "#00E676";

  return (
    <Pressable
      onPress={onPress}
      style={[styles.balanceChip, { borderColor: color + "55" }]}
    >
      <Feather name="credit-card" size={12} color={color} />
      <Text style={[styles.balanceChipText, { color }]}>{balance}</Text>
    </Pressable>
  );
}

function WeekStripe({
  weekStart,
  today,
  selectedDate,
  itemsByDate,
  isVacation,
  onSelectDay,
}: {
  weekStart: Date;
  today: Date;
  selectedDate: Date;
  itemsByDate: Map<string, ScheduledItem[]>;
  isVacation: (d: Date) => boolean;
  onSelectDay: (d: Date) => void;
}) {
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  // RTL flip: visually mirror the row.
  const rowDirection = I18nManager.isRTL ? "row-reverse" : "row";

  return (
    <View style={[styles.weekRow, { flexDirection: rowDirection as any }]}>
      {days.map((d) => {
        const ds = formatLocalDate(d);
        const items = itemsByDate.get(ds) || [];
        const isToday = sameDay(d, today);
        const isSelected = sameDay(d, selectedDate);
        const vac = isVacation(d);

        // Up to 3 type-bars (lesson/court/match).
        const types: Array<"lesson" | "court" | "match"> = [];
        let hasLesson = false,
          hasCourt = false,
          hasMatch = false;
        for (const it of items) {
          if (it.status === "cancelled") continue;
          if (it.type === "court") hasCourt = true;
          else if (it.type === "match") hasMatch = true;
          else hasLesson = true;
        }
        if (hasLesson) types.push("lesson");
        if (hasCourt) types.push("court");
        if (hasMatch) types.push("match");

        return (
          <Pressable
            key={ds}
            onPress={() => onSelectDay(d)}
            style={[
              styles.dayCell,
              vac && styles.dayCellVacation,
              isSelected && styles.dayCellSelected,
            ]}
          >
            <Text
              style={[
                styles.dayWeekday,
                isToday && !isSelected && styles.dayWeekdayToday,
                isSelected && styles.dayWeekdaySelected,
              ]}
            >
              {d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2).toUpperCase()}
            </Text>
            <Text
              style={[
                styles.dayNumber,
                isToday && !isSelected && styles.dayNumberToday,
                isSelected && styles.dayNumberSelected,
              ]}
            >
              {d.getDate()}
            </Text>
            <View style={styles.dayBars}>
              {types.length > 0
                ? types.map((tp) => (
                    <View
                      key={tp}
                      style={[styles.dayBar, { backgroundColor: EVENT_COLORS[tp] }]}
                    />
                  ))
                : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function DayHero({
  selectedDate,
  items,
  isVacation,
  travelTimeMap,
  onBookLesson,
  onFindMatch,
  onAddToCalendar,
  onOpenDirections,
  onPressEvent,
  getTypeLabel,
}: {
  selectedDate: Date;
  items: ScheduledItem[];
  isVacation: boolean;
  travelTimeMap: Map<string, number>;
  onBookLesson: () => void;
  onFindMatch: () => void;
  onAddToCalendar: (it: ScheduledItem) => void;
  onOpenDirections: (it: ScheduledItem) => void;
  onPressEvent: (it: ScheduledItem) => void;
  getTypeLabel: (type: string) => string;
}) {
  const { t } = useTranslation();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let dayLabel: string;
  if (sameDay(selectedDate, today)) dayLabel = t("player.schedule.today");
  else if (sameDay(selectedDate, tomorrow)) dayLabel = t("player.schedule.tomorrow");
  else
    dayLabel = selectedDate.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

  if (items.length === 0) {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.heroWrapper}>
        <Text style={styles.heroDayLabel}>{dayLabel}</Text>
        <View style={styles.heroEmpty}>
          <View style={styles.heroEmptyIcon}>
            <Feather
              name={isVacation ? "sun" : "calendar"}
              size={28}
              color={isVacation ? EVENT_COLORS.court : TextColors.muted}
            />
          </View>
          <Text style={styles.heroEmptyTitle}>
            {isVacation
              ? t("player.schedule.heroVacationTitle")
              : t("player.schedule.heroEmptyTitle")}
          </Text>
          {!isVacation ? (
            <View style={styles.heroEmptyCtas}>
              <Pressable
                style={[styles.heroEmptyCta, { backgroundColor: EVENT_COLORS.lesson }]}
                onPress={onBookLesson}
              >
                <Feather name="book" size={14} color="#0A0A0A" />
                <Text style={styles.heroEmptyCtaText}>
                  {t("player.schedule.bookLesson")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.heroEmptyCta, { backgroundColor: EVENT_COLORS.match }]}
                onPress={onFindMatch}
              >
                <Feather name="users" size={14} color="#FFFFFF" />
                <Text style={[styles.heroEmptyCtaText, { color: "#FFFFFF" }]}>
                  {t("player.schedule.findMatch")}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  const [primary, ...rest] = items;
  const accent = getEventColor(primary.type);
  const startDateTime = new Date(`${primary.date}T${primary.startTime}`);
  const now = new Date();
  const diffMs = startDateTime.getTime() - now.getTime();
  let countdown: string | null = null;
  if (primary.status === "upcoming") {
    if (diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000) {
      const hrs = Math.floor(diffMs / (60 * 60 * 1000));
      const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
      if (hrs > 0) countdown = t("player.schedule.inHours", { count: hrs });
      else countdown = t("player.schedule.inMinutes", { count: mins });
    }
  }

  const travelKey =
    primary.locationLat != null && primary.locationLng != null
      ? `${primary.locationLat},${primary.locationLng}`
      : null;
  const travel = travelKey ? travelTimeMap.get(travelKey) : null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.heroWrapper}>
      <Text style={styles.heroDayLabel}>{dayLabel}</Text>
      <View style={[styles.heroCard, { borderColor: accent + "55" }]}>
        <View style={[styles.heroAccentBar, { backgroundColor: accent }]} />
        <View style={styles.heroHeaderRow}>
          <View style={[styles.heroTypePill, { backgroundColor: accent + "22" }]}>
            <Text style={[styles.heroTypePillText, { color: accent }]}>
              {getTypeLabel(primary.type)}
            </Text>
          </View>
          {countdown ? (
            <View style={[styles.heroCountdown, { backgroundColor: accent + "22" }]}>
              <Feather name="clock" size={11} color={accent} />
              <Text style={[styles.heroCountdownText, { color: accent }]}>
                {countdown}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heroTime}>
          {primary.startTime}
          {primary.endTime ? ` – ${primary.endTime}` : ""}
        </Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {primary.title}
        </Text>
        <View style={styles.heroDetailsRow}>
          {primary.coachName ? (
            <View style={styles.heroDetailItem}>
              <Feather name="user" size={13} color={TextColors.muted} />
              <Text style={styles.heroDetailText}>{primary.coachName}</Text>
            </View>
          ) : null}
          {primary.locationName || primary.courtName ? (
            <View style={styles.heroDetailItem}>
              <Feather name="map-pin" size={13} color={TextColors.muted} />
              <Text style={styles.heroDetailText}>
                {primary.locationName || primary.courtName}
              </Text>
              {travel != null ? (
                <View style={styles.travelPill}>
                  <Feather name="navigation" size={9} color={EVENT_COLORS.court} />
                  <Text style={styles.travelPillText}>~{travel}m</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.heroActions}>
          {primary.locationLat != null ||
          primary.locationName ||
          primary.locationAddress ? (
            <Pressable
              style={[styles.heroActionBtn, { borderColor: accent }]}
              onPress={() => onOpenDirections(primary)}
            >
              <Feather name="navigation" size={14} color={accent} />
              <Text style={[styles.heroActionText, { color: accent }]}>
                {t("player.schedule.directions")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.heroActionBtn, styles.heroActionBtnGhost]}
            onPress={() => onAddToCalendar(primary)}
          >
            <Feather name="calendar" size={14} color={TextColors.secondary} />
            <Text
              style={[styles.heroActionText, { color: TextColors.secondary }]}
            >
              {t("player.schedule.addToCalendar")}
            </Text>
          </Pressable>
        </View>
      </View>

      {rest.length > 0 ? (
        <View style={styles.secondaryList}>
          {rest.map((it) => {
            const c = getEventColor(it.type);
            return (
              <Pressable
                key={it.id}
                style={({ pressed }) => [
                  styles.secondaryRow,
                  { borderLeftColor: c },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => onPressEvent(it)}
              >
                <Text style={styles.secondaryTime}>{it.startTime}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.secondaryTitle} numberOfLines={1}>
                    {it.title}
                  </Text>
                  <Text style={styles.secondarySub} numberOfLines={1}>
                    {getTypeLabel(it.type)}
                    {it.subtitle ? ` · ${it.subtitle}` : ""}
                  </Text>
                </View>
                {it.status === "cancelled" ? (
                  <Feather name="x" size={14} color={"#FF4D4D"} />
                ) : it.status === "completed" ? (
                  <Feather name="check" size={14} color={EVENT_COLORS.lesson} />
                ) : null}
                <Feather
                  name="chevron-right"
                  size={16}
                  color={TextColors.muted}
                  style={{ marginLeft: 4 }}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Animated.View>
  );
}

function MonthGrid({
  cursor,
  today,
  selectedDate,
  itemsByDate,
  isVacation,
  onPrev,
  onNext,
  onSelectDay,
  onClose,
}: {
  cursor: Date;
  today: Date;
  selectedDate: Date;
  itemsByDate: Map<string, ScheduledItem[]>;
  isVacation: (d: Date) => boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (d: Date) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = (first.getDay() + 6) % 7; // shift so Mon=0

  const days: Array<{ date: Date; current: boolean }> = [];
  for (let i = startPad - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), current: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true });
  }
  while (days.length % 7 !== 0 || days.length < 42) {
    const next = days.length - (startPad + last.getDate()) + 1;
    days.push({ date: new Date(year, month + 1, next), current: false });
    if (days.length >= 42) break;
  }

  return (
    <View>
      <View style={styles.monthHeader}>
        <Pressable onPress={onPrev} style={styles.monthNavBtn}>
          <Feather name="chevron-left" size={22} color={TextColors.primary} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </Text>
        <Pressable onPress={onNext} style={styles.monthNavBtn}>
          <Feather name="chevron-right" size={22} color={TextColors.primary} />
        </Pressable>
        <Pressable onPress={onClose} style={[styles.monthNavBtn, { marginLeft: 4 }]}>
          <Feather name="x" size={20} color={TextColors.muted} />
        </Pressable>
      </View>
      <View style={styles.weekdayRow}>
        {[
          t("player.schedule.weekdayMon"),
          t("player.schedule.weekdayTue"),
          t("player.schedule.weekdayWed"),
          t("player.schedule.weekdayThu"),
          t("player.schedule.weekdayFri"),
          t("player.schedule.weekdaySat"),
          t("player.schedule.weekdaySun"),
        ].map((d) => (
          <Text key={d} style={styles.weekdayLabel}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {days.map((day, idx) => {
          const ds = formatLocalDate(day.date);
          const items = itemsByDate.get(ds) || [];
          const hasLesson = items.some(
            (i) => i.type === "private" || i.type === "group" || i.type === "semi_private",
          );
          const hasCourt = items.some((i) => i.type === "court");
          const hasMatch = items.some((i) => i.type === "match");
          const isToday = sameDay(day.date, today);
          const isSelected = sameDay(day.date, selectedDate);
          const vac = isVacation(day.date);

          return (
            <Pressable
              key={idx}
              onPress={() => day.current && onSelectDay(day.date)}
              style={[
                styles.monthCell,
                !day.current && styles.monthCellOther,
                vac && styles.monthCellVacation,
                isToday && !isSelected && styles.monthCellToday,
                isSelected && styles.monthCellSelected,
              ]}
            >
              <Text
                style={[
                  styles.monthCellText,
                  !day.current && styles.monthCellTextOther,
                  isSelected && styles.monthCellTextSelected,
                ]}
              >
                {day.date.getDate()}
              </Text>
              <View style={styles.monthDots}>
                {hasLesson ? (
                  <View
                    style={[styles.monthDot, { backgroundColor: EVENT_COLORS.lesson }]}
                  />
                ) : null}
                {hasCourt ? (
                  <View
                    style={[styles.monthDot, { backgroundColor: EVENT_COLORS.court }]}
                  />
                ) : null}
                {hasMatch ? (
                  <View
                    style={[styles.monthDot, { backgroundColor: EVENT_COLORS.match }]}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BookOption({
  icon,
  color,
  title,
  subtitle,
  onPress,
}: {
  icon: any;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.bookOption} onPress={onPress}>
      <View style={[styles.bookOptionIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.bookOptionTitle}>{title}</Text>
        <Text style={styles.bookOptionSubtitle}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={TextColors.muted} />
    </Pressable>
  );
}

function GuestState({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.container, styles.centered, { paddingHorizontal: Spacing.xl }]}>
      <View style={styles.guestAvatarRing}>
        <Ionicons name="calendar" size={52} color={Colors.dark.primary} />
      </View>
      <Text style={styles.guestTitle}>{t("player.schedule.mySchedule")}</Text>
      <Text style={styles.guestSubtitle}>{t("player.schedule.guestSubtitle")}</Text>
      <Pressable
        style={({ pressed }) => [styles.guestCta, { opacity: pressed ? 0.85 : 1 }]}
        onPress={onSignIn}
      >
        <LinearGradient
          colors={[Colors.dark.primary, "#9AE66E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.guestCtaGradient}
        >
          <Ionicons name="person-add-outline" size={20} color={Colors.dark.buttonText} />
          <Text style={styles.guestCtaText}>{t("player.schedule.guestCta")}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function formatVacationRange(startISO: string, endISO: string): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(startISO)} – ${fmt(endISO)}`;
}

// =============================================================================
// Styles
// =============================================================================
const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Backgrounds.root,
    },
    scrollView: { flex: 1 },
    centered: { justifyContent: "center", alignItems: "center" },
    loadingText: {
      marginTop: Spacing.md,
      color: TextColors.secondary,
      fontSize: 14,
    },
    errorText: {
      marginTop: Spacing.md,
      color: "#FF4D4D",
      fontSize: 16,
      fontWeight: "600",
    },

    // Sticky top
    stickyTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
      backgroundColor: Backgrounds.root,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Backgrounds.surface,
    },
    avatarWrapper: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      overflow: "visible",
    },
    streakRing: {
      position: "absolute",
      top: -2,
      left: -2,
      right: -2,
      bottom: -2,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "#FFD700",
    },
    avatarImg: { width: 36, height: 36, borderRadius: 18 },
    avatarFallback: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Backgrounds.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarFallbackText: {
      fontSize: 16,
      fontWeight: "700",
      color: TextColors.primary,
    },
    nameWrapper: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    nameText: {
      fontSize: 16,
      fontWeight: "700",
      color: TextColors.primary,
      flexShrink: 1,
    },
    streakChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      backgroundColor: "#FFD70022",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    streakChipText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#FFD700",
    },
    balanceChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      backgroundColor: Backgrounds.card,
    },
    balanceChipText: {
      fontSize: 13,
      fontWeight: "700",
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Backgrounds.card,
      alignItems: "center",
      justifyContent: "center",
    },

    // Pager / week
    pager: {
      height: 88,
      marginTop: Spacing.sm,
    },
    weekPage: { flex: 1 },
    weekRow: {
      flexDirection: "row",
      paddingHorizontal: Spacing.md,
      gap: 4,
    },
    dayCell: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 2,
      borderRadius: BorderRadius.md,
      alignItems: "center",
      justifyContent: "flex-start",
      backgroundColor: Backgrounds.card,
      borderWidth: 1,
      borderColor: "transparent",
      gap: 4,
    },
    dayCellSelected: {
      borderColor: GlowColors.primary,
      backgroundColor: GlowColors.primary + "15",
    },
    dayCellVacation: {
      backgroundColor: EVENT_COLORS.court + "15",
    },
    dayWeekday: {
      fontSize: 10,
      fontWeight: "700",
      color: TextColors.muted,
      letterSpacing: 0.5,
    },
    dayWeekdayToday: {
      color: TextColors.primary,
    },
    dayWeekdaySelected: {
      color: GlowColors.primary,
    },
    dayNumber: {
      fontSize: 18,
      fontWeight: "700",
      color: TextColors.primary,
      lineHeight: 22,
    },
    dayNumberToday: {
      color: GlowColors.primary,
    },
    dayNumberSelected: {
      color: GlowColors.primary,
    },
    dayBars: {
      flexDirection: "row",
      gap: 2,
      marginTop: 2,
      minHeight: 4,
    },
    dayBar: {
      width: 14,
      height: 3,
      borderRadius: 2,
    },

    // Vacation banner
    vacationBanner: {
      paddingHorizontal: Spacing.lg,
      marginTop: Spacing.md,
    },
    vacationBannerInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      backgroundColor: EVENT_COLORS.court + "18",
      borderRadius: BorderRadius.md,
      padding: Spacing.sm,
      borderWidth: 1,
      borderColor: EVENT_COLORS.court + "55",
    },
    vacationIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: EVENT_COLORS.court + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    vacationBannerTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: TextColors.primary,
    },
    vacationBannerDates: {
      fontSize: 12,
      color: TextColors.secondary,
      marginTop: 2,
    },
    vacationCancelBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "#FF4D4D22",
      alignItems: "center",
      justifyContent: "center",
    },

    // Hero
    heroWrapper: {
      paddingHorizontal: Spacing.lg,
      marginTop: Spacing.lg,
    },
    heroDayLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: TextColors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: Spacing.sm,
    },
    heroCard: {
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      padding: Spacing.lg,
      overflow: "hidden",
    },
    heroAccentBar: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    heroHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.sm,
    },
    heroTypePill: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    heroTypePillText: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    heroCountdown: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    heroCountdownText: {
      fontSize: 11,
      fontWeight: "700",
    },
    heroTime: {
      fontSize: 28,
      fontWeight: "800",
      color: TextColors.primary,
    },
    heroTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: TextColors.primary,
      marginTop: 2,
      marginBottom: Spacing.sm,
    },
    heroDetailsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    heroDetailItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    heroDetailText: {
      fontSize: 13,
      color: TextColors.secondary,
    },
    travelPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: EVENT_COLORS.court + "22",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      marginLeft: 4,
    },
    travelPillText: {
      fontSize: 10,
      color: EVENT_COLORS.court,
      fontWeight: "700",
    },
    heroActions: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    heroActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    heroActionBtnGhost: {
      borderColor: Backgrounds.surface,
    },
    heroActionText: {
      fontSize: 13,
      fontWeight: "700",
    },

    // Hero empty
    heroEmpty: {
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Backgrounds.surface,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      alignItems: "center",
    },
    heroEmptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: Backgrounds.elevated,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: Spacing.md,
    },
    heroEmptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: TextColors.primary,
      textAlign: "center",
      marginBottom: Spacing.lg,
    },
    heroEmptyCtas: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    heroEmptyCta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 10,
      borderRadius: BorderRadius.full,
    },
    heroEmptyCtaText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#0A0A0A",
    },

    // Secondary list under hero
    secondaryList: {
      marginTop: Spacing.md,
      gap: Spacing.sm,
    },
    secondaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      backgroundColor: Backgrounds.card,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderLeftWidth: 3,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopColor: Backgrounds.surface,
      borderRightColor: Backgrounds.surface,
      borderBottomColor: Backgrounds.surface,
    },
    secondaryTime: {
      fontSize: 13,
      fontWeight: "700",
      color: TextColors.primary,
      width: 50,
    },
    secondaryTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: TextColors.primary,
    },
    secondarySub: {
      fontSize: 12,
      color: TextColors.muted,
      marginTop: 1,
    },

    // FAB
    fab: {
      position: "absolute",
      right: Spacing.lg,
      borderRadius: BorderRadius.full,
      shadowColor: GlowColors.primary,
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    fabGradient: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderRadius: BorderRadius.full,
    },
    fabText: {
      fontSize: 14,
      fontWeight: "800",
      color: "#0A0A0A",
    },
    calendarSubscribeBtn: {
      position: "absolute",
      left: Spacing.lg,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: Backgrounds.card,
      borderWidth: 1,
      borderColor: Backgrounds.surface,
      alignItems: "center",
      justifyContent: "center",
    },

    // Sheets
    sheetOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: Backgrounds.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
    },
    monthSheet: {
      backgroundColor: Backgrounds.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: Backgrounds.surface,
      alignSelf: "center",
      marginBottom: Spacing.md,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: TextColors.primary,
      marginBottom: Spacing.md,
    },
    sheetCancel: {
      marginTop: Spacing.sm,
      paddingVertical: Spacing.md,
      alignItems: "center",
    },
    sheetCancelText: {
      fontSize: 15,
      color: TextColors.secondary,
      fontWeight: "600",
    },
    bookOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      borderRadius: BorderRadius.md,
    },
    bookOptionIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    bookOptionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: TextColors.primary,
    },
    bookOptionSubtitle: {
      fontSize: 12,
      color: TextColors.muted,
      marginTop: 2,
    },

    // Month grid
    monthHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingBottom: Spacing.sm,
    },
    monthNavBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Backgrounds.elevated,
      alignItems: "center",
      justifyContent: "center",
    },
    monthTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: "700",
      color: TextColors.primary,
      textAlign: "center",
    },
    weekdayRow: {
      flexDirection: "row",
      paddingHorizontal: 4,
      paddingBottom: 6,
    },
    weekdayLabel: {
      flex: 1,
      textAlign: "center",
      fontSize: 11,
      fontWeight: "700",
      color: TextColors.muted,
      textTransform: "uppercase",
    },
    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 2,
    },
    monthCell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 2,
      borderRadius: BorderRadius.sm,
    },
    monthCellOther: { opacity: 0.3 },
    monthCellToday: {
      backgroundColor: GlowColors.primary + "22",
    },
    monthCellSelected: {
      backgroundColor: GlowColors.primary,
    },
    monthCellVacation: {
      backgroundColor: EVENT_COLORS.court + "22",
    },
    monthCellText: {
      fontSize: 14,
      fontWeight: "700",
      color: TextColors.primary,
    },
    monthCellTextOther: { color: TextColors.muted },
    monthCellTextSelected: { color: "#0A0A0A" },
    monthDots: {
      flexDirection: "row",
      gap: 2,
      marginTop: 2,
      minHeight: 4,
    },
    monthDot: { width: 5, height: 5, borderRadius: 2.5 },

    // Vacation modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.8)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: Backgrounds.card,
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
      color: TextColors.primary,
    },
    modalSubtitle: {
      fontSize: 14,
      color: TextColors.secondary,
      marginBottom: Spacing.lg,
    },
    datePickerButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Backgrounds.elevated,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    datePickerLabel: {
      flex: 1,
      fontSize: 14,
      color: TextColors.secondary,
    },
    datePickerValue: {
      fontSize: 14,
      fontWeight: "600",
      color: TextColors.primary,
    },
    saveVacationButton: {
      marginTop: Spacing.lg,
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
    },
    saveVacationButtonDisabled: { opacity: 0.5 },
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
      color: TextColors.primary,
    },

    // Sport picker
    sportPickerOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: Spacing.xl,
    },
    sportPickerSheet: {
      backgroundColor: Backgrounds.elevated,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xl,
      width: "100%",
    },
    sportPickerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: TextColors.primary,
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
      borderColor: Backgrounds.surface,
      marginBottom: Spacing.sm,
    },
    sportPickerDot: { width: 10, height: 10, borderRadius: 5 },
    sportPickerOptionText: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      color: TextColors.primary,
    },
    sportPickerCancel: {
      marginTop: Spacing.sm,
      paddingVertical: Spacing.md,
      alignItems: "center",
    },
    sportPickerCancelText: {
      fontSize: 15,
      color: TextColors.secondary,
    },

    // Guest
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
    guestTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: TextColors.primary,
      marginTop: Spacing.xs,
      textAlign: "center",
    },
    guestSubtitle: {
      fontSize: 14,
      color: TextColors.secondary,
      marginTop: Spacing.xs,
      marginBottom: Spacing.xl,
      textAlign: "center",
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
      fontWeight: "700",
      color: Colors.dark.buttonText,
    },
  }),
);
