import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useInterval } from "@/hooks/useInterval";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
  Dimensions,
  ScrollView,
  FlatList,
  Keyboard,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { openDirections } from "@/lib/maps";
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
  runOnJS,
  FadeIn,
  withSequence,
  withRepeat,
  withDelay,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest, apiFetch, buildPhotoUrl } from "@/lib/query-client";
import { Image as ExpoImage } from "expo-image";
import { AnimatedCheck } from "@/components/AnimatedCheck";
import CoachProfileDrawer from "./CoachProfileDrawer";
import { CourtBookingPicker } from "./CourtBookingPicker";
import PaymentMethodPicker, { PaymentMethod } from "@/components/PaymentMethodPicker";
import { useTranslation } from "react-i18next";
import { getSportLabel, getSportColor } from "@/player/context/SportContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";

const { width: _SCREEN_WIDTH } = Dimensions.get("window");

interface Coach {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  color?: string | null;
}

interface DirectoryCoach {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  specialty?: string | null;
  yearsExperience?: string | null;
  specializations?: string[] | null;
  languages?: string[] | null;
  level?: number | null;
  openToOpportunities?: boolean | null;
  academyId?: string | null;
  academyName?: string | null;
  rating?: number | null;
  totalSessions?: number | null;
  bio?: string | null;
  certifications?: string[] | null;
  ballLevels?: string[] | null;
  isExternalPublicCoach?: boolean | null;
  hourlyRate?: string | number | null;
}

interface Location {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface AvailableSlot {
  coachId: string;
  coachName: string;
  coachPhotoUrl?: string | null;
  courtId: string;
  courtName: string;
  locationId: string | null;
  locationName: string;
  startTime: string;
  endTime: string;
  duration: number;
}

interface JoinableSession {
  id: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  duration: number;
  coachId: string;
  coachName: string;
  coachPhotoUrl?: string | null;
  courtId?: string | null;
  courtName: string;
  locationName: string;
  maxPlayers: number;
  currentPlayers: number;
  players: { id: string; name: string; profilePhotoUrl?: string | null }[];
  ballLevel?: string | null;
  skillLevel?: number | null;
  hasWaitlist?: boolean;
}

interface AcademyCourt {
  id: string;
  name: string;
  surface: string | null;
  locationId: string | null;
  locationName: string | null;
  requiresExternalBooking?: boolean | null;
}

interface PlayerBookingWizardProps {
  visible: boolean;
  onClose: () => void;
  onBookingSuccess?: () => void;
  onBuyPackage?: () => void;
  playerId?: string;
  playerBallLevel?: string | null;
  sport?: string;
  preselectedCoachId?: string;
  preselectedSessionId?: string;
  preselectedDate?: Date;
  preselectedSlot?: AvailableSlot;
}

type SessionType = "private" | "semi_private" | "group";

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
    label: "Private Lesson",
    subtitle: "1-on-1 with your coach",
    icon: "person",
    color: Colors.dark.primary,
    gradient: [Colors.dark.primary + "40", Colors.dark.primary + "10"],
  },
  {
    value: "semi_private",
    label: "Semi-Private",
    subtitle: "Train with 1 partner",
    icon: "people-outline",
    color: "#A855F7",
    gradient: ["#A855F740", "#A855F710"],
  },
  {
    value: "group",
    label: "Group Session",
    subtitle: "Join other players",
    icon: "people",
    color: Colors.dark.orange,
    gradient: [Colors.dark.orange + "40", Colors.dark.orange + "10"],
  },
];

const DURATIONS = [30, 45, 60, 90];
const WEEK_OPTIONS = [1, 4, 8];
const HOLD_STORAGE_KEY = "glowup:activeSlotReservation";
const TOTAL_SLIDES = 5;
const SLIDE_TITLES = [
  "Session Type",
  "When to Play",
  "Choose Session",
  "Details",
  "Confirm",
];

