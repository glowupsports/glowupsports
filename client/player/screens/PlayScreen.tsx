import logger from "@/lib/logger";
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Alert,
  ImageBackground,
  Dimensions,
  Platform,
  Image as RNImage,
  TextInput,
  Modal,
  Linking,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withTiming,
} from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { PlayStackParamList } from "@/player/navigation/PlayerNavigator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  TextColors,
  Backgrounds,
} from "@/constants/theme";
import { openDirections as openMapsDirections } from "@/lib/maps";
import { formatSessionTimeWithRelativeDay } from "@/lib/dateUtils";
import {
  apiRequest,
  getApiUrl,
  getStaticAssetsUrl,
  buildPhotoUrl,
} from "@/lib/query-client";
import { useFamily } from "@/player/context/FamilyContext";
import FamilyQuickSwitch from "@/player/components/FamilyQuickSwitch";
import {
  useSport,
  getSportLabel,
  getSportColor,
  getSportIcon,
  SPORT_DEFINITIONS,
} from "@/player/context/SportContext";
import { SportSwitcherChips } from "@/player/components/SportSwitcherChips";
import {
  RecentlyActiveWorldwideRow,
  PlayersYouMightKnowRow,
  TournamentsDiscoveryRow,
} from "@/player/components/DiscoveryRows";
import * as WebBrowser from "expo-web-browser";

import {
  makeReactiveStyles,
  useThemeReactivity,
} from "@/hooks/useThemedStyles";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
// react-native-maps is a native module. On builds where the native side
// isn't linked (e.g. an OTA shipping the screen ahead of a fresh native
// build, a missing/expired Google Maps key, or a future SDK upgrade) the
// require can throw at module-eval time and produce a white screen on
// navigate. We require it lazily inside a try/catch so the screen can
// fall back to a list view instead of crashing. Mirrors the pattern in
// client/player/screens/DiscoveryMapScreen.tsx.
let MapViewLib: any = null;
let MarkerLib: any = null;
let CalloutLib: any = null;
let PROVIDER_DEFAULT_VAL: any = undefined;
let MAPS_LOAD_ERROR: Error | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const maps = require("react-native-maps");
  MapViewLib = maps.default ?? maps.MapView;
  MarkerLib = maps.Marker;
  CalloutLib = maps.Callout;
  PROVIDER_DEFAULT_VAL = maps.PROVIDER_DEFAULT;
} catch (e: any) {
  MAPS_LOAD_ERROR = e instanceof Error ? e : new Error(String(e));
  console.warn("[PlayScreen] react-native-maps failed to load:", MAPS_LOAD_ERROR.message);
}
const courtBackground = require("@/assets/images/courts/court-night-default.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SessionPlayer {
  id: string;
  name: string;
  level: number;
  avatarUrl?: string;
  ballLevel?: string;
}

interface PlaySession {
  id: string;
  title: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  locationName: string;
  locationLat?: number | null;
  locationLng?: number | null;
  locationGooglePlaceId?: string | null;
  courtName?: string;
  courtImageUrl?: string;
  coachName?: string;
  coachId?: string;
  coachPhotoUrl?: string | null;
  coachAverageRating?: number | null;
  coachTotalRatings?: number;
  academyId?: string | null;
  academyName?: string | null;
  academyLogoUrl?: string | null;
  academyCity?: string | null;
  publicDropInPrice?: number | null;
  ballLevel?: string;
  vibe: string;
  minLevel?: number;
  maxLevel?: number;
  xpReward: number;
  maxPlayers: number;
  currentPlayers: number;
  enrolledCount?: number;
  players: SessionPlayer[];
  squadName?: string;
  squadXpBonus?: number;
  waitlistCount: number;
  status: "open" | "almost_full" | "full";
  isEnrolled?: boolean;
  isOnWaitlist?: boolean;
  waitlistPosition?: number | null;
  waitlistStatus?: string | null;
  offeredAt?: string | null;
  claimWindowMinutes?: number;
  sessionAcademyId?: string | null;
  sessionAcademyName?: string | null;
}

interface NearbyPlayer {
  id: string;
  name: string;
  level: number;
  avatarUrl?: string;
  vibe: string;
  mutualSessions: number;
  preferredTime?: string;
  ballLevel?: string;
  skillLevel?: number;
  openToPlay?: boolean;
  glowRating?: number;
  winRate?: number;
  matchesPlayed?: number;
  hasHomeAddress?: boolean;
  driveTimeMinutes?: number;
  driveTimeText?: string;
  lastOnlineAt?: string | null;
  friendStatus?: "none" | "pending_sent" | "pending_received" | "friends";
  friendConnectionId?: string | null;
  // Task #1033 — flag + city on player cards across scopes.
  city?: string | null;
  country?: string | null;
}

