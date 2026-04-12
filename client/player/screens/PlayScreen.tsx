import logger from "@/lib/logger";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Alert, ImageBackground, Dimensions, Platform, Image as RNImage, TextInput, Modal, Linking } from "react-native";
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from "react-native-maps";
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
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { openDirections as openMapsDirections } from "@/lib/maps";
import { formatSessionTimeWithRelativeDay } from "@/lib/dateUtils";
import { apiRequest, getApiUrl, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { useWalkthrough } from "@/player/context/WalkthroughContext";
import { useFamily } from "@/player/context/FamilyContext";
import FamilyQuickSwitch from "@/player/components/FamilyQuickSwitch";
import { useSport, getSportLabel, getSportColor, getSportIcon, SPORT_DEFINITIONS } from "@/player/context/SportContext";
import { SportSwitcherChips } from "@/player/components/SportSwitcherChips";

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
  coachAverageRating?: number | null;
  coachTotalRatings?: number;
  academyAverageRating?: number | null;
  academyId?: string | null;
  ballLevel?: string;
  vibe: string;
  minLevel?: number;
  maxLevel?: number;
  xpReward: number;
  maxPlayers: number;
  currentPlayers: number;
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

const TAB_OPTIONS = ["Group Lessons", "Players"] as const;

const BALL_LEVELS = ["my_level", "all", "blue", "red", "orange", "green", "yellow", "glow"] as const;

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
    const altMatch = l.match(/^(blue|red|orange|green|yellow|glow)[_-]?(\d+)?$/i);
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
  if (!title || title.includes("-0") || title.match(/\d{2}:\d{2}/) || title.length > 50) {
    return session.sessionType === "group" ? "Group Session" : "Semi-Private Session";
  }
  return title;
}