export default function PlayerBookingWizard({
  visible,
  onClose,
  onBookingSuccess,
  onBuyPackage,
  playerId,
  playerBallLevel: _playerBallLevel,
  sport = "tennis",
  preselectedCoachId,
  preselectedSessionId,
  preselectedDate,
  preselectedSlot,
}: PlayerBookingWizardProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const slideScrollPadding = useMemo(
    () => ({ paddingBottom: insets.bottom + 96, flexGrow: 1 }),
    [insets.bottom],
  );

  // ─── Core state ──────────────────────────────────────────────────────────────
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sessionType, setSessionType] = useState<SessionType>("private");

  // Step 1: date + filters
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterCoachId, setFilterCoachId] = useState<string | null>(null);
  const [filterLocationId, setFilterLocationId] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [showCoachFilterPicker, setShowCoachFilterPicker] = useState(false);

  // Step 1: location sub-picker (venue grouping — Bug #1)
  const [expandedVenueId, setExpandedVenueId] = useState<string | null>(null);
  const [filterCourtId, setFilterCourtId] = useState<string | null>(null);

  // Step 2: slot/session selection
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedSession, setSelectedSession] = useState<JoinableSession | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [expandedSlotKey, setExpandedSlotKey] = useState<string | null>(null);

  // Group sessions: week commitment
  const [weekCommitment, setWeekCommitment] = useState<number>(1);
  const [customWeeks, setCustomWeeks] = useState("");

  // Step 3: recurring weeks (private / semi-private) — Bug #6
  const [repeatWeeks, setRepeatWeeks] = useState<number>(1);

  // Bug #7: book-again card dismissal
  const [bookAgainDismissed, setBookAgainDismissed] = useState(false);

  // Semi-private: partner selection
  const [partnerQuery, setPartnerQuery] = useState("");
  const [selectedPartner, setSelectedPartner] = useState<{ id: string; name: string; profilePhotoUrl?: string | null } | null>(null);
  const [letCoachPair, setLetCoachPair] = useState(false);

  // Court availability cache: "locationId|startTime|endTime" -> boolean
  const [slotCourtValid, setSlotCourtValid] = useState<Map<string, boolean>>(new Map());

  // Court selection (existing override logic)
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [selectedCourtName, setSelectedCourtName] = useState<string | null>(null);

  // Reservation system
  const activeReservationRef = useRef<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<Date | null>(null);
  const [reservationSecondsLeft, setReservationSecondsLeft] = useState(0);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationLoading, setReservationLoading] = useState(false);

  // Step 3: details
  const [playerNote, setPlayerNote] = useState("");
  const [aiFocusSuggestions, setAiFocusSuggestions] = useState<string[]>([]);
  const [aiFocusLoading, setAiFocusLoading] = useState(false);
  const [aiFocusFetched, setAiFocusFetched] = useState(false);

  // Court booking declaration (for external courts)
  const [courtBookingStatus, setCourtBookingStatus] = useState<
    "academy_court" | "external_booked" | "external_pending" | null
  >(null);
  const [courtBookingNote, setCourtBookingNote] = useState("");
  const [courtBookingUrl, setCourtBookingUrl] = useState("");

  // Step 4: confirm
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credits");
  const [showSuccess, setShowSuccess] = useState(false);
  const [policyModalVisible, setPolicyModalVisible] = useState(false);

  // Coach profile drawer
  const [showCoachDrawer, setShowCoachDrawer] = useState(false);
  const [selectedCoachForDrawer, setSelectedCoachForDrawer] = useState<DirectoryCoach | null>(null);

  // Ref for scroll
  const slotListScrollViewRef = useRef<ScrollView>(null);
  const preHighlightedSlotYRef = useRef<number | null>(null);

  // Animation values
  const slideProgress = useSharedValue(0);
  const holdGlowOpacity = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const xpGain = useSharedValue(0);

  // ─── Computed ────────────────────────────────────────────────────────────────
  const selectedDateString = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
  }, [selectedDate]);

  // ─── Queries ─────────────────────────────────────────────────────────────────

  // Locations
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: visible,
  });

  // Available slots (coach availability)
  const availabilityQueryUrl = useMemo(() => {
    const params = new URLSearchParams({
      date: selectedDateString,
      duration: duration.toString(),
    });
    if (filterCoachId) params.append("coachId", filterCoachId);
    if (preselectedCoachId && !filterCoachId) params.append("coachId", preselectedCoachId);
    // Bug #1: pass filterCourtId so the server pre-filters slots to this court
    if (filterCourtId) params.append("courtId", filterCourtId);
    return `/api/player/availability?${params}`;
  }, [selectedDateString, duration, filterCoachId, preselectedCoachId, filterCourtId]);

  const [academyTimezone, setAcademyTimezone] = useState("Asia/Dubai");

  const { data: availabilityData, isLoading: slotsLoading } = useQuery<{ slots: AvailableSlot[]; academyTimezone: string }>({
    queryKey: [availabilityQueryUrl],
    enabled: visible && currentSlide >= 2,
  });

  const availableSlots: AvailableSlot[] = availabilityData?.slots ?? [];

  useEffect(() => {
    if (availabilityData?.academyTimezone) {
      setAcademyTimezone(availabilityData.academyTimezone);
    }
  }, [availabilityData?.academyTimezone]);

  // Joinable sessions
  const joinableSessionsUrl = useMemo(() => {
    const params = new URLSearchParams({ date: selectedDateString });
    if (!preselectedSessionId) params.set("sessionType", sessionType);
    if (sport) params.set("sport", sport);
    if (preselectedCoachId) params.set("coachId", preselectedCoachId);
    if (filterCoachId && !preselectedCoachId) params.set("coachId", filterCoachId);
    return `/api/player/joinable-sessions?${params}`;
  }, [selectedDateString, sessionType, sport, preselectedCoachId, filterCoachId, preselectedSessionId]);

  const { data: joinableSessions = [], isLoading: sessionsLoading } = useQuery<JoinableSession[]>({
    queryKey: [joinableSessionsUrl],
    enabled:
      visible &&
      currentSlide >= 2 &&
      (!!preselectedSessionId || sessionType === "group" || sessionType === "semi_private"),
  });

  // Academy coaches (for filter picker + coach drawer)
  const { data: academyCoachesData, isLoading: academyCoachesLoading } = useQuery<{ coaches: DirectoryCoach[] }>({
    queryKey: ["/api/player/academy-coaches", preselectedCoachId || null],
    queryFn: async () => {
      const url = preselectedCoachId
        ? `/api/player/academy-coaches?coachId=${encodeURIComponent(preselectedCoachId)}`
        : "/api/player/academy-coaches";
      const response = await apiFetch(url);
      if (!response.ok) throw new Error("Failed to load coaches");
      return response.json();
    },
    enabled: visible,
  });
  const directoryCoaches = academyCoachesData?.coaches || [];

  // Academy courts (for court booking declaration)
  const { data: academyCourts = [] } = useQuery<AcademyCourt[]>({
    queryKey: ["/api/player/academy-courts"],
    enabled: visible,
  });

  // Available courts after slot selection (for court selection in details)
  // Bug #2: if slot has no locationId, fall back to filterLocationId to avoid showing all courts
  const availableCourtsUrl = useMemo(() => {
    if (!selectedSlot || isJoining) return null;
    const params = new URLSearchParams({
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
    });
    const effectiveLocId = selectedSlot.locationId ?? filterLocationId;
    if (effectiveLocId) params.append("locationId", effectiveLocId);
    return `/api/player/available-courts?${params}`;
  }, [selectedSlot, isJoining, filterLocationId]);

  const { data: availableCourts = [] } = useQuery<{
    id: string;
    name: string;
    locationId: string | null;
    surface: string | null;
    requiresExternalBooking?: boolean;
  }[]>({
    queryKey: [availableCourtsUrl],
    enabled: !!availableCourtsUrl && visible,
  });

  // Auto-select single court
  useEffect(() => {
    if (availableCourts.length === 1 && !selectedCourtId) {
      setSelectedCourtId(availableCourts[0].id);
      setSelectedCourtName(availableCourts[0].name);
    }
  }, [availableCourts]);

  // Booking history for smart suggestions
  const { data: bookingHistory } = useQuery<{ requests: any[] }>({
    queryKey: ["/api/player/booking-requests?limit=20"],
    enabled: visible && currentSlide >= 1,
  });

  // Partner search
  const { data: partnerSearchData, isLoading: partnerSearchLoading } = useQuery<{ players: { id: string; name: string; profilePhotoUrl?: string | null; level?: number | null }[] }>({
    queryKey: [`/api/player/search-players?q=${encodeURIComponent(partnerQuery)}`],
    enabled: visible && partnerQuery.length >= 2 && sessionType === "semi_private",
  });

  // Credits
  const { data: creditsData } = useQuery<{ credits: { group: number; private: number; semi_private: number; court: number } }>({
    queryKey: [`/api/players/${playerId}/credits-summary`],
    enabled: !!playerId && visible,
  });

  // Pricing
  const resolvedCoachId = selectedSlot?.coachId || selectedSession?.coachId || preselectedCoachId || null;
  const resolvedCoach = resolvedCoachId ? directoryCoaches.find((c) => c.id === resolvedCoachId) : null;
  const resolvedAcademyId = resolvedCoach?.academyId || null;
  const isCrossAcademyResolvedCoach = !!resolvedCoach?.isExternalPublicCoach;

  const pricingType: "private" | "semi_private" | "group" | null =
    sessionType === "private" || sessionType === "semi_private" || sessionType === "group" ? sessionType : null;
  const pricingQueryKey = resolvedAcademyId && pricingType
    ? [`/api/player/academy-pricing/${resolvedAcademyId}/${pricingType}`]
    : ["/api/player/academy-pricing/none"];
  const { data: pricingData } = useQuery<
    | { available: true; sessionType: string; currency: string; pricePerSession: number | null; pricePerHour: number | null; isPerPerson: boolean }
    | { available: false }
  >({
    queryKey: pricingQueryKey,
    queryFn: async () => {
      if (!resolvedAcademyId || !pricingType) return { available: false } as const;
      const res = await apiFetch(`/api/player/academy-pricing/${resolvedAcademyId}/${pricingType}`);
      if (res.status === 404) return { available: false } as const;
      if (!res.ok) throw new Error("Failed to load pricing");
      return res.json();
    },
    enabled: visible && currentSlide >= 3 && !!resolvedAcademyId && !!pricingType,
    retry: false,
  });

  const lessonPriceInfo = useMemo(() => {
    if (!pricingData || !("available" in pricingData) || !pricingData.available) return null;
    const perHour = pricingData.pricePerHour || 0;
    const flat = pricingData.pricePerSession || 0;
    let amount = 0;
    if (perHour > 0) amount = Math.round(perHour * (duration / 60) * 100) / 100;
    else amount = Math.round(flat * 100) / 100;
    if (!amount || amount <= 0) return null;
    return { amount, currency: pricingData.currency || "AED" };
  }, [pricingData, duration]);

  const creditsForType = useMemo(() => {
    const c = creditsData?.credits;
    if (!c) return 0;
    if (sessionType === "private") return c.private || 0;
    if (sessionType === "semi_private") return c.semi_private || 0;
    if (sessionType === "group") return c.group || 0;
    return 0;
  }, [creditsData, sessionType]);

  const cardEnabled = isCrossAcademyResolvedCoach ? true : !!lessonPriceInfo;

  // Coach tier pricing (for private lesson rate overview)
  const { data: tierPricingData } = useQuery<{
    tiers: Array<{
      role: string;
      price60min: string | null;
      price90min: string | null;
      price120min: string | null;
      currency: string | null;
    }>;
  }>({
    queryKey: ["/api/player/academy-tier-pricing"],
    enabled: visible && sessionType === "private" && currentSlide >= 1,
    staleTime: 5 * 60 * 1000,
  });

  // Cancellation policy
  const { data: policyData } = useQuery<{ cancellationPolicy: string }>({
    queryKey: [`/api/player/academy-cancellation-policy/${resolvedAcademyId}`],
    enabled: visible && !!resolvedAcademyId,
    staleTime: 5 * 60 * 1000,
  });
  const cancellationPolicy = policyData?.cancellationPolicy || "Free cancellation up to 24 hours before the lesson";

  // ─── Court availability enforcement ─────────────────────────────────────────
  useEffect(() => {
    if (!availableSlots.length || currentSlide < 2) return;

    const uniqueChecks = new Map<string, { locationId: string; startTime: string; endTime: string }>();
    availableSlots.forEach((slot) => {
      if (!slot.locationId) return;
      const key = `${slot.locationId}|${slot.startTime}|${slot.endTime}`;
      if (!uniqueChecks.has(key)) {
        uniqueChecks.set(key, { locationId: slot.locationId, startTime: slot.startTime, endTime: slot.endTime });
      }
    });

    if (uniqueChecks.size === 0) return;

    const checks = Array.from(uniqueChecks.entries());
    Promise.all(
      checks.map(async ([key, { locationId, startTime, endTime }]) => {
        const url = `/api/player/available-courts?locationId=${encodeURIComponent(locationId)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;
        try {
          const res = await apiFetch(url);
          const courts = await res.json();
          return { key, hasFreeCourt: Array.isArray(courts) && courts.length > 0 };
        } catch {
          return { key, hasFreeCourt: true };
        }
      }),
    ).then((results) => {
      setSlotCourtValid((prev) => {
        const next = new Map(prev);
        results.forEach(({ key, hasFreeCourt }) => next.set(key, hasFreeCourt));
        return next;
      });
    });
  }, [availableSlots, currentSlide]);

  // Filter slots: only show if court is confirmed free (or no locationId)
  const courtEnforcedSlots = useMemo(() => {
    return availableSlots.filter((slot) => {
      if (!slot.locationId) return true;
      const key = `${slot.locationId}|${slot.startTime}|${slot.endTime}`;
      if (!slotCourtValid.has(key)) return true; // optimistically show while checking
      return slotCourtValid.get(key) === true;
    });
  }, [availableSlots, slotCourtValid]);

  // Location-filtered slots
  const filteredSlots = useMemo(() => {
    return courtEnforcedSlots.filter((slot) => {
      if (!filterLocationId) return true;
      return !slot.locationId || slot.locationId === filterLocationId;
    });
  }, [courtEnforcedSlots, filterLocationId]);

  // Group slots by coach
  const slotsByCoach = useMemo(() => {
    const map = new Map<string, { coach: { id: string; name: string; photoUrl?: string | null }; slots: AvailableSlot[] }>();
    filteredSlots.forEach((slot) => {
      if (!map.has(slot.coachId)) {
        map.set(slot.coachId, { coach: { id: slot.coachId, name: slot.coachName, photoUrl: slot.coachPhotoUrl }, slots: [] });
      }
      map.get(slot.coachId)!.slots.push(slot);
    });
    return Array.from(map.values());
  }, [filteredSlots]);

  // ─── Smart suggestions ───────────────────────────────────────────────────────
  const smartSuggestions = useMemo(() => {
    const reqs: any[] = bookingHistory?.requests || [];
    if (reqs.length < 2) return [];

    // Find most frequent coach
    const coachCounts = new Map<string, { id: string; name: string; count: number; times: string[] }>();
    reqs.forEach((r: any) => {
      if (!r.coachId || !r.coachName) return;
      if (!coachCounts.has(r.coachId)) {
        coachCounts.set(r.coachId, { id: r.coachId, name: r.coachName, count: 0, times: [] });
      }
      const entry = coachCounts.get(r.coachId)!;
      entry.count++;
      if (r.requestedStart) {
        const d = new Date(r.requestedStart);
        const timeStr = d.toLocaleTimeString("en-US", { timeZone: academyTimezone, hour: "numeric", minute: "2-digit" });
        const dayStr = d.toLocaleDateString("en-US", { timeZone: academyTimezone, weekday: "long" });
        entry.times.push(`${dayStr} ${timeStr}`);
      }
    });

    const topCoach = Array.from(coachCounts.values()).sort((a, b) => b.count - a.count)[0];
    if (!topCoach) return [];

    const suggestions: { key: string; text: string; coachId: string; coachName: string; locationId?: string | null; courtId?: string | null; duration?: number; nextDate?: Date }[] = [];

    // Suggestion 1: usual coach
    const mostFreqTime = topCoach.times.length > 0
      ? topCoach.times.sort((a, b) =>
          topCoach.times.filter((t) => t === b).length - topCoach.times.filter((t) => t === a).length,
        )[0]
      : null;

    if (mostFreqTime) {
      suggestions.push({
        key: "usual",
        text: `Your usual session with ${topCoach.name} (${mostFreqTime})`,
        coachId: topCoach.id,
        coachName: topCoach.name,
      });
    }

    // Suggestion 2: train more this week
    const today = new Date();
    const thisWeekCount = reqs.filter((r: any) => {
      if (!r.requestedStart) return false;
      const d = new Date(r.requestedStart);
      const diffDays = Math.abs((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }).length;

    if (thisWeekCount === 1 && topCoach.count >= 2) {
      suggestions.push({
        key: "train_more",
        text: `You usually train 2x/week. Book another session with ${topCoach.name}?`,
        coachId: topCoach.id,
        coachName: topCoach.name,
      });
    }

    return suggestions.slice(0, 2);
  }, [bookingHistory, academyTimezone]);

  // Bug #7: "Book Again" — the last confirmed private session
  const bookAgainSuggestion = useMemo(() => {
    const reqs: any[] = bookingHistory?.requests || [];
    const confirmed = reqs.find(
      (r: any) =>
        r.status === "approved" &&
        (r.sessionType === "private" || r.sessionType === "semi_private") &&
        r.requestedStart &&
        r.coachId,
    );
    if (!confirmed) return null;
    const past = new Date(confirmed.requestedStart);
    const dayOfWeek = past.getDay();
    // Next occurrence of that day-of-week
    const next = new Date();
    const daysUntil = (dayOfWeek - next.getDay() + 7) % 7 || 7;
    next.setDate(next.getDate() + daysUntil);
    const timeStr = past.toLocaleTimeString("en-US", { timeZone: academyTimezone, hour: "numeric", minute: "2-digit" });
    const dayName = past.toLocaleDateString("en-US", { timeZone: academyTimezone, weekday: "long" });
    return {
      coachId: confirmed.coachId as string,
      coachName: (confirmed.coachName as string) || "Coach",
      locationId: (confirmed.locationId as string | null) ?? null,
      courtId: (confirmed.courtId as string | null) ?? null,
      duration: (confirmed.duration as number) || 60,
      nextDate: next,
      label: `${dayName} at ${timeStr}`,
    };
  }, [bookingHistory, academyTimezone]);

  // ─── Reservation system ───────────────────────────────────────────────────────
  const reserveSlotMutation = useMutation({
    mutationFn: async (data: { coachId: string; startTime: string; endTime: string }) => {
      const res = await apiRequest("POST", "/api/player/reserve-slot", data);
      return res.json() as Promise<{ reservationId: string; expiresAt: string }>;
    },
    onSuccess: (data) => {
      activeReservationRef.current = data.reservationId;
      setReservationId(data.reservationId);
      setReservationExpiresAt(new Date(data.expiresAt));
      setReservationError(null);
      setReservationLoading(false);
    },
    onError: (error: any) => {
      setReservationLoading(false);
      const msg: string = error?.message || "";
      if (msg.includes("slot_taken") || msg.includes("409")) {
        setReservationError("Someone just grabbed this slot!");
        queryClient.invalidateQueries({ queryKey: [availabilityQueryUrl] });
        setSelectedSlot(null);
      } else {
        setReservationError("Could not lock this slot. Please try again.");
      }
    },
  });

  useInterval(() => {
    if (!reservationExpiresAt) return;
    const left = Math.max(0, Math.round((reservationExpiresAt.getTime() - Date.now()) / 1000));
    setReservationSecondsLeft(left);
    if (left === 0) {
      activeReservationRef.current = null;
      setReservationId(null);
      setReservationExpiresAt(null);
      setSelectedSlot(null);
      setReservationError("Your hold expired — please pick a slot again.");
      queryClient.invalidateQueries({ queryKey: [availabilityQueryUrl] });
      AsyncStorage.removeItem(HOLD_STORAGE_KEY).catch(() => {});
    }
  }, reservationExpiresAt ? 1000 : null);

  // Persist reservation to AsyncStorage
  useEffect(() => {
    if (reservationId && reservationExpiresAt && selectedSlot) {
      const holdData = {
        reservationId,
        expiresAt: reservationExpiresAt.toISOString(),
        slot: selectedSlot,
        selectedDate: selectedDateString,
        duration,
        sessionType,
      };
      AsyncStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(holdData)).catch(() => {});
    }
  }, [reservationId, reservationExpiresAt, selectedSlot]);

  // Auto-select preselected session
  useEffect(() => {
    if (!preselectedSessionId) return;
    if (selectedSession?.id === preselectedSessionId) return;
    const match = joinableSessions.find((s) => s.id === preselectedSessionId);
    if (match) {
      setSelectedSession(match);
      setIsJoining(true);
      const validTypes = ["private", "semi_private", "group"] as const;
      if (validTypes.includes(match.sessionType as typeof validTypes[number])) {
        setSessionType(match.sessionType as typeof validTypes[number]);
      }
    }
  }, [preselectedSessionId, joinableSessions, selectedSession?.id]);

  // Auto-select preselected slot
  useEffect(() => {
    if (!preselectedSlot || !visible || currentSlide < 2) return;
    if (availableSlots.length === 0 || slotsLoading) return;
    if (selectedSlot) return;
    const preTime = preselectedSlot.startTime.substring(11, 16);
    const match = availableSlots.find(
      (s) => s.coachId === preselectedSlot.coachId && s.startTime.substring(11, 16) === preTime,
    );
    if (!match) return;
    setSelectedSlot(match);
    setSelectedSession(null);
    setIsJoining(false);
    setReservationLoading(true);
    reserveSlotMutation.mutate({ coachId: match.coachId, startTime: match.startTime, endTime: match.endTime });
    setTimeout(() => {
      if (preHighlightedSlotYRef.current !== null) {
        slotListScrollViewRef.current?.scrollTo({ y: Math.max(0, preHighlightedSlotYRef.current - 80), animated: true });
      }
    }, 500);
  }, [preselectedSlot, availableSlots, slotsLoading, visible, currentSlide, selectedSlot]);

  // Reset court when slot changes
  useEffect(() => {
    if (isJoining) {
      setSelectedCourtId(null);
      setSelectedCourtName(null);
      return;
    }
    setSelectedCourtId(null);
    setSelectedCourtName(null);
  }, [selectedSlot, selectedSession, isJoining]);

  // AI focus suggestions when entering details slide
  useEffect(() => {
    if (currentSlide === 3 && !aiFocusFetched && visible) {
      setAiFocusLoading(true);
      setAiFocusFetched(true);
      apiRequest("POST", "/api/player/booking-ai-focus", {})
        .then((res) => res.json())
        .then((data: any) => setAiFocusSuggestions(data?.suggestions || []))
        .catch(() => setAiFocusSuggestions([]))
        .finally(() => setAiFocusLoading(false));
    }
  }, [currentSlide, aiFocusFetched, visible]);

  // Payment method defaults
  useEffect(() => {
    if (!visible || currentSlide < 3) return;
    if (creditsForType >= 1) setPaymentMethod("credits");
    else if (cardEnabled) setPaymentMethod("card");
    else setPaymentMethod("pay_later");
  }, [visible, currentSlide, creditsForType, cardEnabled, sessionType]);

  // ─── Booking mutations ────────────────────────────────────────────────────────
  const bookingMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      return apiRequest("POST", "/api/player/booking-requests", bookingData);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const holdId = activeReservationRef.current;
      if (holdId) {
        apiRequest("DELETE", `/api/player/reserve-slot/${holdId}`, undefined).catch(() => {});
        activeReservationRef.current = null;
      }
      setReservationId(null);
      setReservationExpiresAt(null);
      AsyncStorage.removeItem(HOLD_STORAGE_KEY).catch(() => {});
      setShowSuccess(true);
      xpGain.value = withSequence(withTiming(1, { duration: 500 }), withDelay(2000, withTiming(0, { duration: 300 })));
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setTimeout(() => {
        resetForm();
        if (onBookingSuccess) onBookingSuccess();
        else onClose();
      }, 2500);
    },
    onError: (error: Error) => {
      let message = error.message || "Failed to submit booking request";
      const colonIdx = message.indexOf(": ");
      if (colonIdx !== -1) {
        const body = message.slice(colonIdx + 2);
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error) message = parsed.error;
        } catch {
          if (body) message = body;
        }
      }
      Alert.alert("Booking Failed", message || "Could not submit your booking request. Please try again.");
    },
  });

  const dropInLessonMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      const res = await apiRequest("POST", "/api/player/drop-in-lesson/checkout", bookingData);
      return res.json() as Promise<{ checkoutUrl: string; price: number }>;
    },
    onSuccess: async (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const holdId = activeReservationRef.current;
      if (holdId) {
        apiRequest("DELETE", `/api/player/reserve-slot/${holdId}`, undefined).catch(() => {});
        activeReservationRef.current = null;
      }
      setReservationId(null);
      setReservationExpiresAt(null);
      AsyncStorage.removeItem(HOLD_STORAGE_KEY).catch(() => {});
      try {
        if (data?.checkoutUrl) await Linking.openURL(data.checkoutUrl);
      } catch {
        Alert.alert("Couldn't open payment", "We couldn't open the secure payment page. Please try again.");
        return;
      }
      Alert.alert(
        "Payment in progress",
        "Finish payment in the secure window to confirm your lesson. You'll see it in your bookings once payment is confirmed.",
        [{ text: "OK", onPress: () => { resetForm(); onClose(); } }],
      );
    },
    onError: (error: Error) => {
      let message = error.message || "Failed to start payment";
      const colonIdx = message.indexOf(": ");
      if (colonIdx !== -1) {
        const body = message.slice(colonIdx + 2);
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error) message = parsed.error;
        } catch {
          if (body) message = body;
        }
      }
      Alert.alert("Payment Failed", message);
    },
  });

  // ─── Reset form ───────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    activeReservationRef.current = null;
    setCurrentSlide(0);
    setSessionType("private");
    setSelectedDate(new Date());
    setFilterCoachId(null);
    setFilterLocationId(null);
    setFilterCourtId(null);
    setExpandedVenueId(null);
    setDuration(60);
    setSelectedSlot(null);
    setSelectedSession(null);
    setIsJoining(false);
    setExpandedSlotKey(null);
    setWeekCommitment(1);
    setCustomWeeks("");
    setRepeatWeeks(1);
    setBookAgainDismissed(false);
    setPartnerQuery("");
    setSelectedPartner(null);
    setLetCoachPair(false);
    setSelectedCourtId(null);
    setSelectedCourtName(null);
    setPlayerNote("");
    setAiFocusSuggestions([]);
    setAiFocusFetched(false);
    setCourtBookingStatus(null);
    setCourtBookingNote("");
    setCourtBookingUrl("");
    setReservationId(null);
    setReservationExpiresAt(null);
    setReservationSecondsLeft(0);
    setReservationError(null);
    setReservationLoading(false);
    setShowSuccess(false);
    setShowCoachDrawer(false);
    setSelectedCoachForDrawer(null);
    setSlotCourtValid(new Map());
  }, []);

  // ─── Mount/unmount effects ─────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      slideProgress.value = 0;
      // Restore reservation from AsyncStorage
      AsyncStorage.getItem(HOLD_STORAGE_KEY).then((raw) => {
        if (!raw) return;
        try {
          const stored = JSON.parse(raw);
          if (!stored?.expiresAt || !stored?.slot || !stored?.reservationId) return;
          const expiresAt = new Date(stored.expiresAt);
          if (expiresAt.getTime() <= Date.now()) { AsyncStorage.removeItem(HOLD_STORAGE_KEY).catch(() => {}); return; }
          activeReservationRef.current = stored.reservationId;
          setReservationId(stored.reservationId);
          setReservationExpiresAt(expiresAt);
          setSelectedSlot(stored.slot);
          if (stored.selectedDate) {
            const [y, m, d] = stored.selectedDate.split("-").map(Number);
            setSelectedDate(new Date(y, m - 1, d));
          }
          if (stored.duration) setDuration(stored.duration);
          const validSessionTypes = ["private", "semi_private", "group"] as const;
          if (stored.sessionType && validSessionTypes.includes(stored.sessionType)) {
            setSessionType(stored.sessionType as typeof validSessionTypes[number]);
          }
          setCurrentSlide(2);
        } catch { /* ignore */ }
      }).catch(() => {});

      if (preselectedCoachId) {
        setFilterCoachId(preselectedCoachId);
        if (preselectedSessionId) { setIsJoining(true); }
        else { setSessionType("private"); }
        if (preselectedDate) setSelectedDate(preselectedDate);
        setCurrentSlide(2);
      } else if (preselectedDate) {
        setSelectedDate(preselectedDate);
        setCurrentSlide(1);
      }
    } else {
      resetForm();
    }
  }, [visible, preselectedCoachId, preselectedSessionId, preselectedDate]);

  // Glow pulse animation
  useEffect(() => {
    const pulse = () => {
      glowPulse.value = withTiming(1, { duration: 1500 }, () => {
        glowPulse.value = withTiming(0, { duration: 1500 }, () => { runOnJS(pulse)(); });
      });
    };
    if (visible) pulse();
  }, [visible]);

  // Progress bar
  useEffect(() => {
    slideProgress.value = withSpring(currentSlide / (TOTAL_SLIDES - 1), { damping: 20, stiffness: 90 });
  }, [currentSlide]);

  // Hold glow
  useEffect(() => {
    if (reservationId && selectedSlot) {
      holdGlowOpacity.value = withRepeat(
        withSequence(withTiming(0.85, { duration: 700 }), withTiming(0.2, { duration: 700 })),
        -1, true,
      );
    } else {
      holdGlowOpacity.value = withTiming(0, { duration: 250 });
    }
  }, [reservationId, selectedSlot]);

  // ─── Resolved court/booking logic ─────────────────────────────────────────────
  const resolvedCourtId = useMemo<string | null>(() => {
    return selectedCourtId ?? selectedSlot?.courtId ?? (isJoining && selectedSession ? (selectedSession as any).courtId ?? null : null);
  }, [selectedCourtId, selectedSlot, selectedSession, isJoining]);

  const resolvedCourt = useMemo<{ requiresExternalBooking?: boolean | null } | null>(() => {
    if (!resolvedCourtId) return null;
    const fromAvailable = availableCourts.find((c) => c.id === resolvedCourtId);
    if (fromAvailable) return fromAvailable;
    const fromAcademy = academyCourts.find((c) => c.id === resolvedCourtId);
    return fromAcademy ?? null;
  }, [resolvedCourtId, availableCourts, academyCourts]);

  const isAcademyCourt = useMemo(() => {
    if (!resolvedCourt) return false;
    return !resolvedCourt.requiresExternalBooking;
  }, [resolvedCourt]);

  const requiresExternalBooking = useMemo(() => !!resolvedCourt?.requiresExternalBooking, [resolvedCourt]);
  const courtBookingValid = useMemo(() => isAcademyCourt ? true : !!courtBookingStatus, [isAcademyCourt, courtBookingStatus]);

  // ─── Cross-academy logic ──────────────────────────────────────────────────────
  const isCrossAcademyDropInCoach = useCallback((coachId: string | null | undefined) => {
    if (!coachId) return false;
    const dc = directoryCoaches.find((c) => c.id === coachId);
    return !!dc?.isExternalPublicCoach;
  }, [directoryCoaches]);

  // ─── canProceed ───────────────────────────────────────────────────────────────
  const canProceed = useMemo(() => {
    switch (currentSlide) {
      case 0: return !!sessionType;
      case 1: return true;
      case 2:
        if (sessionType === "group") return !!selectedSession;
        return !!selectedSlot || !!selectedSession;
      case 3:
        if (sessionType === "semi_private" && !letCoachPair && !selectedPartner) return false;
        if (requiresExternalBooking) return courtBookingValid;
        return true;
      case 4: return true;
      default: return false;
    }
  }, [currentSlide, sessionType, selectedSlot, selectedSession, selectedPartner, letCoachPair, courtBookingValid, requiresExternalBooking]);

  // ─── Navigation ────────────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (currentSlide === 2 && !selectedSlot && !selectedSession) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Pick a session first", "Tap an available time or session before continuing.");
      return;
    }
    if (currentSlide < TOTAL_SLIDES - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentSlide((prev) => prev + 1);
    }
  }, [currentSlide, selectedSlot, selectedSession]);

  const goBack = useCallback(() => {
    if (currentSlide > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  // ─── Handle book ──────────────────────────────────────────────────────────────
  const handleBook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const courtBookingPayload = {
      courtBookingStatus: isAcademyCourt ? "academy_court" : (courtBookingStatus || null),
      courtBookingNote: !isAcademyCourt && courtBookingNote ? courtBookingNote.trim() : null,
      courtBookingUrl: !isAcademyCourt && courtBookingUrl ? courtBookingUrl.trim() : null,
    };

    if (isJoining && selectedSession) {
      const bookingData = {
        sessionId: selectedSession.id,
        coachId: selectedSession.coachId,
        requestedStart: selectedSession.startTime,
        requestedEnd: selectedSession.endTime,
        duration: selectedSession.duration,
        sessionType: selectedSession.sessionType,
        playerNote: playerNote || null,
        isJoinRequest: true,
        weeksCommitment: sessionType === "group" ? weekCommitment : undefined,
        paymentIntent: paymentMethod === "pay_later" ? "pay_later" : "credits",
        ...courtBookingPayload,
      };
      bookingMutation.mutate(bookingData);
    } else if (selectedSlot) {
      const wantsCardPath = isCrossAcademyDropInCoach(selectedSlot.coachId) || paymentMethod === "card";
      if (wantsCardPath) {
        const checkoutData = {
          coachId: selectedSlot.coachId,
          locationId: selectedSlot.locationId ?? undefined,
          courtId: (selectedCourtId ?? selectedSlot.courtId) ?? undefined,
          requestedStart: selectedSlot.startTime,
          requestedEnd: selectedSlot.endTime,
          duration: selectedSlot.duration,
          sessionType,
          playerNote: playerNote || null,
          bookingType: isCrossAcademyDropInCoach(selectedSlot.coachId) ? "drop_in" : "internal_lesson",
        };
        dropInLessonMutation.mutate(checkoutData);
        return;
      }

      const bookingData = {
        coachId: selectedSlot.coachId ?? undefined,
        locationId: selectedSlot.locationId ?? filterLocationId ?? undefined,
        courtId: (selectedCourtId ?? selectedSlot.courtId) ?? undefined,
        requestedStart: selectedSlot.startTime,
        requestedEnd: selectedSlot.endTime,
        duration: selectedSlot.duration,
        sessionType,
        playerNote: playerNote || null,
        partnerPlayerId: sessionType === "semi_private" && selectedPartner ? selectedPartner.id : undefined,
        letCoachPair: sessionType === "semi_private" && letCoachPair ? true : undefined,
        reservationId: reservationId || undefined,
        paymentIntent: paymentMethod === "pay_later" ? "pay_later" : "credits",
        // Bug #6: Recurring bookings — send repeatWeeks for private/semi-private
        repeatWeeks: (sessionType === "private" || sessionType === "semi_private") && repeatWeeks > 1 ? repeatWeeks : undefined,
        ...courtBookingPayload,
      };
      bookingMutation.mutate(bookingData);
    }
  }, [
    isJoining, selectedSession, selectedSlot, sessionType, playerNote, selectedCourtId,
    bookingMutation, dropInLessonMutation, isCrossAcademyDropInCoach, isAcademyCourt,
    courtBookingStatus, courtBookingNote, courtBookingUrl, paymentMethod, weekCommitment,
    selectedPartner, letCoachPair, reservationId, repeatWeeks, filterLocationId,
  ]);

  // ─── Animated styles ──────────────────────────────────────────────────────────
  const progressStyle = useAnimatedStyle(() => ({ width: `${slideProgress.value * 100}%` }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.02]) }],
  }));
  const xpStyle = useAnimatedStyle(() => ({
    opacity: xpGain.value,
    transform: [{ translateY: interpolate(xpGain.value, [0, 1], [20, 0]) }, { scale: interpolate(xpGain.value, [0, 1], [0.8, 1]) }],
  }));
  const holdGlowAnimStyle = useAnimatedStyle(() => ({
    shadowColor: Colors.dark.primary,
    shadowOpacity: holdGlowOpacity.value,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  }));

  // ─── Resolved location name (for filter-based display) ───────────────────────
  const resolvedLocationName = useMemo(() => {
    if (filterLocationId) {
      return locations.find((l) => l.id === filterLocationId)?.name ?? null;
    }
    return null;
  }, [filterLocationId, locations]);

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("en-US", {
      timeZone: academyTimezone,
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDateHeader = (date: Date) => {
    const tz = academyTimezone;
    const localDateStr = date.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const todayStr = new Date().toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrowDate.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    if (localDateStr === todayStr) return "Today";
    if (localDateStr === tomorrowStr) return "Tomorrow";
    return date.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  };

  const releaseSlot = useCallback((slotId: string | null) => {
    if (!slotId) return;
    apiRequest("DELETE", `/api/player/reserve-slot/${slotId}`, undefined).catch(() => {});
    activeReservationRef.current = null;
    setReservationId(null);
    setReservationExpiresAt(null);
    AsyncStorage.removeItem(HOLD_STORAGE_KEY).catch(() => {});
  }, []);

  // ─── SLIDE 0: Session Type ────────────────────────────────────────────────────
  const renderSessionTypeSlide = () => (
    <Animated.View entering={FadeIn} style={styles.slideContent}>
      {/* Bug #7: Book Again card */}
      {bookAgainSuggestion && !bookAgainDismissed && (
        <View style={styles.bookAgainCard}>
          <LinearGradient
            colors={[Colors.dark.primary + "18", Colors.dark.backgroundSecondary]}
            style={styles.bookAgainGradient}
          >
            <View style={styles.bookAgainHeader}>
              <View style={[styles.bookAgainIconWrap]}>
                <Ionicons name="repeat" size={18} color={Colors.dark.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bookAgainTitle}>Book again with {bookAgainSuggestion.coachName}</Text>
                <Text style={styles.bookAgainSub}>{bookAgainSuggestion.label}</Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBookAgainDismissed(true); }}
              >
                <Ionicons name="close" size={16} color={Colors.dark.textSecondary} />
              </Pressable>
            </View>
            <Pressable
              style={styles.bookAgainBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setFilterCoachId(bookAgainSuggestion.coachId);
                if (bookAgainSuggestion.locationId) setFilterLocationId(bookAgainSuggestion.locationId);
                if (bookAgainSuggestion.duration) setDuration(bookAgainSuggestion.duration);
                setSelectedDate(bookAgainSuggestion.nextDate);
                setSessionType("private");
                setCurrentSlide(2);
              }}
            >
              <Ionicons name="flash" size={14} color={Colors.dark.buttonText} />
              <Text style={styles.bookAgainBtnText}>Book same slot</Text>
            </Pressable>
          </LinearGradient>
        </View>
      )}
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
                goNext();
              }}
              style={[styles.sessionTypeCard, isSelected && { borderColor: type.color, borderWidth: 2 }]}
            >
              <LinearGradient
                colors={isSelected ? type.gradient : [Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
                style={styles.sessionTypeCardGradient}
              >
                {isSelected && <View style={[styles.glowOrb, { backgroundColor: type.color }]} />}
                <View style={[styles.sessionTypeIcon, { backgroundColor: type.color + "30" }]}>
                  <Ionicons name={type.icon} size={32} color={type.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sessionTypeLabel, isSelected && { color: type.color }]}>{type.label}</Text>
                  <Text style={styles.sessionTypeSubtitle}>{type.subtitle}</Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={22} color={type.color} />}
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );

  // ─── SLIDE 1: When to Play ─────────────────────────────────────────────────────
  const renderWhenSlide = () => {
    const selectedTypeCard = SESSION_TYPE_CARDS.find((t) => t.value === sessionType);
    return (
      <Animated.View entering={FadeIn} style={styles.slideContent}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={slideScrollPadding}>

          {/* Smart suggestions */}
          {smartSuggestions.length > 0 && (
            <View style={styles.suggestionsSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles" size={16} color={Colors.dark.primary} />
                <Text style={styles.sectionTitle}>Smart Suggestions</Text>
              </View>
              {smartSuggestions.map((s) => (
                <Pressable
                  key={s.key}
                  style={styles.suggestionCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setFilterCoachId(s.coachId);
                    goNext();
                  }}
                >
                  <View style={[styles.suggestionIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
                    <Ionicons name="person" size={18} color={Colors.dark.primary} />
                  </View>
                  <Text style={styles.suggestionText} numberOfLines={2}>{s.text}</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.dark.primary} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Date picker */}
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Choose Date</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
            {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
              const date = new Date();
              date.setDate(date.getDate() + offset);
              const isSelected = date.toDateString() === selectedDate.toDateString();
              return (
                <Pressable
                  key={offset}
                  style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedDate(date); }}
                >
                  <Text style={[styles.dateChipDay, isSelected && styles.dateChipTextSelected]}>
                    {offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : date.toLocaleDateString([], { weekday: "short" })}
                  </Text>
                  <Text style={[styles.dateChipDate, isSelected && styles.dateChipTextSelected]}>
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.dateChip} onPress={() => setShowCalendarModal(true)}>
              <Ionicons name="calendar-outline" size={20} color={Colors.dark.textSecondary} />
              <Text style={styles.dateChipDay}>More</Text>
            </Pressable>
          </ScrollView>

          {/* Filters */}
          <View style={[styles.sectionHeader, { marginTop: Spacing.lg }]}>
            <Ionicons name="options" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Filters</Text>
            <Text style={styles.filterOptional}>(optional)</Text>
          </View>

          {/* Duration filter */}
          <Text style={styles.filterLabel}>Duration</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {DURATIONS.map((dur) => (
              <Pressable
                key={dur}
                style={[styles.filterChip, duration === dur && styles.filterChipSelected]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDuration(dur); }}
              >
                <Text style={[styles.filterChipText, duration === dur && styles.filterChipTextSelected]}>
                  {dur} min
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Location filter — visual cards with venue grouping (Bug #1) */}
          {locations.length > 0 && (
            <>
              <Text style={styles.filterLabel}>Location</Text>
              {/* "Any" tile */}
              <View style={styles.locationGrid}>
                <Pressable
                  style={[styles.locationCard, !filterLocationId && styles.locationCardSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFilterLocationId(null);
                    setFilterCourtId(null);
                    setExpandedVenueId(null);
                  }}
                >
                  <View style={[styles.locationCardIcon, !filterLocationId && { backgroundColor: Colors.dark.primary + "20" }]}>
                    <Ionicons name="earth-outline" size={18} color={!filterLocationId ? Colors.dark.primary : Colors.dark.textSecondary} />
                  </View>
                  <Text style={[styles.locationCardName, !filterLocationId && styles.locationCardNameSelected]} numberOfLines={2}>Any</Text>
                  {!filterLocationId ? <Ionicons name="checkmark-circle" size={13} color={Colors.dark.primary} style={{ marginTop: 2 }} /> : null}
                </Pressable>
                {locations.map((loc) => {
                  const isLocSel = filterLocationId === loc.id;
                  // Courts at this venue (from the academy-courts query)
                  const venueCourts = academyCourts.filter((c) => c.locationId === loc.id);
                  const isMultiCourt = venueCourts.length > 1;
                  const isExpanded = expandedVenueId === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      style={[styles.locationCard, isLocSel && styles.locationCardSelected]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (isMultiCourt && !isLocSel) {
                          // Open court sub-picker instead of immediately filtering
                          setExpandedVenueId(isExpanded ? null : loc.id);
                        } else {
                          // Single-court venue OR re-tap to deselect — set filter directly
                          if (isLocSel) {
                            setFilterLocationId(null);
                            setFilterCourtId(null);
                          } else {
                            setFilterLocationId(loc.id);
                            setFilterCourtId(null);
                          }
                          setExpandedVenueId(null);
                        }
                      }}
                    >
                      <View style={[styles.locationCardIcon, isLocSel && { backgroundColor: Colors.dark.primary + "20" }]}>
                        <Ionicons name="tennisball-outline" size={18} color={isLocSel ? Colors.dark.primary : Colors.dark.textSecondary} />
                      </View>
                      <Text style={[styles.locationCardName, isLocSel && styles.locationCardNameSelected]} numberOfLines={2}>{loc.name}</Text>
                      {isLocSel ? (
                        <Ionicons name="checkmark-circle" size={13} color={Colors.dark.primary} style={{ marginTop: 2 }} />
                      ) : isMultiCourt ? (
                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={12} color={Colors.dark.textSecondary} style={{ marginTop: 2 }} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {/* Court sub-row for expanded multi-court venue (Bug #1) */}
              {expandedVenueId && (() => {
                const venueCourts = academyCourts.filter((c) => c.locationId === expandedVenueId);
                if (venueCourts.length === 0) return null;
                return (
                  <View style={styles.courtSubRow}>
                    <Text style={styles.courtSubRowLabel}>Pick a court at {locations.find((l) => l.id === expandedVenueId)?.name ?? "venue"}:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {venueCourts.map((court) => {
                        const isCourtSel = filterCourtId === court.id;
                        return (
                          <Pressable
                            key={court.id}
                            style={[styles.courtSubChip, isCourtSel && styles.courtSubChipSelected]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setFilterLocationId(expandedVenueId);
                              setFilterCourtId(isCourtSel ? null : court.id);
                              if (!isCourtSel) setExpandedVenueId(null);
                            }}
                          >
                            <Ionicons name="grid-outline" size={13} color={isCourtSel ? Colors.dark.primary : Colors.dark.textSecondary} />
                            <Text style={[styles.courtSubChipText, isCourtSel && styles.courtSubChipTextSelected]}>
                              {court.name}
                            </Text>
                            {isCourtSel && <Ionicons name="checkmark" size={12} color={Colors.dark.primary} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              })()}
            </>
          )}

          {/* Coach filter — chips with avatars */}
          {directoryCoaches.length > 0 && (
            <>
              <Text style={styles.filterLabel}>Coach</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                <Pressable
                  style={[styles.filterChip, !filterCoachId && styles.filterChipSelected]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilterCoachId(null); }}
                >
                  <Text style={[styles.filterChipText, !filterCoachId && styles.filterChipTextSelected]}>Any Coach</Text>
                </Pressable>
                {directoryCoaches.map((coach) => {
                  const isCoachSel = filterCoachId === coach.id;
                  const coachPhotoUrl = coach.profilePhotoUrl ? buildPhotoUrl(coach.profilePhotoUrl) : null;
                  return (
                    <Pressable
                      key={coach.id}
                      style={[styles.filterChip, styles.coachFilterChip, isCoachSel && styles.filterChipSelected]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilterCoachId(coach.id); }}
                    >
                      <View style={styles.coachFilterAvatar}>
                        {coachPhotoUrl ? (
                          <ExpoImage source={{ uri: coachPhotoUrl }} style={styles.coachFilterAvatarImg} contentFit="cover" />
                        ) : (
                          <Text style={[styles.coachFilterAvatarText, isCoachSel && { color: Colors.dark.primary }]}>
                            {(coach.name || "C").charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.filterChipText, isCoachSel && styles.filterChipTextSelected]}>
                        {coach.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Tier pricing overview — shown for private sessions */}
          {sessionType === "private" &&
            tierPricingData?.tiers &&
            tierPricingData.tiers.length > 0 &&
            tierPricingData.tiers.some(
              (t) => t.price60min || t.price90min || t.price120min,
            ) && (
              <View style={{ marginTop: Spacing.lg }}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="pricetag-outline" size={16} color={Colors.dark.gold} />
                  <Text style={styles.sectionTitle}>Lesson Rates</Text>
                  <Text style={styles.filterOptional}>(by coach tier)</Text>
                </View>
                <View style={styles.tierPricingCard}>
                  {[
                    { role: "head_coach", label: "Head Coach", color: Colors.dark.gold },
                    { role: "coach", label: "Coach", color: Colors.dark.primary },
                    { role: "assistant", label: "Assistant", color: "#A855F7" },
                    { role: "intern", label: "Intern", color: Colors.dark.textSecondary },
                  ].map(({ role, label, color }) => {
                    const tier = tierPricingData.tiers.find((t) => t.role === role);
                    if (!tier) return null;
                    if (!tier.price60min && !tier.price90min && !tier.price120min)
                      return null;
                    const cur = tier.currency || "AED";
                    return (
                      <View key={role} style={styles.tierPricingRow}>
                        <View style={styles.tierPricingRoleCell}>
                          <View
                            style={[styles.tierPricingDot, { backgroundColor: color + "30" }]}
                          >
                            <View
                              style={[
                                styles.tierPricingDotInner,
                                { backgroundColor: color },
                              ]}
                            />
                          </View>
                          <Text style={[styles.tierPricingRoleLabel, { color }]}>
                            {label}
                          </Text>
                        </View>
                        <View style={styles.tierPricingPrices}>
                          {tier.price60min ? (
                            <View
                              style={[
                                styles.tierPricingPill,
                                duration === 60 && styles.tierPricingPillActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierPricingPillText,
                                  duration === 60 && styles.tierPricingPillTextActive,
                                ]}
                              >
                                {cur} {tier.price60min}
                              </Text>
                              <Text style={styles.tierPricingPillDur}>60m</Text>
                            </View>
                          ) : null}
                          {tier.price90min ? (
                            <View
                              style={[
                                styles.tierPricingPill,
                                duration === 90 && styles.tierPricingPillActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierPricingPillText,
                                  duration === 90 && styles.tierPricingPillTextActive,
                                ]}
                              >
                                {cur} {tier.price90min}
                              </Text>
                              <Text style={styles.tierPricingPillDur}>90m</Text>
                            </View>
                          ) : null}
                          {tier.price120min ? (
                            <View
                              style={[
                                styles.tierPricingPill,
                                duration === 120 && styles.tierPricingPillActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tierPricingPillText,
                                  duration === 120 && styles.tierPricingPillTextActive,
                                ]}
                              >
                                {cur} {tier.price120min}
                              </Text>
                              <Text style={styles.tierPricingPillDur}>120m</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

          {/* Session type reminder */}
          {selectedTypeCard && (
            <View style={styles.sessionTypePill}>
              <Ionicons name={selectedTypeCard.icon} size={14} color={selectedTypeCard.color} />
              <Text style={[styles.sessionTypePillText, { color: selectedTypeCard.color }]}>
                {selectedTypeCard.label}
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    );
  };

  // ─── SLIDE 2: Choose Session ─────────────────────────────────────────────────
  const renderChooseSessionSlide = () => {
    const isLoading = slotsLoading || sessionsLoading;

    if (sessionType === "group") {
      return (
        <Animated.View entering={FadeIn} style={styles.slideContent}>
          <ScrollView ref={slotListScrollViewRef} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people" size={16} color={Colors.dark.orange} />
              <Text style={styles.sectionTitle}>Group Sessions</Text>
              <Text style={styles.dateLabel}>{formatDateHeader(selectedDate)}</Text>
            </View>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <TennisBallSpinner size="large" color={Colors.dark.orange} />
                <Text style={styles.loadingText}>Finding sessions...</Text>
              </View>
            ) : joinableSessions.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyStateTitle}>No group sessions available</Text>
                <Text style={styles.emptyStateText}>Try a different date or check back later</Text>
              </View>
            ) : (
              joinableSessions.map((session) => {
                const isSelected = selectedSession?.id === session.id;
                const spotsLeft = session.maxPlayers - session.currentPlayers;
                const isFull = spotsLeft <= 0;
                return (
                  <Pressable
                    key={session.id}
                    onPress={() => {
                      if (isFull) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setSelectedSession(session);
                      setSelectedSlot(null);
                      setIsJoining(true);
                    }}
                    style={[styles.groupSessionCard, isSelected && styles.groupSessionCardSelected, isFull && { opacity: 0.5 }]}
                  >
                    <LinearGradient
                      colors={isSelected ? [Colors.dark.orange + "30", Colors.dark.orange + "10"] : [Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
                      style={styles.groupSessionGradient}
                    >
                      <View style={styles.groupSessionHeader}>
                        <View>
                          <Text style={styles.groupSessionCoach}>{session.coachName}</Text>
                          <Text style={styles.groupSessionType}>Group {session.ballLevel ? `· ${session.ballLevel}` : ""}</Text>
                        </View>
                        <View style={[styles.spotsBadge, spotsLeft <= 2 && !isFull && styles.spotsBadgeHot]}>
                          <Text style={[styles.spotsText, spotsLeft <= 2 && !isFull && { color: Colors.dark.orange }]}>
                            {isFull ? "Full" : `${spotsLeft} spots`}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.groupSessionDetails}>
                        <View style={styles.detailRow}>
                          <Ionicons name="time-outline" size={14} color={Colors.dark.textSecondary} />
                          <Text style={styles.detailText}>
                            {formatDateHeader(new Date(session.startTime))} · {formatTime(session.startTime)} – {formatTime(session.endTime)} · {session.duration}min
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Ionicons name="location-outline" size={14} color={Colors.dark.textSecondary} />
                          <Text style={styles.detailText}>{session.locationName} · {session.courtName}</Text>
                        </View>
                      </View>

                      {/* Week commitment selector */}
                      {isSelected && (
                        <View style={styles.weekCommitSection}>
                          <Text style={styles.weekCommitLabel}>How many weeks?</Text>
                          <View style={styles.weekCommitRow}>
                            {WEEK_OPTIONS.map((w) => (
                              <Pressable
                                key={w}
                                style={[styles.weekChip, weekCommitment === w && styles.weekChipSelected]}
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWeekCommitment(w); setCustomWeeks(""); }}
                              >
                                <Text style={[styles.weekChipText, weekCommitment === w && styles.weekChipTextSelected]}>{w}w</Text>
                              </Pressable>
                            ))}
                            <TextInput
                              style={[styles.weekCustomInput, !WEEK_OPTIONS.includes(weekCommitment) && styles.weekChipSelected]}
                              value={customWeeks}
                              onChangeText={(v) => {
                                setCustomWeeks(v);
                                const n = parseInt(v, 10);
                                if (!isNaN(n) && n > 0) setWeekCommitment(n);
                              }}
                              placeholder="Custom"
                              placeholderTextColor={Colors.dark.textSecondary}
                              keyboardType="numeric"
                              maxLength={3}
                            />
                          </View>
                        </View>
                      )}

                      {isSelected && (
                        <View style={styles.groupJoinBar}>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.dark.orange} />
                          <Text style={[styles.groupJoinText, { color: Colors.dark.orange }]}>
                            Selected · {weekCommitment} week{weekCommitment !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      )}

                      {isFull && session.hasWaitlist && (
                        <View style={styles.waitlistBar}>
                          <Text style={styles.waitlistText}>Join Waitlist</Text>
                        </View>
                      )}
                    </LinearGradient>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      );
    }

    // Private / Semi-private: grouped by coach
    return (
      <Animated.View entering={FadeIn} style={styles.slideContent}>
        <ScrollView ref={slotListScrollViewRef} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {/* Slot locked banner */}
          {reservationId && selectedSlot && !reservationLoading ? (
            <View style={styles.slotLockedCard}>
              <View style={styles.slotLockedAccent} />
              <View style={styles.slotLockedBody}>
                <View style={styles.slotLockedTop}>
                  <View style={styles.slotLockedTitleRow}>
                    <Ionicons name="lock-closed" size={14} color={Colors.dark.primary} />
                    <Text style={styles.slotLockedTitle}>SLOT LOCKED</Text>
                  </View>
                  <View style={styles.slotLockedCountdownBox}>
                    <Ionicons name="time-outline" size={12} color={Colors.dark.primary} />
                    <Text style={styles.slotLockedCountdown}>
                      {`${Math.floor(reservationSecondsLeft / 60)}:${String(reservationSecondsLeft % 60).padStart(2, "0")}`}
                    </Text>
                  </View>
                </View>
                <Text style={styles.slotLockedInfo} numberOfLines={1}>
                  {selectedSlot.coachName} · {formatTime(selectedSlot.startTime)} ({selectedSlot.duration}min)
                </Text>
                <Text style={styles.slotLockedHint}>Tap Next to confirm your booking</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Ionicons name="person" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Available Times</Text>
            <Text style={styles.dateLabel}>{formatDateHeader(selectedDate)}</Text>
          </View>

          {/* Reservation error */}
          {reservationError ? (
            <View style={styles.reservationErrorBanner}>
              <Ionicons name="alert-circle" size={16} color="#FF6B6B" />
              <Text style={styles.reservationErrorText}>{reservationError}</Text>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <TennisBallSpinner size="large" color={Colors.dark.primary} />
              <Text style={styles.loadingText}>Finding available coaches...</Text>
            </View>
          ) : slotsByCoach.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.dark.textSecondary} />
              <Text style={styles.emptyStateTitle}>No sessions available</Text>
              <Text style={styles.emptyStateText}>
                {filterCoachId ? "This coach has no availability. Try any coach or another date." : "Try a different date or duration."}
              </Text>
              {filterCoachId ? (
                <Pressable style={styles.clearFilterBtn} onPress={() => { setFilterCoachId(null); }}>
                  <Text style={styles.clearFilterBtnText}>Show all coaches</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            slotsByCoach.map((group) => {
              const isUsualCoach = smartSuggestions.some((s) => s.coachId === group.coach.id);
              const sortedSlots = [...group.slots].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
              const INITIAL_SHOW = 4;
              const isExpanded = expandedSlotKey === group.coach.id;
              const visibleSlots = isExpanded ? sortedSlots : sortedSlots.slice(0, INITIAL_SHOW);

              return (
                <View key={group.coach.id} style={styles.coachGroup}>
                  {/* Coach header */}
                  <View style={styles.coachGroupHeader}>
                    <View style={styles.coachGroupAvatar}>
                      {group.coach.photoUrl ? (
                        <ExpoImage source={{ uri: buildPhotoUrl(group.coach.photoUrl) ?? undefined }} style={styles.coachGroupPhoto} contentFit="cover" />
                      ) : (
                        <Text style={styles.coachGroupAvatarText}>{(group.coach.name || "C").charAt(0)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.coachGroupName}>{group.coach.name}</Text>
                        {isUsualCoach && (
                          <View style={styles.usualBadge}>
                            <Ionicons name="star" size={10} color={Colors.dark.primary} />
                            <Text style={styles.usualBadgeText}>Usual</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.coachGroupSub}>
                        {sortedSlots.length} slot{sortedSlots.length !== 1 ? "s" : ""}
                        {(() => {
                          const locDisplay = resolvedLocationName ?? (sortedSlots[0]?.locationName && sortedSlots[0].locationName !== "Any Location" ? sortedSlots[0].locationName : null);
                          return locDisplay ? ` · ${locDisplay}` : "";
                        })()}
                      </Text>
                    </View>
                  </View>

                  {/* Time chips */}
                  <View style={styles.timeChipsContainer}>
                    {visibleSlots.map((slot) => {
                      const slotKey = `${slot.coachId}|${slot.startTime}`;
                      const isSelected = selectedSlot?.coachId === slot.coachId && selectedSlot?.startTime === slot.startTime;
                      const isExpandedSlot = expandedSlotKey === slotKey;
                      const isPreHighlighted = !!preselectedSlot &&
                        !isSelected &&
                        slot.coachId === preselectedSlot.coachId &&
                        slot.startTime.substring(11, 16) === preselectedSlot.startTime.substring(11, 16);

                      return (
                        <View key={slotKey}>
                          <Pressable
                            style={[
                              styles.timeChip,
                              isSelected && styles.timeChipSelected,
                              isPreHighlighted && styles.timeChipHighlighted,
                            ]}
                            onLayout={isPreHighlighted ? (e) => { preHighlightedSlotYRef.current = e.nativeEvent.layout.y; } : undefined}
                            onPress={() => {
                              if (reservationLoading) return;
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

                              if (isSelected) {
                                setExpandedSlotKey(expandedSlotKey === slotKey ? null : slotKey);
                                return;
                              }

                              const prevId = activeReservationRef.current;
                              if (prevId) { releaseSlot(prevId); }
                              setReservationError(null);
                              setSelectedSlot(slot);
                              setSelectedSession(null);
                              setIsJoining(false);
                              setExpandedSlotKey(slotKey);
                              setReservationLoading(true);
                              reserveSlotMutation.mutate({ coachId: slot.coachId, startTime: slot.startTime, endTime: slot.endTime });
                            }}
                          >
                            {reservationLoading && isSelected ? (
                              <TennisBallSpinner size="small" color={isSelected ? Colors.dark.buttonText : Colors.dark.primary} />
                            ) : (
                              <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
                                {formatTime(slot.startTime)}
                              </Text>
                            )}
                          </Pressable>

                          {/* Expanded detail card */}
                          {isExpandedSlot && isSelected && !reservationLoading && (
                            <View style={styles.slotDetailCard}>
                              <View style={styles.slotDetailRow}>
                                <Ionicons name="time-outline" size={14} color={Colors.dark.textSecondary} />
                                <Text style={styles.slotDetailText}>
                                  {formatTime(slot.startTime)} – {formatTime(slot.endTime)} · {slot.duration} min
                                </Text>
                              </View>
                              <View style={styles.slotDetailRow}>
                                <Ionicons name="location-outline" size={14} color={Colors.dark.textSecondary} />
                                <Text style={styles.slotDetailText}>
                                  {(() => {
                                    const locName = resolvedLocationName || (slot.locationName && slot.locationName !== "Any Location" ? slot.locationName : null);
                                    const courtName = slot.courtName && slot.courtName !== "Any Court" ? slot.courtName : null;
                                    return [locName, courtName].filter(Boolean).join(" · ") || "—";
                                  })()}
                                </Text>
                              </View>
                              {reservationId ? (
                                <View style={styles.slotDetailRow}>
                                  <Ionicons name="lock-closed" size={14} color={Colors.dark.primary} />
                                  <Text style={[styles.slotDetailText, { color: Colors.dark.primary, fontWeight: "600" }]}>
                                    Held for {`${Math.floor(reservationSecondsLeft / 60)}:${String(reservationSecondsLeft % 60).padStart(2, "0")}`}
                                  </Text>
                                </View>
                              ) : null}
                              {/* Inline court picker — moved from Step 4 */}
                              {availableCourts.length > 0 ? (
                                <View style={{ marginTop: Spacing.sm }}>
                                  <Text style={styles.courtPickerLabel}>Choose Court</Text>
                                  <View style={styles.courtPickerChips}>
                                    {availableCourts.map((court) => {
                                      const isCourtSel = (selectedCourtId ?? slot.courtId) === court.id;
                                      return (
                                        <Pressable
                                          key={court.id}
                                          style={[styles.courtPickerChip, isCourtSel && styles.courtPickerChipSelected]}
                                          onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            setSelectedCourtId(court.id);
                                            setSelectedCourtName(court.name);
                                          }}
                                        >
                                          <Ionicons name="tennisball" size={12} color={isCourtSel ? Colors.dark.buttonText : Colors.dark.textSecondary} />
                                          <Text style={[styles.courtPickerChipText, isCourtSel && styles.courtPickerChipTextSelected]}>
                                            {court.name}{court.surface ? ` · ${court.surface}` : ""}
                                          </Text>
                                        </Pressable>
                                      );
                                    })}
                                  </View>
                                </View>
                              ) : null}
                              <Pressable
                                style={styles.selectSlotBtn}
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                  goNext();
                                }}
                              >
                                <Text style={styles.selectSlotBtnText}>Select This Slot</Text>
                                <Ionicons name="arrow-forward" size={16} color={Colors.dark.buttonText} />
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    })}

                    {/* Show more/less */}
                    {sortedSlots.length > INITIAL_SHOW && (
                      <Pressable
                        style={styles.showMoreChip}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setExpandedSlotKey(expandedSlotKey === group.coach.id ? null : group.coach.id);
                        }}
                      >
                        <Text style={styles.showMoreText}>
                          {isExpanded ? "Less" : `+${sortedSlots.length - INITIAL_SHOW} more`}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    );
  };

  // ─── SLIDE 3: Details ─────────────────────────────────────────────────────────
  const renderDetailsSlide = () => {
    const sessionInfo = selectedSlot ?? selectedSession;
    const typeCard = SESSION_TYPE_CARDS.find((t) => t.value === sessionType) ?? SESSION_TYPE_CARDS[0];

    const inner = (
      <Animated.View entering={FadeIn} style={styles.slideContent}>
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={slideScrollPadding}
        >
          {/* Credits check */}
          <View style={[styles.creditsCard, creditsForType === 0 && styles.creditsCardWarn]}>
            <View style={styles.creditsRow}>
              <Ionicons
                name={creditsForType > 0 ? "flash" : "alert-circle-outline"}
                size={18}
                color={creditsForType > 0 ? Colors.dark.primary : "#F59E0B"}
              />
              <Text style={styles.creditsLabel}>
                {sessionType === "group" ? "Group" : sessionType === "semi_private" ? "Semi-Private" : "Private"} Credits
              </Text>
              <Text style={[styles.creditsCount, creditsForType === 0 && { color: "#F59E0B" }]}>
                {creditsForType} remaining
              </Text>
            </View>
            {creditsForType === 0 && onBuyPackage && (
              <Pressable style={styles.buyCreditsBtn} onPress={onBuyPackage}>
                <Text style={styles.buyCreditsBtnText}>Buy a Package</Text>
              </Pressable>
            )}
          </View>

          {/* Session summary mini card */}
          {sessionInfo && (
            <View style={[styles.summaryMini, { borderColor: typeCard.color + "40" }]}>
              <LinearGradient colors={typeCard.gradient} style={styles.summaryMiniGradient}>
                <View style={styles.summaryMiniRow}>
                  <Ionicons name={typeCard.icon} size={14} color={typeCard.color} />
                  <Text style={[styles.summaryMiniType, { color: typeCard.color }]}>{typeCard.label}</Text>
                </View>
                <Text style={styles.summaryMiniTime}>
                  {formatDateHeader(selectedDate)} · {formatTime(sessionInfo.startTime)} – {formatTime(sessionInfo.endTime)}
                </Text>
                <Text style={styles.summaryMiniCoach}>
                  {sessionInfo.coachName}
                  {(() => {
                    const locName = resolvedLocationName ?? ("locationName" in sessionInfo && sessionInfo.locationName && sessionInfo.locationName !== "Any Location" ? sessionInfo.locationName : null);
                    return locName ? ` · ${locName}` : "";
                  })()}
                  {selectedCourtName ? ` · ${selectedCourtName}` : ""}
                </Text>
              </LinearGradient>
            </View>
          )}

          {/* Bug #6: Repeat weeks selector (private / semi-private only) */}
          {(sessionType === "private" || sessionType === "semi_private") && (
            <View style={styles.repeatSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="repeat" size={16} color={Colors.dark.primary} />
                <Text style={styles.sectionTitle}>Repeat for</Text>
              </View>
              <View style={styles.weekCommitRow}>
                {[1, 2, 4, 8].map((w) => (
                  <Pressable
                    key={w}
                    style={[styles.weekChip, repeatWeeks === w && styles.repeatChipSelected]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRepeatWeeks(w); }}
                  >
                    <Text style={[styles.weekChipText, repeatWeeks === w && styles.repeatChipTextSelected]}>
                      {w === 1 ? "1 week" : `${w} weeks`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {repeatWeeks > 1 && (
                <Text style={styles.repeatHint}>
                  Sent as 1 grouped request with all {repeatWeeks} dates — your coach sees them on one card.
                </Text>
              )}
            </View>
          )}

          {/* Semi-private: partner selection */}
          {sessionType === "semi_private" && (
            <View style={styles.partnerSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="people-outline" size={16} color="#A855F7" />
                <Text style={[styles.sectionTitle, { color: "#A855F7" }]}>Training Partner</Text>
              </View>

              <Pressable
                style={[styles.pairMeBtn, letCoachPair && styles.pairMeBtnSelected]}
                onPress={() => { setLetCoachPair(true); setSelectedPartner(null); setPartnerQuery(""); }}
              >
                <Ionicons name={letCoachPair ? "checkmark-circle" : "shuffle"} size={18} color={letCoachPair ? "#A855F7" : Colors.dark.textSecondary} />
                <Text style={[styles.pairMeBtnText, letCoachPair && { color: "#A855F7" }]}>Let the coach pair me</Text>
              </Pressable>

              <Text style={styles.orDivider}>— or search a partner —</Text>

              <View style={styles.partnerSearchBox}>
                <Ionicons name="search" size={16} color={Colors.dark.textSecondary} />
                <TextInput
                  style={styles.partnerSearchInput}
                  value={partnerQuery}
                  onChangeText={(v) => { setPartnerQuery(v); setLetCoachPair(false); }}
                  placeholder="Search by name..."
                  placeholderTextColor={Colors.dark.textSecondary}
                />
                {partnerQuery.length > 0 && (
                  <Pressable onPress={() => { setPartnerQuery(""); }}>
                    <Ionicons name="close-circle" size={16} color={Colors.dark.textSecondary} />
                  </Pressable>
                )}
              </View>

              {partnerSearchLoading ? (
                <View style={{ padding: Spacing.md, alignItems: "center" }}>
                  <TennisBallSpinner size="small" color="#A855F7" />
                </View>
              ) : (partnerSearchData?.players || []).map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.partnerRow, selectedPartner?.id === p.id && styles.partnerRowSelected]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPartner(p); setLetCoachPair(false); }}
                >
                  <View style={styles.partnerAvatar}>
                    <Text style={styles.partnerAvatarText}>{(p.name || "P").charAt(0)}</Text>
                  </View>
                  <Text style={styles.partnerName}>{p.name}</Text>
                  {selectedPartner?.id === p.id && <Ionicons name="checkmark-circle" size={20} color="#A855F7" />}
                </Pressable>
              ))}

              {selectedPartner && (
                <View style={styles.partnerSelectedBanner}>
                  <Ionicons name="checkmark-circle" size={16} color="#A855F7" />
                  <Text style={[styles.partnerSelectedText, { color: "#A855F7" }]}>
                    {selectedPartner.name} will receive an invite
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* AI Focus suggestions */}
          {(aiFocusLoading || aiFocusSuggestions.length > 0) ? (
            <View style={styles.aiFocusSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="sparkles" size={16} color={Colors.dark.primary} />
                <Text style={styles.sectionTitle}>AI Focus Suggestions</Text>
                {aiFocusLoading && <TennisBallSpinner size="small" color={Colors.dark.primary} style={{ marginLeft: 4 }} />}
              </View>
              {aiFocusSuggestions.length > 0 && (
                <View style={styles.aiFocusChips}>
                  {aiFocusSuggestions.map((s, i) => (
                    <Pressable
                      key={i}
                      style={[styles.aiFocusChip, playerNote === s && styles.aiFocusChipSelected]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPlayerNote(playerNote === s ? "" : s); }}
                    >
                      <Text style={[styles.aiFocusChipText, playerNote === s && styles.aiFocusChipTextSelected]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* Note to coach */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <Ionicons name="chatbubble-outline" size={16} color={Colors.dark.primary} />
              <Text style={styles.inputLabelText}>Note to Coach</Text>
              <Text style={styles.optional}>(optional · max 200 chars)</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={playerNote}
              onChangeText={(v) => setPlayerNote(v.slice(0, 200))}
              placeholder="What do you want to focus on?"
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={3}
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* Court booking declaration (for external courts) */}
          {requiresExternalBooking && (
            <View style={styles.courtNoticeCard}>
              <Ionicons name="information-circle" size={18} color="#F59E0B" />
              <Text style={styles.courtNoticeText}>
                {"This venue requires a court booking. You\u2019ll be reminded to upload your confirmation after booking."}
              </Text>
            </View>
          )}

          {requiresExternalBooking && (
            <CourtBookingPicker
              isAcademyCourt={isAcademyCourt}
              requiresExternalBooking={requiresExternalBooking}
              status={courtBookingStatus}
              note={courtBookingNote}
              url={courtBookingUrl}
              onStatusChange={setCourtBookingStatus}
              onNoteChange={setCourtBookingNote}
              onUrlChange={setCourtBookingUrl}
            />
          )}

          {/* Cancellation policy */}
          <Pressable style={styles.policyRow} onPress={() => setPolicyModalVisible(true)}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.policyRowText} numberOfLines={2}>{cancellationPolicy}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </Animated.View>
    );

    if (Platform.OS === "web") return inner;
    return (
      <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ flex: 1 }}>
        {inner}
      </Pressable>
    );
  };

  // ─── SLIDE 4: Confirm ─────────────────────────────────────────────────────────
  const renderConfirmSlide = () => {
    const sessionInfo = selectedSession || selectedSlot;
    if (!sessionInfo) return null;
    const typeCard = SESSION_TYPE_CARDS.find((t) => t.value === sessionType);

    return (
      <Animated.View entering={FadeIn} style={styles.slideContent}>
        {showSuccess ? (
          <View style={styles.successContainer}>
            <View style={styles.successCheckmark}>
              <AnimatedCheck size={72} variant="glow" autoPlay />
            </View>
            <Text style={styles.successTitle}>{isJoining ? "You're In!" : "Request Sent!"}</Text>
            <Text style={styles.successSubtitle}>{isJoining ? "See you on the court!" : "Coach will confirm soon"}</Text>
            <Animated.View style={[styles.xpReward, xpStyle]}>
              <Ionicons name="flash" size={24} color={Colors.dark.primary} />
              <Text style={styles.xpRewardText}>+10 Glow XP</Text>
            </Animated.View>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={slideScrollPadding}>
            <Text style={styles.slideSubtitle}>Review your booking</Text>

            {/* Booking summary */}
            <View style={styles.confirmCard}>
              <LinearGradient
                colors={[typeCard?.gradient[0] || Colors.dark.backgroundSecondary, typeCard?.gradient[1] || Colors.dark.backgroundRoot]}
                style={styles.confirmCardGradient}
              >
                <View style={styles.confirmTypeBadge}>
                  <Ionicons name={typeCard?.icon || "tennisball"} size={20} color={typeCard?.color || Colors.dark.primary} />
                  <Text style={[styles.confirmTypeText, { color: typeCard?.color }]}>{typeCard?.label}</Text>
                </View>

                <View style={styles.confirmRow}>
                  <Ionicons name="time" size={16} color={Colors.dark.primary} />
                  <Text style={styles.confirmText}>
                    {formatDateHeader(selectedDate)} · {formatTime(sessionInfo.startTime)} – {formatTime(sessionInfo.endTime)}
                  </Text>
                </View>

                <View style={styles.confirmRow}>
                  <Ionicons name="location" size={16} color={Colors.dark.primary} />
                  <Text style={styles.confirmText}>
                    {(() => {
                      // Bug #4: prefer resolvedLocationName (from filterLocationId), fall back to
                      // slot's locationName only when it isn't the generic "Any Location" placeholder.
                      const locName =
                        resolvedLocationName ??
                        ("locationName" in sessionInfo &&
                        (sessionInfo as any).locationName &&
                        (sessionInfo as any).locationName !== "Any Location"
                          ? (sessionInfo as any).locationName
                          : null);
                      const courtName =
                        selectedCourtName ??
                        ("courtName" in sessionInfo &&
                        (sessionInfo as any).courtName &&
                        (sessionInfo as any).courtName !== "Any Court"
                          ? (sessionInfo as any).courtName
                          : null);
                      return [locName, courtName].filter(Boolean).join(" · ") || "—";
                    })()}
                  </Text>
                </View>

                <View style={styles.confirmRow}>
                  <View style={styles.confirmCoachAvatarPlaceholder}>
                    <Text style={styles.confirmCoachAvatarInitial}>
                      {(sessionInfo.coachName || "C").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.confirmText}>{sessionInfo.coachName}</Text>
                </View>

                <View style={styles.confirmRow}>
                  <Ionicons name="hourglass" size={16} color={Colors.dark.primary} />
                  <Text style={styles.confirmText}>{sessionInfo.duration} min</Text>
                </View>

                {sessionType === "group" && (
                  <View style={styles.confirmRow}>
                    <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
                    <Text style={styles.confirmText}>{weekCommitment} week{weekCommitment !== 1 ? "s" : ""} commitment</Text>
                  </View>
                )}

                {sessionType === "semi_private" && (selectedPartner || letCoachPair) && (
                  <View style={styles.confirmRow}>
                    <Ionicons name="people" size={16} color="#A855F7" />
                    <Text style={styles.confirmText}>
                      {letCoachPair ? "Coach will pair you" : `With ${selectedPartner?.name}`}
                    </Text>
                  </View>
                )}

                {playerNote ? (
                  <View style={styles.confirmRow}>
                    <Ionicons name="chatbubble-outline" size={16} color={Colors.dark.primary} />
                    <Text style={[styles.confirmText, { fontStyle: "italic" }]} numberOfLines={2}>{playerNote}</Text>
                  </View>
                ) : null}

                {/* Directions */}
                {(() => {
                  const locId = "locationId" in sessionInfo ? (sessionInfo as AvailableSlot).locationId : null;
                  const loc = locId ? locations.find((l) => l.id === locId) : null;
                  if (!loc || (!loc.lat && !loc.address)) return null;
                  return (
                    <Pressable
                      style={styles.confirmDirectionsRow}
                      onPress={() => openDirections({ lat: loc.lat, lng: loc.lng ?? undefined, address: loc.address ?? undefined, label: loc.name })}
                    >
                      <Ionicons name="navigate" size={13} color={Colors.dark.primary} />
                      <Text style={styles.confirmDirectionsText}>Get directions</Text>
                    </Pressable>
                  );
                })()}
              </LinearGradient>
            </View>

            {/* Price summary */}
            {lessonPriceInfo && (
              <View style={styles.priceSummaryRow}>
                <Text style={styles.priceSummaryLabel}>Session cost</Text>
                <Text style={styles.priceSummaryValue}>{lessonPriceInfo.currency} {lessonPriceInfo.amount}</Text>
              </View>
            )}

            {/* Payment method */}
            <PaymentMethodPicker
              selected={paymentMethod}
              onChange={setPaymentMethod}
              creditsAvailable={creditsForType}
              cardEnabled={cardEnabled}
              cardPriceLabel={lessonPriceInfo ? `${lessonPriceInfo.currency ?? ""}${lessonPriceInfo.amount ?? ""}` : null}
              onBuyCredits={onBuyPackage}
            />

            {/* Cancellation policy modal */}
            <Modal visible={policyModalVisible} animationType="fade" transparent onRequestClose={() => setPolicyModalVisible(false)}>
              <Pressable style={styles.policyOverlay} onPress={() => setPolicyModalVisible(false)}>
                <View style={styles.policyModalBox}>
                  <View style={styles.policyModalHeader}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={GlowColors.primary} />
                    <Text style={styles.policyModalTitle}>Cancellation Policy</Text>
                  </View>
                  <Text style={styles.policyModalBody}>{cancellationPolicy}</Text>
                  <Pressable style={styles.policyModalClose} onPress={() => setPolicyModalVisible(false)}>
                    <Text style={styles.policyModalCloseText}>Got it</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Modal>
          </ScrollView>
        )}
      </Animated.View>
    );
  };

  // ─── Render slide content ─────────────────────────────────────────────────────
  const renderSlideContent = () => {
    switch (currentSlide) {
      case 0: return renderSessionTypeSlide();
      case 1: return renderWhenSlide();
      case 2: return renderChooseSessionSlide();
      case 3: return renderDetailsSlide();
      case 4: return renderConfirmSlide();
      default: return null;
    }
  };

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Backgrounds.card }]} />
        )}

        {/* Header */}
        <View style={styles.header}>
          <View style={{ width: 40 }} />

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{SLIDE_TITLES[currentSlide]}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
              <Text style={styles.headerSlide}>Step {currentSlide + 1} of {TOTAL_SLIDES}</Text>
              <View style={{ backgroundColor: getSportColor(sport) + "22", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: getSportColor(sport), fontSize: 10, fontWeight: "600" }}>{getSportLabel(sport)}</Text>
              </View>
            </View>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <Animated.View style={[styles.progressBar, progressStyle]}>
            <Animated.View style={[styles.progressGlow, glowStyle]} />
          </Animated.View>
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>{renderSlideContent()}</View>

        {/* Footer */}
        {!showSuccess && (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + Spacing.md }]}>
            {currentSlide === 0 ? (
              <Pressable style={styles.backButton} onPress={onClose}>
                <Text style={styles.backButtonText}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.backButton} onPress={goBack}>
                <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
                <Text style={styles.backButtonText}>Back</Text>
              </Pressable>
            )}
            <Animated.View style={[styles.nextButtonWrapper, holdGlowAnimStyle]}>
              <Pressable
                style={[styles.nextButton, !canProceed && styles.nextButtonDisabled, currentSlide === TOTAL_SLIDES - 1 && styles.confirmButton]}
                onPress={currentSlide === TOTAL_SLIDES - 1 ? handleBook : goNext}
                disabled={!canProceed || bookingMutation.isPending || dropInLessonMutation.isPending}
              >
                {bookingMutation.isPending || dropInLessonMutation.isPending ? (
                  <TennisBallSpinner size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Text style={styles.nextButtonText}>
                      {currentSlide === TOTAL_SLIDES - 1
                        ? isJoining ? "Join Session" : selectedSlot && isCrossAcademyDropInCoach(selectedSlot.coachId) ? "Pay & Book" : "Request Booking"
                        : "Next"}
                    </Text>
                    {currentSlide < TOTAL_SLIDES - 1 && <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />}
                  </>
                )}
              </Pressable>
            </Animated.View>
          </View>
        )}

        {/* Calendar modal */}
        <Modal visible={showCalendarModal} transparent animationType="fade">
          <View style={styles.calendarOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCalendarModal(false)} />
            <View style={styles.calendarModal}>
              <View style={styles.calendarHeader}>
                <Pressable onPress={() => { const d = new Date(calendarViewDate); d.setMonth(d.getMonth() - 1); setCalendarViewDate(d); }} style={styles.calendarNavButton}>
                  <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
                </Pressable>
                <Text style={styles.calendarMonthText}>
                  {calendarViewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </Text>
                <Pressable onPress={() => { const d = new Date(calendarViewDate); d.setMonth(d.getMonth() + 1); setCalendarViewDate(d); }} style={styles.calendarNavButton}>
                  <Ionicons name="chevron-forward" size={24} color={Colors.dark.text} />
                </Pressable>
              </View>
              <View style={styles.calendarWeekdays}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <Text key={day} style={styles.calendarWeekdayText}>{day}</Text>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {(() => {
                  const firstDay = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), 1);
                  const lastDay = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 0);
                  const days: (number | null)[] = [];
                  for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
                  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
                  return days.map((day, idx) => {
                    if (day === null) return <View key={`pad-${idx}`} style={styles.calendarDayEmpty} />;
                    const dateObj = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), day);
                    const isSelected = dateObj.toDateString() === selectedDate.toDateString();
                    const isToday = dateObj.toDateString() === new Date().toDateString();
                    const isPast = dateObj < new Date(new Date().setHours(0, 0, 0, 0));
                    return (
                      <Pressable
                        key={day}
                        style={[styles.calendarDay, isSelected && styles.calendarDaySelected, isToday && !isSelected && styles.calendarDayToday, isPast && styles.calendarDayPast]}
                        onPress={() => { if (!isPast) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedDate(dateObj); setShowCalendarModal(false); } }}
                        disabled={isPast}
                      >
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, isPast && styles.calendarDayTextPast]}>{day}</Text>
                      </Pressable>
                    );
                  });
                })()}
              </View>
              <Pressable style={styles.calendarCloseButton} onPress={() => setShowCalendarModal(false)}>
                <Text style={styles.calendarCloseButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Coach profile drawer */}
        <CoachProfileDrawer
          visible={showCoachDrawer}
          onClose={() => setShowCoachDrawer(false)}
          onSelectCoach={() => {
            if (selectedCoachForDrawer) setFilterCoachId(selectedCoachForDrawer.id);
          }}
          coach={selectedCoachForDrawer ? {
            id: selectedCoachForDrawer.id,
            name: selectedCoachForDrawer.name,
            profilePhotoUrl: selectedCoachForDrawer.profilePhotoUrl,
            specialty: selectedCoachForDrawer.specialty,
            yearsExperience: selectedCoachForDrawer.yearsExperience,
            specializations: selectedCoachForDrawer.specializations,
            ballLevels: selectedCoachForDrawer.ballLevels,
            rating: selectedCoachForDrawer.rating,
            totalSessions: selectedCoachForDrawer.totalSessions,
            bio: selectedCoachForDrawer.bio,
            certifications: selectedCoachForDrawer.certifications,
            languages: selectedCoachForDrawer.languages,
            availableForPrivate: true,
            availableForGroup: true,
          } : null}
        />
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
  headerCenter: { alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  headerSlide: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },
  progressContainer: {
    height: 3,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
    position: "relative",
  },
  progressGlow: {
    position: "absolute",
    top: -2,
    right: -2,
    bottom: -2,
    width: 16,
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  slideContent: { flex: 1 },
  slideSubtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
    textAlign: "center",
  },

  // Session type cards
  sessionTypeGrid: { gap: Spacing.sm },
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
  glowOrb: { position: "absolute", top: -20, right: -20, width: 60, height: 60, borderRadius: 30, opacity: 0.3 },
  sessionTypeIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  sessionTypeLabel: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  sessionTypeSubtitle: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },

  // Smart suggestions
  suggestionsSection: { marginBottom: Spacing.lg },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  suggestionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  suggestionText: { flex: 1, fontSize: 14, color: Colors.dark.text, fontWeight: "500" },

  // Bug #7: Book Again card
  bookAgainCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  bookAgainGradient: { padding: Spacing.md, gap: Spacing.sm },
  bookAgainHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  bookAgainIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  bookAgainTitle: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  bookAgainSub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 1 },
  bookAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    marginTop: 4,
  },
  bookAgainBtnText: { fontSize: 13, fontWeight: "700", color: Colors.dark.buttonText },

  // Section headers
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm, marginTop: Spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  dateLabel: { flex: 1, textAlign: "right", fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "500" },

  // Date strip
  dateScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  dateChip: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.sm,
    minWidth: 64,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateChipSelected: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "20" },
  dateChipDay: { fontSize: 12, color: Colors.dark.textSecondary },
  dateChipDate: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, marginTop: 2 },
  dateChipTextSelected: { color: Colors.dark.primary },

  // Filters
  filterOptional: { fontSize: 12, color: Colors.dark.textMuted, marginLeft: 2 },
  filterLabel: { fontSize: 13, fontWeight: "600", color: Colors.dark.textSecondary, marginBottom: 6, marginTop: Spacing.sm },
  filterRow: { flexGrow: 0, marginBottom: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipSelected: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "20" },
  filterChipText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "500" },
  filterChipTextSelected: { color: Colors.dark.primary, fontWeight: "700" },
  sessionTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "center",
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sessionTypePillText: { fontSize: 13, fontWeight: "600" },

  // Coach groups
  coachGroup: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  coachGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  coachGroupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coachGroupPhoto: { width: 40, height: 40, borderRadius: 20 },
  coachGroupAvatarText: { fontSize: 16, fontWeight: "700", color: Colors.dark.buttonText },
  coachGroupName: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  coachGroupSub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 1 },
  usualBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  usualBadgeText: { fontSize: 10, fontWeight: "700", color: Colors.dark.primary },

  // Time chips
  timeChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  timeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  timeChipSelected: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary, borderWidth: 2 },
  timeChipHighlighted: { borderColor: Colors.dark.primary, borderWidth: 2, backgroundColor: Colors.dark.primary + "20" },
  timeChipText: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  timeChipTextSelected: { color: Colors.dark.buttonText },
  showMoreChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  showMoreText: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "500" },

  // Slot detail card
  slotDetailCard: {
    width: "100%",
    backgroundColor: Colors.dark.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: 4,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  slotDetailRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  slotDetailText: { fontSize: 13, color: Colors.dark.textSecondary },
  selectSlotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    marginTop: Spacing.sm,
  },
  selectSlotBtnText: { fontSize: 14, fontWeight: "700", color: Colors.dark.buttonText },

  // Group sessions
  groupSessionCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  groupSessionCardSelected: { borderColor: Colors.dark.orange, borderWidth: 2 },
  groupSessionGradient: { padding: Spacing.md, gap: Spacing.sm },
  groupSessionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  groupSessionCoach: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  groupSessionType: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },
  groupSessionDetails: { gap: 4 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, color: Colors.dark.textSecondary },
  spotsBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "30",
  },
  spotsBadgeHot: { backgroundColor: Colors.dark.orange + "30" },
  spotsText: { fontSize: 11, fontWeight: "600", color: Colors.dark.primary },
  weekCommitSection: { marginTop: Spacing.sm },
  weekCommitLabel: { fontSize: 13, fontWeight: "600", color: Colors.dark.textSecondary, marginBottom: 6 },
  weekCommitRow: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  weekChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minWidth: 48,
    alignItems: "center",
  },
  weekChipSelected: { borderColor: Colors.dark.orange, backgroundColor: Colors.dark.orange + "20" },

  // Bug #1: Court sub-row for multi-court venues
  courtSubRow: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  courtSubRowLabel: { fontSize: 12, color: Colors.dark.textSecondary, marginBottom: 4, fontWeight: "500" },
  courtSubChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  courtSubChipSelected: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "20" },
  courtSubChipText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "500" },
  courtSubChipTextSelected: { color: Colors.dark.primary, fontWeight: "700" },

  // Bug #6: Repeat weeks selector
  repeatSection: { marginBottom: Spacing.md },
  repeatChipSelected: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + "20" },
  repeatChipTextSelected: { color: Colors.dark.primary, fontWeight: "700" },
  repeatHint: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 4, fontStyle: "italic" },
  weekChipText: { fontSize: 13, fontWeight: "600", color: Colors.dark.textSecondary },
  weekChipTextSelected: { color: Colors.dark.orange },
  weekCustomInput: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.text,
    fontSize: 13,
    minWidth: 72,
    textAlign: "center",
  },
  groupJoinBar: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: Spacing.sm },
  groupJoinText: { fontSize: 13, fontWeight: "600" },
  waitlistBar: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  waitlistText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "500" },

  // Slot locked
  slotLockedCard: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  slotLockedAccent: { width: 3, backgroundColor: Colors.dark.primary },
  slotLockedBody: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 2 },
  slotLockedTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slotLockedTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  slotLockedTitle: { fontSize: 12, fontWeight: "700", color: Colors.dark.primary, letterSpacing: 0.5 },
  slotLockedCountdownBox: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.dark.primary + "22", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  slotLockedCountdown: { fontSize: 13, fontWeight: "800", color: Colors.dark.primary, fontVariant: ["tabular-nums"] },
  slotLockedInfo: { fontSize: 12, color: Colors.dark.text, fontWeight: "500" },
  slotLockedHint: { fontSize: 11, color: Colors.dark.textSecondary },

  // Details slide
  creditsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  creditsCardWarn: { borderColor: "#F59E0B40" },
  creditsRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  creditsLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  creditsCount: { fontSize: 14, fontWeight: "700", color: Colors.dark.primary },
  buyCreditsBtn: {
    backgroundColor: "#F59E0B20",
    borderRadius: BorderRadius.sm,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F59E0B40",
  },
  buyCreditsBtnText: { fontSize: 13, fontWeight: "700", color: "#F59E0B" },

  summaryMini: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  summaryMiniGradient: { padding: Spacing.md, gap: 4 },
  summaryMiniRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  summaryMiniType: { fontSize: 12, fontWeight: "700" },
  summaryMiniTime: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  summaryMiniCoach: { fontSize: 13, color: Colors.dark.textSecondary },

  // Partner section
  partnerSection: { marginBottom: Spacing.lg },
  pairMeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  pairMeBtnSelected: { borderColor: "#A855F740", backgroundColor: "#A855F710" },
  pairMeBtnText: { fontSize: 14, fontWeight: "600", color: Colors.dark.textSecondary },
  orDivider: { fontSize: 12, color: Colors.dark.textMuted, textAlign: "center", marginVertical: Spacing.sm },
  partnerSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.sm,
  },
  partnerSearchInput: { flex: 1, fontSize: 14, color: Colors.dark.text },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  partnerRowSelected: { borderColor: "#A855F750", backgroundColor: "#A855F710" },
  partnerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#A855F7", alignItems: "center", justifyContent: "center" },
  partnerAvatarText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  partnerName: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  partnerSelectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#A855F710",
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#A855F730",
  },
  partnerSelectedText: { fontSize: 13, fontWeight: "600" },

  // AI focus
  aiFocusSection: { marginBottom: Spacing.lg },
  aiFocusChips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.sm },
  aiFocusChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  aiFocusChipSelected: { backgroundColor: Colors.dark.primary + "20", borderColor: Colors.dark.primary },
  aiFocusChipText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "500" },
  aiFocusChipTextSelected: { color: Colors.dark.primary, fontWeight: "600" },

  // Note/form
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm },
  inputLabelText: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  optional: { fontSize: 11, color: Colors.dark.textMuted },
  textInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 80,
    textAlignVertical: "top",
  },

  // Court notice
  courtNoticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: "#F59E0B10",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#F59E0B30",
    marginBottom: Spacing.md,
  },
  courtNoticeText: { flex: 1, fontSize: 13, color: "#F59E0B", lineHeight: 18 },

  // Policy row
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  policyRowText: { flex: 1, fontSize: 12, color: Colors.dark.textSecondary },

  // Confirm slide
  confirmCard: { borderRadius: BorderRadius.lg, overflow: "hidden", marginBottom: Spacing.md },
  confirmCardGradient: { padding: Spacing.lg, gap: Spacing.sm },
  confirmTypeBadge: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm },
  confirmTypeText: { fontSize: 16, fontWeight: "700" },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  confirmCoachAvatarPlaceholder: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.dark.primary + "40", alignItems: "center", justifyContent: "center" },
  confirmCoachAvatarInitial: { fontSize: 11, fontWeight: "700", color: Colors.dark.primary },
  confirmText: { fontSize: 15, color: Colors.dark.text, flex: 1 },
  confirmDirectionsRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingLeft: 28, marginTop: 2 },
  confirmDirectionsText: { fontSize: 13, color: Colors.dark.primary, textDecorationLine: "underline" },
  priceSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, backgroundColor: Backgrounds.elevated, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  priceSummaryLabel: { fontSize: 14, color: Colors.dark.textSecondary, fontWeight: "600" },
  priceSummaryValue: { fontSize: 18, color: Colors.dark.text, fontWeight: "800" },

  // Success
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.lg },
  successCheckmark: { marginBottom: Spacing.md },
  successTitle: { fontSize: 28, fontWeight: "700", color: Colors.dark.text },
  successSubtitle: { fontSize: 16, color: Colors.dark.textSecondary },
  xpReward: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: Colors.dark.primary + "20", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, marginTop: Spacing.md },
  xpRewardText: { fontSize: 18, fontWeight: "700", color: Colors.dark.primary },

  // Footer
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.md },
  backButton: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backButtonText: { fontSize: 15, color: Colors.dark.text },
  nextButtonWrapper: { flex: 1, borderRadius: BorderRadius.md, overflow: "visible" },
  nextButton: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    minHeight: 52,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
  },
  nextButtonDisabled: { opacity: 0.5 },
  confirmButton: { backgroundColor: GlowColors.primary },
  nextButtonText: { fontSize: 16, fontWeight: "700", color: Colors.dark.buttonText },

  // Empty/loading
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md, paddingVertical: Spacing.xxl },
  loadingText: { fontSize: 15, color: Colors.dark.textSecondary },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: Spacing["2xl"], gap: Spacing.md },
  emptyStateTitle: { fontSize: 18, fontWeight: "600", color: Colors.dark.text },
  emptyStateText: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" },
  clearFilterBtn: { marginTop: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border },
  clearFilterBtnText: { fontSize: 13, fontWeight: "600", color: Colors.dark.text },

  // Error
  reservationErrorBanner: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: "rgba(255,107,107,0.12)", borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "rgba(255,107,107,0.3)", padding: Spacing.md, marginBottom: Spacing.sm },
  reservationErrorText: { flex: 1, fontSize: 13, color: "#FF6B6B", fontWeight: "500" },

  // Policy modal
  policyOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  policyModalBox: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.xl, width: "100%", gap: Spacing.md },
  policyModalHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  policyModalTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  policyModalBody: { fontSize: 14, color: Colors.dark.textSecondary, lineHeight: 22 },
  policyModalClose: { backgroundColor: GlowColors.primary, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: "center", marginTop: Spacing.xs },
  policyModalCloseText: { fontSize: 15, fontWeight: "700", color: Colors.dark.buttonText },

  // Calendar
  calendarOverlay: { flex: 1, backgroundColor: Backgrounds.card, justifyContent: "center", alignItems: "center", padding: Spacing.lg },
  calendarModal: { backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.lg, width: "100%", maxWidth: 350 },
  calendarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md },
  calendarNavButton: { padding: Spacing.sm },
  calendarMonthText: { fontSize: 17, fontWeight: "600", color: Colors.dark.text },
  calendarWeekdays: { flexDirection: "row", justifyContent: "space-around", marginBottom: Spacing.sm },
  calendarWeekdayText: { fontSize: 12, color: Colors.dark.textMuted, width: 40, textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDay: { width: "14.28%", aspectRatio: 1, justifyContent: "center", alignItems: "center", borderRadius: BorderRadius.sm },
  calendarDayEmpty: { width: "14.28%", aspectRatio: 1 },
  calendarDaySelected: { backgroundColor: Colors.dark.primary },
  calendarDayToday: { borderWidth: 1, borderColor: Colors.dark.primary },
  calendarDayPast: { opacity: 0.3 },
  calendarDayText: { fontSize: 14, color: Colors.dark.text },
  calendarDayTextSelected: { color: Colors.dark.buttonText, fontWeight: "600" },
  calendarDayTextPast: { color: Colors.dark.textMuted },
  calendarCloseButton: { marginTop: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.dark.backgroundTertiary, borderRadius: BorderRadius.md, alignItems: "center" },
  calendarCloseButtonText: { fontSize: 15, color: Colors.dark.text, fontWeight: "500" },

  // Location cards (Step 2 visual filter)
  locationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  locationCard: {
    flexBasis: "30%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 82,
    position: "relative",
  },
  locationCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "12",
  },
  locationCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  locationCardName: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  locationCardNameSelected: {
    color: Colors.dark.primary,
  },

  // Coach filter chip with avatar
  coachFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 6,
  },
  coachFilterAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coachFilterAvatarImg: { width: 22, height: 22, borderRadius: 11 },
  coachFilterAvatarText: { fontSize: 10, fontWeight: "700", color: Colors.dark.textSecondary },

  // Inline court picker (Step 3)
  courtPickerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: 6,
  },
  courtPickerChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  courtPickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  courtPickerChipSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  courtPickerChipText: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary },
  courtPickerChipTextSelected: { color: Colors.dark.buttonText },

  // Tier pricing overview in "When to Play" slide
  tierPricingCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "25",
    overflow: "hidden",
  },
  tierPricingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border + "50",
    gap: Spacing.sm,
  },
  tierPricingRoleCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 110,
  },
  tierPricingDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tierPricingDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tierPricingRoleLabel: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  tierPricingPrices: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "flex-end",
  },
  tierPricingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tierPricingPillActive: {
    backgroundColor: Colors.dark.gold + "20",
    borderColor: Colors.dark.gold + "60",
  },
  tierPricingPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  tierPricingPillTextActive: {
    color: Colors.dark.gold,
  },
  tierPricingPillDur: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
}));