// Task #1033 — minimal country → flag emoji mapping used on player cards.
// Accepts ISO-2/ISO-3 codes plus a few common country names; returns "" when
// we can't resolve a flag so callers fall back to a generic globe icon.
function flagForCountry(country?: string | null): string {
  if (!country) return "";
  const c = country.trim();
  if (c.length === 2 && /^[A-Za-z]{2}$/.test(c)) {
    const code = c.toUpperCase();
    return String.fromCodePoint(
      ...code.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
    );
  }
  const NAME_TO_ISO2: Record<string, string> = {
    "united arab emirates": "AE",
    uae: "AE",
    "united states": "US",
    usa: "US",
    "united states of america": "US",
    "united kingdom": "GB",
    uk: "GB",
    "great britain": "GB",
    england: "GB",
    netherlands: "NL",
    nederland: "NL",
    spain: "ES",
    france: "FR",
    germany: "DE",
    italy: "IT",
    portugal: "PT",
    belgium: "BE",
    switzerland: "CH",
    "saudi arabia": "SA",
    qatar: "QA",
    bahrain: "BH",
    kuwait: "KW",
    oman: "OM",
    egypt: "EG",
    morocco: "MA",
    india: "IN",
    pakistan: "PK",
    australia: "AU",
    canada: "CA",
    brazil: "BR",
    argentina: "AR",
    mexico: "MX",
    japan: "JP",
    china: "CN",
    "south korea": "KR",
    korea: "KR",
    singapore: "SG",
    philippines: "PH",
    thailand: "TH",
    indonesia: "ID",
    vietnam: "VN",
    "south africa": "ZA",
    turkey: "TR",
    greece: "GR",
    ireland: "IE",
    sweden: "SE",
    norway: "NO",
    denmark: "DK",
    finland: "FI",
    poland: "PL",
    russia: "RU",
    ukraine: "UA",
  };
  const iso = NAME_TO_ISO2[c.toLowerCase()];
  if (!iso) return "";
  return String.fromCodePoint(
    ...iso.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

type DiscoverFilter = "all" | "recommended" | "sameLevel" | "openToPlay";

interface NearbyCourt {
  id: string;
  name: string;
  address: string | null;
  distance: number | null;
  sport: string;
  surface: string;
  isInternal: boolean;
  bookingEnabled: boolean;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  academyName: string | null;
}

const TAB_OPTIONS = ["Group Lessons", "Players", "Leaderboard"] as const;

const BALL_LEVELS = [
  "my_level",
  "all",
  "blue",
  "red",
  "orange",
  "green",
  "yellow",
  "glow",
] as const;

function formatLastSeen(iso?: string | null): string {
  if (!iso) return "long ago";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "online now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return "this week+";
}

function isOnlineNow(iso?: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}

function getBallLevelColor(level: string): string {
  const l = level?.toLowerCase() || "";
  if (l.includes("blue")) return "#3B82F6";
  if (l.includes("red")) return "#EF4444";
  if (l.includes("orange")) return "#F97316";
  if (l.includes("green")) return "#22C55E";
  if (l.includes("yellow")) return "#EAB308";
  if (l.includes("glow")) return "#E040FB";
  return Colors.dark.primary;
}

function getBallLevelLabel(level: string): string {
  const l = level?.toLowerCase() || "";
  // Return the full level with sub-level number (e.g. "GLOW 6", "YELLOW 3")
  if (l) {
    // Extract level name and number if present
    const match = l.match(/^(blue|red|orange|green|yellow|glow)\s*(\d+)?$/i);
    if (match) {
      const baseName = match[1].toUpperCase();
      const subLevel = match[2];
      return subLevel ? `${baseName} ${subLevel}` : baseName;
    }
    const altMatch = l.match(
      /^(blue|red|orange|green|yellow|glow)[_-]?(\d+)?$/i,
    );
    if (altMatch) {
      const baseName = altMatch[1].toUpperCase();
      const subLevel = altMatch[2];
      return subLevel ? `${baseName} ${subLevel}` : baseName;
    }
  }
  if (l.includes("blue")) return "BLUE";
  if (l.includes("red")) return "RED";
  if (l.includes("orange")) return "ORANGE";
  if (l.includes("green")) return "GREEN";
  if (l.includes("yellow")) return "YELLOW";
  if (l.includes("glow")) return "GLOW";
  return "";
}

function getCleanSessionTitle(session: PlaySession): string {
  const title = session.title || "";
  if (
    !title ||
    title.includes("-0") ||
    title.match(/\d{2}:\d{2}/) ||
    title.length > 50
  ) {
    return session.sessionType === "group"
      ? "Group Session"
      : "Semi-Private Session";
  }
  return title;
}

export default function PlayScreen() {
  useThemeReactivity();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<PlayStackParamList, "Play">>();
  const queryClient = useQueryClient();
  const { isFamily, familyData, activePlayerId } = useFamily();
  const { isMultiSport, activeSports, activeSport, setActiveSport } =
    useSport();
  const [showPlayModal, setShowPlayModal] = useState(false);
  const [playModalStep, setPlayModalStep] = useState<"sport" | "type">("type");
  const initialTab = route.params?.initialTab || "Group Lessons";
  const [activeTab, setActiveTab] =
    useState<(typeof TAB_OPTIONS)[number]>(initialTab);

  useEffect(() => {
    const tab = route.params?.initialTab;
    if (tab) {
      setActiveTab(tab);
      navigation.setParams({ initialTab: undefined });
    }
  }, [route.params?.initialTab]);

  const [brokenAvatars, setBrokenAvatars] = useState<Set<string>>(new Set());
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [selectedBallLevel, setSelectedBallLevel] =
    useState<string>("my_level");
  const [showOtherLevels, setShowOtherLevels] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [selectedPlayerLevel, setSelectedPlayerLevel] = useState<string>("all");
  const [discoverFilter, setDiscoverFilter] =
    useState<DiscoverFilter>("sameLevel");
  const [selectedSession, setSelectedSession] = useState<PlaySession | null>(
    null,
  );
  const [friendRequestPlayer, setFriendRequestPlayer] =
    useState<NearbyPlayer | null>(null);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [friendRequestPushDelivered, setFriendRequestPushDelivered] = useState<
    boolean | null
  >(null);
  type FriendReqState =
    | { kind: "idle" }
    | { kind: "already_pending_by_me" }
    | { kind: "already_sent_by_them" }
    | { kind: "already_friends" }
    | { kind: "error"; message: string };
  const [friendRequestState, setFriendRequestState] = useState<FriendReqState>({
    kind: "idle",
  });
  // Task #1033 — discovery scope tri-state. "country" sits between My academy
  // and Worldwide so players can find people / matches / tournaments in their
  // own country without losing the academy view.
  const [scope, setScope] = useState<"mine" | "country" | "all">("country");
  const SCOPE_KEY = "@play_scope";
  const [leaderboardSport, setLeaderboardSport] = useState<string>("all");
  const [leaderboardCity, setLeaderboardCity] = useState<string>("all");

  useEffect(() => {
    AsyncStorage.getItem(SCOPE_KEY)
      .then((val) => {
        if (val === "all" || val === "mine" || val === "country") setScope(val);
      })
      .catch(() => {});
  }, []);

  const handleScopeChange = useCallback(
    (newScope: "mine" | "country" | "all") => {
      setScope(newScope);
      AsyncStorage.setItem(SCOPE_KEY, newScope).catch(() => {});
    },
    [],
  );

  const scrollY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  const headerTranslation = useSharedValue(0);
  const headerHeightSV = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const delta = currentY - lastScrollY.value;
      lastScrollY.value = currentY;
      scrollY.value = currentY;

      if (currentY <= 0) {
        headerTranslation.value = withTiming(0, { duration: 200 });
        return;
      }

      const newTranslation = headerTranslation.value - delta;
      headerTranslation.value = Math.max(
        -headerHeightSV.value,
        Math.min(0, newTranslation),
      );
    },
    onBeginDrag: () => {
      lastScrollY.value = scrollY.value;
    },
    onEndDrag: (event) => {
      const currentY = event.contentOffset.y;
      if (currentY <= 0) {
        headerTranslation.value = withTiming(0, { duration: 200 });
      } else if (headerTranslation.value > -headerHeightSV.value / 2) {
        headerTranslation.value = withTiming(0, { duration: 200 });
      } else {
        headerTranslation.value = withTiming(-headerHeightSV.value, {
          duration: 200,
        });
      }
    },
    onMomentumEnd: (event) => {
      const currentY = event.contentOffset.y;
      if (currentY <= 0) {
        headerTranslation.value = withTiming(0, { duration: 200 });
      } else if (headerTranslation.value > -headerHeightSV.value / 2) {
        headerTranslation.value = withTiming(0, { duration: 200 });
      } else {
        headerTranslation.value = withTiming(-headerHeightSV.value, {
          duration: 200,
        });
      }
    },
  });

  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslation.value }],
    opacity: interpolate(
      headerTranslation.value,
      [-headerHeightSV.value, 0],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const insetsTop = insets.top;
  const animatedMainContentStyle = useAnimatedStyle(() => ({
    paddingTop:
      insetsTop + Math.max(headerHeightSV.value + headerTranslation.value, 0),
  }));

  // Task #1383 — Single god-query collapses the 6 parallel mount queries on
  // this screen (profile, booking-invites, open-matches, corporate/my-account,
  // play/sessions, play/nearby-players). Same iOS bridge serialisation fix
  // as Player Home (#1379) and Progress (#1383). The legacy per-resource
  // endpoints stay alive for child components / other screens — we prime
  // their queryKeys via setQueryData below.
  //
  // The chip selections (level, scope, filter) are forwarded to the server,
  // which resolves the `__my_level__` sentinel using the player's ballLevel
  // and applies the free-player "scope=mine → country" fallback so the
  // legacy endpoints get byte-equivalent input.
  interface PlayGodResponse {
    profile: {
      player: { ballLevel?: string; city?: string; country?: string };
      academy?: { id: string; name: string } | null;
    } | null;
    bookingInvites: { booking_invite_guests: { status: string } }[];
    openMatches: { id: string }[];
    corporate: {
      corporateAccount: { companyName: string; creditBalance: number } | null;
      member: { inviteStatus: string } | null;
    };
    sessions: PlaySession[];
    nearbyPlayers: NearbyPlayer[];
    _keys?: {
      sessions: string;
      nearbyPlayers: string;
      openMatches: unknown[];
    };
    _errors?: Record<string, number | null>;
  }

  const apiUrl = getApiUrl();

  // Compute the level param to pass to the API. Mirrored on the server too —
  // the server resolves `__my_level__` against the player's ballLevel — but
  // we still keep the client-side memo so the legacy queryKeys we prime
  // below match what the rest of the screen would build.
  const sessionsLevelParam = useMemo(() => {
    if (!showOtherLevels || selectedBallLevel === "my_level") {
      return "__my_level__";
    }
    return selectedBallLevel; // "all" or specific level
  }, [showOtherLevels, selectedBallLevel]);

  const {
    data: playGodData,
    isError: playGodIsError,
    refetch: refetchPlayGod,
  } = useQuery<PlayGodResponse>({
    queryKey: [
      "/api/player/me/play-data",
      activeSport,
      sessionsLevelParam,
      scope,
      discoverFilter,
    ],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const url = new URL("/api/player/me/play-data", apiUrl);
      url.searchParams.set("sport", activeSport);
      url.searchParams.set("level", sessionsLevelParam);
      url.searchParams.set("scope", scope);
      url.searchParams.set("filter", discoverFilter);
      url.searchParams.set("travelTime", "true");
      const r = await apiRequest("GET", url.toString());
      return r.json();
    },
  });

  // Local aliases — keep the original variable names so the rest of the
  // ~5800-line render body needs zero changes. profileData is derived here
  // because the geocode useEffects below reference it.
  const profileData = playGodData?.profile ?? undefined;
  const invitesData = playGodData?.bookingInvites;
  const openMatchesList = playGodData?.openMatches;
  const corporateData = playGodData?.corporate;
  const sessions = playGodData?.sessions;
  const nearbyPlayers = playGodData?.nearbyPlayers;
  const sessionsLoading = !playGodData;
  const playersLoading = !playGodData;

  // Prime each legacy queryKey from the god-query response so child
  // components and any other screen that re-uses these keys hit cache
  // instead of triggering a fresh request.
  useEffect(() => {
    if (!playGodData) return;
    const qc = queryClient;
    qc.setQueryData(["/api/player/me/profile"], playGodData.profile);
    qc.setQueryData(["/api/player/booking-invites"], playGodData.bookingInvites);
    qc.setQueryData(["/api/corporate/my-account"], playGodData.corporate);
    if (playGodData._keys) {
      qc.setQueryData([playGodData._keys.sessions], playGodData.sessions);
      qc.setQueryData([playGodData._keys.nearbyPlayers], playGodData.nearbyPlayers);
      qc.setQueryData(playGodData._keys.openMatches, playGodData.openMatches);
    }
  }, [playGodData, queryClient]);

  // Reverse geocode location when permission is granted
  const reverseGeocodeMutation = useMutation({
    mutationFn: async ({
      lat,
      lng,
      missingCity,
      missingCountry,
    }: {
      lat: number;
      lng: number;
      missingCity: boolean;
      missingCountry: boolean;
    }) => {
      const response = await apiRequest(
        "GET",
        `/api/maps/reverse-geocode?lat=${lat}&lng=${lng}`,
      );
      const geocoded = (await response.json()) as {
        city?: string;
        country?: string;
      };
      // Only return the fields that were missing
      return {
        city: missingCity ? geocoded.city : undefined,
        country: missingCountry ? geocoded.country : undefined,
      };
    },
    onSuccess: async (data) => {
      const patch: Record<string, string> = {};
      if (data.city) patch.city = data.city;
      if (data.country) patch.country = data.country;
      if (Object.keys(patch).length === 0) return;
      try {
        await apiRequest("PATCH", "/api/player/me/profile", patch);
        queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      } catch (e) {
        // Silent failure - background enrichment only
      }
    },
  });

  const [locationPermission, requestLocationPermission] =
    Location.useForegroundPermissions();
  const hasAutoRequestedLocationRef = useRef(false);

  // Auto-request location permission when status is undetermined (first time).
  // Uses a ref guard so frequent re-renders during mount don't keep cancelling the timer.
  useEffect(() => {
    if (
      locationPermission?.status === "undetermined" &&
      !hasAutoRequestedLocationRef.current
    ) {
      hasAutoRequestedLocationRef.current = true;
      const timer = setTimeout(() => {
        requestLocationPermission();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [locationPermission?.status]);

  // Stable ref to prevent repeated geocode calls on re-renders (time interval causes frequent re-renders)
  const geocodedRef = useRef(false);
  const profileDataRef = useRef(profileData);
  useEffect(() => {
    profileDataRef.current = profileData;
  }, [profileData]);

  // One-shot reverse geocode when location permission is first granted
  useEffect(() => {
    if (!locationPermission?.granted) return;
    if (geocodedRef.current) return; // already ran
    // Wait for profile data before checking what fields to fill
    const profile = profileDataRef.current;
    if (profile === undefined) return;
    const missingCity = !profile?.player?.city;
    const missingCountry = !profile?.player?.country;
    if (!missingCity && !missingCountry) {
      geocodedRef.current = true; // nothing to fill — mark done
      return;
    }
    geocodedRef.current = true; // mark before async to prevent double-fire
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => {
        reverseGeocodeMutation.mutate({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          missingCity,
          missingCountry,
        });
      })
      .catch(() => {
        /* silent */
      });
  }, [locationPermission?.granted, profileData]); // profileData dep so it retries once profile loads

  // Task #1383 — invitesData / openMatchesList / corporateData / sessions /
  // nearbyPlayers used to be 5 individual mount queries here. They are now
  // sourced from the single god-query above; the derived counts stay
  // identical so the rest of the screen body needs no changes.
  const pendingInvitesCount =
    invitesData?.filter((i) => i.booking_invite_guests?.status === "pending")
      ?.length || 0;
  const openMatchesCount = openMatchesList?.length ?? 0;
  const hasCorporateCredits = !!(
    corporateData?.corporateAccount &&
    corporateData?.member?.inviteStatus === "accepted" &&
    (corporateData.corporateAccount.creditBalance ?? 0) > 0
  );

  // Fetch place details (rating + photo ref) when a session with a Google Place ID is selected
  const selectedPlaceId = selectedSession?.locationGooglePlaceId ?? null;
  const { data: sessionPlaceDetails } = useQuery<{
    rating?: number;
    reviewCount?: number;
    photoRef?: string;
  }>({
    queryKey: ["/api/maps/place-details", selectedPlaceId],
    enabled: !!selectedPlaceId,
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/maps/place-details?placeId=${encodeURIComponent(selectedPlaceId!)}`,
      );
      return response.json();
    },
  });

  const playerBallLevel =
    profileData?.player?.ballLevel?.toLowerCase() || "glow";
  const playerAcademyId = profileData?.academy?.id || null;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getCountdownText = (startTime: string) => {
    const sessionDate = new Date(startTime);
    const now = currentTime;
    const diff = sessionDate.getTime() - now.getTime();

    if (diff <= 0)
      return { text: "Starting Now", urgent: true, expired: false };

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return {
        text: `${days}d ${hours % 24}h left`,
        urgent: false,
        expired: false,
      };
    }
    if (hours > 0) {
      return {
        text: `${hours}h ${minutes}m left`,
        urgent: hours < 2,
        expired: false,
      };
    }
    if (minutes > 0) {
      return {
        text: `${minutes}m ${seconds}s left`,
        urgent: minutes < 30,
        expired: false,
      };
    }
    return { text: `${seconds}s left`, urgent: true, expired: false };
  };

  // Task #1033 — free players (no academy) cannot use "mine" but can still
  // pick country vs worldwide. Default them to "country" to keep discovery
  // local-first. Server applies the same fallback for the god-query, but
  // the rest of the screen still reads `effectiveScope` for downstream UI
  // (the place picker, tournaments row, etc.).
  const effectiveScope: "mine" | "country" | "all" = playerAcademyId
    ? scope
    : scope === "mine"
      ? "country"
      : scope;

  // Count of group lessons available in the current ISO week — surfaced on
  // the highlighted "Take a lesson" hero card (Variant 1 Cleanup).
  const lessonsThisWeekCount = useMemo(() => {
    if (!sessions || sessions.length === 0) return 0;
    const now = new Date();
    const day = now.getDay(); // 0 Sun..6 Sat
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - diffToMonday);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    return sessions.filter((s) => {
      const t = s.startTime ? new Date(s.startTime).getTime() : NaN;
      return (
        !Number.isNaN(t) && t >= monday.getTime() && t < nextMonday.getTime()
      );
    }).length;
  }, [sessions]);

  // Task #1383 — kept as a string for `queryClient.invalidateQueries` calls
  // elsewhere in this screen (the swipe-away action invalidates this key).
  // The data itself comes from the god-query above.
  const nearbyPlayersQueryKey =
    discoverFilter !== "all"
      ? `/api/play/nearby-players?filter=${discoverFilter}&sport=${activeSport}&travelTime=true&scope=${effectiveScope}`
      : `/api/play/nearby-players?sport=${activeSport}&travelTime=true&scope=${effectiveScope}`;

  const leaderboardQueryKey = `/api/player/leaderboard?scope=global&sport=${encodeURIComponent(leaderboardSport)}&city=${encodeURIComponent(leaderboardCity)}&limit=100`;
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{
    rankings: {
      rank: number;
      id: string;
      name: string;
      photoUrl: string | null;
      ballLevel: string | null;
      glowRank: number | null;
      glowMmr: number;
      academyName: string | null;
      city: string | null;
      isCurrentPlayer: boolean;
    }[];
    myRank: number;
    availableCities: string[];
  }>({
    queryKey: [leaderboardQueryKey],
    enabled: activeTab === "Leaderboard",
  });

  // Filter and limit players based on search and showAll state
  const filteredPlayers = useMemo(() => {
    if (!nearbyPlayers) return [];

    let filtered = nearbyPlayers;

    // Apply search filter
    if (playerSearchQuery.trim()) {
      const query = playerSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.vibe?.toLowerCase().includes(query),
      );
    }

    // Apply ball level filter for players FIRST
    if (selectedPlayerLevel !== "all") {
      filtered = filtered.filter((p) => {
        const level = p.ballLevel?.toLowerCase() || "";
        return (
          level.includes(selectedPlayerLevel) ||
          selectedPlayerLevel.includes(level)
        );
      });
    }

    return filtered;
  }, [nearbyPlayers, playerSearchQuery, selectedPlayerLevel]);

  // Variant 1 cleanup — day presets replace the Mon-Sun chip list. Maps to
  // human-friendly buckets (today / tomorrow / weekend) instead of forcing
  // the player to know which weekday they want.
  const DAY_PRESETS = [
    { id: "all", label: "All Days" },
    { id: "today", label: "Today" },
    { id: "tomorrow", label: "Tomorrow" },
    { id: "weekend", label: "Weekend" },
  ] as const;
  type DayPresetId = (typeof DAY_PRESETS)[number]["id"];

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    // API already handles level filtering; only apply day filter client-side
    let filtered = sessions.filter((s) => s.sessionType === "group");

    if (selectedDay !== "all") {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
      const startOfDayAfterTomorrow = new Date(startOfTomorrow);
      startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);

      filtered = filtered.filter((s) => {
        const t = s.startTime ? new Date(s.startTime) : null;
        if (!t || Number.isNaN(t.getTime())) return false;
        if (selectedDay === "today") {
          return t >= startOfToday && t < startOfTomorrow;
        }
        if (selectedDay === "tomorrow") {
          return t >= startOfTomorrow && t < startOfDayAfterTomorrow;
        }
        if (selectedDay === "weekend") {
          const d = t.getDay(); // 0 Sun..6 Sat
          return (d === 0 || d === 6) && t >= startOfToday;
        }
        return true;
      });
    }

    return filtered;
  }, [sessions, selectedDay]);

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/play/sessions/${sessionId}/join`,
      );
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Joined!", data.message || "You're in the session!");
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0].startsWith("/api/play/sessions") ||
            q.queryKey[0] === "/api/player/me/play-data"),
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ")
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not join session");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const joinWaitlistMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/play/sessions/${sessionId}/waitlist`,
      );
      return await response.json();
    },
    onSuccess: (data: {
      success?: boolean;
      message?: string;
      position?: number;
    }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Waitlist",
        data.message || `You're #${data.position} on the waitlist!`,
      );
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0].startsWith("/api/play/sessions") ||
            q.queryKey[0] === "/api/player/me/play-data"),
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ")
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not join waitlist");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const leaveSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/play/sessions/${sessionId}/leave`,
      );
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Left Session", data.message || "You've left the session");
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0].startsWith("/api/play/sessions") ||
            q.queryKey[0] === "/api/player/me/play-data"),
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ")
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not leave session");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const leaveWaitlistMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/play/sessions/${sessionId}/waitlist`,
      );
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Removed",
        data.message || "You've been removed from the waitlist",
      );
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0].startsWith("/api/play/sessions") ||
            q.queryKey[0] === "/api/player/me/play-data"),
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ")
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not leave waitlist");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const claimWaitlistSpotMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/play/sessions/${sessionId}/waitlist/claim`,
      );
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Spot Claimed!",
        data.message || "You've successfully claimed your spot!",
      );
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0].startsWith("/api/play/sessions") ||
            q.queryKey[0] === "/api/player/me/play-data"),
      });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ")
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not claim the spot");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const dropInBookMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/play/sessions/${sessionId}/drop-in-book`,
      );
      return await response.json();
    },
    onSuccess: async (data: {
      checkoutUrl?: string;
      sessionId?: string;
      price?: number;
    }) => {
      setJoiningSessionId(null);
      if (data.checkoutUrl) {
        await WebBrowser.openBrowserAsync(data.checkoutUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        queryClient.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" &&
            (q.queryKey[0].startsWith("/api/play/sessions") ||
            q.queryKey[0] === "/api/player/me/play-data"),
        });
        Alert.alert(
          "Booked! See you there.",
          "Payment complete — you are in the session.",
        );
      }
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ")
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not start drop-in booking");
      setJoiningSessionId(null);
    },
  });

  const handleDropInBook = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningSessionId(sessionId);
    dropInBookMutation.mutate(sessionId);
  };

  const handleLeaveSession = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningSessionId(sessionId);
    leaveSessionMutation.mutate(sessionId);
  };

  const handleLeaveWaitlist = (sessionId: string) => {
    Alert.alert(
      "Leave Waitlist",
      "Are you sure you want to remove yourself from the waitlist?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setJoiningSessionId(sessionId);
            leaveWaitlistMutation.mutate(sessionId);
          },
        },
      ],
    );
  };

  const handleClaimWaitlistSpot = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setJoiningSessionId(sessionId);
    claimWaitlistSpotMutation.mutate(sessionId);
  };

  const handleJoinSession = (sessionId: string) => {
    logger.log(
      "[PlayScreen] handleJoinSession called with sessionId:",
      sessionId,
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningSessionId(sessionId);
    joinSessionMutation.mutate(sessionId);
  };

  const handleJoinWaitlist = (sessionId: string) => {
    setJoiningSessionId(sessionId);
    joinWaitlistMutation.mutate(sessionId);
  };

  const formatTime = (dateStr: string) => {
    // Use Dubai timezone for consistent display
    return formatSessionTimeWithRelativeDay(dateStr, "Asia/Dubai");
  };

  const getStatusBadge = (session: PlaySession) => {
    const effectiveMax =
      session.sessionType === "semi_private"
        ? Math.min(session.maxPlayers, 2)
        : session.maxPlayers;
    const spotsLeft = effectiveMax - session.currentPlayers;
    const enrolledForDisplay = session.enrolledCount ?? session.currentPlayers;
    const playerCount = `${enrolledForDisplay}/${effectiveMax}`;

    if (spotsLeft <= 0) {
      return {
        text: `Full (${playerCount})`,
        color: Colors.dark.error,
        bgColor: Colors.dark.error + "40",
      };
    }
    if (spotsLeft === 1) {
      return {
        text: `Almost Full (${playerCount})`,
        color: Colors.dark.orange,
        bgColor: Colors.dark.orange + "40",
      };
    }
    return {
      text: `${spotsLeft} spots left (${playerCount})`,
      color: Colors.dark.primary,
      bgColor: Colors.dark.primary + "40",
    };
  };

  const getLevelRangeText = (session: PlaySession) => {
    if (session.minLevel && session.maxLevel) {
      return `Lv ${session.minLevel}-${session.maxLevel}`;
    }
    if (session.minLevel) return `Lv ${session.minLevel}+`;
    if (session.maxLevel) return `Lv 1-${session.maxLevel}`;
    return "All Levels";
  };

  const getWaitlistClaimCountdown = (
    offeredAt: string,
    claimWindowMinutes: number,
  ): string => {
    const offeredTime = new Date(offeredAt).getTime();
    const expiryTime = offeredTime + claimWindowMinutes * 60 * 1000;
    const now = Date.now();
    const remainingMs = expiryTime - now;
    if (remainingMs <= 0) return "Expired";
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const renderSessionCard = (session: PlaySession) => {
    const statusBadge = getStatusBadge(session);
    const effectiveMax =
      session.sessionType === "semi_private"
        ? Math.min(session.maxPlayers, 2)
        : session.maxPlayers;
    // Use server-provided status which accounts for offered waitlist spots as reserved seats
    const isFull = session.status === "full";
    const isJoining = joiningSessionId === session.id;
    const backgroundImage = session.courtImageUrl
      ? { uri: session.courtImageUrl }
      : courtBackground;
    const sessionLevelColor = getBallLevelColor(session.ballLevel || "");
    const isOffered =
      session.isOnWaitlist && session.waitlistStatus === "offered";
    // Drop-in: session has a price AND player is not from the same academy
    const isDropInSession =
      session.publicDropInPrice != null &&
      !(
        playerAcademyId &&
        session.sessionAcademyId &&
        playerAcademyId === session.sessionAcademyId
      );

    return (
      <View
        key={session.id}
        style={[
          styles.epicSessionCard,
          {
            borderWidth: 2,
            borderColor: sessionLevelColor + "60",
            shadowColor: sessionLevelColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          },
        ]}
      >
        <ImageBackground
          source={backgroundImage}
          style={styles.cardBackground}
          imageStyle={styles.cardBackgroundImage}
        >
          <LinearGradient
            colors={
              Colors.dark.text === "#FFFFFF"
                ? ["rgba(0,0,0,0.3)", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.9)"]
                : [
                    "rgba(255,255,255,0.05)",
                    "rgba(255,255,255,0.55)",
                    "rgba(255,255,255,0.85)",
                  ]
            }
            style={styles.cardOverlay}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleSection}>
                  <View style={styles.titleWithBadges}>
                    <Text style={styles.epicSessionTitle}>
                      {getCleanSessionTitle(session)}
                    </Text>
                    <View style={styles.inlineBadgesRow}>
                      <View style={styles.epicXpBadgeSmall}>
                        <Ionicons
                          name="flame"
                          size={12}
                          color={Colors.dark.orange}
                        />
                        <Text style={styles.epicXpTextSmall}>
                          +{session.xpReward} XP
                        </Text>
                      </View>
                      {(() => {
                        const countdown = getCountdownText(session.startTime);
                        return (
                          <View
                            style={[
                              styles.countdownBadgeSmall,
                              countdown.urgent && styles.countdownUrgent,
                            ]}
                          >
                            <Ionicons
                              name="timer-outline"
                              size={11}
                              color={
                                countdown.urgent
                                  ? Colors.dark.error
                                  : Colors.dark.primary
                              }
                            />
                            <Text
                              style={[
                                styles.countdownTextSmall,
                                countdown.urgent && styles.countdownTextUrgent,
                              ]}
                            >
                              {countdown.text}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                  {session.ballLevel &&
                    getBallLevelLabel(session.ballLevel) && (
                      <Text
                        style={[
                          styles.ballLevelBadgeText,
                          { color: getBallLevelColor(session.ballLevel) },
                        ]}
                      >
                        {getBallLevelLabel(session.ballLevel)}
                      </Text>
                    )}
                  <Pressable
                    style={styles.epicLocationRow}
                    onPress={
                      session.academyId
                        ? () =>
                            navigation.navigate(
                              "AcademyPublicProfile" as never,
                              { academyId: session.academyId } as never,
                            )
                        : undefined
                    }
                    disabled={!session.academyId}
                  >
                    <Ionicons
                      name="location"
                      size={14}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.epicLocationText}>
                      {session.locationName}
                    </Text>
                  </Pressable>
                  {session.coachName ? (
                    <Pressable
                      style={styles.epicCoachRow}
                      onPress={() =>
                        session.coachId
                          ? navigation.navigate("CoachProfile", {
                              coachId: session.coachId,
                            })
                          : undefined
                      }
                    >
                      {session.coachPhotoUrl ? (
                        <ExpoImage
                          source={{
                            uri: buildPhotoUrl(session.coachPhotoUrl)!,
                          }}
                          style={styles.coachAvatarSmall}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.coachAvatarSmallPlaceholder}>
                          <Text style={styles.coachAvatarSmallInitial}>
                            {session.coachName.charAt(0)}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.epicCoachText}>
                        {session.coachName}
                      </Text>
                      {session.coachAverageRating ? (
                        <View style={styles.coachRatingBadge}>
                          <Ionicons
                            name="star"
                            size={10}
                            color={Colors.dark.primary}
                          />
                          <Text style={styles.coachRatingText}>
                            {session.coachAverageRating.toFixed(1)}
                            {session.coachTotalRatings
                              ? ` · ${session.coachTotalRatings} review${session.coachTotalRatings === 1 ? "" : "s"}`
                              : ""}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ) : null}
                  {session.academyName ? (
                    <Pressable
                      style={styles.epicAcademyRow}
                      onPress={() =>
                        session.academyId
                          ? navigation.navigate("AcademyProfile", {
                              academyId: session.academyId,
                            })
                          : undefined
                      }
                    >
                      {session.academyLogoUrl ? (
                        <ExpoImage
                          source={{
                            uri: buildPhotoUrl(session.academyLogoUrl)!,
                          }}
                          style={styles.academyLogoSmall}
                          contentFit="contain"
                        />
                      ) : (
                        <Ionicons
                          name="business-outline"
                          size={13}
                          color={Colors.dark.textMuted}
                        />
                      )}
                      <Text style={styles.epicAcademyText}>
                        {session.academyName}
                        {session.academyCity ? ` · ${session.academyCity}` : ""}
                      </Text>
                    </Pressable>
                  ) : null}
                  {session.sessionAcademyId &&
                  session.sessionAcademyId !== playerAcademyId &&
                  session.sessionAcademyName ? (
                    <Pressable
                      style={styles.crossAcademyBadge}
                      onPress={() =>
                        navigation.navigate(
                          "AcademyProfile" as never,
                          { academyId: session.sessionAcademyId } as never,
                        )
                      }
                      hitSlop={8}
                    >
                      <Ionicons
                        name="business-outline"
                        size={12}
                        color={Colors.dark.textMuted}
                      />
                      <Text style={styles.crossAcademyBadgeText}>
                        {session.sessionAcademyName}
                      </Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.epicMetaRow}>
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={Colors.dark.textMuted}
                    />
                    <Text style={styles.epicMetaText}>
                      {formatTime(session.startTime)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.epicActionsRow}>
                <View style={styles.epicStatusSection}>
                  <View
                    style={[
                      styles.epicStatusBadge,
                      {
                        backgroundColor: isOffered
                          ? "#F59E0B40"
                          : statusBadge.bgColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.epicStatusText,
                        { color: isOffered ? "#F59E0B" : statusBadge.color },
                      ]}
                    >
                      {isOffered ? "Spot Offered!" : statusBadge.text}
                    </Text>
                  </View>
                  {session.isEnrolled ? (
                    <Pressable
                      style={[
                        styles.epicCancelButton,
                        isJoining && styles.buttonDisabled,
                      ]}
                      onPress={() => {
                        if (!isJoining) {
                          handleLeaveSession(session.id);
                        }
                      }}
                    >
                      {isJoining ? (
                        <ActivityIndicator size="small" color="#FF6B6B" />
                      ) : (
                        <>
                          <Ionicons
                            name="close-circle-outline"
                            size={18}
                            color="#FF6B6B"
                          />
                          <Text style={styles.epicCancelButtonText}>
                            Cancel
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : isOffered ? (
                    <View style={styles.waitlistOfferedContainer}>
                      <Text style={styles.waitlistClaimTimer}>
                        {session.offeredAt
                          ? getWaitlistClaimCountdown(
                              session.offeredAt,
                              session.claimWindowMinutes || 30,
                            )
                          : ""}
                      </Text>
                      <View style={styles.waitlistOfferedButtons}>
                        <Pressable
                          style={[
                            styles.epicClaimButton,
                            isJoining && styles.buttonDisabled,
                          ]}
                          onPress={() => {
                            if (!isJoining) handleClaimWaitlistSpot(session.id);
                          }}
                        >
                          {isJoining ? (
                            <ActivityIndicator
                              size="small"
                              color={Colors.dark.buttonText}
                            />
                          ) : (
                            <>
                              <Ionicons
                                name="checkmark-circle-outline"
                                size={16}
                                color={Colors.dark.buttonText}
                              />
                              <Text style={styles.epicClaimButtonText}>
                                Claim Spot
                              </Text>
                            </>
                          )}
                        </Pressable>
                        <Pressable
                          style={styles.epicDeclineButton}
                          onPress={() => handleLeaveWaitlist(session.id)}
                        >
                          <Text style={styles.epicDeclineButtonText}>
                            Decline
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : session.isOnWaitlist ? (
                    <View style={styles.waitlistStatusContainer}>
                      <View style={styles.waitlistPositionBadge}>
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color={Colors.dark.primary}
                        />
                        <Text style={styles.waitlistPositionText}>
                          {session.waitlistPosition != null
                            ? `#${session.waitlistPosition} on waitlist — you'll get a notification when a spot opens`
                            : "On waitlist — you'll get a notification when a spot opens"}
                        </Text>
                      </View>
                      <Pressable
                        style={[
                          styles.epicLeaveWaitlistButton,
                          isJoining && styles.buttonDisabled,
                        ]}
                        onPress={() => {
                          if (!isJoining) handleLeaveWaitlist(session.id);
                        }}
                      >
                        {isJoining ? (
                          <ActivityIndicator size="small" color="#FF6B6B" />
                        ) : (
                          <Text style={styles.epicLeaveWaitlistText}>
                            Leave Waitlist
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ) : !isFull ? (
                    isDropInSession ? (
                      <Pressable
                        style={[
                          styles.epicDropInButton,
                          isJoining && styles.buttonDisabled,
                        ]}
                        onPress={() => {
                          if (!isJoining) {
                            handleDropInBook(session.id);
                          }
                        }}
                      >
                        {isJoining ? (
                          <ActivityIndicator size="small" color="#000" />
                        ) : (
                          <>
                            <Ionicons
                              name="card-outline"
                              size={18}
                              color="#000"
                            />
                            <Text style={styles.epicDropInButtonText}>
                              Book & Pay — AED{" "}
                              {session.publicDropInPrice!.toFixed(0)}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[
                          styles.epicJoinButton,
                          isJoining && styles.buttonDisabled,
                        ]}
                        onPress={() => {
                          logger.log(
                            "[PlayScreen] Join button pressed for session:",
                            session.id,
                          );
                          if (!isJoining) {
                            handleJoinSession(session.id);
                          }
                        }}
                      >
                        {isJoining ? (
                          <ActivityIndicator
                            size="small"
                            color={Colors.dark.buttonText}
                          />
                        ) : (
                          <>
                            <Ionicons
                              name="enter-outline"
                              size={18}
                              color={Colors.dark.buttonText}
                            />
                            <Text style={styles.epicJoinButtonText}>
                              Join Session
                            </Text>
                          </>
                        )}
                      </Pressable>
                    )
                  ) : (
                    <Pressable
                      style={[
                        styles.epicWaitlistButton,
                        isJoining && styles.buttonDisabled,
                      ]}
                      onPress={() => {
                        logger.log(
                          "[PlayScreen] Waitlist button pressed for session:",
                          session.id,
                        );
                        if (!isJoining) {
                          handleJoinWaitlist(session.id);
                        }
                      }}
                    >
                      {isJoining ? (
                        <ActivityIndicator
                          size="small"
                          color={Colors.dark.text}
                        />
                      ) : (
                        <>
                          <Ionicons
                            name="list-outline"
                            size={16}
                            color={Colors.dark.text}
                          />
                          <Text style={styles.epicWaitlistButtonText}>
                            Join Waitlist
                            {session.waitlistCount > 0
                              ? ` (${session.waitlistCount})`
                              : ""}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Price + Spots chip */}
              {isDropInSession ? (
                <View style={styles.priceChipRow}>
                  <View style={styles.priceChip}>
                    <Ionicons
                      name="cash-outline"
                      size={12}
                      color="#39FF14"
                      style={{ marginRight: 2 }}
                    />
                    <Text style={[styles.priceChipText, { color: "#39FF14" }]}>
                      AED {session.publicDropInPrice!.toFixed(0)} / session
                    </Text>
                  </View>
                  {session.academyName || session.sessionAcademyName ? (
                    <View style={styles.spotsChip}>
                      <Text style={styles.spotsChipText}>
                        at {session.academyName || session.sessionAcademyName}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.spotsChip}>
                      <Text style={styles.spotsChipText}>
                        {Math.max(
                          0,
                          session.maxPlayers - session.currentPlayers,
                        )}{" "}
                        spots left
                      </Text>
                    </View>
                  )}
                </View>
              ) : session.publicDropInPrice === 0 ? (
                <View style={styles.priceChipRow}>
                  <View style={styles.priceChip}>
                    <Text style={styles.priceChipText}>Free</Text>
                  </View>
                  <View style={styles.spotsChip}>
                    <Text style={styles.spotsChipText}>
                      {Math.max(0, session.maxPlayers - session.currentPlayers)}{" "}
                      spots left
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Credit Cost Indicator — only shown for academy members using credits, not drop-in players */}
              {!isDropInSession ? (
                <View style={styles.creditCostRow}>
                  <Ionicons
                    name="ticket-outline"
                    size={14}
                    color={
                      hasCorporateCredits
                        ? Colors.dark.primary
                        : Colors.dark.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.creditCostText,
                      hasCorporateCredits ? { color: Colors.dark.primary } : {},
                    ]}
                  >
                    {hasCorporateCredits
                      ? `Company credit (${corporateData?.corporateAccount?.companyName})`
                      : `1 ${session.sessionType === "group" ? "Group" : "Semi-Private"} Credit`}
                  </Text>
                </View>
              ) : null}

              {/* Participants Section - Below buttons */}
              {session.players.length > 0 ? (
                <View style={styles.participantsRow}>
                  <View style={styles.epicAvatarStack}>
                    {session.players.slice(0, 6).map((player, index) => (
                      <View
                        key={player.id}
                        style={[
                          styles.epicAvatarCircle,
                          {
                            marginLeft: index > 0 ? -16 : 0,
                            zIndex: 6 - index,
                          },
                        ]}
                      >
                        {player.avatarUrl ? (
                          Platform.OS === "web" ? (
                            <RNImage
                              source={{ uri: buildPhotoUrl(player.avatarUrl)! }}
                              style={styles.epicAvatarImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <ExpoImage
                              source={{ uri: buildPhotoUrl(player.avatarUrl)! }}
                              style={styles.epicAvatarImage}
                              contentFit="cover"
                            />
                          )
                        ) : (
                          <LinearGradient
                            colors={[
                              Colors.dark.backgroundSecondary,
                              Colors.dark.backgroundTertiary,
                            ]}
                            style={styles.epicAvatarPlaceholder}
                          >
                            <Text style={styles.epicAvatarInitial}>
                              {player.name.charAt(0).toUpperCase()}
                            </Text>
                          </LinearGradient>
                        )}
                        {player.ballLevel === "glow" ? (
                          <View style={styles.epicGoldRing} />
                        ) : null}
                      </View>
                    ))}
                    {session.players.length > 6 ||
                    session.currentPlayers > session.players.length ? (
                      <View
                        style={[
                          styles.epicAvatarCircle,
                          styles.epicAvatarMore,
                          { marginLeft: -16 },
                        ]}
                      >
                        <Text style={styles.epicAvatarMoreText}>
                          +
                          {Math.max(
                            session.players.length > 6
                              ? session.players.length - 6
                              : 0,
                            session.currentPlayers - session.players.length,
                          )}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.participantNamesRow}>
                    <Text style={styles.participantNamesText}>
                      {session.players
                        .slice(0, 3)
                        .map((p) => p.name.split(" ")[0])
                        .join(", ")}
                      {session.players.length > 3
                        ? ` +${session.players.length - 3}`
                        : ""}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.sessionInfoButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSession(session);
                    }}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={Colors.dark.primary}
                    />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.participantsRow}>
                  <Text
                    style={[
                      styles.participantNamesText,
                      { color: Colors.dark.textMuted },
                    ]}
                  >
                    No players yet
                  </Text>
                  <Pressable
                    style={styles.sessionInfoButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSession(session);
                    }}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color={Colors.dark.primary}
                    />
                  </Pressable>
                </View>
              )}

              {session.squadName ? (
                <View style={styles.epicSquadRow}>
                  <Ionicons
                    name="radio"
                    size={14}
                    color={Colors.dark.primary}
                  />
                  <Text style={styles.epicSquadName}>{session.squadName}</Text>
                  <View style={styles.epicSquadXpBadge}>
                    <Ionicons
                      name="flame"
                      size={12}
                      color={Colors.dark.orange}
                    />
                    <Text style={styles.epicSquadXp}>
                      +{session.squadXpBonus || 2} Squad XP
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </LinearGradient>
        </ImageBackground>
        <View style={styles.epicCardGlow} />
      </View>
    );
  };

  const sendFriendRequestMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/player/connections/request`,
        { targetPlayerId: playerId },
      );
      return await response.json();
    },
    onSuccess: (data: { recipientHasPushTokens?: boolean } | undefined) => {
      setFriendRequestSent(true);
      setFriendRequestPushDelivered(data?.recipientHasPushTokens ?? null);
      setFriendRequestState({ kind: "idle" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Refresh nearby list so the card flips to the "Invited" pill immediately.
      queryClient.invalidateQueries({ queryKey: [nearbyPlayersQueryKey] });
    },
    onError: (error: Error) => {
      // apiRequest throws errors of the form "<status>: <body>". Extract status + clean message.
      const raw = error?.message || "";
      const m = raw.match(/^(\d+):\s*(.*)$/s);
      const status = m ? Number(m[1]) : 0;
      const bodyRaw = m ? m[2].trim() : raw;
      let message = bodyRaw;
      try {
        const parsed = JSON.parse(bodyRaw);
        message = parsed?.error || parsed?.message || bodyRaw;
      } catch {
        // not JSON, leave as-is
      }

      if (status === 409) {
        const lower = message.toLowerCase();
        if (lower.includes("already friends")) {
          setFriendRequestState({ kind: "already_friends" });
        } else if (lower.includes("already sent you")) {
          setFriendRequestState({ kind: "already_sent_by_them" });
        } else {
          // "Friend request already sent" — i.e. by me
          setFriendRequestState({ kind: "already_pending_by_me" });
        }
        // No haptic error for an "already sent" state — it's not a failure.
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFriendRequestState({
        kind: "error",
        message: message || "Could not send friend request. Please try again.",
      });
    },
  });

  const [courtsViewMode, setCourtsViewMode] = useState<"list" | "map">("list");
  const courtsMapRef = useRef<any>(null);
  // Require all map exports we render — a partial load (where one export is
  // missing) would still crash at render, so treat that as unavailable.
  const mapsAvailable =
    !!MapViewLib && !!MarkerLib && !!CalloutLib && !MAPS_LOAD_ERROR;
  const [nearbyCourtsLocation, setNearbyCourtsLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const nearbyCourtsEnabled =
    locationPermission?.granted === true && nearbyCourtsLocation !== null;
  const nearbyCourtsQueryKey = nearbyCourtsEnabled
    ? `/api/play/nearby-courts?lat=${nearbyCourtsLocation!.lat}&lng=${nearbyCourtsLocation!.lng}`
    : null;
  const { data: nearbyCourts, isLoading: nearbyCourtsLoading } = useQuery<
    NearbyCourt[]
  >({
    queryKey: nearbyCourtsQueryKey
      ? [nearbyCourtsQueryKey]
      : ["__disabled_nearby_courts__"],
    enabled: nearbyCourtsEnabled,
  });

  useEffect(() => {
    if (!locationPermission?.granted) return;
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => {
        setNearbyCourtsLocation({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      })
      .catch(() => {});
  }, [locationPermission?.granted]);

  const renderCourtsNearYou = () => {
    if (!locationPermission) return null;
    if (!locationPermission.granted) {
      if (
        locationPermission.status === "denied" &&
        !locationPermission.canAskAgain
      ) {
        if (Platform.OS === "ios") return null;
        return (
          <View style={styles.courtsNearYouSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons
                  name="location"
                  size={20}
                  color={Colors.dark.primary}
                />
                <Text style={styles.sectionTitle}>Courts Near You</Text>
              </View>
            </View>
            <View style={styles.locationPermissionBanner}>
              <Ionicons
                name="location-outline"
                size={18}
                color={Colors.dark.primary}
              />
              <Text style={styles.locationPermissionText}>
                Enable location in Settings to discover nearby courts
              </Text>
            </View>
          </View>
        );
      }
      return (
        <View style={styles.courtsNearYouSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="location" size={20} color={Colors.dark.primary} />
              <Text style={styles.sectionTitle}>Courts Near You</Text>
            </View>
          </View>
          <Pressable
            style={styles.locationPermissionBanner}
            onPress={() => requestLocationPermission()}
          >
            <Ionicons
              name="location-outline"
              size={18}
              color={Colors.dark.primary}
            />
            <Text style={styles.locationPermissionText}>
              Enable location to discover nearby courts
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: Colors.dark.primary,
                fontWeight: "600",
              }}
            >
              Enable
            </Text>
          </Pressable>
        </View>
      );
    }
    if (nearbyCourtsLoading) {
      return (
        <View style={styles.courtsNearYouSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="location" size={20} color={Colors.dark.primary} />
              <Text style={styles.sectionTitle}>Courts Near You</Text>
            </View>
          </View>
          <ActivityIndicator
            size="small"
            color={Colors.dark.primary}
            style={{ marginVertical: Spacing.md }}
          />
        </View>
      );
    }
    if (!nearbyCourts || nearbyCourts.length === 0) {
      return (
        <View style={styles.courtsNearYouSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="location" size={20} color={Colors.dark.primary} />
              <Text style={styles.sectionTitle}>Courts Near You</Text>
            </View>
          </View>
          <View style={styles.locationPermissionBanner}>
            <Ionicons
              name="tennisball-outline"
              size={18}
              color={Colors.dark.textMuted}
            />
            <Text
              style={[
                styles.locationPermissionText,
                { color: Colors.dark.textMuted },
              ]}
            >
              No courts found nearby
            </Text>
          </View>
        </View>
      );
    }
    const courtsWithCoords = nearbyCourts.filter(
      (c) => c.lat != null && c.lng != null,
    );

    const fitMapToMarkers = () => {
      if (!courtsMapRef.current || courtsWithCoords.length === 0) return;
      const coords = courtsWithCoords.map((c) => ({
        latitude: c.lat!,
        longitude: c.lng!,
      }));
      if (nearbyCourtsLocation) {
        coords.push({
          latitude: nearbyCourtsLocation.lat,
          longitude: nearbyCourtsLocation.lng,
        });
      }
      courtsMapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
    };

    return (
      <View style={styles.courtsNearYouSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="location" size={20} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>Courts Near You</Text>
          </View>
          <View style={styles.courtsViewToggle}>
            <Pressable
              style={[
                styles.courtsViewToggleBtn,
                courtsViewMode === "list" && styles.courtsViewToggleBtnActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCourtsViewMode("list");
              }}
            >
              <Ionicons
                name="list"
                size={16}
                color={
                  courtsViewMode === "list"
                    ? Colors.dark.backgroundRoot
                    : Colors.dark.textMuted
                }
              />
            </Pressable>
            <Pressable
              style={[
                styles.courtsViewToggleBtn,
                courtsViewMode === "map" && styles.courtsViewToggleBtnActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCourtsViewMode("map");
              }}
            >
              <Ionicons
                name="map"
                size={16}
                color={
                  courtsViewMode === "map"
                    ? Colors.dark.backgroundRoot
                    : Colors.dark.textMuted
                }
              />
            </Pressable>
          </View>
        </View>
        {courtsViewMode === "list" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nearbyCourtsScroll}
          >
            {nearbyCourts.map((court) => (
              <View key={court.id} style={styles.nearbyCourtCard}>
                <View style={styles.nearbyCourtHeader}>
                  <View style={styles.nearbyCourtBadgeRow}>
                    <View
                      style={[
                        styles.nearbyCourtSportBadge,
                        {
                          backgroundColor: court.isInternal
                            ? Colors.dark.primary + "25"
                            : Colors.dark.backgroundTertiary,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          court.sport === "padel"
                            ? "grid-outline"
                            : "tennisball-outline"
                        }
                        size={12}
                        color={
                          court.isInternal
                            ? Colors.dark.primary
                            : Colors.dark.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.nearbyCourtSportText,
                          {
                            color: court.isInternal
                              ? Colors.dark.primary
                              : Colors.dark.textMuted,
                          },
                        ]}
                      >
                        {court.sport.charAt(0).toUpperCase() +
                          court.sport.slice(1)}
                      </Text>
                    </View>
                    {court.isInternal ? (
                      <View style={styles.nearbyCourtInternalBadge}>
                        <Text style={styles.nearbyCourtInternalText}>
                          Academy
                        </Text>
                      </View>
                    ) : court.academyName ? (
                      <View style={styles.nearbyCourtExternalBadge}>
                        <Text
                          style={styles.nearbyCourtExternalText}
                          numberOfLines={1}
                        >
                          {court.academyName}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {court.distance != null ? (
                    <View style={styles.nearbyCourtDistanceBadge}>
                      <Ionicons
                        name="navigate"
                        size={10}
                        color={Colors.dark.primary}
                      />
                      <Text style={styles.nearbyCourtDistanceText}>
                        {court.distance} km away
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.nearbyCourtDistanceBadge,
                        { backgroundColor: Colors.dark.backgroundTertiary },
                      ]}
                    >
                      <Ionicons
                        name="location-outline"
                        size={10}
                        color={Colors.dark.textMuted}
                      />
                      <Text
                        style={[
                          styles.nearbyCourtDistanceText,
                          { color: Colors.dark.textMuted },
                        ]}
                      >
                        No location set
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.nearbyCourtName} numberOfLines={2}>
                  {court.name}
                </Text>
                {court.address ? (
                  <Text style={styles.nearbyCourtAddress} numberOfLines={1}>
                    {court.address}
                  </Text>
                ) : null}
                {court.surface && court.surface !== "unknown" ? (
                  <View style={styles.nearbyCourtSurfaceChip}>
                    <Text style={styles.nearbyCourtSurfaceText}>
                      {court.surface.charAt(0).toUpperCase() +
                        court.surface.slice(1)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.nearbyCourtActions}>
                  {court.isInternal && court.bookingEnabled ? (
                    <Pressable
                      style={styles.nearbyCourtBookBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate("BookCourt" as never);
                      }}
                    >
                      <Text style={styles.nearbyCourtBookBtnText}>Book</Text>
                    </Pressable>
                  ) : null}
                  {court.lat != null && court.lng != null ? (
                    <Pressable
                      style={styles.nearbyCourtDirectionsBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        openMapsDirections({
                          lat: court.lat,
                          lng: court.lng,
                          label: court.name,
                        });
                      }}
                    >
                      <Ionicons
                        name="navigate-outline"
                        size={14}
                        color={Colors.dark.primary}
                      />
                      <Text style={styles.nearbyCourtDirectionsBtnText}>
                        Directions
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : Platform.OS === "web" || !mapsAvailable ? (
          <View style={styles.courtsMapWebFallback}>
            <Ionicons
              name="map-outline"
              size={32}
              color={Colors.dark.textMuted}
            />
            <Text style={styles.courtsMapWebFallbackText}>
              {Platform.OS === "web"
                ? "Open the app in Expo Go to view the interactive courts map"
                : "Map view needs the latest app version from the store. Use the list view above."}
            </Text>
          </View>
        ) : (
          <View style={styles.courtsMapContainer}>
            <MapViewLib
              ref={courtsMapRef}
              style={styles.courtsMap}
              provider={PROVIDER_DEFAULT_VAL}
              showsUserLocation={true}
              showsMyLocationButton={false}
              onMapReady={fitMapToMarkers}
              initialRegion={
                nearbyCourtsLocation
                  ? {
                      latitude: nearbyCourtsLocation.lat,
                      longitude: nearbyCourtsLocation.lng,
                      latitudeDelta: 0.05,
                      longitudeDelta: 0.05,
                    }
                  : undefined
              }
            >
              {courtsWithCoords.map((court) => (
                <MarkerLib
                  key={court.id}
                  coordinate={{ latitude: court.lat!, longitude: court.lng! }}
                  pinColor={
                    court.isInternal
                      ? Colors.dark.primary
                      : Colors.dark.textMuted
                  }
                >
                  <CalloutLib tooltip={false}>
                    <View style={styles.courtsMapCallout}>
                      <Text
                        style={styles.courtsMapCalloutName}
                        numberOfLines={2}
                      >
                        {court.name}
                      </Text>
                      <View style={styles.courtsMapCalloutMeta}>
                        {court.surface && court.surface !== "unknown" ? (
                          <Text style={styles.courtsMapCalloutSurface}>
                            {court.surface.charAt(0).toUpperCase() +
                              court.surface.slice(1)}
                          </Text>
                        ) : null}
                        {court.distance != null ? (
                          <Text style={styles.courtsMapCalloutDistance}>
                            {court.distance} km away
                          </Text>
                        ) : null}
                      </View>
                      {court.isInternal && court.bookingEnabled ? (
                        <Pressable
                          style={styles.courtsMapCalloutBookBtn}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            navigation.navigate("BookCourt" as never);
                          }}
                        >
                          <Text style={styles.courtsMapCalloutBookBtnText}>
                            Book
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </CalloutLib>
                </MarkerLib>
              ))}
            </MapViewLib>
          </View>
        )}
      </View>
    );
  };

  const renderPlayerCard = (player: NearbyPlayer) => {
    const ballColor = getBallLevelColor(player.ballLevel || "");
    const baseBallLabel = getBallLevelLabel(player.ballLevel || "");
    const ballLabel = player.skillLevel
      ? `${baseBallLabel} ${player.skillLevel}`
      : baseBallLabel;
    const online = isOnlineNow(player.lastOnlineAt);
    const lastSeenText = formatLastSeen(player.lastOnlineAt);

    return (
      <Pressable
        key={player.id}
        style={styles.compactPlayerCard}
        onPress={() =>
          navigation.navigate("PublicProfile", { playerId: player.id })
        }
      >
        <View
          style={[
            styles.compactAvatarRing,
            { borderColor: online ? "#22C55E" : ballColor },
          ]}
        >
          {player.avatarUrl && !brokenAvatars.has(player.id) ? (
            <ExpoImage
              source={{ uri: buildPhotoUrl(player.avatarUrl) ?? undefined }}
              style={styles.compactAvatarImage}
              contentFit="cover"
              onError={() =>
                setBrokenAvatars((prev) => new Set([...prev, player.id]))
              }
            />
          ) : (
            <View
              style={[
                styles.compactAvatarPlaceholder,
                { backgroundColor: ballColor + "30" },
              ]}
            >
              <Text style={[styles.compactAvatarLetter, { color: ballColor }]}>
                {player.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {online || player.openToPlay ? (
            <View
              style={[
                styles.compactOnlineDot,
                online ? styles.compactOnlineDotActive : null,
              ]}
            />
          ) : null}
        </View>

        <View style={styles.compactPlayerInfo}>
          <Text style={styles.compactPlayerName} numberOfLines={1}>
            {player.name}
          </Text>
          <View style={styles.compactBadgeRow}>
            <View
              style={[
                styles.compactLevelBadge,
                { backgroundColor: ballColor + "25" },
              ]}
            >
              <Text style={[styles.compactLevelText, { color: ballColor }]}>
                {ballLabel}
              </Text>
            </View>
            {online ? (
              <View style={styles.compactOnlineBadge}>
                <View style={styles.compactOnlinePulse} />
                <Text style={styles.compactOnlineText}>Online</Text>
              </View>
            ) : (
              <View style={styles.compactLastSeenBadge}>
                <Ionicons
                  name="time-outline"
                  size={10}
                  color={Colors.dark.textSubtle}
                />
                <Text style={styles.compactLastSeenText}>{lastSeenText}</Text>
              </View>
            )}
            {player.hasHomeAddress ? (
              <View style={styles.homeAddressBadge}>
                <Ionicons name="home" size={10} color={Colors.dark.primary} />
              </View>
            ) : null}
          </View>
          {/* Task #1033 — flag + city subtitle so cross-academy / worldwide
              discovery cards still feel local. Falls back to a globe icon when
              we can't resolve the country to a flag emoji. */}
          {player.country || player.city ? (
            <View style={styles.compactLocationRow}>
              {(() => {
                const flag = flagForCountry(player.country);
                if (flag) {
                  return <Text style={styles.compactFlag}>{flag}</Text>;
                }
                return (
                  <Ionicons
                    name="globe-outline"
                    size={11}
                    color={Colors.dark.textSubtle}
                  />
                );
              })()}
              <Text style={styles.compactLocationText} numberOfLines={1}>
                {[player.city, player.country].filter(Boolean).join(", ")}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.compactActions}>
          {(() => {
            const status = player.friendStatus ?? "none";
            const openModal = () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setFriendRequestPlayer(player);
              setFriendRequestSent(false);
              setFriendRequestPushDelivered(null);
              if (status === "pending_sent") {
                setFriendRequestState({ kind: "already_pending_by_me" });
              } else if (status === "pending_received") {
                setFriendRequestState({ kind: "already_sent_by_them" });
              } else if (status === "friends") {
                setFriendRequestState({ kind: "already_friends" });
              } else {
                setFriendRequestState({ kind: "idle" });
              }
            };
            if (status === "friends") {
              return (
                <Pressable
                  style={[
                    styles.compactFriendBtn,
                    styles.compactFriendBtnFriends,
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    openModal();
                  }}
                >
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={Colors.dark.primary}
                  />
                  <Text style={styles.compactFriendStatusText}>Friends</Text>
                </Pressable>
              );
            }
            if (status === "pending_sent") {
              return (
                <Pressable
                  style={[
                    styles.compactFriendBtn,
                    styles.compactFriendBtnPending,
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    openModal();
                  }}
                >
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={Colors.dark.textSecondary}
                  />
                  <Text
                    style={[
                      styles.compactFriendStatusText,
                      { color: Colors.dark.textSecondary },
                    ]}
                  >
                    Invited
                  </Text>
                </Pressable>
              );
            }
            if (status === "pending_received") {
              return (
                <Pressable
                  style={[
                    styles.compactFriendBtn,
                    styles.compactFriendBtnIncoming,
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    openModal();
                  }}
                >
                  <Ionicons
                    name="person-add"
                    size={14}
                    color={Colors.dark.buttonText}
                  />
                  <Text
                    style={[
                      styles.compactFriendStatusText,
                      { color: Colors.dark.buttonText },
                    ]}
                  >
                    Accept
                  </Text>
                </Pressable>
              );
            }
            return (
              <Pressable
                style={styles.compactFriendBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  openModal();
                }}
              >
                <Ionicons
                  name="person-add"
                  size={16}
                  color={Colors.dark.text}
                />
              </Pressable>
            );
          })()}
          <Pressable
            style={styles.compactChallengeBtn}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              navigation.navigate("ChallengePlayer", {
                opponentId: player.id,
                opponentName: player.name,
                opponentBallLevel: player.ballLevel,
                opponentLevel: player.level,
              } as never);
            }}
          >
            <Ionicons name="flash" size={12} color={Colors.dark.buttonText} />
            <Text style={styles.compactChallengeText}>Challenge</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  // Task #1383 — God-query failed (network error / 404 / 500). Without this
  // gate the screen would sit on `sessionsLoading=!playGodData=true` forever
  // and the user would see an indefinite spinner with no recovery affordance.
  // Mirrors the PlayerProgressScreen / ProPlayerHomeScreen recoverable-error
  // pattern. Critical during the "OTA shipped before backend Republish" gap
  // where /api/player/me/play-data 404s on production.
  if (playGodIsError) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={[styles.errorText ?? {}, { marginTop: Spacing.md, color: Colors.dark.text, fontSize: 16, fontWeight: "600" }]}>
          Unable to load Play
        </Text>
        <Text style={{ marginTop: Spacing.xs, color: Colors.dark.textMuted, fontSize: 13 }}>
          Please try again
        </Text>
        <Pressable
          onPress={() => refetchPlayGod()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading Play tab"
          style={{
            marginTop: Spacing.lg,
            paddingHorizontal: Spacing.xl,
            paddingVertical: Spacing.md,
            backgroundColor: Colors.dark.primary,
            borderRadius: BorderRadius.md,
          }}
        >
          <Text style={{ color: Colors.dark.buttonText, fontWeight: "600" }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.animatedHeader,
          { top: insets.top },
          animatedHeaderStyle,
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeaderHeight(h);
          headerHeightSV.value = h;
        }}
      >
        <View style={styles.header}>
          {/* Variant 1 cleanup — show academy name on the left and a search
              shortcut on the right (taps the Players tab to surface the
              existing search bar). */}
          <View style={styles.playHeaderRow}>
            <Text style={styles.playHeaderAcademy} numberOfLines={1}>
              {profileData?.academy?.name || t("player.play.title")}
            </Text>
            <Pressable
              style={styles.playHeaderSearchBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("Players");
              }}
              accessibilityLabel="Search players"
            >
              <Ionicons name="search" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
          {isFamily ? (
            <View style={styles.familySwitchRow}>
              <FamilyQuickSwitch />
              {activePlayerId && familyData ? (
                <Text style={styles.familyViewingText}>
                  Viewing for{" "}
                  {familyData.members.find((m) => m.id === activePlayerId)
                    ?.name || ""}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {activeTab === "Group Lessons" ? (
          <>
            {isMultiSport ? (
              <SportSwitcherChips style={styles.sportChipsRow} />
            ) : null}

            {/* Unified Play Hub — Variant 1 cleanup: calmer cards, only the
                primary "Take a lesson" CTA carries the neon highlight. */}
            <View style={styles.heroRow}>
              <Pressable
                style={[styles.heroCard, styles.heroCardHighlighted]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("LessonBooking");
                }}
              >
                <View
                  style={[styles.heroCardIcon, styles.heroCardIconHighlighted]}
                >
                  <Ionicons
                    name="school"
                    size={18}
                    color={Colors.dark.primary}
                  />
                </View>
                <Text
                  style={[
                    styles.heroCardLabel,
                    styles.heroCardLabelHighlighted,
                  ]}
                  numberOfLines={1}
                >
                  Take a lesson
                </Text>
                {lessonsThisWeekCount > 0 ? (
                  <Text
                    style={[
                      styles.heroCardCount,
                      { color: Colors.dark.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {lessonsThisWeekCount} this week
                  </Text>
                ) : null}
              </Pressable>

              <Pressable
                style={styles.heroCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setPlayModalStep(isMultiSport ? "sport" : "type");
                  setShowPlayModal(true);
                }}
              >
                <View style={styles.heroCardIcon}>
                  <Ionicons name="flame" size={18} color={Colors.dark.text} />
                </View>
                <Text style={styles.heroCardLabel} numberOfLines={1}>
                  Find a Match
                </Text>
              </Pressable>

              <Pressable
                style={styles.heroCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("OpenMatches" as never);
                }}
              >
                <View style={styles.heroCardIcon}>
                  <Ionicons
                    name="tennisball"
                    size={18}
                    color={Colors.dark.text}
                  />
                </View>
                <Text style={styles.heroCardLabel} numberOfLines={1}>
                  Open Matches
                </Text>
                {openMatchesCount > 0 ? (
                  <Text style={styles.heroCardCount} numberOfLines={1}>
                    {openMatchesCount} open
                  </Text>
                ) : null}
              </Pressable>
            </View>

            {/* Play Modal - unified entry point: sport (if multi) then match type */}
            <Modal
              visible={showPlayModal}
              transparent
              animationType="slide"
              onRequestClose={() => {
                setShowPlayModal(false);
                setPlayModalStep(isMultiSport ? "sport" : "type");
              }}
            >
              <Pressable
                style={styles.playModalOverlay}
                onPress={() => {
                  setShowPlayModal(false);
                  setPlayModalStep(isMultiSport ? "sport" : "type");
                }}
              >
                <View style={styles.playModalSheet}>
                  <View style={styles.playModalHandle} />
                  {playModalStep === "sport" ? (
                    <>
                      <Text style={styles.playModalTitle}>Choose a sport</Text>
                      {SPORT_DEFINITIONS.filter((s) =>
                        activeSports.includes(s.key),
                      ).map((sport) => (
                        <Pressable
                          key={sport.key}
                          style={[
                            styles.playModalOption,
                            {
                              borderWidth: 1,
                              borderColor: sport.color + "40",
                              backgroundColor: sport.color + "10",
                              borderRadius: 14,
                            },
                          ]}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            setActiveSport(sport.key);
                            setPlayModalStep("type");
                          }}
                        >
                          <View style={styles.playModalSportRow}>
                            <Ionicons
                              name={
                                getSportIcon(
                                  sport.key,
                                ) as keyof typeof Ionicons.glyphMap
                              }
                              size={22}
                              color={sport.color}
                            />
                            <Text
                              style={[
                                styles.playModalOptionTitle,
                                { color: sport.color },
                              ]}
                            >
                              {sport.label}
                            </Text>
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color={sport.color}
                            />
                          </View>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <>
                      <Text style={styles.playModalTitle}>
                        {isMultiSport
                          ? `${getSportLabel(activeSport)} — What are you looking for?`
                          : "What are you looking for?"}
                      </Text>
                      {isMultiSport ? (
                        <Pressable
                          style={styles.playModalBackRow}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            setPlayModalStep("sport");
                          }}
                        >
                          <Ionicons
                            name="chevron-back"
                            size={14}
                            color={Colors.dark.textMuted}
                          />
                          <Text style={styles.playModalBackText}>
                            Change sport
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={styles.playModalOption}
                        onPress={() => {
                          setShowPlayModal(false);
                          setPlayModalStep(isMultiSport ? "sport" : "type");
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Medium,
                          );
                          // Task #1271 — Find a Match now opens the
                          // players-first Match Finder home; the legacy
                          // wizard is reachable from its footer.
                          navigation.navigate("MatchFinderHome" as never);
                        }}
                      >
                        <LinearGradient
                          colors={[
                            Colors.dark.primary,
                            Colors.dark.primaryGlow,
                          ]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.playModalOptionGradient}
                        >
                          <Ionicons
                            name="flame"
                            size={22}
                            color={Colors.dark.buttonText}
                          />
                          <View style={styles.playModalOptionText}>
                            <Text style={styles.playModalOptionTitle}>
                              {t("player.play.challengePlayer")}
                            </Text>
                            <Text style={styles.playModalOptionDesc}>
                              {t("player.play.challengePlayerDesc")}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={Colors.dark.buttonText}
                          />
                        </LinearGradient>
                      </Pressable>
                      {/* Task #1362 — "Post an open match" is now a first-class
                          option alongside "Challenge a player" and "Find a
                          game". Deep-links into CreateMatch with the partner
                          step pre-set to "Leave open for anyone". */}
                      <Pressable
                        style={styles.playModalOption}
                        onPress={() => {
                          setShowPlayModal(false);
                          setPlayModalStep(isMultiSport ? "sport" : "type");
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Medium,
                          );
                          navigation.navigate(
                            "CreateMatch" as never,
                            { presetPartnerOption: "find" } as never,
                          );
                        }}
                      >
                        <LinearGradient
                          colors={["#22C55E", "#15803D"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.playModalOptionGradient}
                        >
                          <Ionicons
                            name="megaphone"
                            size={22}
                            color={Colors.dark.buttonText}
                          />
                          <View style={styles.playModalOptionText}>
                            <Text style={styles.playModalOptionTitle}>
                              {t("player.play.postOpenMatch")}
                            </Text>
                            <Text style={styles.playModalOptionDesc}>
                              {t("player.play.postOpenMatchDesc")}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={Colors.dark.buttonText}
                          />
                        </LinearGradient>
                      </Pressable>
                      <Pressable
                        style={styles.playModalOption}
                        onPress={() => {
                          setShowPlayModal(false);
                          setPlayModalStep(isMultiSport ? "sport" : "type");
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Medium,
                          );
                          navigation.navigate("FindGame" as never);
                        }}
                      >
                        <LinearGradient
                          colors={["#00E5FF", "#00A3D9"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.playModalOptionGradient}
                        >
                          <Ionicons
                            name="people-circle-outline"
                            size={22}
                            color={Colors.dark.buttonText}
                          />
                          <View style={styles.playModalOptionText}>
                            <Text style={styles.playModalOptionTitle}>
                              Find a Game
                            </Text>
                            <Text style={styles.playModalOptionDesc}>
                              Join a group session or social game
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={Colors.dark.buttonText}
                          />
                        </LinearGradient>
                      </Pressable>
                    </>
                  )}
                </View>
              </Pressable>
            </Modal>

            {/* Variant 1 cleanup: secondary chips collapsed into a compact
                icon-row (Invites · My Games · Prefs). Reuses existing nav
                handlers; no functional changes. */}
            <View style={styles.compactChipsRow}>
              <Pressable
                style={[
                  styles.compactChip,
                  pendingInvitesCount > 0 && styles.compactChipActive,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("BookingInvites" as never);
                }}
              >
                <Ionicons
                  name="mail"
                  size={12}
                  color={
                    pendingInvitesCount > 0
                      ? Colors.dark.primary
                      : Colors.dark.textMuted
                  }
                />
                <Text
                  style={[
                    styles.compactChipText,
                    pendingInvitesCount > 0 && { color: Colors.dark.primary },
                  ]}
                >
                  {t("player.play.invites")}
                </Text>
                {pendingInvitesCount > 0 ? (
                  <View style={styles.compactChipBadge}>
                    <Text style={styles.compactChipBadgeText}>
                      {pendingInvitesCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                style={styles.compactChip}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("MyGames" as never);
                }}
              >
                <Ionicons
                  name="people"
                  size={12}
                  color={Colors.dark.textMuted}
                />
                <Text style={styles.compactChipText}>My Games</Text>
              </Pressable>

              <Pressable
                style={styles.compactChip}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("BookingPreferences" as never);
                }}
              >
                <Ionicons
                  name="options"
                  size={12}
                  color={Colors.dark.textMuted}
                />
                <Text style={styles.compactChipText}>Prefs</Text>
              </Pressable>

              <View style={{ flex: 1 }} />

              <Pressable
                style={styles.compactChip}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("PlayerHelp" as never);
                }}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={12}
                  color={Colors.dark.textMuted}
                />
                <Text style={styles.compactChipText}>More</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </Animated.View>

      <Animated.View style={[styles.mainContent, animatedMainContentStyle]}>
        <View style={styles.tabs}>
          {TAB_OPTIONS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab === "Group Lessons"
                  ? t("player.play.groupLessons")
                  : tab === "Players"
                    ? t("player.play.players")
                    : "Leaderboard"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Animated.ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: insets.bottom + 200 },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {locationPermission !== null &&
          !locationPermission.granted &&
          locationPermission.status === "denied" &&
          !locationPermission.canAskAgain &&
          Platform.OS === "ios" ? (
            <Pressable
              style={styles.topLocationBanner}
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch {}
              }}
            >
              <Ionicons
                name="location-outline"
                size={16}
                color={Colors.dark.primary}
              />
              <Text style={styles.topLocationBannerText}>
                Allow location to see courts nearby and find players close to
                you
              </Text>
              <Text style={styles.topLocationBannerAction}>Open Settings</Text>
            </Pressable>
          ) : null}

          {/* Variant 1 cleanup: shared Filter pill + bottom-sheet drives both
            Group Lessons (level / day / scope) and Players (level / scope).
            Defaults are hidden from the inline summary so chrome stays calm. */}
          {activeTab === "Group Lessons" || activeTab === "Players"
            ? (() => {
                const summary: {
                  key: string;
                  label: string;
                  color?: string;
                }[] = [];
                if (activeTab === "Group Lessons") {
                  if (selectedBallLevel !== "my_level") {
                    if (selectedBallLevel === "all") {
                      summary.push({
                        key: "lvl",
                        label: t("player.play.allLevels"),
                      });
                    } else {
                      summary.push({
                        key: "lvl",
                        label:
                          selectedBallLevel.charAt(0).toUpperCase() +
                          selectedBallLevel.slice(1),
                        color: getBallLevelColor(selectedBallLevel),
                      });
                    }
                  }
                  if (selectedDay !== "all") {
                    const preset = DAY_PRESETS.find(
                      (p) => p.id === selectedDay,
                    );
                    if (preset)
                      summary.push({ key: "day", label: preset.label });
                  }
                } else {
                  if (selectedPlayerLevel !== "all") {
                    summary.push({
                      key: "plvl",
                      label:
                        selectedPlayerLevel.charAt(0).toUpperCase() +
                        selectedPlayerLevel.slice(1),
                      color: getBallLevelColor(selectedPlayerLevel),
                    });
                  }
                }
                // Task #1033 — show scope chip in summary for all users.
                if (effectiveScope === "country") {
                  summary.push({ key: "scope", label: "My country" });
                } else if (effectiveScope === "all") {
                  summary.push({ key: "scope", label: "Worldwide" });
                }
                const openSheet = () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowFilterSheet(true);
                };
                return (
                  <View style={styles.filterPillRow}>
                    <Pressable style={styles.filterPillBtn} onPress={openSheet}>
                      <Ionicons
                        name="options-outline"
                        size={12}
                        color={Colors.dark.primary}
                      />
                      <Text style={styles.filterPillBtnText}>Filter</Text>
                      <Ionicons
                        name="chevron-down"
                        size={11}
                        color={Colors.dark.primary}
                      />
                    </Pressable>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.filterSummaryContent}
                      style={styles.filterSummaryScroll}
                    >
                      {summary.map((s) => (
                        <Pressable
                          key={s.key}
                          onPress={openSheet}
                          style={styles.filterSummaryChip}
                        >
                          {s.color ? (
                            <View
                              style={[
                                styles.filterSummaryDot,
                                { backgroundColor: s.color },
                              ]}
                            />
                          ) : null}
                          <Text style={styles.filterSummaryChipText}>
                            {s.label}
                          </Text>
                        </Pressable>
                      ))}
                      {summary.length > 0 ? (
                        <Text style={styles.filterSummaryActiveCount}>
                          · {summary.length} active
                        </Text>
                      ) : null}
                    </ScrollView>
                  </View>
                );
              })()
            : null}

          {/* Shared Filter bottom-sheet — content adapts to active tab */}
          {showFilterSheet ? (
            <SwipeableBottomSheet
              visible={showFilterSheet}
              onClose={() => setShowFilterSheet(false)}
              bottomInset={insets.bottom + Spacing.lg}
            >
              <View style={{ paddingHorizontal: Spacing.lg }}>
                <Text style={styles.playModalTitle}>
                  {activeTab === "Players"
                    ? "Filter players"
                    : "Filter sessions"}
                </Text>

                {activeTab === "Group Lessons" ? (
                  <>
                    <Text style={styles.filterSheetGroupLabel}>Ball level</Text>
                    <View style={styles.filterSheetWrap}>
                      {(
                        [
                          "my_level",
                          "all",
                          "blue",
                          "red",
                          "orange",
                          "green",
                          "yellow",
                          "glow",
                        ] as const
                      ).map((level) => {
                        const isSelected = selectedBallLevel === level;
                        const color =
                          level === "my_level"
                            ? getBallLevelColor(playerBallLevel)
                            : level === "all"
                              ? Colors.dark.textMuted
                              : getBallLevelColor(level);
                        const label =
                          level === "my_level"
                            ? `My Level${playerBallLevel !== "glow" ? ` (${playerBallLevel.charAt(0).toUpperCase() + playerBallLevel.slice(1)})` : ""}`
                            : level === "all"
                              ? t("player.play.allLevels")
                              : level.charAt(0).toUpperCase() + level.slice(1);
                        return (
                          <Pressable
                            key={level}
                            style={[
                              styles.filterChip,
                              isSelected && {
                                backgroundColor: color + "30",
                                borderColor: color,
                              },
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light,
                              );
                              setSelectedBallLevel(level);
                              setShowOtherLevels(level !== "my_level");
                            }}
                          >
                            <View
                              style={[
                                styles.filterDot,
                                { backgroundColor: color },
                              ]}
                            />
                            <Text
                              style={[
                                styles.filterChipText,
                                isSelected && { color },
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={styles.filterSheetGroupLabel}>Day</Text>
                    <View style={styles.filterSheetWrap}>
                      {DAY_PRESETS.map((preset) => {
                        const isSelected = selectedDay === preset.id;
                        return (
                          <Pressable
                            key={preset.id}
                            style={[
                              styles.dayChip,
                              isSelected && styles.dayChipSelected,
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light,
                              );
                              setSelectedDay(preset.id);
                            }}
                          >
                            <Text
                              style={[
                                styles.dayChipText,
                                isSelected && styles.dayChipTextSelected,
                              ]}
                            >
                              {preset.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.filterSheetGroupLabel}>
                      Player level
                    </Text>
                    <View style={styles.filterSheetWrap}>
                      {(
                        [
                          "all",
                          "blue",
                          "red",
                          "orange",
                          "green",
                          "yellow",
                          "glow",
                        ] as const
                      ).map((level) => {
                        const isSelected = selectedPlayerLevel === level;
                        const color =
                          level === "all"
                            ? Colors.dark.textMuted
                            : getBallLevelColor(level);
                        const label =
                          level === "all" ? "ALL" : level.toUpperCase();
                        return (
                          <Pressable
                            key={level}
                            style={[
                              styles.filterChip,
                              isSelected && {
                                backgroundColor: color + "30",
                                borderColor: color,
                              },
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light,
                              );
                              setSelectedPlayerLevel(level);
                            }}
                          >
                            <View
                              style={[
                                styles.filterDot,
                                { backgroundColor: color },
                              ]}
                            />
                            <Text
                              style={[
                                styles.filterChipText,
                                isSelected && { color },
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {(() => {
                  // Task #1033 — chips always visible. Free players (no
                  // academy) see only My Country / Worldwide.
                  const scopeOptions = playerAcademyId
                    ? [
                        { id: "mine" as const, label: "My Academy" },
                        { id: "country" as const, label: "My Country" },
                        { id: "all" as const, label: "Worldwide" },
                      ]
                    : [
                        { id: "country" as const, label: "My Country" },
                        { id: "all" as const, label: "Worldwide" },
                      ];
                  return (
                    <>
                      <Text style={styles.filterSheetGroupLabel}>Scope</Text>
                      <View style={styles.filterSheetWrap}>
                        {scopeOptions.map((s) => {
                          const isSelected = scope === s.id;
                          return (
                            <Pressable
                              key={s.id}
                              style={[
                                styles.filterChip,
                                isSelected && {
                                  backgroundColor: Colors.dark.primary + "30",
                                  borderColor: Colors.dark.primary,
                                },
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(
                                  Haptics.ImpactFeedbackStyle.Light,
                                );
                                handleScopeChange(s.id);
                              }}
                            >
                              <Text
                                style={[
                                  styles.filterChipText,
                                  isSelected && { color: Colors.dark.primary },
                                ]}
                              >
                                {s.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  );
                })()}

                <View style={styles.filterSheetFooter}>
                  <Pressable
                    style={styles.filterSheetResetBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (activeTab === "Group Lessons") {
                        setSelectedBallLevel("my_level");
                        setShowOtherLevels(false);
                        setSelectedDay("all");
                      } else {
                        setSelectedPlayerLevel("all");
                      }
                      // Task #1033 — reset returns to country (open by default).
                      handleScopeChange("country");
                    }}
                  >
                    <Text style={styles.filterSheetResetText}>Reset</Text>
                  </Pressable>
                  <Pressable
                    style={styles.filterSheetApplyBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowFilterSheet(false);
                    }}
                  >
                    <Text style={styles.filterSheetApplyText}>Done</Text>
                  </Pressable>
                </View>
              </View>
            </SwipeableBottomSheet>
          ) : null}

          {activeTab === "Group Lessons" ? (
            <>
              {sessionsLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.dark.primary} />
                  <Text style={styles.loadingText}>
                    {t("player.play.findingGroupLessons")}
                  </Text>
                </View>
              ) : filteredSessions.length > 0 ? (
                (() => {
                  if (effectiveScope === "all" && playerAcademyId) {
                    const mySessions = filteredSessions.filter(
                      (s) =>
                        s.sessionAcademyId === playerAcademyId ||
                        !s.sessionAcademyId,
                    );
                    const otherSessions = filteredSessions.filter(
                      (s) =>
                        s.sessionAcademyId &&
                        s.sessionAcademyId !== playerAcademyId,
                    );
                    return (
                      <>
                        {mySessions.length > 0 ? (
                          <>
                            <View style={styles.sectionDivider}>
                              <View style={styles.sectionDividerLine} />
                              <Text style={styles.sectionDividerText}>
                                YOUR ACADEMY
                              </Text>
                              <View style={styles.sectionDividerLine} />
                            </View>
                            {mySessions.map(renderSessionCard)}
                          </>
                        ) : null}
                        {otherSessions.length > 0 ? (
                          <>
                            <View style={styles.sectionDivider}>
                              <View style={styles.sectionDividerLine} />
                              <Text style={styles.sectionDividerText}>
                                DISCOVER NEARBY
                              </Text>
                              <View style={styles.sectionDividerLine} />
                            </View>
                            {otherSessions.map(renderSessionCard)}
                          </>
                        ) : null}
                      </>
                    );
                  }
                  return <>{filteredSessions.map(renderSessionCard)}</>;
                })()
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="calendar-outline"
                    size={48}
                    color={Colors.dark.textMuted}
                  />
                  <Text style={styles.emptyTitle}>
                    No public lessons near you yet
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    Check back soon — coaches in your area are adding public
                    group lessons
                  </Text>
                  {!playerAcademyId ? (
                    <Pressable
                      onPress={() => navigation.navigate("AcademyBrowser")}
                      style={styles.findAcademyLink}
                    >
                      <Text style={styles.findAcademyLinkText}>
                        Find an Academy
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={Colors.dark.primary}
                      />
                    </Pressable>
                  ) : null}
                </View>
              )}
              {/* Task #1070 — Tournaments row uses the same scope chip as
                  the rest of the Group Lessons tab for parity. */}
              <TournamentsDiscoveryRow scope={effectiveScope} />
              {renderCourtsNearYou()}
            </>
          ) : activeTab === "Players" ? (
            <>
              {/* Task #1070 — discovery rows that make Play feel alive even
                  when local pickings are slim. */}
              <RecentlyActiveWorldwideRow sport={activeSport} />
              <PlayersYouMightKnowRow sport={activeSport} />

              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons
                    name="people"
                    size={20}
                    color={Colors.dark.textMuted}
                  />
                  <Text style={styles.sectionTitle}>
                    {t("player.play.playersNearby")}
                  </Text>
                  {nearbyPlayers && nearbyPlayers.length > 0 ? (
                    <Text style={styles.playerCount}>
                      ({nearbyPlayers.length})
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Variant 1 cleanup: Players-tab scope toggle now lives in the
                shared Filter sheet above. */}

              {/* Discovery Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.discoverFilterRow}
                contentContainerStyle={styles.discoverFilterContent}
              >
                {[
                  {
                    id: "all",
                    label: t("player.play.allFilter"),
                    icon: "people",
                  },
                  {
                    id: "recommended",
                    label: t("player.play.recommended"),
                    icon: "star",
                  },
                  {
                    id: "sameLevel",
                    label: t("player.play.sameLevel"),
                    icon: "bar-chart",
                  },
                  {
                    id: "openToPlay",
                    label: t("player.play.openToPlayFilter"),
                    icon: "tennisball",
                  },
                ].map((filter) => {
                  const isSelected = discoverFilter === filter.id;
                  return (
                    <Pressable
                      key={filter.id}
                      style={[
                        styles.discoverChip,
                        isSelected && styles.discoverChipActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setDiscoverFilter(filter.id as DiscoverFilter);
                      }}
                    >
                      <Ionicons
                        name={filter.icon as any}
                        size={12}
                        color={
                          isSelected
                            ? Colors.dark.backgroundRoot
                            : Colors.dark.primary
                        }
                      />
                      <Text
                        style={[
                          styles.discoverChipText,
                          isSelected && styles.discoverChipTextActive,
                        ]}
                      >
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Search Bar */}
              <View style={styles.playerSearchContainer}>
                <Ionicons
                  name="search"
                  size={18}
                  color={Colors.dark.textMuted}
                />
                <TextInput
                  style={styles.playerSearchInput}
                  placeholder={t("player.play.searchPlayers")}
                  placeholderTextColor={Colors.dark.textMuted}
                  value={playerSearchQuery}
                  onChangeText={setPlayerSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {playerSearchQuery.length > 0 ? (
                  <Pressable onPress={() => setPlayerSearchQuery("")}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={Colors.dark.textMuted}
                    />
                  </Pressable>
                ) : null}
              </View>

              {/* Variant 1 cleanup: ball-level filter now lives in the shared
                Filter sheet above. */}

              {locationPermission && !locationPermission.granted && (
                <Pressable
                  style={styles.locationPermissionBanner}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const result = await requestLocationPermission();
                    if (result.granted) {
                      // Reset geocoded flag so the useEffect can run after permission is granted
                      geocodedRef.current = false;
                    }
                  }}
                >
                  <Ionicons
                    name="location"
                    size={16}
                    color={Colors.dark.primary}
                  />
                  <Text style={styles.locationPermissionText}>
                    Enable location to find players near you
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={Colors.dark.primary}
                  />
                </Pressable>
              )}
              {playersLoading ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : filteredPlayers.length > 0 ? (
                <View style={styles.playersGrid}>
                  {filteredPlayers.map(renderPlayerCard)}
                </View>
              ) : nearbyPlayers &&
                nearbyPlayers.length > 0 &&
                playerSearchQuery ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="search-outline"
                    size={48}
                    color={Colors.dark.textMuted}
                  />
                  <Text style={styles.emptyTitle}>
                    {t("player.play.noResults")}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {t("player.play.noPlayersMatch", {
                      query: playerSearchQuery,
                    })}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="people-outline"
                    size={48}
                    color={Colors.dark.textMuted}
                  />
                  <Text style={styles.emptyTitle}>No players found</Text>
                  <Text style={styles.emptySubtitle}>
                    Players who are open to playing appear here
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Leaderboard Tab */}
              <View style={styles.leaderboardFilterRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.leaderboardFilterScroll}
                >
                  {["all", "tennis", "padel", "pickleball"].map((sport) => (
                    <Pressable
                      key={sport}
                      style={[
                        styles.leaderboardChip,
                        leaderboardSport === sport &&
                          styles.leaderboardChipActive,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setLeaderboardSport(sport);
                      }}
                    >
                      <Text
                        style={[
                          styles.leaderboardChipText,
                          leaderboardSport === sport &&
                            styles.leaderboardChipTextActive,
                        ]}
                      >
                        {sport === "all"
                          ? "All Sports"
                          : sport.charAt(0).toUpperCase() + sport.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {leaderboardData &&
              leaderboardData.availableCities &&
              leaderboardData.availableCities.length > 0 ? (
                <View style={styles.leaderboardFilterRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.leaderboardFilterScroll}
                  >
                    {["all", ...leaderboardData.availableCities].map((city) => (
                      <Pressable
                        key={city}
                        style={[
                          styles.leaderboardChip,
                          leaderboardCity === city &&
                            styles.leaderboardChipActive,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setLeaderboardCity(city);
                        }}
                      >
                        <Text
                          style={[
                            styles.leaderboardChipText,
                            leaderboardCity === city &&
                              styles.leaderboardChipTextActive,
                          ]}
                        >
                          {city === "all" ? "All City/Country" : city}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {leaderboardLoading ? (
                <ActivityIndicator
                  size="small"
                  color={Colors.dark.primary}
                  style={{ marginTop: Spacing.xl }}
                />
              ) : leaderboardData && leaderboardData.rankings.length > 0 ? (
                <>
                  {leaderboardData.rankings.map((player) => {
                    const rankNum = player.rank;
                    const isTop3 = rankNum <= 3;
                    const rankMedal =
                      rankNum === 1
                        ? "#FFD700"
                        : rankNum === 2
                          ? "#C0C0C0"
                          : rankNum === 3
                            ? "#CD7F32"
                            : null;
                    const GLOW_RANK_NAMES: Record<number, string> = {
                      1: "Glow 1",
                      2: "Glow 2",
                      3: "Glow 3",
                      4: "Glow 4",
                      5: "Glow 5",
                      6: "Glow 6",
                      7: "Glow 7",
                      8: "Glow 8",
                      9: "Blue",
                    };
                    const glowRankLabel =
                      player.glowRank != null
                        ? GLOW_RANK_NAMES[player.glowRank] ||
                          `Glow ${player.glowRank}`
                        : null;
                    const avatarLetter = player.name
                      ? player.name.charAt(0).toUpperCase()
                      : "?";
                    const ballColor = getBallLevelColor(player.ballLevel || "");
                    return (
                      <Pressable
                        key={player.id}
                        style={[
                          styles.leaderboardRow,
                          player.isCurrentPlayer &&
                            styles.leaderboardRowHighlight,
                        ]}
                        onPress={() =>
                          navigation.navigate(
                            "PublicProfile" as never,
                            { playerId: player.id } as never,
                          )
                        }
                      >
                        <View style={styles.leaderboardRankCol}>
                          {isTop3 ? (
                            <Text
                              style={[
                                styles.leaderboardRankText,
                                { color: rankMedal! },
                              ]}
                            >
                              #{rankNum}
                            </Text>
                          ) : (
                            <Text style={styles.leaderboardRankText}>
                              #{rankNum}
                            </Text>
                          )}
                        </View>
                        <View
                          style={[
                            styles.leaderboardAvatar,
                            { borderColor: ballColor },
                          ]}
                        >
                          {player.photoUrl ? (
                            <ExpoImage
                              source={{
                                uri:
                                  buildPhotoUrl(player.photoUrl) ?? undefined,
                              }}
                              style={styles.leaderboardAvatarImg}
                              contentFit="cover"
                            />
                          ) : (
                            <View
                              style={[
                                styles.leaderboardAvatarPlaceholder,
                                { backgroundColor: ballColor + "30" },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.leaderboardAvatarLetter,
                                  { color: ballColor },
                                ]}
                              >
                                {avatarLetter}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.leaderboardPlayerInfo}>
                          <Text
                            style={styles.leaderboardPlayerName}
                            numberOfLines={1}
                          >
                            {player.name}
                            {player.isCurrentPlayer ? " (You)" : ""}
                          </Text>
                          {glowRankLabel ? (
                            <Text
                              style={[
                                styles.leaderboardGlowRank,
                                { color: ballColor },
                              ]}
                            >
                              {glowRankLabel}
                            </Text>
                          ) : null}
                          {player.academyName ? (
                            <Text
                              style={styles.leaderboardAcademy}
                              numberOfLines={1}
                            >
                              {player.academyName}
                              {player.city ? ` · ${player.city}` : ""}
                            </Text>
                          ) : player.city ? (
                            <Text style={styles.leaderboardAcademy}>
                              {player.city}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.leaderboardMmr,
                            player.isCurrentPlayer && {
                              color: Colors.dark.primary,
                            },
                          ]}
                        >
                          {player.glowMmr.toLocaleString()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="trophy-outline"
                    size={48}
                    color={Colors.dark.textMuted}
                  />
                  <Text style={styles.emptyTitle}>No ranked players yet</Text>
                  <Text style={styles.emptySubtitle}>
                    No ranked players found in this region yet. Play matches to
                    earn your Glow Rank.
                  </Text>
                </View>
              )}
            </>
          )}
        </Animated.ScrollView>
      </Animated.View>

      {/* Session Info Modal with static map */}
      <Modal
        visible={!!selectedSession}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSession(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedSession(null)}
        >
          <View style={styles.sessionInfoModal}>
            {selectedSession ? (
              <>
                <View style={styles.sessionInfoHeader}>
                  <Text style={styles.sessionInfoTitle}>
                    {getCleanSessionTitle(selectedSession)}
                  </Text>
                  <Pressable
                    onPress={() => setSelectedSession(null)}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close"
                      size={22}
                      color={Colors.dark.textMuted}
                    />
                  </Pressable>
                </View>

                {/* Ball level + XP badges row */}
                <View style={styles.sessionInfoBadgesRow}>
                  {selectedSession.ballLevel &&
                  getBallLevelLabel(selectedSession.ballLevel) ? (
                    <View
                      style={[
                        styles.sessionInfoLevelBadge,
                        {
                          backgroundColor:
                            getBallLevelColor(selectedSession.ballLevel) + "30",
                          borderColor:
                            getBallLevelColor(selectedSession.ballLevel) + "80",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sessionInfoLevelBadgeText,
                          {
                            color: getBallLevelColor(selectedSession.ballLevel),
                          },
                        ]}
                      >
                        {getBallLevelLabel(selectedSession.ballLevel)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.sessionInfoXpBadge}>
                    <Ionicons
                      name="flame"
                      size={13}
                      color={Colors.dark.orange}
                    />
                    <Text style={styles.sessionInfoXpText}>
                      +{selectedSession.xpReward} XP
                    </Text>
                  </View>
                </View>

                {/* Capacity */}
                <View style={styles.sessionInfoCapacityRow}>
                  <Ionicons
                    name="people-outline"
                    size={15}
                    color={Colors.dark.textSecondary}
                  />
                  <Text style={styles.sessionInfoCapacityText}>
                    {selectedSession.enrolledCount ??
                      selectedSession.currentPlayers}{" "}
                    enrolled / {selectedSession.maxPlayers} max
                  </Text>
                </View>

                {/* Enrolled players avatar stack */}
                {selectedSession.players.length > 0 ? (
                  <View style={styles.sessionInfoPlayersRow}>
                    <View style={styles.epicAvatarStack}>
                      {selectedSession.players
                        .slice(0, 6)
                        .map((player, index) => (
                          <View
                            key={player.id}
                            style={[
                              styles.epicAvatarCircle,
                              {
                                marginLeft: index > 0 ? -16 : 0,
                                zIndex: 6 - index,
                              },
                            ]}
                          >
                            {player.avatarUrl ? (
                              <ExpoImage
                                source={{
                                  uri: buildPhotoUrl(player.avatarUrl)!,
                                }}
                                style={styles.epicAvatarImage}
                                contentFit="cover"
                              />
                            ) : (
                              <LinearGradient
                                colors={[
                                  Colors.dark.backgroundSecondary,
                                  Colors.dark.backgroundTertiary,
                                ]}
                                style={styles.epicAvatarPlaceholder}
                              >
                                <Text style={styles.epicAvatarInitial}>
                                  {player.name.charAt(0).toUpperCase()}
                                </Text>
                              </LinearGradient>
                            )}
                          </View>
                        ))}
                    </View>
                    <Text style={styles.sessionInfoPlayerNames}>
                      {selectedSession.players
                        .slice(0, 3)
                        .map((p) => p.name.split(" ")[0])
                        .join(", ")}
                      {selectedSession.players.length > 3
                        ? ` +${selectedSession.players.length - 3}`
                        : ""}
                    </Text>
                  </View>
                ) : null}

                {/* Waitlist position (if player is on waitlist) */}
                {selectedSession.isOnWaitlist &&
                selectedSession.waitlistPosition != null ? (
                  <View style={styles.sessionInfoWaitlistRow}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.sessionInfoWaitlistText}>
                      #{selectedSession.waitlistPosition} on waitlist
                    </Text>
                  </View>
                ) : null}

                {/* Venue photo from Google Place (proxy, no key exposure) */}
                {sessionPlaceDetails?.photoRef ? (
                  <ExpoImage
                    source={{
                      uri: `${apiUrl}/api/maps/place-photo?ref=${encodeURIComponent(sessionPlaceDetails.photoRef)}&maxwidth=800`,
                    }}
                    style={styles.sessionInfoVenuePhoto}
                    contentFit="cover"
                  />
                ) : null}
                <View style={styles.sessionInfoLocationRow}>
                  <Text style={styles.sessionInfoLocation}>
                    <Ionicons
                      name="location"
                      size={13}
                      color={Colors.dark.primary}
                    />{" "}
                    {selectedSession.locationName}
                    {selectedSession.courtName
                      ? ` · ${selectedSession.courtName}`
                      : ""}
                  </Text>
                  {sessionPlaceDetails?.rating ? (
                    <View style={styles.sessionInfoRatingBadge}>
                      <Ionicons name="star" size={11} color="#FFD700" />
                      <Text style={styles.sessionInfoRatingText}>
                        {sessionPlaceDetails.rating.toFixed(1)}
                        {sessionPlaceDetails.reviewCount
                          ? ` (${sessionPlaceDetails.reviewCount > 999 ? "1k+" : sessionPlaceDetails.reviewCount})`
                          : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sessionInfoTime}>
                  <Ionicons
                    name="time-outline"
                    size={13}
                    color={Colors.dark.textMuted}
                  />{" "}
                  {formatTime(selectedSession.startTime)}
                </Text>
                {selectedSession.coachName ? (
                  <Text style={styles.sessionInfoCoach}>
                    <Ionicons
                      name="person"
                      size={13}
                      color={Colors.dark.primary}
                    />{" "}
                    Coach {selectedSession.coachName}
                  </Text>
                ) : null}
                {selectedSession.locationLat != null &&
                selectedSession.locationLng != null ? (
                  <Pressable
                    style={styles.sessionInfoMapWrapper}
                    onPress={() => {
                      openMapsDirections({
                        lat: selectedSession.locationLat,
                        lng: selectedSession.locationLng,
                        label: selectedSession.locationName,
                      });
                    }}
                  >
                    <ExpoImage
                      source={{
                        uri: `${apiUrl}/api/maps/static-map?lat=${selectedSession.locationLat}&lng=${selectedSession.locationLng}&size=600x140`,
                      }}
                      style={styles.sessionInfoMap}
                      contentFit="cover"
                    />
                    <View style={styles.sessionInfoMapBadge}>
                      <Ionicons
                        name="navigate"
                        size={12}
                        color={TextColors.primary}
                      />
                      <Text style={styles.sessionInfoMapBadgeText}>
                        Open in Maps
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.sessionInfoClose}
                  onPress={() => setSelectedSession(null)}
                >
                  <Text style={styles.sessionInfoCloseText}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!friendRequestPlayer}
        transparent
        animationType="fade"
        onRequestClose={() => setFriendRequestPlayer(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setFriendRequestPlayer(null)}
        >
          <View style={styles.friendRequestModal}>
            {friendRequestPlayer ? (
              <>
                <View
                  style={[
                    styles.friendModalAvatarRing,
                    {
                      borderColor: getBallLevelColor(
                        friendRequestPlayer.ballLevel || "",
                      ),
                    },
                  ]}
                >
                  {friendRequestPlayer.avatarUrl ? (
                    <ExpoImage
                      source={{
                        uri: buildPhotoUrl(friendRequestPlayer.avatarUrl)!,
                      }}
                      style={styles.friendModalAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={[
                        styles.friendModalAvatarPlaceholder,
                        {
                          backgroundColor:
                            getBallLevelColor(
                              friendRequestPlayer.ballLevel || "",
                            ) + "30",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.friendModalAvatarLetter,
                          {
                            color: getBallLevelColor(
                              friendRequestPlayer.ballLevel || "",
                            ),
                          },
                        ]}
                      >
                        {friendRequestPlayer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.friendModalTitle}>
                  {friendRequestSent
                    ? "Request Sent!"
                    : friendRequestState.kind === "already_pending_by_me"
                      ? "Request already sent"
                      : friendRequestState.kind === "already_sent_by_them"
                        ? "They sent you one"
                        : friendRequestState.kind === "already_friends"
                          ? "You're already friends"
                          : "Send Friend Request"}
                </Text>
                <Text style={styles.friendModalName}>
                  {friendRequestPlayer.name}
                </Text>

                {friendRequestPlayer.ballLevel ? (
                  <View
                    style={[
                      styles.friendModalLevelBadge,
                      {
                        backgroundColor:
                          getBallLevelColor(friendRequestPlayer.ballLevel) +
                          "25",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.friendModalLevelText,
                        {
                          color: getBallLevelColor(
                            friendRequestPlayer.ballLevel,
                          ),
                        },
                      ]}
                    >
                      {getBallLevelLabel(friendRequestPlayer.ballLevel)}
                    </Text>
                  </View>
                ) : null}

                {friendRequestSent ? (
                  <View style={styles.friendModalSentContainer}>
                    <Ionicons
                      name="checkmark-circle"
                      size={48}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.friendModalSentText}>
                      Friend request sent successfully
                    </Text>
                    {friendRequestPushDelivered === true ? (
                      <Text style={styles.friendModalDeliveryHint}>
                        {friendRequestPlayer.name} just got a notification on
                        their phone.
                      </Text>
                    ) : friendRequestPushDelivered === false ? (
                      <Text style={styles.friendModalDeliveryHint}>
                        We&apos;ll show it to {friendRequestPlayer.name} the next
                        time they open the app.
                      </Text>
                    ) : null}
                    <Pressable
                      style={styles.friendModalDoneBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalDoneBtnText}>Done</Text>
                    </Pressable>
                  </View>
                ) : friendRequestState.kind === "already_pending_by_me" ? (
                  <View style={styles.friendModalSentContainer}>
                    <Ionicons
                      name="time-outline"
                      size={48}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.friendModalSentText}>
                      Waiting for {friendRequestPlayer.name} to respond.
                    </Text>
                    <Pressable
                      style={styles.friendModalDoneBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalDoneBtnText}>Close</Text>
                    </Pressable>
                  </View>
                ) : friendRequestState.kind === "already_sent_by_them" ? (
                  <View style={styles.friendModalSentContainer}>
                    <Ionicons
                      name="mail-unread-outline"
                      size={48}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.friendModalSentText}>
                      {friendRequestPlayer.name} already sent you a request —
                      open Connections to accept.
                    </Text>
                    <Pressable
                      style={styles.friendModalDoneBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalDoneBtnText}>Close</Text>
                    </Pressable>
                  </View>
                ) : friendRequestState.kind === "already_friends" ? (
                  <View style={styles.friendModalSentContainer}>
                    <Ionicons
                      name="people"
                      size={48}
                      color={Colors.dark.primary}
                    />
                    <Text style={styles.friendModalSentText}>
                      You&apos;re already friends with {friendRequestPlayer.name}.
                    </Text>
                    <Pressable
                      style={styles.friendModalDoneBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalDoneBtnText}>Close</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    {friendRequestState.kind === "error" ? (
                      <View style={styles.friendModalErrorBanner}>
                        <Ionicons
                          name="alert-circle"
                          size={16}
                          color={Colors.dark.error}
                        />
                        <Text style={styles.friendModalErrorText}>
                          {friendRequestState.message}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.friendModalButtons}>
                      <Pressable
                        style={styles.friendModalCancelBtn}
                        onPress={() => setFriendRequestPlayer(null)}
                      >
                        <Text style={styles.friendModalCancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.friendModalSendBtn,
                          sendFriendRequestMutation.isPending && {
                            opacity: 0.6,
                          },
                        ]}
                        onPress={() => {
                          if (!sendFriendRequestMutation.isPending) {
                            setFriendRequestState({ kind: "idle" });
                            sendFriendRequestMutation.mutate(
                              friendRequestPlayer.id,
                            );
                          }
                        }}
                      >
                        {sendFriendRequestMutation.isPending ? (
                          <ActivityIndicator
                            size="small"
                            color={Colors.dark.buttonText}
                          />
                        ) : (
                          <>
                            <Ionicons
                              name="person-add"
                              size={18}
                              color={Colors.dark.buttonText}
                            />
                            <Text style={styles.friendModalSendText}>
                              {friendRequestState.kind === "error"
                                ? "Try again"
                                : "Send Request"}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2;

const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.dark.backgroundRoot,
    },
    animatedHeader: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 10,
      backgroundColor: Colors.dark.backgroundRoot,
    },
    mainContent: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },
    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      flex: 1,
    },
    headerLine: {
      flex: 1,
      height: 1,
      backgroundColor: Colors.dark.primary + "40",
    },
    headerTitle: {
      ...Typography.h1,
      color: Colors.dark.text,
      textAlign: "center",
    },
    playHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flex: 1,
      gap: Spacing.sm,
    },
    playHeaderAcademy: {
      ...Typography.h2,
      color: Colors.dark.text,
      flex: 1,
    },
    playHeaderSearchBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: Colors.dark.backgroundElevated,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    familySwitchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.sm,
      marginTop: Spacing.xs,
    },
    familyViewingText: {
      ...Typography.caption,
      color: Colors.dark.primary,
      fontWeight: "600",
    },
    chatButton: {
      position: "relative",
      padding: Spacing.sm,
    },
    chatBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      backgroundColor: Colors.dark.primary,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    chatBadgeText: {
      ...Typography.caption,
      color: Colors.dark.buttonText,
      fontSize: 10,
      fontWeight: "700",
    },
    // Variant 1 cleanup — hero CTA cards
    heroRow: {
      flexDirection: "row",
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    heroCard: {
      flex: 1,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.dark.backgroundDefault,
      borderWidth: 1,
      borderColor: Colors.dark.borderSubtle,
      alignItems: "center",
      gap: 6,
    },
    heroCardHighlighted: {
      backgroundColor: Colors.dark.primary + "12",
      borderColor: Colors.dark.primary + "55",
    },
    heroCardIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: Colors.dark.chipBackground,
    },
    heroCardIconHighlighted: {
      backgroundColor: Colors.dark.primary + "22",
    },
    heroCardLabel: {
      ...Typography.caption,
      fontWeight: "700",
      color: Colors.dark.text,
      textAlign: "center",
    },
    heroCardLabelHighlighted: {
      color: Colors.dark.primary,
    },
    // Variant 1 cleanup — compact secondary chip row
    compactChipsRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
    },
    compactChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.chipBackground,
      borderWidth: 1,
      borderColor: Colors.dark.chipBorder,
      position: "relative",
    },
    compactChipActive: {
      backgroundColor: Colors.dark.primary + "18",
      borderColor: Colors.dark.primary + "55",
    },
    compactChipText: {
      fontSize: 11,
      fontWeight: "700",
      color: Colors.dark.textMuted,
    },
    compactChipBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      minWidth: 14,
      height: 14,
      paddingHorizontal: 4,
      borderRadius: 999,
      backgroundColor: "#E040FB",
      alignItems: "center",
      justifyContent: "center",
    },
    compactChipBadgeText: {
      fontSize: 9,
      fontWeight: "800",
      color: "#fff",
    },
    // Variant 1 cleanup — Filter pill + active summary
    filterPillRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 0,
      marginBottom: Spacing.md,
    },
    filterPillBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.primary + "18",
      borderWidth: 1,
      borderColor: Colors.dark.primary + "55",
    },
    filterPillBtnText: {
      fontSize: 11,
      fontWeight: "800",
      color: Colors.dark.primary,
    },
    filterSummaryScroll: {
      flex: 1,
    },
    filterSummaryContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingRight: Spacing.sm,
    },
    filterSummaryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.chipBackground,
      borderWidth: 1,
      borderColor: Colors.dark.chipBorder,
    },
    filterSummaryDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    filterSummaryChipText: {
      fontSize: 10,
      fontWeight: "700",
      color: Colors.dark.textMuted,
    },
    filterSummaryActiveCount: {
      fontSize: 10,
      fontWeight: "700",
      color: Colors.dark.textMuted,
      alignSelf: "center",
      marginLeft: 2,
    },
    heroCardCount: {
      fontSize: 10,
      fontWeight: "700",
      color: Colors.dark.textMuted,
      textAlign: "center",
    },
    // Variant 1 cleanup — Filter bottom-sheet content
    filterSheetGroupLabel: {
      ...Typography.caption,
      color: Colors.dark.textMuted,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: Spacing.sm,
      marginBottom: 6,
    },
    filterSheetWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    filterSheetFooter: {
      flexDirection: "row",
      gap: Spacing.sm,
      marginTop: Spacing.lg,
    },
    filterSheetResetBtn: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.chipBackground,
      borderWidth: 1,
      borderColor: Colors.dark.chipBorder,
      alignItems: "center",
    },
    filterSheetResetText: {
      fontSize: 13,
      fontWeight: "700",
      color: Colors.dark.text,
    },
    filterSheetApplyBtn: {
      flex: 2,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.primary,
      alignItems: "center",
    },
    filterSheetApplyText: {
      fontSize: 13,
      fontWeight: "800",
      color: Colors.dark.buttonText,
    },
    sportChipsRow: {
      marginBottom: Spacing.sm,
    },
    playModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    playModalSheet: {
      backgroundColor: Colors.dark.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: Spacing.xl,
      paddingBottom: 48,
      gap: Spacing.md,
    },
    playModalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: Colors.dark.border,
      alignSelf: "center",
      marginBottom: Spacing.sm,
    },
    playModalTitle: {
      ...Typography.h3,
      color: Colors.dark.text,
      fontWeight: "700",
      marginBottom: Spacing.sm,
    },
    playModalOption: {
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
    },
    playModalOptionGradient: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.lg,
      gap: Spacing.md,
    },
    playModalOptionText: {
      flex: 1,
    },
    playModalOptionTitle: {
      ...Typography.h4,
      color: Colors.dark.buttonText,
      fontWeight: "700",
    },
    playModalOptionDesc: {
      ...Typography.small,
      color: Colors.dark.backgroundRoot + "cc",
      marginTop: 2,
    },
    playModalSportRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      padding: Spacing.md,
    },
    playModalBackRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginBottom: Spacing.sm,
    },
    playModalBackText: {
      ...Typography.small,
      color: Colors.dark.textMuted,
    },
    tabs: {
      flexDirection: "row",
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border,
    },
    tab: {
      flex: 1,
      paddingVertical: Spacing.md,
      alignItems: "center",
    },
    tabActive: {
      borderBottomWidth: 2,
      borderBottomColor: Colors.dark.primary,
    },
    tabText: {
      ...Typography.body,
      color: Colors.dark.textMuted,
    },
    tabTextActive: {
      color: Colors.dark.text,
      fontWeight: "600",
    },
    filterRow: {
      marginTop: Spacing.sm,
      marginHorizontal: -Spacing.lg,
    },
    filterRowContent: {
      paddingHorizontal: Spacing.lg,
      gap: Spacing.sm,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    filterDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    filterChipText: {
      ...Typography.small,
      color: Colors.dark.textMuted,
      fontWeight: "500",
    },
    dayChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      marginRight: Spacing.xs,
    },
    dayChipSelected: {
      backgroundColor: Colors.dark.primary + "30",
      borderColor: Colors.dark.primary,
    },
    dayChipText: {
      ...Typography.small,
      color: Colors.dark.textMuted,
      fontWeight: "600",
    },
    dayChipTextSelected: {
      color: Colors.dark.primary,
    },
    playerLevelChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    playerLevelChipText: {
      ...Typography.small,
      color: Colors.dark.textMuted,
      fontWeight: "600",
    },
    playerLevelCount: {
      ...Typography.small,
      color: Colors.dark.textMuted,
      opacity: 0.7,
      marginLeft: Spacing.xs / 2,
    },
    ballLevelBadgeText: {
      ...Typography.small,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      paddingHorizontal: Spacing.lg,
      gap: Spacing.lg,
    },
    loadingContainer: {
      alignItems: "center",
      paddingVertical: Spacing.xl * 2,
      gap: Spacing.md,
    },
    loadingText: {
      ...Typography.body,
      color: Colors.dark.textMuted,
    },
    epicSessionCard: {
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
      marginBottom: Spacing.md,
      position: "relative",
    },
    cardBackground: {
      width: "100%",
      minHeight: 220,
    },
    cardBackgroundImage: {
      borderRadius: BorderRadius.lg,
    },
    cardOverlay: {
      flex: 1,
      padding: Spacing.lg,
      borderRadius: BorderRadius.lg,
    },
    cardContent: {
      flex: 1,
      justifyContent: "space-between",
    },
    cardHeader: {
      marginBottom: Spacing.md,
    },
    cardTitleSection: {
      gap: Spacing.xs,
    },
    titleWithBadges: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: Spacing.sm,
    },
    epicSessionTitle: {
      ...Typography.h2,
      color: Colors.dark.text,
      fontWeight: "700",
      marginBottom: 2,
      flexWrap: "wrap",
      flex: 1,
    },
    inlineBadgesRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
    },
    epicXpBadgeSmall: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "rgba(255, 133, 27, 0.25)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.dark.orange + "40",
    },
    epicXpTextSmall: {
      ...Typography.caption,
      color: Colors.dark.orange,
      fontWeight: "600",
      fontSize: 11,
    },
    countdownBadgeSmall: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "rgba(34, 211, 238, 0.15)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "40",
    },
    countdownTextSmall: {
      ...Typography.caption,
      color: Colors.dark.primary,
      fontWeight: "600",
      fontSize: 11,
    },
    epicLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
    },
    epicLocationText: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "500",
    },
    epicCoachRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
    },
    epicCoachText: {
      ...Typography.small,
      color: Colors.dark.primary,
      fontWeight: "500",
    },
    coachAvatarSmall: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "80",
    },
    coachAvatarSmallPlaceholder: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: Colors.dark.primary + "30",
      justifyContent: "center",
      alignItems: "center",
    },
    coachAvatarSmallInitial: {
      fontSize: 10,
      color: Colors.dark.primary,
      fontWeight: "700",
    },
    coachRatingBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      backgroundColor: Colors.dark.primary + "25",
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    coachRatingText: {
      fontSize: 10,
      color: Colors.dark.primary,
      fontWeight: "600",
    },
    epicAcademyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginTop: 2,
    },
    academyLogoSmall: {
      width: 16,
      height: 16,
      borderRadius: 3,
    },
    epicAcademyText: {
      ...Typography.small,
      color: Colors.dark.textMuted,
      fontSize: 11,
    },
    epicMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
    epicMetaText: {
      ...Typography.small,
      color: Colors.dark.textMuted,
    },
    epicMetaDot: {
      color: Colors.dark.textMuted,
      marginHorizontal: 2,
    },
    epicBadgesRow: {
      position: "absolute",
      top: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    epicXpBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255, 133, 27, 0.25)",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.dark.orange + "40",
    },
    countdownBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: Colors.dark.primary + "20",
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "40",
    },
    countdownUrgent: {
      backgroundColor: Colors.dark.error + "20",
      borderColor: Colors.dark.error + "40",
    },
    countdownText: {
      ...Typography.caption,
      color: Colors.dark.primary,
      fontWeight: "600",
      fontSize: 11,
    },
    countdownTextUrgent: {
      color: Colors.dark.error,
    },
    epicXpText: {
      ...Typography.body,
      color: Colors.dark.orange,
      fontWeight: "700",
    },
    epicActionsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: Spacing.md,
    },
    epicStatusSection: {
      gap: Spacing.sm,
      flex: 1,
    },
    epicStatusBadge: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      alignSelf: "flex-start",
    },
    epicStatusText: {
      ...Typography.body,
      fontWeight: "700",
    },
    epicJoinButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      backgroundColor: Colors.dark.primary,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.primaryGlow,
    },
    epicJoinButtonText: {
      ...Typography.body,
      color: Colors.dark.buttonText,
      fontWeight: "700",
    },
    epicWaitlistButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    epicWaitlistButtonText: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    epicDropInButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      backgroundColor: "#39FF14",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: "#39FF14",
    },
    epicDropInButtonText: {
      ...Typography.body,
      color: "#000",
      fontWeight: "700",
    },
    waitlistStatusContainer: {
      alignItems: "flex-end",
      gap: Spacing.xs,
    },
    waitlistPositionBadge: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 4,
      backgroundColor: Colors.dark.primary + "20",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "40",
      flexShrink: 1,
    },
    waitlistPositionText: {
      ...Typography.caption,
      color: Colors.dark.primary,
      fontWeight: "600",
      flexShrink: 1,
    },
    epicLeaveWaitlistButton: {
      backgroundColor: "rgba(255, 107, 107, 0.12)",
      paddingHorizontal: Spacing.md,
      paddingVertical: 5,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: "#FF6B6B60",
    },
    epicLeaveWaitlistText: {
      ...Typography.caption,
      color: "#FF6B6B",
      fontWeight: "600",
    },
    waitlistOfferedContainer: {
      alignItems: "flex-end",
      gap: Spacing.xs,
    },
    waitlistClaimTimer: {
      ...Typography.caption,
      color: "#F59E0B",
      fontWeight: "700",
      fontSize: 13,
    },
    waitlistOfferedButtons: {
      flexDirection: "row",
      gap: Spacing.xs,
    },
    epicClaimButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "#F59E0B",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
    },
    epicClaimButtonText: {
      ...Typography.body,
      color: Colors.dark.buttonText,
      fontWeight: "700",
      fontSize: 13,
    },
    epicDeclineButton: {
      backgroundColor: Colors.dark.chipBackgroundStrong,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    epicDeclineButtonText: {
      ...Typography.body,
      color: Colors.dark.textMuted,
      fontSize: 13,
    },
    epicCancelButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      backgroundColor: "rgba(255, 107, 107, 0.15)",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: "#FF6B6B",
    },
    epicCancelButtonText: {
      ...Typography.body,
      color: "#FF6B6B",
      fontWeight: "700",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    epicPlayersSection: {
      alignItems: "flex-end",
    },
    epicAvatarStack: {
      flexDirection: "row",
      marginBottom: Spacing.xs,
    },
    epicAvatarCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 3,
      borderColor: Colors.dark.backgroundRoot,
      backgroundColor: Colors.dark.backgroundSecondary,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    epicAvatarImage: {
      width: 62,
      height: 62,
      borderRadius: 31,
    },
    epicAvatarPlaceholder: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: "center",
      justifyContent: "center",
    },
    epicAvatarInitial: {
      ...Typography.h3,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    epicGoldRing: {
      position: "absolute",
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 3,
      borderColor: Colors.dark.gold,
    },
    epicPlayerNames: {
      flexDirection: "row",
      gap: Spacing.xs,
    },
    epicPlayerName: {
      ...Typography.caption,
      color: Colors.dark.textMuted,
      fontSize: 11,
    },
    priceChipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginTop: Spacing.sm,
    },
    priceChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Colors.dark.primary + "25",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "60",
    },
    priceChipText: {
      fontSize: 11,
      color: Colors.dark.primary,
      fontWeight: "700",
    },
    spotsChip: {
      backgroundColor: Colors.dark.chipBackgroundStrong,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.sm,
    },
    spotsChipText: {
      fontSize: 11,
      color: Colors.dark.textMuted,
      fontWeight: "500",
    },
    creditCostRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginTop: Spacing.md,
      paddingTop: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: Colors.dark.chipBackgroundStrong,
    },
    creditCostText: {
      ...Typography.caption,
      color: Colors.dark.textMuted,
    },
    participantsRow: {
      marginTop: Spacing.sm,
      gap: Spacing.sm,
    },
    participantNamesRow: {
      marginTop: Spacing.xs,
    },
    participantNamesText: {
      ...Typography.caption,
      color: Colors.dark.textSecondary,
    },
    epicAvatarMore: {
      backgroundColor: Colors.dark.backgroundSecondary,
      justifyContent: "center",
      alignItems: "center",
    },
    epicAvatarMoreText: {
      ...Typography.caption,
      color: Colors.dark.textMuted,
      fontWeight: "600",
    },
    epicSquadRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      marginTop: Spacing.md,
      paddingTop: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: Colors.dark.chipBackgroundStrong,
    },
    epicSquadName: {
      ...Typography.body,
      color: Colors.dark.primary,
      fontWeight: "600",
      flex: 1,
    },
    epicSquadXpBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: Colors.dark.orange + "20",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    epicSquadXp: {
      ...Typography.caption,
      color: Colors.dark.orange,
      fontWeight: "600",
    },
    epicCardGlow: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      borderColor: Colors.dark.primary + "50",
      pointerEvents: "none",
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: Spacing.md,
    },
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    sectionTitle: {
      ...Typography.h3,
      color: Colors.dark.text,
    },
    viewAllButton: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    viewAllText: {
      ...Typography.caption,
      color: Colors.dark.primary,
    },
    playerCount: {
      ...Typography.caption,
      color: Colors.dark.textMuted,
      marginLeft: 4,
    },
    playerSearchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Colors.dark.backgroundRoot,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.md,
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    playerSearchInput: {
      flex: 1,
      ...Typography.body,
      color: Colors.dark.text,
      paddingVertical: 0,
    },
    playersGrid: {
      gap: Spacing.sm,
    },
    compactPlayerCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Colors.dark.backgroundSecondary,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      gap: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    compactAvatarRing: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      padding: 2,
      position: "relative",
    },
    compactAvatarImage: {
      width: "100%",
      height: "100%",
      borderRadius: 22,
    },
    compactAvatarPlaceholder: {
      width: "100%",
      height: "100%",
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    compactAvatarLetter: {
      fontSize: 18,
      fontWeight: "800",
    },
    compactOnlineDot: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: Colors.dark.primary,
      borderWidth: 2,
      borderColor: Colors.dark.backgroundSecondary,
    },
    compactPlayerInfo: {
      flex: 1,
      gap: 4,
    },
    compactPlayerName: {
      fontSize: 15,
      fontWeight: "700",
      color: Colors.dark.text,
    },
    compactBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    compactLevelBadge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    compactLevelText: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    compactVibeText: {
      fontSize: 11,
      color: Colors.dark.textMuted,
      flex: 1,
    },
    homeAddressBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: Colors.dark.primary + "25",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: Colors.dark.primary + "40",
    },
    compactDriveTimeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: Colors.dark.chipBackground,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 6,
    },
    compactDriveTimeText: {
      fontSize: 10,
      color: Colors.dark.textSubtle,
    },
    compactLastSeenBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: Colors.dark.chipBackground,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 6,
    },
    compactLastSeenText: {
      fontSize: 10,
      color: Colors.dark.textSubtle,
    },
    // Task #1033 — flag + city subtitle on player cards.
    compactLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
    compactFlag: {
      fontSize: 12,
    },
    compactLocationText: {
      fontSize: 10,
      color: Colors.dark.textSubtle,
      flexShrink: 1,
    },
    compactOnlineDotActive: {
      backgroundColor: "#22C55E",
      shadowColor: "#22C55E",
      shadowOpacity: 0.8,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 0 },
    },
    compactOnlineBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(34,197,94,0.15)",
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.35)",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    compactOnlinePulse: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#22C55E",
    },
    compactOnlineText: {
      fontSize: 10,
      fontWeight: "600",
      color: "#22C55E",
    },
    compactActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    compactFriendBtn: {
      minWidth: 36,
      height: 36,
      paddingHorizontal: 10,
      borderRadius: 18,
      backgroundColor: Colors.dark.backgroundTertiary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    compactFriendBtnPending: {
      backgroundColor: Colors.dark.backgroundSecondary,
      borderColor: Colors.dark.border,
    },
    compactFriendBtnFriends: {
      backgroundColor: Colors.dark.primary + "20",
      borderColor: Colors.dark.primary + "55",
    },
    compactFriendBtnIncoming: {
      backgroundColor: Colors.dark.primary,
      borderColor: Colors.dark.primary,
    },
    compactFriendStatusText: {
      fontSize: 11,
      fontWeight: "700",
      color: Colors.dark.primary,
    },
    compactChallengeBtn: {
      flexDirection: "row",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.dark.primary,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    compactChallengeText: {
      fontSize: 11,
      fontWeight: "800",
      color: Colors.dark.buttonText,
      letterSpacing: 0.3,
    },
    compactXpLevelBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: Colors.dark.gold + "20",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    compactXpLevelText: {
      fontSize: 10,
      fontWeight: "700",
      color: Colors.dark.gold,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      alignItems: "center",
      padding: Spacing.xl,
    },
    friendRequestModal: {
      backgroundColor: Colors.dark.backgroundSecondary,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      alignItems: "center",
      width: "100%",
      maxWidth: 340,
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    friendModalAvatarRing: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 3,
      padding: 3,
      marginBottom: Spacing.md,
    },
    friendModalAvatar: {
      width: "100%",
      height: "100%",
      borderRadius: 36,
    },
    friendModalAvatarPlaceholder: {
      width: "100%",
      height: "100%",
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    friendModalAvatarLetter: {
      fontSize: 28,
      fontWeight: "800",
    },
    friendModalTitle: {
      ...Typography.h3,
      color: Colors.dark.text,
      marginBottom: Spacing.xs,
    },
    friendModalName: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
      marginBottom: Spacing.sm,
    },
    friendModalLevelBadge: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      marginBottom: Spacing.lg,
    },
    friendModalLevelText: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    friendModalSentContainer: {
      alignItems: "center",
      gap: Spacing.md,
    },
    friendModalSentText: {
      ...Typography.body,
      color: Colors.dark.textMuted,
      textAlign: "center",
    },
    friendModalDeliveryHint: {
      fontSize: 13,
      color: Colors.dark.textSecondary,
      textAlign: "center",
      marginTop: -Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    friendModalDoneBtn: {
      backgroundColor: Colors.dark.primary,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      marginTop: Spacing.sm,
    },
    friendModalDoneBtnText: {
      ...Typography.body,
      color: Colors.dark.buttonText,
      fontWeight: "700",
    },
    friendModalButtons: {
      flexDirection: "row",
      gap: Spacing.md,
      width: "100%",
    },
    friendModalCancelBtn: {
      flex: 1,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.dark.backgroundTertiary,
      alignItems: "center",
      borderWidth: 1,
      borderColor: Colors.dark.border,
    },
    friendModalErrorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.xs,
      backgroundColor: `${Colors.dark.error}15`,
      borderColor: `${Colors.dark.error}40`,
      borderWidth: 1,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.sm,
      marginBottom: Spacing.sm,
      width: "100%",
    },
    friendModalErrorText: {
      flex: 1,
      fontSize: 12,
      color: Colors.dark.error,
      lineHeight: 16,
    },
    friendModalCancelText: {
      ...Typography.body,
      color: Colors.dark.text,
      fontWeight: "600",
    },
    friendModalSendBtn: {
      flex: 1,
      flexDirection: "row",
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      backgroundColor: Colors.dark.primary,
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.xs,
    },
    friendModalSendText: {
      ...Typography.body,
      color: Colors.dark.buttonText,
      fontWeight: "700",
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: Spacing.xl * 2,
      gap: Spacing.md,
    },
    emptyTitle: {
      ...Typography.h4,
      color: Colors.dark.textMuted,
    },
    emptySubtitle: {
      ...Typography.body,
      color: Colors.dark.textMuted,
      textAlign: "center",
    },
    findAcademyLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: Spacing.sm,
    },
    findAcademyLinkText: {
      ...Typography.body,
      color: Colors.dark.primary,
      fontWeight: "600",
    },
    discoverFilterRow: {
      marginBottom: Spacing.sm,
    },
    discoverFilterContent: {
      paddingHorizontal: Spacing.lg,
      gap: Spacing.sm,
    },
    discoverChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: "transparent",
    },
    discoverChipActive: {
      backgroundColor: Colors.dark.primary,
      borderColor: Colors.dark.primary,
    },
    discoverChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: Colors.dark.text,
    },
    discoverChipTextActive: {
      color: Colors.dark.buttonText,
    },
    epicBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
    },
    openToPlayBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: Colors.dark.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    epicAvatarWrapper: {
      position: "relative",
      alignItems: "center",
      marginBottom: Spacing.sm,
    },
    openToPlayAvatarBadge: {
      position: "absolute",
      bottom: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: Colors.dark.primary,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: Colors.dark.backgroundSecondary,
    },

    // Location permission banner
    locationPermissionBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: Colors.dark.primary + "15",
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "30",
    },
    locationPermissionText: {
      flex: 1,
      fontSize: 13,
      color: Colors.dark.text,
    },
    topLocationBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: Colors.dark.primary + "15",
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "40",
    },
    topLocationBannerText: {
      flex: 1,
      fontSize: 13,
      color: Colors.dark.text,
      lineHeight: 18,
    },
    topLocationBannerAction: {
      fontSize: 12,
      color: Colors.dark.primary,
      fontWeight: "700",
    },

    // Courts Near You
    courtsNearYouSection: {
      marginTop: Spacing.xl,
    },
    nearbyCourtsScroll: {
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
      gap: Spacing.md,
    },
    nearbyCourtCard: {
      width: 180,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      gap: Spacing.xs,
    },
    nearbyCourtHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 2,
    },
    nearbyCourtBadgeRow: {
      flexDirection: "row",
      gap: 4,
      flexWrap: "wrap",
      flex: 1,
    },
    nearbyCourtSportBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    nearbyCourtSportText: {
      fontSize: 10,
      fontWeight: "600",
    },
    nearbyCourtInternalBadge: {
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.dark.gold + "25",
    },
    nearbyCourtInternalText: {
      fontSize: 10,
      fontWeight: "600",
      color: Colors.dark.gold,
    },
    nearbyCourtExternalBadge: {
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.dark.backgroundTertiary,
      maxWidth: 90,
    },
    nearbyCourtExternalText: {
      fontSize: 10,
      fontWeight: "600",
      color: Colors.dark.textSecondary,
    },
    nearbyCourtDistanceBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.dark.primary + "15",
    },
    nearbyCourtDistanceText: {
      fontSize: 10,
      fontWeight: "600",
      color: Colors.dark.primary,
    },
    nearbyCourtName: {
      fontSize: 13,
      fontWeight: "700",
      color: Colors.dark.text,
      lineHeight: 17,
    },
    nearbyCourtAddress: {
      fontSize: 11,
      color: Colors.dark.textMuted,
    },
    nearbyCourtSurfaceChip: {
      alignSelf: "flex-start",
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.dark.backgroundTertiary,
      marginTop: 2,
    },
    nearbyCourtSurfaceText: {
      fontSize: 10,
      color: Colors.dark.textSecondary,
    },
    nearbyCourtActions: {
      flexDirection: "row",
      gap: Spacing.xs,
      marginTop: Spacing.sm,
    },
    nearbyCourtBookBtn: {
      flex: 1,
      paddingVertical: Spacing.xs,
      backgroundColor: Colors.dark.primary,
      borderRadius: BorderRadius.sm,
      alignItems: "center",
    },
    nearbyCourtBookBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: Colors.dark.buttonText,
    },
    nearbyCourtDirectionsBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingVertical: Spacing.xs,
      backgroundColor: Colors.dark.backgroundTertiary,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: Colors.dark.primary + "40",
    },
    nearbyCourtDirectionsBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: Colors.dark.primary,
    },

    // Courts view toggle
    courtsViewToggle: {
      flexDirection: "row",
      backgroundColor: Colors.dark.backgroundTertiary,
      borderRadius: BorderRadius.md,
      padding: 2,
      gap: 2,
    },
    courtsViewToggleBtn: {
      padding: 6,
      borderRadius: BorderRadius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    courtsViewToggleBtnActive: {
      backgroundColor: Colors.dark.primary,
    },

    // Courts map
    courtsMapContainer: {
      marginHorizontal: Spacing.lg,
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
      height: 260,
      marginTop: Spacing.sm,
    },
    courtsMap: {
      width: "100%",
      height: "100%",
    },
    courtsMapWebFallback: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      height: 260,
      borderRadius: BorderRadius.lg,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.sm,
      padding: Spacing.lg,
    },
    courtsMapWebFallbackText: {
      fontSize: 14,
      color: Colors.dark.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
    courtsMapCallout: {
      width: 180,
      padding: Spacing.sm,
      gap: 4,
    },
    courtsMapCalloutName: {
      fontSize: 13,
      fontWeight: "700",
      color: Colors.dark.text,
      lineHeight: 17,
    },
    courtsMapCalloutMeta: {
      flexDirection: "row",
      gap: Spacing.xs,
      flexWrap: "wrap",
    },
    courtsMapCalloutSurface: {
      fontSize: 11,
      color: Colors.dark.textSecondary,
      backgroundColor: Colors.dark.backgroundTertiary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    courtsMapCalloutDistance: {
      fontSize: 11,
      color: Colors.dark.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      backgroundColor: Colors.dark.primary + "15",
    },
    courtsMapCalloutBookBtn: {
      marginTop: 4,
      backgroundColor: Colors.dark.primary,
      borderRadius: BorderRadius.sm,
      paddingVertical: 6,
      alignItems: "center",
    },
    courtsMapCalloutBookBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: Colors.dark.buttonText,
    },

    // Session Info Modal
    sessionInfoModal: {
      backgroundColor: Colors.dark.backgroundSecondary,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginTop: "auto",
      gap: Spacing.sm,
    },
    sessionInfoHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.xs,
    },
    sessionInfoTitle: {
      ...Typography.h4,
      color: Colors.dark.text,
      flex: 1,
    },
    sessionInfoVenuePhoto: {
      width: "100%",
      height: 120,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.xs,
    },
    sessionInfoLocationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      flexWrap: "wrap",
    },
    sessionInfoLocation: {
      flex: 1,
      fontSize: 14,
      color: Colors.dark.textSecondary,
    },
    sessionInfoRatingBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "rgba(255,215,0,0.12)",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    sessionInfoRatingText: {
      fontSize: 11,
      fontWeight: "600",
      color: "#FFD700",
    },
    sessionInfoTime: {
      fontSize: 13,
      color: Colors.dark.textMuted,
    },
    sessionInfoCoach: {
      fontSize: 13,
      color: Colors.dark.primary,
    },
    sessionInfoMapWrapper: {
      borderRadius: BorderRadius.md,
      overflow: "hidden",
      height: 140,
      marginTop: Spacing.sm,
      position: "relative",
    },
    sessionInfoMap: {
      width: "100%",
      height: "100%",
    },
    sessionInfoMapBadge: {
      position: "absolute",
      bottom: Spacing.sm,
      right: Spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0,212,255,0.9)",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      gap: 4,
    },
    sessionInfoMapBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: Backgrounds.root,
    },
    sessionInfoClose: {
      marginTop: Spacing.md,
      paddingVertical: Spacing.md,
      backgroundColor: Colors.dark.backgroundTertiary,
      borderRadius: BorderRadius.md,
      alignItems: "center",
    },
    sessionInfoCloseText: {
      fontSize: 15,
      fontWeight: "600",
      color: Colors.dark.text,
    },
    sessionInfoBadgesRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      flexWrap: "wrap",
    },
    sessionInfoLevelBadge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    sessionInfoLevelBadgeText: {
      fontSize: 12,
      fontWeight: "700",
    },
    sessionInfoXpBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: Colors.dark.orange + "20",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.full,
    },
    sessionInfoXpText: {
      fontSize: 12,
      fontWeight: "700",
      color: Colors.dark.orange,
    },
    sessionInfoCapacityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
    },
    sessionInfoCapacityText: {
      fontSize: 13,
      color: Colors.dark.textSecondary,
    },
    sessionInfoPlayersRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      flexWrap: "wrap",
    },
    sessionInfoPlayerNames: {
      fontSize: 12,
      color: Colors.dark.textMuted,
      flexShrink: 1,
    },
    sessionInfoWaitlistRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      backgroundColor: Colors.dark.primary + "15",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 5,
      borderRadius: BorderRadius.sm,
    },
    sessionInfoWaitlistText: {
      fontSize: 13,
      fontWeight: "600",
      color: Colors.dark.primary,
    },
    scopeToggleContainer: {
      flexDirection: "row",
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
      marginBottom: Spacing.sm,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderRadius: BorderRadius.lg,
      padding: 3,
    },
    scopeToggleBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: BorderRadius.md,
    },
    scopeToggleBtnActive: {
      backgroundColor: Colors.dark.primary,
    },
    scopeToggleText: {
      fontSize: 13,
      fontWeight: "600",
      color: Colors.dark.textMuted,
    },
    scopeToggleTextActive: {
      color: Colors.dark.backgroundRoot,
    },
    sectionDivider: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.md,
      gap: Spacing.sm,
    },
    sectionDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: Colors.dark.backgroundTertiary,
    },
    sectionDividerText: {
      fontSize: 11,
      fontWeight: "700",
      color: Colors.dark.textMuted,
      letterSpacing: 1,
    },
    crossAcademyBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 3,
    },
    crossAcademyBadgeText: {
      fontSize: 11,
      color: Colors.dark.textMuted,
      fontWeight: "500",
    },
    leaderboardFilterRow: {
      marginBottom: Spacing.sm,
    },
    leaderboardFilterScroll: {
      flexDirection: "row",
      paddingHorizontal: Spacing.lg,
      gap: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    leaderboardChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      backgroundColor: Colors.dark.backgroundSecondary,
    },
    leaderboardChipActive: {
      backgroundColor: Colors.dark.primary + "20",
      borderColor: Colors.dark.primary,
    },
    leaderboardChipText: {
      fontSize: 13,
      fontWeight: "500",
      color: Colors.dark.textMuted,
    },
    leaderboardChipTextActive: {
      color: Colors.dark.primary,
      fontWeight: "600",
    },
    leaderboardRow: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: Colors.dark.backgroundSecondary,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      gap: Spacing.sm,
    },
    leaderboardRowHighlight: {
      borderColor: Colors.dark.primary,
      backgroundColor: Colors.dark.primary + "12",
    },
    leaderboardRankCol: {
      width: 36,
      alignItems: "center",
    },
    leaderboardRankText: {
      fontSize: 13,
      fontWeight: "700",
      color: Colors.dark.textMuted,
    },
    leaderboardAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      overflow: "hidden",
    },
    leaderboardAvatarImg: {
      width: 40,
      height: 40,
    },
    leaderboardAvatarPlaceholder: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    leaderboardAvatarLetter: {
      fontSize: 16,
      fontWeight: "700",
    },
    leaderboardPlayerInfo: {
      flex: 1,
      gap: 2,
    },
    leaderboardPlayerName: {
      fontSize: 14,
      fontWeight: "600",
      color: Colors.dark.text,
    },
    leaderboardGlowRank: {
      fontSize: 11,
      fontWeight: "600",
    },
    leaderboardAcademy: {
      fontSize: 11,
      color: Colors.dark.textMuted,
    },
    leaderboardMmr: {
      fontSize: 14,
      fontWeight: "700",
      color: Colors.dark.primary,
      minWidth: 50,
      textAlign: "right",
    },
  }),
);