export default function PlayScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<PlayStackParamList, "Play">>();
  const queryClient = useQueryClient();
  const { hasSeenScreen, startWalkthrough } = useWalkthrough();
  const { isFamily, familyData, activePlayerId } = useFamily();
  const { isMultiSport, activeSports, activeSport, setActiveSport } = useSport();
  const [showPlayModal, setShowPlayModal] = useState(false);
  const [playModalStep, setPlayModalStep] = useState<"sport" | "type">("type");
  const initialTab = route.params?.initialTab || "Group Lessons";
  const [activeTab, setActiveTab] = useState<typeof TAB_OPTIONS[number]>(initialTab);

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
  const [selectedBallLevel, setSelectedBallLevel] = useState<string>("my_level");
  const [showOtherLevels, setShowOtherLevels] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [selectedPlayerLevel, setSelectedPlayerLevel] = useState<string>("all");
  const [discoverFilter, setDiscoverFilter] = useState<DiscoverFilter>("sameLevel");
  const [selectedSession, setSelectedSession] = useState<PlaySession | null>(null);
  const [friendRequestPlayer, setFriendRequestPlayer] = useState<NearbyPlayer | null>(null);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const SCOPE_KEY = "@play_scope";

  useEffect(() => {
    AsyncStorage.getItem(SCOPE_KEY).then(val => {
      if (val === "all" || val === "mine") setScope(val);
    }).catch(() => {});
  }, []);

  const handleScopeChange = useCallback((newScope: "mine" | "all") => {
    setScope(newScope);
    AsyncStorage.setItem(SCOPE_KEY, newScope).catch(() => {});
  }, []);

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
        Math.min(0, newTranslation)
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
        headerTranslation.value = withTiming(-headerHeightSV.value, { duration: 200 });
      }
    },
    onMomentumEnd: (event) => {
      const currentY = event.contentOffset.y;
      if (currentY <= 0) {
        headerTranslation.value = withTiming(0, { duration: 200 });
      } else if (headerTranslation.value > -headerHeightSV.value / 2) {
        headerTranslation.value = withTiming(0, { duration: 200 });
      } else {
        headerTranslation.value = withTiming(-headerHeightSV.value, { duration: 200 });
      }
    },
  });

  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslation.value }],
    opacity: interpolate(
      headerTranslation.value,
      [-headerHeightSV.value, 0],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const insetsTop = insets.top;
  const animatedMainContentStyle = useAnimatedStyle(() => ({
    paddingTop: insetsTop + Math.max(
      headerHeightSV.value + headerTranslation.value,
      0
    ),
  }));

  useEffect(() => {
    if (!hasSeenScreen("Play")) {
      const timer = setTimeout(() => {
        startWalkthrough("Play");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenScreen, startWalkthrough]);


  const { data: profileData } = useQuery<{ player: { ballLevel?: string; city?: string; country?: string }; academy?: { id: string; name: string } | null }>({
    queryKey: ["/api/player/me/profile"],
  });

  const apiUrl = getApiUrl();

  // Reverse geocode location when permission is granted
  const reverseGeocodeMutation = useMutation({
    mutationFn: async ({ lat, lng, missingCity, missingCountry }: { lat: number; lng: number; missingCity: boolean; missingCountry: boolean }) => {
      const response = await apiRequest("GET", `/api/maps/reverse-geocode?lat=${lat}&lng=${lng}`);
      const geocoded = await response.json() as { city?: string; country?: string };
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

  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const hasAutoRequestedLocationRef = useRef(false);

  // Auto-request location permission when status is undetermined (first time).
  // Uses a ref guard so frequent re-renders during mount don't keep cancelling the timer.
  useEffect(() => {
    if (locationPermission?.status === "undetermined" && !hasAutoRequestedLocationRef.current) {
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
  useEffect(() => { profileDataRef.current = profileData; }, [profileData]);

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
      .then(loc => {
        reverseGeocodeMutation.mutate({ lat: loc.coords.latitude, lng: loc.coords.longitude, missingCity, missingCountry });
      })
      .catch(() => { /* silent */ });
  }, [locationPermission?.granted, profileData]); // profileData dep so it retries once profile loads

  const { data: invitesData } = useQuery<Array<{ booking_invite_guests: { status: string } }>>({
    queryKey: ["/api/player/booking-invites"],
  });
  const pendingInvitesCount = invitesData?.filter(i => i.booking_invite_guests?.status === "pending")?.length || 0;

  const { data: corporateData } = useQuery<{ corporateAccount: { companyName: string; creditBalance: number } | null; member: { inviteStatus: string } | null }>({
    queryKey: ["/api/corporate/my-account"],
  });
  const hasCorporateCredits = !!(corporateData?.corporateAccount && corporateData?.member?.inviteStatus === "accepted" && (corporateData.corporateAccount.creditBalance ?? 0) > 0);

  // Fetch place details (rating + photo ref) when a session with a Google Place ID is selected
  const selectedPlaceId = selectedSession?.locationGooglePlaceId ?? null;
  const { data: sessionPlaceDetails } = useQuery<{ rating?: number; reviewCount?: number; photoRef?: string }>({
    queryKey: ["/api/maps/place-details", selectedPlaceId],
    enabled: !!selectedPlaceId,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/maps/place-details?placeId=${encodeURIComponent(selectedPlaceId!)}`);
      return response.json();
    },
  });

  const playerBallLevel = profileData?.player?.ballLevel?.toLowerCase() || "glow";
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
    
    if (diff <= 0) return { text: "Starting Now", urgent: true, expired: false };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return { text: `${days}d ${hours % 24}h left`, urgent: false, expired: false };
    }
    if (hours > 0) {
      return { text: `${hours}h ${minutes}m left`, urgent: hours < 2, expired: false };
    }
    if (minutes > 0) {
      return { text: `${minutes}m ${seconds}s left`, urgent: minutes < 30, expired: false };
    }
    return { text: `${seconds}s left`, urgent: true, expired: false };
  };

  // Compute the level param to pass to the API:
  // "my_level" selected (and not browsing) -> pass player's ball level
  // "all" (browsing with no chip) -> pass "all"
  // specific level chip selected -> pass that level
  const sessionsLevelParam = useMemo(() => {
    if (!showOtherLevels || selectedBallLevel === "my_level") {
      return playerBallLevel;
    }
    return selectedBallLevel; // "all" or specific level
  }, [showOtherLevels, selectedBallLevel, playerBallLevel]);

  // Free players (no academy) always use "all" scope regardless of stored preference
  const effectiveScope = playerAcademyId ? scope : "all";

  const sessionsQueryKey = `/api/play/sessions?level=${sessionsLevelParam}&sport=${activeSport}&scope=${effectiveScope}`;

  const { data: sessions, isLoading: sessionsLoading } = useQuery<PlaySession[]>({
    queryKey: [sessionsQueryKey],
  });

  const nearbyPlayersQueryKey = discoverFilter !== "all" 
    ? `/api/play/nearby-players?filter=${discoverFilter}&sport=${activeSport}&travelTime=true&scope=${effectiveScope}` 
    : `/api/play/nearby-players?sport=${activeSport}&travelTime=true&scope=${effectiveScope}`;
  const { data: nearbyPlayers, isLoading: playersLoading } = useQuery<NearbyPlayer[]>({
    queryKey: [nearbyPlayersQueryKey],
  });

  // Filter and limit players based on search and showAll state
  const filteredPlayers = useMemo(() => {
    if (!nearbyPlayers) return [];
    
    let filtered = nearbyPlayers;
    
    // Apply search filter
    if (playerSearchQuery.trim()) {
      const query = playerSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.vibe?.toLowerCase().includes(query)
      );
    }
    
    // Apply ball level filter for players FIRST
    if (selectedPlayerLevel !== "all") {
      filtered = filtered.filter(p => {
        const level = p.ballLevel?.toLowerCase() || "";
        return level.includes(selectedPlayerLevel) || selectedPlayerLevel.includes(level);
      });
    }
    
    return filtered;
  }, [nearbyPlayers, playerSearchQuery, selectedPlayerLevel]);

  const DAY_LABELS = ["all", "mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  
  const getDayOfWeek = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return days[date.getDay()];
  };

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    
    // API already handles level filtering; only apply day filter client-side
    let filtered = sessions.filter(s => s.sessionType === "group");
    
    if (selectedDay !== "all") {
      filtered = filtered.filter(s => getDayOfWeek(s.startTime) === selectedDay);
    }
    
    return filtered;
  }, [sessions, selectedDay]);

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/join`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Joined!", data.message || "You're in the session!");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
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
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/waitlist`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string; position?: number }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Waitlist", data.message || `You're #${data.position} on the waitlist!`);
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
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
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/leave`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Left Session", data.message || "You've left the session");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
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
      const response = await apiRequest("DELETE", `/api/play/sessions/${sessionId}/waitlist`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Removed", data.message || "You've been removed from the waitlist");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
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
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/waitlist/claim`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Spot Claimed!", data.message || "You've successfully claimed your spot!");
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/play/sessions") });
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
      ]
    );
  };

  const handleClaimWaitlistSpot = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setJoiningSessionId(sessionId);
    claimWaitlistSpotMutation.mutate(sessionId);
  };

  const handleJoinSession = (sessionId: string) => {
    logger.log("[PlayScreen] handleJoinSession called with sessionId:", sessionId);
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
    const effectiveMax = session.sessionType === "semi_private" ? Math.min(session.maxPlayers, 2) : session.maxPlayers;
    const spotsLeft = effectiveMax - session.currentPlayers;
    const playerCount = `${session.currentPlayers}/${effectiveMax}`;
    
    if (spotsLeft <= 0) {
      return { text: `Full (${playerCount})`, color: Colors.dark.error, bgColor: Colors.dark.error + "40" };
    }
    if (spotsLeft === 1) {
      return { text: `Almost Full (${playerCount})`, color: Colors.dark.orange, bgColor: Colors.dark.orange + "40" };
    }
    return { text: `${spotsLeft} spots left (${playerCount})`, color: Colors.dark.primary, bgColor: Colors.dark.primary + "40" };
  };

  const getLevelRangeText = (session: PlaySession) => {
    if (session.minLevel && session.maxLevel) {
      return `Lv ${session.minLevel}-${session.maxLevel}`;
    }
    if (session.minLevel) return `Lv ${session.minLevel}+`;
    if (session.maxLevel) return `Lv 1-${session.maxLevel}`;
    return "All Levels";
  };

  const getWaitlistClaimCountdown = (offeredAt: string, claimWindowMinutes: number): string => {
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
    const effectiveMax = session.sessionType === "semi_private" ? Math.min(session.maxPlayers, 2) : session.maxPlayers;
    // Use server-provided status which accounts for offered waitlist spots as reserved seats
    const isFull = session.status === "full";
    const isJoining = joiningSessionId === session.id;
    const backgroundImage = session.courtImageUrl ? { uri: session.courtImageUrl } : courtBackground;
    const sessionLevelColor = getBallLevelColor(session.ballLevel || "");
    const isOffered = session.isOnWaitlist && session.waitlistStatus === "offered";

    return (
      <View 
        key={session.id} 
        style={[
          styles.epicSessionCard,
          { borderWidth: 2, borderColor: sessionLevelColor + "60", shadowColor: sessionLevelColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8 }
        ]}
      >
        <ImageBackground 
          source={backgroundImage} 
          style={styles.cardBackground}
          imageStyle={styles.cardBackgroundImage}
        >
          <LinearGradient
            colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.9)"]}
            style={styles.cardOverlay}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleSection}>
                  <View style={styles.titleWithBadges}>
                    <Text style={styles.epicSessionTitle}>{getCleanSessionTitle(session)}</Text>
                    <View style={styles.inlineBadgesRow}>
                      <View style={styles.epicXpBadgeSmall}>
                        <Ionicons name="flame" size={12} color={Colors.dark.orange} />
                        <Text style={styles.epicXpTextSmall}>+{session.xpReward} XP</Text>
                      </View>
                      {(() => {
                        const countdown = getCountdownText(session.startTime);
                        return (
                          <View style={[styles.countdownBadgeSmall, countdown.urgent && styles.countdownUrgent]}>
                            <Ionicons 
                              name="timer-outline" 
                              size={11} 
                              color={countdown.urgent ? Colors.dark.error : Colors.dark.xpCyan} 
                            />
                            <Text style={[styles.countdownTextSmall, countdown.urgent && styles.countdownTextUrgent]}>
                              {countdown.text}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                  {session.ballLevel && getBallLevelLabel(session.ballLevel) && (
                    <Text style={[styles.ballLevelBadgeText, { color: getBallLevelColor(session.ballLevel) }]}>
                      {getBallLevelLabel(session.ballLevel)}
                    </Text>
                  )}
                  <Pressable
                    style={styles.epicLocationRow}
                    onPress={session.academyId ? () => navigation.navigate("AcademyPublicProfile" as never, { academyId: session.academyId } as never) : undefined}
                    disabled={!session.academyId}
                  >
                    <Ionicons name="location" size={14} color={Colors.dark.primary} />
                    <Text style={styles.epicLocationText}>{session.locationName}</Text>
                  </Pressable>
                  {session.coachName ? (
                    <View style={styles.epicCoachRow}>
                      <Ionicons name="person" size={13} color={Colors.dark.xpCyan} />
                      <Text style={styles.epicCoachText}>Coach {session.coachName}</Text>
                      {session.coachAverageRating != null && session.coachAverageRating > 0 ? (
                        <>
                          <Ionicons
                            name="star"
                            size={12}
                            color={session.coachAverageRating >= 4.5 ? Colors.dark.primary : Colors.dark.textMuted}
                            style={{ marginLeft: 6 }}
                          />
                          <Text style={[styles.epicCoachText, { color: session.coachAverageRating >= 4.5 ? Colors.dark.primary : Colors.dark.textMuted }]}>
                            {session.coachAverageRating.toFixed(1)}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                  {session.academyAverageRating != null && session.academyAverageRating > 0 ? (
                    <View style={styles.epicCoachRow}>
                      <Ionicons name="business-outline" size={13} color={Colors.dark.textMuted} />
                      <Text style={styles.epicCoachText}>at {session.locationName}</Text>
                      <Ionicons
                        name="star"
                        size={12}
                        color={session.academyAverageRating >= 4.5 ? Colors.dark.primary : Colors.dark.textMuted}
                        style={{ marginLeft: 6 }}
                      />
                      <Text style={[styles.epicCoachText, { color: session.academyAverageRating >= 4.5 ? Colors.dark.primary : Colors.dark.textMuted }]}>
                        {session.academyAverageRating.toFixed(1)}
                      </Text>
                    </View>
                  ) : null}
                  {session.sessionAcademyId && session.sessionAcademyId !== playerAcademyId && session.sessionAcademyName ? (
                    <Pressable
                      style={styles.crossAcademyBadge}
                      onPress={() => navigation.navigate("AcademyProfile" as never, { academyId: session.sessionAcademyId } as never)}
                      hitSlop={8}
                    >
                      <Ionicons name="business-outline" size={12} color={Colors.dark.textMuted} />
                      <Text style={styles.crossAcademyBadgeText}>{session.sessionAcademyName}</Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.epicMetaRow}>
                    <Ionicons name="time-outline" size={13} color={Colors.dark.textMuted} />
                    <Text style={styles.epicMetaText}>{formatTime(session.startTime)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.epicActionsRow}>
                <View style={styles.epicStatusSection}>
                  <View style={[styles.epicStatusBadge, { backgroundColor: isOffered ? "#F59E0B40" : statusBadge.bgColor }]}>
                    <Text style={[styles.epicStatusText, { color: isOffered ? "#F59E0B" : statusBadge.color }]}>
                      {isOffered ? "Spot Offered!" : statusBadge.text}
                    </Text>
                  </View>
                  {session.isEnrolled ? (
                    <Pressable 
                      style={[styles.epicCancelButton, isJoining && styles.buttonDisabled]}
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
                          <Ionicons name="close-circle-outline" size={18} color="#FF6B6B" />
                          <Text style={styles.epicCancelButtonText}>Cancel</Text>
                        </>
                      )}
                    </Pressable>
                  ) : isOffered ? (
                    <View style={styles.waitlistOfferedContainer}>
                      <Text style={styles.waitlistClaimTimer}>
                        {session.offeredAt ? getWaitlistClaimCountdown(session.offeredAt, session.claimWindowMinutes || 30) : ""}
                      </Text>
                      <View style={styles.waitlistOfferedButtons}>
                        <Pressable
                          style={[styles.epicClaimButton, isJoining && styles.buttonDisabled]}
                          onPress={() => {
                            if (!isJoining) handleClaimWaitlistSpot(session.id);
                          }}
                        >
                          {isJoining ? (
                            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.buttonText} />
                              <Text style={styles.epicClaimButtonText}>Claim Spot</Text>
                            </>
                          )}
                        </Pressable>
                        <Pressable
                          style={styles.epicDeclineButton}
                          onPress={() => handleLeaveWaitlist(session.id)}
                        >
                          <Text style={styles.epicDeclineButtonText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : session.isOnWaitlist ? (
                    <View style={styles.waitlistStatusContainer}>
                      <View style={styles.waitlistPositionBadge}>
                        <Ionicons name="time-outline" size={14} color={Colors.dark.xpCyan} />
                        <Text style={styles.waitlistPositionText}>
                          {session.waitlistPosition != null ? `#${session.waitlistPosition} on waitlist` : "On waitlist"}
                        </Text>
                      </View>
                      <Pressable
                        style={[styles.epicLeaveWaitlistButton, isJoining && styles.buttonDisabled]}
                        onPress={() => {
                          if (!isJoining) handleLeaveWaitlist(session.id);
                        }}
                      >
                        {isJoining ? (
                          <ActivityIndicator size="small" color="#FF6B6B" />
                        ) : (
                          <Text style={styles.epicLeaveWaitlistText}>Leave Waitlist</Text>
                        )}
                      </Pressable>
                    </View>
                  ) : !isFull ? (
                    <Pressable 
                      style={[styles.epicJoinButton, isJoining && styles.buttonDisabled]}
                      onPress={() => {
                        logger.log("[PlayScreen] Join button pressed for session:", session.id);
                        if (!isJoining) {
                          handleJoinSession(session.id);
                        }
                      }}
                    >
                      {isJoining ? (
                        <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                      ) : (
                        <>
                          <Ionicons name="enter-outline" size={18} color={Colors.dark.buttonText} />
                          <Text style={styles.epicJoinButtonText}>Join Session</Text>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <Pressable 
                      style={[styles.epicWaitlistButton, isJoining && styles.buttonDisabled]}
                      onPress={() => {
                        logger.log("[PlayScreen] Waitlist button pressed for session:", session.id);
                        if (!isJoining) {
                          handleJoinWaitlist(session.id);
                        }
                      }}
                    >
                      {isJoining ? (
                        <ActivityIndicator size="small" color={Colors.dark.text} />
                      ) : (
                        <>
                          <Ionicons name="list-outline" size={16} color={Colors.dark.text} />
                          <Text style={styles.epicWaitlistButtonText}>Join Waitlist{session.waitlistCount > 0 ? ` (${session.waitlistCount})` : ""}</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Credit Cost Indicator */}
              <View style={styles.creditCostRow}>
                <Ionicons name="ticket-outline" size={14} color={hasCorporateCredits ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                <Text style={[styles.creditCostText, hasCorporateCredits ? { color: Colors.dark.xpCyan } : {}]}>
                  {hasCorporateCredits
                    ? `Company credit (${corporateData?.corporateAccount?.companyName})`
                    : `1 ${session.sessionType === "group" ? "Group" : "Semi-Private"} Credit`}
                </Text>
              </View>

              {/* Participants Section - Below buttons */}
              {session.players.length > 0 ? (
                <View style={styles.participantsRow}>
                  <View style={styles.epicAvatarStack}>
                    {session.players.slice(0, 6).map((player, index) => (
                      <View 
                        key={player.id} 
                        style={[
                          styles.epicAvatarCircle, 
                          { marginLeft: index > 0 ? -16 : 0, zIndex: 6 - index }
                        ]}
                      >
                        {player.avatarUrl ? (
                          Platform.OS === 'web' ? (
                            <RNImage 
                              source={{ uri: `${getStaticAssetsUrl()}${player.avatarUrl}` }} 
                              style={styles.epicAvatarImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <ExpoImage 
                              source={{ uri: `${getStaticAssetsUrl()}${player.avatarUrl}` }} 
                              style={styles.epicAvatarImage}
                              contentFit="cover"
                            />
                          )
                        ) : (
                          <LinearGradient
                            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundTertiary]}
                            style={styles.epicAvatarPlaceholder}
                          >
                            <Text style={styles.epicAvatarInitial}>{player.name.charAt(0).toUpperCase()}</Text>
                          </LinearGradient>
                        )}
                        {player.ballLevel === "glow" ? (
                          <View style={styles.epicGoldRing} />
                        ) : null}
                      </View>
                    ))}
                    {(session.players.length > 6 || session.currentPlayers > session.players.length) ? (
                      <View style={[styles.epicAvatarCircle, styles.epicAvatarMore, { marginLeft: -16 }]}>
                        <Text style={styles.epicAvatarMoreText}>
                          +{Math.max(session.players.length > 6 ? session.players.length - 6 : 0, session.currentPlayers - session.players.length)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.participantNamesRow}>
                    <Text style={styles.participantNamesText}>
                      {session.players.slice(0, 3).map(p => p.name.split(" ")[0]).join(", ")}
                      {session.players.length > 3 ? ` +${session.players.length - 3}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.sessionInfoButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSession(session);
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={20} color={Colors.dark.xpCyan} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.participantsRow}>
                  <Text style={[styles.participantNamesText, { color: Colors.dark.textMuted }]}>No players yet</Text>
                  <Pressable
                    style={styles.sessionInfoButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedSession(session);
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={20} color={Colors.dark.xpCyan} />
                  </Pressable>
                </View>
              )}

              {session.squadName ? (
                <View style={styles.epicSquadRow}>
                  <Ionicons name="radio" size={14} color={Colors.dark.primary} />
                  <Text style={styles.epicSquadName}>{session.squadName}</Text>
                  <View style={styles.epicSquadXpBadge}>
                    <Ionicons name="flame" size={12} color={Colors.dark.orange} />
                    <Text style={styles.epicSquadXp}>+{session.squadXpBonus || 2} Squad XP</Text>
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
      const response = await apiRequest("POST", `/api/player/connections/request`, { targetPlayerId: playerId });
      return await response.json();
    },
    onSuccess: () => {
      setFriendRequestSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      const msg = error.message.includes(": ") ? error.message.split(": ").slice(1).join(": ") : error.message;
      if (Platform.OS === "web") {
        window.alert(msg || "Could not send friend request");
      } else {
        Alert.alert("Oops", msg || "Could not send friend request");
      }
    },
  });

  const [courtsViewMode, setCourtsViewMode] = useState<"list" | "map">("list");
  const courtsMapRef = useRef<MapView>(null);
  const [nearbyCourtsLocation, setNearbyCourtsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const nearbyCourtsEnabled = locationPermission?.granted === true && nearbyCourtsLocation !== null;
  const nearbyCourtsQueryKey = nearbyCourtsEnabled
    ? `/api/play/nearby-courts?lat=${nearbyCourtsLocation!.lat}&lng=${nearbyCourtsLocation!.lng}`
    : null;
  const { data: nearbyCourts, isLoading: nearbyCourtsLoading } = useQuery<NearbyCourt[]>({
    queryKey: nearbyCourtsQueryKey ? [nearbyCourtsQueryKey] : ["__disabled_nearby_courts__"],
    enabled: nearbyCourtsEnabled,
  });

  useEffect(() => {
    if (!locationPermission?.granted) return;
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(loc => {
        setNearbyCourtsLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      })
      .catch(() => {});
  }, [locationPermission?.granted]);

  const renderCourtsNearYou = () => {
    if (!locationPermission) return null;
    if (!locationPermission.granted) {
      if (locationPermission.status === "denied" && !locationPermission.canAskAgain) {
        if (Platform.OS === "ios") return null;
        return (
          <View style={styles.courtsNearYouSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="location" size={20} color={Colors.dark.primary} />
                <Text style={styles.sectionTitle}>Courts Near You</Text>
              </View>
            </View>
            <View style={styles.locationPermissionBanner}>
              <Ionicons name="location-outline" size={18} color={Colors.dark.primary} />
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
            <Ionicons name="location-outline" size={18} color={Colors.dark.primary} />
            <Text style={styles.locationPermissionText}>
              Enable location to discover nearby courts
            </Text>
            <Text style={{ fontSize: 12, color: Colors.dark.primary, fontWeight: "600" }}>Enable</Text>
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
          <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginVertical: Spacing.md }} />
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
            <Ionicons name="tennisball-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={[styles.locationPermissionText, { color: Colors.dark.textMuted }]}>
              No courts found nearby
            </Text>
          </View>
        </View>
      );
    }
    const courtsWithCoords = nearbyCourts.filter(c => c.lat != null && c.lng != null);

    const fitMapToMarkers = () => {
      if (!courtsMapRef.current || courtsWithCoords.length === 0) return;
      const coords = courtsWithCoords.map(c => ({ latitude: c.lat!, longitude: c.lng! }));
      if (nearbyCourtsLocation) {
        coords.push({ latitude: nearbyCourtsLocation.lat, longitude: nearbyCourtsLocation.lng });
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
              style={[styles.courtsViewToggleBtn, courtsViewMode === "list" && styles.courtsViewToggleBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCourtsViewMode("list");
              }}
            >
              <Ionicons name="list" size={16} color={courtsViewMode === "list" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} />
            </Pressable>
            <Pressable
              style={[styles.courtsViewToggleBtn, courtsViewMode === "map" && styles.courtsViewToggleBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCourtsViewMode("map");
              }}
            >
              <Ionicons name="map" size={16} color={courtsViewMode === "map" ? Colors.dark.backgroundRoot : Colors.dark.textMuted} />
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
                    <View style={[styles.nearbyCourtSportBadge, { backgroundColor: court.isInternal ? Colors.dark.primary + "25" : Colors.dark.backgroundTertiary }]}>
                      <Ionicons
                        name={court.sport === "padel" ? "grid-outline" : "tennisball-outline"}
                        size={12}
                        color={court.isInternal ? Colors.dark.primary : Colors.dark.textMuted}
                      />
                      <Text style={[styles.nearbyCourtSportText, { color: court.isInternal ? Colors.dark.primary : Colors.dark.textMuted }]}>
                        {court.sport.charAt(0).toUpperCase() + court.sport.slice(1)}
                      </Text>
                    </View>
                    {court.isInternal ? (
                      <View style={styles.nearbyCourtInternalBadge}>
                        <Text style={styles.nearbyCourtInternalText}>Academy</Text>
                      </View>
                    ) : court.academyName ? (
                      <View style={styles.nearbyCourtExternalBadge}>
                        <Text style={styles.nearbyCourtExternalText} numberOfLines={1}>{court.academyName}</Text>
                      </View>
                    ) : null}
                  </View>
                  {court.distance != null ? (
                    <View style={styles.nearbyCourtDistanceBadge}>
                      <Ionicons name="navigate" size={10} color={Colors.dark.xpCyan} />
                      <Text style={styles.nearbyCourtDistanceText}>{court.distance} km away</Text>
                    </View>
                  ) : (
                    <View style={[styles.nearbyCourtDistanceBadge, { backgroundColor: Colors.dark.backgroundTertiary }]}>
                      <Ionicons name="location-outline" size={10} color={Colors.dark.textMuted} />
                      <Text style={[styles.nearbyCourtDistanceText, { color: Colors.dark.textMuted }]}>No location set</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.nearbyCourtName} numberOfLines={2}>{court.name}</Text>
                {court.address ? (
                  <Text style={styles.nearbyCourtAddress} numberOfLines={1}>{court.address}</Text>
                ) : null}
                {court.surface && court.surface !== "unknown" ? (
                  <View style={styles.nearbyCourtSurfaceChip}>
                    <Text style={styles.nearbyCourtSurfaceText}>{court.surface.charAt(0).toUpperCase() + court.surface.slice(1)}</Text>
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
                        openMapsDirections({ lat: court.lat, lng: court.lng, label: court.name });
                      }}
                    >
                      <Ionicons name="navigate-outline" size={14} color={Colors.dark.primary} />
                      <Text style={styles.nearbyCourtDirectionsBtnText}>Directions</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : Platform.OS === "web" ? (
          <View style={styles.courtsMapWebFallback}>
            <Ionicons name="map-outline" size={32} color={Colors.dark.textMuted} />
            <Text style={styles.courtsMapWebFallbackText}>Open the app in Expo Go to view the interactive courts map</Text>
          </View>
        ) : (
          <View style={styles.courtsMapContainer}>
            <MapView
              ref={courtsMapRef}
              style={styles.courtsMap}
              provider={PROVIDER_DEFAULT}
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
                <Marker
                  key={court.id}
                  coordinate={{ latitude: court.lat!, longitude: court.lng! }}
                  pinColor={court.isInternal ? Colors.dark.primary : Colors.dark.textMuted}
                >
                  <Callout tooltip={false}>
                    <View style={styles.courtsMapCallout}>
                      <Text style={styles.courtsMapCalloutName} numberOfLines={2}>{court.name}</Text>
                      <View style={styles.courtsMapCalloutMeta}>
                        {court.surface && court.surface !== "unknown" ? (
                          <Text style={styles.courtsMapCalloutSurface}>
                            {court.surface.charAt(0).toUpperCase() + court.surface.slice(1)}
                          </Text>
                        ) : null}
                        {court.distance != null ? (
                          <Text style={styles.courtsMapCalloutDistance}>{court.distance} km away</Text>
                        ) : null}
                      </View>
                      {court.isInternal && court.bookingEnabled ? (
                        <Pressable
                          style={styles.courtsMapCalloutBookBtn}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            navigation.navigate("BookCourt" as never);
                          }}
                        >
                          <Text style={styles.courtsMapCalloutBookBtnText}>Book</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Callout>
                </Marker>
              ))}
            </MapView>
          </View>
        )}
      </View>
    );
  };

  const renderPlayerCard = (player: NearbyPlayer) => {
    const ballColor = getBallLevelColor(player.ballLevel || "");
    const baseBallLabel = getBallLevelLabel(player.ballLevel || "");
    const ballLabel = player.skillLevel ? `${baseBallLabel} ${player.skillLevel}` : baseBallLabel;
    const online = isOnlineNow(player.lastOnlineAt);
    const lastSeenText = formatLastSeen(player.lastOnlineAt);
    
    return (
      <Pressable 
        key={player.id} 
        style={styles.compactPlayerCard}
        onPress={() => navigation.navigate("PublicProfile", { playerId: player.id })}
      >
        <View style={[styles.compactAvatarRing, { borderColor: online ? "#22C55E" : ballColor }]}>
          {player.avatarUrl && !brokenAvatars.has(player.id) ? (
            <ExpoImage 
              source={{ uri: buildPhotoUrl(player.avatarUrl) ?? undefined }}
              style={styles.compactAvatarImage}
              contentFit="cover"
              onError={() => setBrokenAvatars(prev => new Set([...prev, player.id]))}
            />
          ) : (
            <View style={[styles.compactAvatarPlaceholder, { backgroundColor: ballColor + "30" }]}>
              <Text style={[styles.compactAvatarLetter, { color: ballColor }]}>
                {player.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {(online || player.openToPlay) ? (
            <View style={[styles.compactOnlineDot, online ? styles.compactOnlineDotActive : null]} />
          ) : null}
        </View>

        <View style={styles.compactPlayerInfo}>
          <Text style={styles.compactPlayerName} numberOfLines={1}>{player.name}</Text>
          <View style={styles.compactBadgeRow}>
            <View style={[styles.compactLevelBadge, { backgroundColor: ballColor + "25" }]}>
              <Text style={[styles.compactLevelText, { color: ballColor }]}>{ballLabel}</Text>
            </View>
            {online ? (
              <View style={styles.compactOnlineBadge}>
                <View style={styles.compactOnlinePulse} />
                <Text style={styles.compactOnlineText}>Online</Text>
              </View>
            ) : (
              <View style={styles.compactLastSeenBadge}>
                <Ionicons name="time-outline" size={10} color={Colors.dark.textSubtle} />
                <Text style={styles.compactLastSeenText}>{lastSeenText}</Text>
              </View>
            )}
            {player.hasHomeAddress ? (
              <View style={styles.homeAddressBadge}>
                <Ionicons name="home" size={10} color={Colors.dark.xpCyan} />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.compactActions}>
          <Pressable 
            style={styles.compactFriendBtn} 
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setFriendRequestPlayer(player);
              setFriendRequestSent(false);
            }}
          >
            <Ionicons name="person-add" size={16} color={Colors.dark.text} />
          </Pressable>
          <Pressable 
            style={styles.compactChallengeBtn} 
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              navigation.navigate("ChallengePlayer", { opponentId: player.id, opponentName: player.name, opponentBallLevel: player.ballLevel, opponentLevel: player.level } as never);
            }}
          >
            <Ionicons name="flash" size={12} color={Colors.dark.buttonText} />
            <Text style={styles.compactChallengeText}>Challenge</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.animatedHeader, { top: insets.top }, animatedHeaderStyle]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeaderHeight(h);
          headerHeightSV.value = h;
        }}
      >
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerLine} />
            <Text style={styles.headerTitle}>{t("player.play.title")}</Text>
            <View style={styles.headerLine} />
          </View>
          {isFamily ? (
            <View style={styles.familySwitchRow}>
              <FamilyQuickSwitch />
              {activePlayerId && familyData ? (
                <Text style={styles.familyViewingText}>
                  Viewing for {familyData.members.find(m => m.id === activePlayerId)?.name || ""}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {activeTab === "Group Lessons" ? (
          <>
            {isMultiSport ? <SportSwitcherChips style={styles.sportChipsRow} /> : null}

            {/* Unified Play Hub */}
            <View style={styles.quickActions}>
              <Pressable 
                style={styles.findMatchButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setPlayModalStep(isMultiSport ? "sport" : "type");
                  setShowPlayModal(true);
                }}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.findMatchGradient}
                >
                  <Ionicons name="flame" size={20} color={Colors.dark.buttonText} />
                  <Text style={styles.findMatchText}>
                    {isMultiSport ? `Play ${getSportLabel(activeSport)}` : t("player.play.findMatch")}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable 
                style={styles.openMatchesButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("OpenMatches" as never);
                }}
              >
                <LinearGradient
                  colors={[Colors.dark.xpCyan, "#00A3D9"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.findMatchGradient}
                >
                  <Ionicons name="tennisball" size={18} color={Colors.dark.buttonText} />
                  <Text style={styles.findMatchText}>{t("player.play.openMatches")}</Text>
                </LinearGradient>
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
              <Pressable style={styles.playModalOverlay} onPress={() => {
                setShowPlayModal(false);
                setPlayModalStep(isMultiSport ? "sport" : "type");
              }}>
                <View style={styles.playModalSheet}>
                  <View style={styles.playModalHandle} />
                  {playModalStep === "sport" ? (
                    <>
                      <Text style={styles.playModalTitle}>Choose a sport</Text>
                      {SPORT_DEFINITIONS.filter(s => activeSports.includes(s.key)).map(sport => (
                        <Pressable
                          key={sport.key}
                          style={[styles.playModalOption, { borderWidth: 1, borderColor: sport.color + "40", backgroundColor: sport.color + "10", borderRadius: 14 }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setActiveSport(sport.key);
                            setPlayModalStep("type");
                          }}
                        >
                          <View style={styles.playModalSportRow}>
                            <Ionicons name={getSportIcon(sport.key) as keyof typeof Ionicons.glyphMap} size={22} color={sport.color} />
                            <Text style={[styles.playModalOptionTitle, { color: sport.color }]}>{sport.label}</Text>
                            <Ionicons name="chevron-forward" size={18} color={sport.color} />
                          </View>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <>
                      <Text style={styles.playModalTitle}>
                        {isMultiSport ? `${getSportLabel(activeSport)} — What are you looking for?` : "What are you looking for?"}
                      </Text>
                      {isMultiSport ? (
                        <Pressable style={styles.playModalBackRow} onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setPlayModalStep("sport");
                        }}>
                          <Ionicons name="chevron-back" size={14} color={Colors.dark.textMuted} />
                          <Text style={styles.playModalBackText}>Change sport</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={styles.playModalOption}
                        onPress={() => {
                          setShowPlayModal(false);
                          setPlayModalStep(isMultiSport ? "sport" : "type");
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          navigation.navigate("CreateMatch" as never);
                        }}
                      >
                        <LinearGradient
                          colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.playModalOptionGradient}
                        >
                          <Ionicons name="flame" size={22} color={Colors.dark.buttonText} />
                          <View style={styles.playModalOptionText}>
                            <Text style={styles.playModalOptionTitle}>Find a Match</Text>
                            <Text style={styles.playModalOptionDesc}>Challenge a player to a 1v1 match</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={Colors.dark.buttonText} />
                        </LinearGradient>
                      </Pressable>
                      <Pressable
                        style={styles.playModalOption}
                        onPress={() => {
                          setShowPlayModal(false);
                          setPlayModalStep(isMultiSport ? "sport" : "type");
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          navigation.navigate("FindGame" as never);
                        }}
                      >
                        <LinearGradient
                          colors={["#00E5FF", "#00A3D9"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.playModalOptionGradient}
                        >
                          <Ionicons name="people-circle-outline" size={22} color={Colors.dark.buttonText} />
                          <View style={styles.playModalOptionText}>
                            <Text style={styles.playModalOptionTitle}>Find a Game</Text>
                            <Text style={styles.playModalOptionDesc}>Join a group session or social game</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={Colors.dark.buttonText} />
                        </LinearGradient>
                      </Pressable>
                    </>
                  )}
                </View>
              </Pressable>
            </Modal>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bookingToolsScroll} contentContainerStyle={styles.bookingToolsRow}>
              <Pressable
                style={styles.bookingToolButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("MyGames" as never);
                }}
              >
                <View style={styles.bookingToolIcon}>
                  <Ionicons name="calendar-number-outline" size={18} color={Colors.dark.gold} />
                </View>
                <Text style={styles.bookingToolText}>My Games</Text>
              </Pressable>
              <Pressable 
                style={[styles.bookingToolButton, pendingInvitesCount > 0 && styles.bookingToolButtonActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("BookingInvites" as never);
                }}
              >
                <View style={styles.bookingToolIcon}>
                  <Ionicons name="mail" size={18} color={pendingInvitesCount > 0 ? Colors.dark.primary : Colors.dark.gold} />
                  {pendingInvitesCount > 0 ? (
                    <View style={styles.invitesBadge}>
                      <Text style={styles.invitesBadgeText}>{pendingInvitesCount}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.bookingToolText, pendingInvitesCount > 0 && { color: Colors.dark.primary }]}>
                  {t("player.play.invites")}{pendingInvitesCount > 0 ? ` (${pendingInvitesCount})` : ""}
                </Text>
              </Pressable>

              <Pressable 
                style={styles.bookingToolButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("BookingPreferences" as never);
                }}
              >
                <View style={styles.bookingToolIcon}>
                  <Ionicons name="options" size={18} color={Colors.dark.primary} />
                </View>
                <Text style={styles.bookingToolText}>{t("player.play.preferences")}</Text>
              </Pressable>
            </ScrollView>
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
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === "Group Lessons" ? t("player.play.groupLessons") : t("player.play.players")}</Text>
          </Pressable>
        ))}
        </View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 200 }]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {locationPermission !== null && !locationPermission.granted && locationPermission.status === "denied" && !locationPermission.canAskAgain && Platform.OS === "ios" ? (
          <Pressable
            style={styles.topLocationBanner}
            onPress={async () => {
              try { await Linking.openSettings(); } catch {}
            }}
          >
            <Ionicons name="location-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.topLocationBannerText}>
              Allow location to see courts nearby and find players close to you
            </Text>
            <Text style={styles.topLocationBannerAction}>Open Settings</Text>
          </Pressable>
        ) : null}

        {activeTab === "Group Lessons" ? (
          <>
            {playerAcademyId ? (
              <View style={styles.scopeToggleContainer}>
                <Pressable
                  style={[styles.scopeToggleBtn, scope === "mine" && styles.scopeToggleBtnActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleScopeChange("mine"); }}
                >
                  <Text style={[styles.scopeToggleText, scope === "mine" && styles.scopeToggleTextActive]}>My Academy</Text>
                </Pressable>
                <Pressable
                  style={[styles.scopeToggleBtn, scope === "all" && styles.scopeToggleBtnActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleScopeChange("all"); }}
                >
                  <Text style={[styles.scopeToggleText, scope === "all" && styles.scopeToggleTextActive]}>Discover All</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.filterContainer}>
              <View style={styles.filterMainRow}>
                <Pressable
                  style={[
                    styles.filterChip,
                    selectedBallLevel === "my_level" && { backgroundColor: getBallLevelColor(playerBallLevel) + "30", borderColor: getBallLevelColor(playerBallLevel) },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedBallLevel("my_level");
                    setShowOtherLevels(false);
                  }}
                >
                  <View style={[styles.filterDot, { backgroundColor: getBallLevelColor(playerBallLevel) }]} />
                  <Text style={[styles.filterChipText, selectedBallLevel === "my_level" && { color: getBallLevelColor(playerBallLevel) }]}>
                    My Level{playerBallLevel !== "glow" ? ` (${playerBallLevel.charAt(0).toUpperCase() + playerBallLevel.slice(1)})` : ""}
                  </Text>
                </Pressable>
                
                <Pressable
                  style={[
                    styles.otherLevelsToggle,
                    showOtherLevels && styles.otherLevelsToggleActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowOtherLevels(!showOtherLevels);
                    if (!showOtherLevels) {
                      setSelectedBallLevel("all");
                    } else {
                      setSelectedBallLevel("my_level");
                    }
                  }}
                >
                  <Ionicons 
                    name={showOtherLevels ? "people" : "people-outline"} 
                    size={16} 
                    color={showOtherLevels ? Colors.dark.primary : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.otherLevelsToggleText, showOtherLevels && { color: Colors.dark.primary }]}>
                    {showOtherLevels ? t("player.play.browsingAllLevels") : t("player.play.lookingForSomeoneElse")}
                  </Text>
                  <Ionicons 
                    name={showOtherLevels ? "chevron-up" : "chevron-down"} 
                    size={14} 
                    color={showOtherLevels ? Colors.dark.primary : Colors.dark.textMuted} 
                  />
                </Pressable>
              </View>
              
              {showOtherLevels && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  style={styles.filterRow}
                  contentContainerStyle={styles.filterRowContent}
                >
                  {(["all", "blue", "red", "orange", "green", "yellow", "glow"] as const).map((level) => {
                    const isSelected = selectedBallLevel === level;
                    const color = level === "all" ? Colors.dark.textMuted : getBallLevelColor(level);
                    const label = level === "all" ? t("player.play.allLevels") : level.charAt(0).toUpperCase() + level.slice(1);
                    
                    return (
                      <Pressable
                        key={level}
                        style={[
                          styles.filterChip,
                          isSelected && { backgroundColor: color + "30", borderColor: color },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedBallLevel(level);
                        }}
                      >
                        <View style={[styles.filterDot, { backgroundColor: color }]} />
                        <Text style={[styles.filterChipText, isSelected && { color }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.filterRow}
                contentContainerStyle={styles.filterRowContent}
              >
                {DAY_LABELS.map((day) => {
                  const isSelected = selectedDay === day;
                  const label = day === "all" ? t("player.play.allDays") : day.toUpperCase();
                  
                  return (
                    <Pressable
                      key={day}
                      style={[
                        styles.dayChip,
                        isSelected && styles.dayChipSelected,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDay(day);
                      }}
                    >
                      <Text style={[styles.dayChipText, isSelected && styles.dayChipTextSelected]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            {sessionsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.dark.primary} />
                <Text style={styles.loadingText}>{t("player.play.findingGroupLessons")}</Text>
              </View>
            ) : filteredSessions.length > 0 ? (
              (() => {
                if (effectiveScope === "all" && playerAcademyId) {
                  const mySessions = filteredSessions.filter(s => s.sessionAcademyId === playerAcademyId || !s.sessionAcademyId);
                  const otherSessions = filteredSessions.filter(s => s.sessionAcademyId && s.sessionAcademyId !== playerAcademyId);
                  return (
                    <>
                      {mySessions.length > 0 ? (
                        <>
                          <View style={styles.sectionDivider}>
                            <View style={styles.sectionDividerLine} />
                            <Text style={styles.sectionDividerText}>YOUR ACADEMY</Text>
                            <View style={styles.sectionDividerLine} />
                          </View>
                          {mySessions.map(renderSessionCard)}
                        </>
                      ) : null}
                      {otherSessions.length > 0 ? (
                        <>
                          <View style={styles.sectionDivider}>
                            <View style={styles.sectionDividerLine} />
                            <Text style={styles.sectionDividerText}>DISCOVER NEARBY</Text>
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
                <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>{t("player.play.noGroupLessons")}</Text>
                <Text style={styles.emptySubtitle}>
                  {effectiveScope === "all"
                    ? "No public lessons near you yet. Check back soon."
                    : effectiveScope === "mine" && playerAcademyId
                    ? "No upcoming group sessions at your academy"
                    : selectedBallLevel === "my_level" 
                    ? `${t("player.play.noLevelLessons", { level: playerBallLevel.toUpperCase() })}`
                    : selectedBallLevel !== "all" 
                    ? `${t("player.play.noLevelLessons", { level: selectedBallLevel.toUpperCase() })}` 
                    : t("player.play.checkBackSoon")}
                </Text>
              </View>
            )}
            {renderCourtsNearYou()}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="people" size={20} color={Colors.dark.textMuted} />
                <Text style={styles.sectionTitle}>{t("player.play.playersNearby")}</Text>
                {nearbyPlayers && nearbyPlayers.length > 0 ? (
                  <Text style={styles.playerCount}>({nearbyPlayers.length})</Text>
                ) : null}
              </View>
            </View>

            {playerAcademyId ? (
              <View style={styles.scopeToggleContainer}>
                <Pressable
                  style={[styles.scopeToggleBtn, scope === "mine" && styles.scopeToggleBtnActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleScopeChange("mine"); }}
                >
                  <Text style={[styles.scopeToggleText, scope === "mine" && styles.scopeToggleTextActive]}>My Academy</Text>
                </Pressable>
                <Pressable
                  style={[styles.scopeToggleBtn, scope === "all" && styles.scopeToggleBtnActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleScopeChange("all"); }}
                >
                  <Text style={[styles.scopeToggleText, scope === "all" && styles.scopeToggleTextActive]}>Discover All</Text>
                </Pressable>
              </View>
            ) : null}
            
            {/* Discovery Filter Chips */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.discoverFilterRow}
              contentContainerStyle={styles.discoverFilterContent}
            >
              {[
                { id: "all", label: t("player.play.allFilter"), icon: "people" },
                { id: "recommended", label: t("player.play.recommended"), icon: "star" },
                { id: "sameLevel", label: t("player.play.sameLevel"), icon: "bar-chart" },
                { id: "openToPlay", label: t("player.play.openToPlayFilter"), icon: "tennisball" },
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
                      color={isSelected ? Colors.dark.backgroundRoot : Colors.dark.primary} 
                    />
                    <Text style={[
                      styles.discoverChipText,
                      isSelected && styles.discoverChipTextActive,
                    ]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            
            {/* Search Bar */}
            <View style={styles.playerSearchContainer}>
              <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
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
                  <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
                </Pressable>
              ) : null}
            </View>
            
            {/* Ball Level Filter */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.filterRow}
              contentContainerStyle={styles.filterRowContent}
            >
              {(["all", "blue", "red", "orange", "green", "yellow", "glow"] as const).map((level) => {
                const isSelected = selectedPlayerLevel === level;
                const color = level === "all" ? Colors.dark.textMuted : getBallLevelColor(level);
                const label = level === "all" ? "ALL" : level.toUpperCase();
                const playerCount = nearbyPlayers?.filter(p => {
                  if (level === "all") return true;
                  const pLevel = p.ballLevel?.toLowerCase() || "";
                  return pLevel.includes(level);
                }).length || 0;
                
                return (
                  <Pressable
                    key={level}
                    style={[
                      styles.playerLevelChip,
                      isSelected && { backgroundColor: color + "30", borderColor: color },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedPlayerLevel(level);
                    }}
                  >
                    <View style={[styles.filterDot, { backgroundColor: color }]} />
                    <Text style={[styles.playerLevelChipText, isSelected && { color }]}>{label}</Text>
                    <Text style={[styles.playerLevelCount, isSelected && { color }]}>{playerCount}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            
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
                <Ionicons name="location" size={16} color={Colors.dark.primary} />
                <Text style={styles.locationPermissionText}>Enable location to find players near you</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.dark.primary} />
              </Pressable>
            )}
          {playersLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : filteredPlayers.length > 0 ? (
              <View style={styles.playersGrid}>
                {filteredPlayers.map(renderPlayerCard)}
              </View>
            ) : nearbyPlayers && nearbyPlayers.length > 0 && playerSearchQuery ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>{t("player.play.noResults")}</Text>
                <Text style={styles.emptySubtitle}>{t("player.play.noPlayersMatch", { query: playerSearchQuery })}</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>{t("player.play.noPlayersFound")}</Text>
                <Text style={styles.emptySubtitle}>
                  {effectiveScope === "mine" && playerAcademyId
                    ? "No players in your academy have the app yet"
                    : "No players found in your area"}
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
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedSession(null)}>
          <View style={styles.sessionInfoModal}>
            {selectedSession ? (
              <>
                <View style={styles.sessionInfoHeader}>
                  <Text style={styles.sessionInfoTitle}>{getCleanSessionTitle(selectedSession)}</Text>
                  <Pressable onPress={() => setSelectedSession(null)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
                {/* Venue photo from Google Place (proxy, no key exposure) */}
                {sessionPlaceDetails?.photoRef ? (
                  <ExpoImage
                    source={{ uri: `${apiUrl}/api/maps/place-photo?ref=${encodeURIComponent(sessionPlaceDetails.photoRef)}&maxwidth=800` }}
                    style={styles.sessionInfoVenuePhoto}
                    contentFit="cover"
                  />
                ) : null}
                <View style={styles.sessionInfoLocationRow}>
                  <Text style={styles.sessionInfoLocation}>
                    <Ionicons name="location" size={13} color={Colors.dark.primary} />
                    {" "}{selectedSession.locationName}
                    {selectedSession.courtName ? ` · ${selectedSession.courtName}` : ""}
                  </Text>
                  {sessionPlaceDetails?.rating ? (
                    <View style={styles.sessionInfoRatingBadge}>
                      <Ionicons name="star" size={11} color="#FFD700" />
                      <Text style={styles.sessionInfoRatingText}>
                        {sessionPlaceDetails.rating.toFixed(1)}
                        {sessionPlaceDetails.reviewCount ? ` (${sessionPlaceDetails.reviewCount > 999 ? "1k+" : sessionPlaceDetails.reviewCount})` : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sessionInfoTime}>
                  <Ionicons name="time-outline" size={13} color={Colors.dark.textMuted} />
                  {" "}{formatTime(selectedSession.startTime)}
                </Text>
                {selectedSession.coachName ? (
                  <Text style={styles.sessionInfoCoach}>
                    <Ionicons name="person" size={13} color={Colors.dark.xpCyan} />
                    {" "}Coach {selectedSession.coachName}
                  </Text>
                ) : null}
                {(selectedSession.locationLat != null && selectedSession.locationLng != null) ? (
                  <Pressable
                    style={styles.sessionInfoMapWrapper}
                    onPress={() => {
                      openMapsDirections({ lat: selectedSession.locationLat, lng: selectedSession.locationLng, label: selectedSession.locationName });
                    }}
                  >
                    <ExpoImage
                      source={{ uri: `${apiUrl}/api/maps/static-map?lat=${selectedSession.locationLat}&lng=${selectedSession.locationLng}&size=600x140` }}
                      style={styles.sessionInfoMap}
                      contentFit="cover"
                    />
                    <View style={styles.sessionInfoMapBadge}>
                      <Ionicons name="navigate" size={12} color="#FFFFFF" />
                      <Text style={styles.sessionInfoMapBadgeText}>Open in Maps</Text>
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
        <Pressable style={styles.modalOverlay} onPress={() => setFriendRequestPlayer(null)}>
          <View style={styles.friendRequestModal}>
            {friendRequestPlayer ? (
              <>
                <View style={[styles.friendModalAvatarRing, { borderColor: getBallLevelColor(friendRequestPlayer.ballLevel || "") }]}>
                  {friendRequestPlayer.avatarUrl ? (
                    <ExpoImage
                      source={{ uri: `${getStaticAssetsUrl()}${friendRequestPlayer.avatarUrl}` }}
                      style={styles.friendModalAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.friendModalAvatarPlaceholder, { backgroundColor: getBallLevelColor(friendRequestPlayer.ballLevel || "") + "30" }]}>
                      <Text style={[styles.friendModalAvatarLetter, { color: getBallLevelColor(friendRequestPlayer.ballLevel || "") }]}>
                        {friendRequestPlayer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.friendModalTitle}>
                  {friendRequestSent ? "Request Sent!" : "Send Friend Request"}
                </Text>
                <Text style={styles.friendModalName}>{friendRequestPlayer.name}</Text>
                
                {friendRequestPlayer.ballLevel ? (
                  <View style={[styles.friendModalLevelBadge, { backgroundColor: getBallLevelColor(friendRequestPlayer.ballLevel) + "25" }]}>
                    <Text style={[styles.friendModalLevelText, { color: getBallLevelColor(friendRequestPlayer.ballLevel) }]}>
                      {getBallLevelLabel(friendRequestPlayer.ballLevel)}
                    </Text>
                  </View>
                ) : null}

                {friendRequestSent ? (
                  <View style={styles.friendModalSentContainer}>
                    <Ionicons name="checkmark-circle" size={48} color={Colors.dark.primary} />
                    <Text style={styles.friendModalSentText}>Friend request sent successfully</Text>
                    <Pressable
                      style={styles.friendModalDoneBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalDoneBtnText}>Done</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.friendModalButtons}>
                    <Pressable
                      style={styles.friendModalCancelBtn}
                      onPress={() => setFriendRequestPlayer(null)}
                    >
                      <Text style={styles.friendModalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.friendModalSendBtn, sendFriendRequestMutation.isPending && { opacity: 0.6 }]}
                      onPress={() => {
                        if (!sendFriendRequestMutation.isPending) {
                          sendFriendRequestMutation.mutate(friendRequestPlayer.id);
                        }
                      }}
                    >
                      {sendFriendRequestMutation.isPending ? (
                        <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                      ) : (
                        <>
                          <Ionicons name="person-add" size={18} color={Colors.dark.buttonText} />
                          <Text style={styles.friendModalSendText}>Send Request</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
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

const styles = StyleSheet.create({
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
  quickActions: {
    flexDirection: "column",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  sportChipsRow: {
    marginBottom: Spacing.sm,
  },
  findMatchButton: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.primaryGlow + "60",
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
  openMatchesButton: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan + "60",
  },
  findMatchGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  findMatchText: {
    ...Typography.h4,
    color: Colors.dark.buttonText,
    fontWeight: "700",
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
  filterContainer: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  otherLevelsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  otherLevelsToggleActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  otherLevelsToggleText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "500",
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
    borderColor: Colors.dark.xpCyan + "40",
  },
  countdownTextSmall: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
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
    color: Colors.dark.xpCyan,
    fontWeight: "500",
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
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  countdownUrgent: {
    backgroundColor: Colors.dark.error + "20",
    borderColor: Colors.dark.error + "40",
  },
  countdownText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
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
  waitlistStatusContainer: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  waitlistPositionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  waitlistPositionText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
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
    backgroundColor: "rgba(255,255,255,0.1)",
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
  creditCostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
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
    borderTopColor: "rgba(255,255,255,0.1)",
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
    backgroundColor: Colors.dark.xpCyan + "25",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  compactDriveTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  compactLastSeenText: {
    fontSize: 10,
    color: Colors.dark.textSubtle,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
  bookingToolsScroll: {
    flexGrow: 0,
    marginBottom: Spacing.md,
  },
  bookingToolsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  bookingToolButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  bookingToolButtonActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  bookingToolIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    position: "relative",
  },
  invitesBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  invitesBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  bookingToolText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.xpCyan + "15",
  },
  nearbyCourtDistanceText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
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
    color: Colors.dark.xpCyan,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.xpCyan + "15",
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
    color: Colors.dark.xpCyan,
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
    color: "#0B0D10",
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
});
