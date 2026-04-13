import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  FlatList,
} from "react-native";
import { openDirections } from "@/lib/maps";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
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
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Typography, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest, apiFetch, getApiUrl, getStaticAssetsUrl } from "@/lib/query-client";
import { AnimatedCheck } from "@/components/AnimatedCheck";
import { SuccessToast } from "@/components/SuccessToast";
import BookingCoachCard from "./BookingCoachCard";
import CoachProfileDrawer from "./CoachProfileDrawer";
import { getSportLabel, getSportColor } from "@/player/context/SportContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Coach {
  id: string;
  name: string;
  profilePhotoUrl?: string | null;
  color?: string | null;
}

interface DirectoryCoach {
  id: string;
  name: string;
  photoUrl?: string | null;
  specialty?: string | null;
  yearsExperience?: string | null;
  specializations?: string[] | null;
  languages?: string[] | null;
  level?: number | null;
  openToOpportunities?: boolean | null;
  academyId?: string | null;
  academyName?: string | null;
  rating?: number | null;
  totalStudents?: number | null;
  bio?: string | null;
  certifications?: string[] | null;
  ballLevels?: string[] | null;
}

interface Location {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface AvailableSlot {
  coachId: string;
  coachName: string;
  coachPhotoUrl?: string | null;
  courtId: string;
  courtName: string;
  locationId: string;
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
  courtName: string;
  locationName: string;
  maxPlayers: number;
  currentPlayers: number;
  players: { id: string; name: string; profilePhotoUrl?: string | null }[];
  ballLevel?: string | null;
  skillLevel?: number | null;
  hasWaitlist?: boolean;
}

interface PlayerBookingWizardProps {
  visible: boolean;
  onClose: () => void;
  onBookingSuccess?: () => void;
  playerId?: string;
  playerBallLevel?: string | null;
  sport?: string;
}

type SessionType = "private" | "semi_private" | "group" | "open_play";
type BrowseMode = "by_time" | "by_coach";

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
    subtitle: "Train 1-on-1 with a coach",
    icon: "person",
    color: Colors.dark.primary,
    gradient: [Colors.dark.primary + "40", Colors.dark.primary + "10"],
  },
  {
    value: "group",
    label: "Group Session",
    subtitle: "Join other players",
    icon: "people",
    color: Colors.dark.orange,
    gradient: [Colors.dark.orange + "40", Colors.dark.orange + "10"],
  },
  {
    value: "semi_private",
    label: "Semi-Private",
    subtitle: "Train with 1 partner",
    icon: "people-outline",
    color: Colors.dark.xpCyan,
    gradient: [Colors.dark.xpCyan + "40", Colors.dark.xpCyan + "10"],
  },
  {
    value: "open_play",
    label: "Open Play",
    subtitle: "Just play & meet players",
    icon: "tennisball",
    color: Colors.dark.gold,
    gradient: [Colors.dark.gold + "40", Colors.dark.gold + "10"],
  },
];

const TOTAL_SLIDES = 5;
const SLIDE_TITLES = [
  "Choose Your Mode",
  "How to Browse",
  "Find Your Session",
  "Details",
  "Confirm & Book",
];

const DURATIONS = [30, 45, 60, 90, 120];

export default function PlayerBookingWizard({
  visible,
  onClose,
  onBookingSuccess,
  playerId,
  playerBallLevel,
  sport = "tennis",
}: PlayerBookingWizardProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const navigation = useNavigation<any>();
  // Current slide (0-4)
  const [currentSlide, setCurrentSlide] = useState(0);

  // Slide 0: Session Type
  const [sessionType, setSessionType] = useState<SessionType>("private");

  // Slide 1: Browse Mode (by time or by coach)
  const [browseMode, setBrowseMode] = useState<BrowseMode>("by_time");
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);

  // Slide 2: When & Where
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);

  // Slide 2: Pick Session
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedSession, setSelectedSession] = useState<JoinableSession | null>(null);
  const [isJoining, setIsJoining] = useState(false); // true = joining existing, false = requesting new

  // Court selection (can override the slot's pre-assigned court)
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [selectedCourtName, setSelectedCourtName] = useState<string | null>(null);

  // Slide 3: Details
  const [playerNote, setPlayerNote] = useState("");
  const [friendEmail, setFriendEmail] = useState("");

  // AI Focus suggestions
  const [aiFocusSuggestions, setAiFocusSuggestions] = useState<string[]>([]);
  const [aiFocusLoading, setAiFocusLoading] = useState(false);
  const [aiFocusFetched, setAiFocusFetched] = useState(false);

  // Slide 4: Confirm
  const [showSuccess, setShowSuccess] = useState(false);

  // Calendar modal
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  // Animation values
  const slideProgress = useSharedValue(0);
  const glowPulse = useSharedValue(0);
  const xpGain = useSharedValue(0);

  // Date string for API
  const selectedDateString = useMemo(() => {
    return `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
  }, [selectedDate]);

  // Fetch locations
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: visible,
  });

  // Build availability query URL with params
  // Note: We don't filter by locationId because coach_availability doesn't have location set
  const availabilityQueryUrl = useMemo(() => {
    const params = new URLSearchParams({
      date: selectedDateString,
      duration: duration.toString(),
    });
    // When browsing by coach, filter to that coach only
    if (browseMode === "by_coach" && selectedCoachId) {
      params.append("coachId", selectedCoachId);
    }
    
    return `/api/player/availability?${params}`;
  }, [selectedDateString, duration, browseMode, selectedCoachId]);

  // Fetch available slots using default queryFn
  // Enable when on slide 2 (When & Where) or later
  const { data: availableSlots = [], isLoading: slotsLoading, error: slotsError } = useQuery<AvailableSlot[]>({
    queryKey: [availabilityQueryUrl],
    enabled: visible && currentSlide >= 2,
  });

  // Build joinable sessions query URL with server-side filtering
  const joinableSessionsUrl = useMemo(() => {
    const params = new URLSearchParams({
      date: selectedDateString,
      sessionType,
    });
    if (sport) params.set("sport", sport);
    return `/api/player/joinable-sessions?${params}`;
  }, [selectedDateString, sessionType, sport]);

  // Fetch joinable sessions using the dedicated player endpoint (server-filtered)
  // Enable when on slide 2 (When & Where) or later
  const { data: joinableSessions = [], isLoading: sessionsLoading } = useQuery<JoinableSession[]>({
    queryKey: [joinableSessionsUrl],
    enabled: visible && currentSlide >= 2 && (sessionType === "group" || sessionType === "semi_private" || sessionType === "open_play"),
  });

  // Fetch available courts when a slot is selected (for court selection step)
  const availableCourtsUrl = useMemo(() => {
    if (!selectedSlot || isJoining) return null;
    const params = new URLSearchParams({
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
    });
    if (selectedSlot.locationId) {
      params.append("locationId", selectedSlot.locationId);
    }
    return `/api/player/available-courts?${params}`;
  }, [selectedSlot, isJoining]);

  const { data: availableCourts = [] } = useQuery<Array<{
    id: string;
    name: string;
    locationId: string | null;
    surface: string | null;
  }>>({
    queryKey: [availableCourtsUrl],
    enabled: !!availableCourtsUrl && visible,
  });

  // Fetch coaches for "browse by coach" mode
  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
    enabled: visible,
  });

  // Fetch all coaches from player's academy for coach selection screen
  const { data: academyCoachesData, isLoading: academyCoachesLoading } = useQuery<{ coaches: DirectoryCoach[] }>({
    queryKey: ["/api/player/academy-coaches"],
    queryFn: async () => {
      const response = await apiFetch("/api/player/academy-coaches");
      if (!response.ok) throw new Error("Failed to load coaches");
      return response.json();
    },
    enabled: visible,
  });
  const directoryCoaches = academyCoachesData?.coaches || [];

  // Coach profile drawer state
  const [showCoachDrawer, setShowCoachDrawer] = useState(false);
  const [selectedCoachForDrawer, setSelectedCoachForDrawer] = useState<DirectoryCoach | null>(null);

  // Dynamic slide count - add extra slide when browsing by coach
  const getTotalSlides = () => browseMode === "by_coach" ? 6 : 5;
  const getSlideTitle = (slide: number) => {
    if (browseMode === "by_coach") {
      const titles = ["Choose Your Mode", "How to Browse", "Select Coach", "Find Your Session", "Details", "Confirm & Book"];
      return titles[slide] || "";
    }
    return SLIDE_TITLES[slide] || "";
  };

  // Reset form on close
  const resetForm = useCallback(() => {
    setCurrentSlide(0);
    setSessionType("private");
    setBrowseMode("by_time");
    setSelectedCoachId(null);
    setSelectedDate(new Date());
    setSelectedLocationId(null);
    setDuration(60);
    setSelectedSlot(null);
    setSelectedSession(null);
    setIsJoining(false);
    setPlayerNote("");
    setFriendEmail("");
    setShowSuccess(false);
    setShowCoachDrawer(false);
    setSelectedCoachForDrawer(null);
    setAiFocusSuggestions([]);
    setAiFocusFetched(false);
    setSelectedCourtId(null);
    setSelectedCourtName(null);
  }, []);

  useEffect(() => {
    if (visible) {
      slideProgress.value = 0;
    } else {
      resetForm();
    }
  }, [visible]);

  // Animate slide progress
  useEffect(() => {
    const totalSlides = getTotalSlides();
    slideProgress.value = withSpring(currentSlide / (totalSlides - 1), {
      damping: 20,
      stiffness: 90,
    });
  }, [currentSlide, browseMode]);

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

  // Reset court override whenever the selected slot changes (prevents stale court from previous selection)
  useEffect(() => {
    setSelectedCourtId(null);
    setSelectedCourtName(null);
  }, [selectedSlot]);

  // Fetch AI focus suggestions when entering the Details slide
  const detailsSlideIndex = browseMode === "by_coach" ? 4 : 3;
  useEffect(() => {
    if (currentSlide === detailsSlideIndex && !aiFocusFetched && visible) {
      setAiFocusLoading(true);
      setAiFocusFetched(true);
      apiRequest("POST", "/api/player/booking-ai-focus", {})
        .then((res) => res.json())
        .then((data: any) => {
          const suggestions = data?.suggestions || [];
          setAiFocusSuggestions(suggestions);
        })
        .catch(() => {
          setAiFocusSuggestions([]);
        })
        .finally(() => {
          setAiFocusLoading(false);
        });
    }
  }, [currentSlide, detailsSlideIndex, aiFocusFetched, visible]);

  // Navigation
  const goNext = useCallback(() => {
    const totalSlides = getTotalSlides();
    if (currentSlide < totalSlides - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentSlide((prev) => prev + 1);
    }
  }, [currentSlide, browseMode]);

  const goBack = useCallback(() => {
    if (currentSlide > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  // Can proceed to next slide? (dynamic based on browse mode)
  const canProceed = useMemo(() => {
    if (browseMode === "by_coach") {
      // 6 slides: Mode -> Browse -> Coach -> Session -> Details -> Confirm
      switch (currentSlide) {
        case 0: return !!sessionType;
        case 1: return true; // Browse mode already selected
        case 2: return !!selectedCoachId; // Must select a coach
        case 3: return !!selectedSlot || !!selectedSession; // Find Session
        case 4: return true; // Details optional
        case 5: return true; // Confirm
        default: return false;
      }
    } else {
      // 5 slides: Mode -> Browse -> Session -> Details -> Confirm
      switch (currentSlide) {
        case 0: return !!sessionType;
        case 1: return true; // Browse mode
        case 2: return !!selectedSlot || !!selectedSession; // Find Session
        case 3: return true; // Details optional
        case 4: return true; // Confirm
        default: return false;
      }
    }
  }, [currentSlide, sessionType, browseMode, selectedCoachId, selectedSlot, selectedSession]);

  // Create booking request mutation - always uses booking request flow
  // For joining an existing session, we include the sessionId in the request
  const bookingMutation = useMutation({
    mutationFn: async (bookingData: any) => {
      // Both flows use booking requests - coach will approve
      return apiRequest("POST", "/api/player/booking-requests", bookingData);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccess(true);
      xpGain.value = withSequence(
        withTiming(1, { duration: 500 }),
        withDelay(2000, withTiming(0, { duration: 300 }))
      );
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setTimeout(() => {
        resetForm();
        if (onBookingSuccess) {
          onBookingSuccess();
        } else {
          onClose();
        }
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

  // Handle booking - both flows create booking requests for coach approval
  const handleBook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    if (isJoining && selectedSession) {
      // Request to join existing session
      const bookingData = {
        sessionId: selectedSession.id,
        coachId: selectedSession.coachId,
        requestedStart: selectedSession.startTime,
        requestedEnd: selectedSession.endTime,
        duration: selectedSession.duration,
        sessionType: selectedSession.sessionType,
        playerNote: playerNote || null,
        isJoinRequest: true,
      };
      bookingMutation.mutate(bookingData);
    } else if (selectedSlot) {
      // Request new session slot (use player-selected court if overridden, else slot's pre-assigned court)
      const bookingData = {
        coachId: selectedSlot.coachId,
        locationId: selectedSlot.locationId,
        courtId: selectedCourtId ?? selectedSlot.courtId,
        requestedStart: selectedSlot.startTime,
        requestedEnd: selectedSlot.endTime,
        duration: selectedSlot.duration,
        sessionType,
        playerNote: playerNote || null,
      };
      bookingMutation.mutate(bookingData);
    }
  }, [selectedSlot, selectedSession, isJoining, sessionType, playerNote, selectedCourtId, bookingMutation]);

  // Progress bar animated style
  const progressStyle = useAnimatedStyle(() => ({
    width: `${slideProgress.value * 100}%`,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.02]) }],
  }));

  const xpStyle = useAnimatedStyle(() => ({
    opacity: xpGain.value,
    transform: [
      { translateY: interpolate(xpGain.value, [0, 1], [20, 0]) },
      { scale: interpolate(xpGain.value, [0, 1], [0.8, 1]) },
    ],
  }));

  // Format time for display
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Format date for header
  const formatDateHeader = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  // SLIDE 0: Choose Your Mode
  const renderSessionTypeSlide = () => (
    <Animated.View entering={FadeIn} style={styles.slideContent}>
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
                {isSelected && <View style={[styles.glowOrb, { backgroundColor: type.color }]} />}
                <View style={[styles.sessionTypeIcon, { backgroundColor: type.color + "30" }]}>
                  <Ionicons name={type.icon} size={32} color={type.color} />
                </View>
                <Text style={[styles.sessionTypeLabel, isSelected && { color: type.color }]}>
                  {type.label}
                </Text>
                <Text style={styles.sessionTypeSubtitle}>{type.subtitle}</Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );

  // SLIDE 1: How to Browse (by time or by coach)
  const renderBrowseModeSlide = () => (
    <Animated.View entering={FadeIn} style={styles.slideContent}>
      <Text style={styles.slideSubtitle}>How would you like to find a session?</Text>
      
      <View style={styles.browseModeGrid}>
        {/* Browse by Time option */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setBrowseMode("by_time");
            setSelectedCoachId(null);
          }}
          style={[
            styles.browseModeCard,
            browseMode === "by_time" && { borderColor: Colors.dark.xpCyan, borderWidth: 2 },
          ]}
        >
          <LinearGradient
            colors={browseMode === "by_time" ? [Colors.dark.xpCyan + "40", Colors.dark.xpCyan + "10"] : [Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
            style={styles.browseModeCardGradient}
          >
            <View style={[styles.browseModeIcon, { backgroundColor: Colors.dark.xpCyan + "30" }]}>
              <Ionicons name="calendar" size={36} color={Colors.dark.xpCyan} />
            </View>
            <Text style={[styles.browseModeLabel, browseMode === "by_time" && { color: Colors.dark.xpCyan }]}>
              Browse by Time
            </Text>
            <Text style={styles.browseModeSubtitle}>See available courts & times first</Text>
          </LinearGradient>
        </Pressable>

        {/* Browse by Coach option */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setBrowseMode("by_coach");
          }}
          style={[
            styles.browseModeCard,
            browseMode === "by_coach" && { borderColor: Colors.dark.primary, borderWidth: 2 },
          ]}
        >
          <LinearGradient
            colors={browseMode === "by_coach" ? [Colors.dark.primary + "40", Colors.dark.primary + "10"] : [Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
            style={styles.browseModeCardGradient}
          >
            <View style={[styles.browseModeIcon, { backgroundColor: Colors.dark.primary + "30" }]}>
              <Ionicons name="person" size={36} color={Colors.dark.primary} />
            </View>
            <Text style={[styles.browseModeLabel, browseMode === "by_coach" && { color: Colors.dark.primary }]}>
              Choose Coach
            </Text>
            <Text style={styles.browseModeSubtitle}>Select your preferred coach first</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );

  // SLIDE 2 (only when by_coach): Select Coach - Premium coach cards
  const renderSelectCoachSlide = () => {
    const handleCoachSelect = (coach: DirectoryCoach) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedCoachId(coach.id);
    };

    const handleCoachInfoPress = (coach: DirectoryCoach) => {
      setSelectedCoachForDrawer(coach);
      setShowCoachDrawer(true);
    };

    const mapCoachForCard = (coach: DirectoryCoach) => ({
      id: coach.id,
      name: coach.name,
      profilePhotoUrl: coach.photoUrl,
      specialty: coach.specialty,
      yearsExperience: coach.yearsExperience,
      specializations: coach.specializations,
      ballLevels: coach.ballLevels,
      rating: coach.rating,
      totalStudents: coach.totalStudents,
      bio: coach.bio,
      availableForPrivate: true,
      availableForGroup: true,
    });

    const mapCoachForDrawer = (coach: DirectoryCoach) => ({
      id: coach.id,
      name: coach.name,
      profilePhotoUrl: coach.photoUrl,
      specialty: coach.specialty,
      yearsExperience: coach.yearsExperience,
      specializations: coach.specializations,
      ballLevels: coach.ballLevels,
      rating: coach.rating,
      totalStudents: coach.totalStudents,
      bio: coach.bio,
      certifications: coach.certifications,
      languages: coach.languages,
      availableForPrivate: true,
      availableForGroup: true,
    });

    return (
      <Animated.View entering={FadeIn} style={styles.slideContent}>
        <Text style={styles.slideSubtitle}>Choose your tennis coach</Text>
        
        {academyCoachesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GlowColors.primary} />
            <Text style={styles.loadingText}>Loading coaches...</Text>
          </View>
        ) : directoryCoaches.length === 0 ? (
          <View style={styles.emptyCoachesContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyCoachesText}>No coaches available</Text>
          </View>
        ) : (
          <FlatList
            data={directoryCoaches}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <BookingCoachCard
                coach={mapCoachForCard(item)}
                isSelected={selectedCoachId === item.id}
                onSelect={() => handleCoachSelect(item)}
                onInfoPress={() => handleCoachInfoPress(item)}
                index={index}
              />
            )}
            contentContainerStyle={styles.coachCardsContainer}
            showsVerticalScrollIndicator={false}
          />
        )}

        <CoachProfileDrawer
          visible={showCoachDrawer}
          onClose={() => setShowCoachDrawer(false)}
          onSelectCoach={() => {
            if (selectedCoachForDrawer) {
              setSelectedCoachId(selectedCoachForDrawer.id);
            }
          }}
          coach={selectedCoachForDrawer ? mapCoachForDrawer(selectedCoachForDrawer) : null}
        />
      </Animated.View>
    );
  };

  // SLIDE 2 or 3: Find Your Session (combined date/duration + available slots)
  const renderFindSessionSlide = () => {
    const isLoading = slotsLoading || sessionsLoading;

    // Combine joinable sessions and available slots for display
    const showJoinable = sessionType === "group" || sessionType === "semi_private";

    return (
      <Animated.View entering={FadeIn} style={styles.slideContent}>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {/* Date Selector */}
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>Date</Text>
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
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDate(date);
                  }}
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

          {/* Duration Selector */}
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>Duration</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationScroll}>
            {DURATIONS.map((dur) => {
              const isSelected = duration === dur;
              return (
                <Pressable
                  key={dur}
                  style={[styles.durationChip, isSelected && styles.durationChipSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setDuration(dur);
                  }}
                >
                  <Text style={[styles.durationChipText, isSelected && styles.durationChipTextSelected]}>
                    {dur} min
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Location Filter */}
          {locations.length > 0 && (
            <>
              <View style={[styles.sectionHeader, { marginTop: Spacing.md }]}>
                <Ionicons name="location" size={18} color={Colors.dark.xpCyan} />
                <Text style={styles.sectionTitle}>Location</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationScroll}>
                <Pressable
                  style={[styles.locationChip, selectedLocationId === null && styles.locationChipSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedLocationId(null);
                  }}
                >
                  <Text style={[styles.locationChipText, selectedLocationId === null && styles.locationChipTextSelected]}>
                    All
                  </Text>
                </Pressable>
                {locations.map((loc) => (
                  <Pressable
                    key={loc.id}
                    style={[styles.locationChip, selectedLocationId === loc.id && styles.locationChipSelected]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedLocationId(loc.id);
                      setSelectedSlot(null);
                    }}
                  >
                    <Text style={[styles.locationChipText, selectedLocationId === loc.id && styles.locationChipTextSelected]}>
                      {loc.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Available Sessions Section */}
          <View style={[styles.sectionHeader, { marginTop: Spacing.lg }]}>
            <Ionicons name="tennisball" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>
              {showJoinable ? "Available Sessions" : "Available Times"}
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
              <Text style={styles.loadingText}>Finding sessions...</Text>
            </View>
          ) : (
            <>
            {/* Joinable Sessions */}
            {showJoinable && joinableSessions.length > 0 && (
              <>
                <Text style={styles.sessionSectionTitle}>Join Existing Group</Text>
                {joinableSessions.map((session) => {
                  const isSelected = selectedSession?.id === session.id;
                  const spotsLeft = (session.maxPlayers || 6) - session.currentPlayers;
                  return (
                    <Pressable
                      key={session.id}
                      style={[styles.sessionCard, isSelected && styles.sessionCardSelected]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedSession(session);
                        setSelectedSlot(null);
                        setIsJoining(true);
                      }}
                    >
                      <LinearGradient
                        colors={isSelected ? [Colors.dark.primary + "30", Colors.dark.xpCyan + "10"] : [Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
                        style={styles.sessionCardGradient}
                      >
                        <View style={styles.sessionCardHeader}>
                          <View style={styles.sessionTimeRow}>
                            <Ionicons name="time" size={16} color={Colors.dark.xpCyan} />
                            <Text style={styles.sessionTime}>
                              {formatTime(session.startTime)} - {formatTime(session.endTime)}
                            </Text>
                          </View>
                          <View style={[styles.spotsBadge, spotsLeft <= 2 && styles.spotsBadgeHot]}>
                            <Text style={styles.spotsText}>
                              {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                            </Text>
                          </View>
                        </View>

                        <View style={styles.sessionCardInfo}>
                          <View style={styles.coachRow}>
                            <View style={styles.coachAvatar}>
                              <Text style={styles.coachAvatarText}>
                                {(session.coachName || "C").charAt(0)}
                              </Text>
                            </View>
                            <Text style={styles.coachName}>{session.coachName}</Text>
                          </View>

                          <View style={styles.locationRow}>
                            <Ionicons name="location" size={14} color={Colors.dark.textSecondary} />
                            <Text style={styles.locationText}>{session.locationName}</Text>
                          </View>

                          {/* Player avatars */}
                          <View style={styles.playersRow}>
                            {session.players.slice(0, 4).map((p, i) => (
                              <View key={p.id} style={[styles.playerAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i }]}>
                                <Text style={styles.playerAvatarText}>{(p.name || "P").charAt(0)}</Text>
                              </View>
                            ))}
                            {session.currentPlayers > 4 && (
                              <View style={[styles.playerAvatar, { marginLeft: -8 }]}>
                                <Text style={styles.playerAvatarText}>+{session.currentPlayers - 4}</Text>
                              </View>
                            )}
                            <Text style={styles.playersLabel}>
                              {session.currentPlayers}/{session.maxPlayers || 6} players
                            </Text>
                          </View>
                        </View>

                        {isSelected && (
                          <View style={styles.selectedBadge}>
                            <Ionicons name="checkmark-circle" size={24} color={Colors.dark.primary} />
                          </View>
                        )}
                      </LinearGradient>
                    </Pressable>
                  );
                })}
              </>
            )}

            {/* Available Slots for New Booking */}
            {availableSlots.filter(slot => !selectedLocationId || slot.locationId === selectedLocationId).length > 0 && (
              <>
                <Text style={styles.sessionSectionTitle}>
                  {showJoinable ? "Or Request New Session" : "Available Times"}
                </Text>
                {availableSlots.filter(slot => !selectedLocationId || slot.locationId === selectedLocationId).map((slot, index) => {
                  const isSelected = selectedSlot?.startTime === slot.startTime && selectedSlot?.coachId === slot.coachId;
                  return (
                    <Pressable
                      key={`${slot.coachId}-${slot.startTime}-${index}`}
                      style={[styles.slotCard, isSelected && styles.slotCardSelected]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedSlot(slot);
                        setSelectedSession(null);
                        setIsJoining(false);
                      }}
                    >
                      <View style={styles.slotTimeColumn}>
                        <Text style={[styles.slotTime, isSelected && styles.slotTimeSelected]}>
                          {formatTime(slot.startTime)}
                        </Text>
                        <Text style={styles.slotDuration}>{slot.duration}min</Text>
                      </View>

                      <View style={styles.slotInfoColumn}>
                        <View style={styles.coachRow}>
                          <View style={[styles.coachAvatarSmall, isSelected && { borderColor: Colors.dark.xpCyan }]}>
                            <Text style={styles.coachAvatarTextSmall}>
                              {(slot.coachName || "C").charAt(0)}
                            </Text>
                          </View>
                          <Text style={styles.slotCoachName}>{slot.coachName}</Text>
                        </View>
                        <View style={styles.locationRow}>
                          <Ionicons name="location" size={12} color={Colors.dark.textSecondary} />
                          <Text style={styles.slotLocationText}>{slot.locationName} - {slot.courtName}</Text>
                        </View>
                      </View>

                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={24} color={Colors.dark.xpCyan} />
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}

            {availableSlots.filter(slot => !selectedLocationId || slot.locationId === selectedLocationId).length === 0 && joinableSessions.length === 0 && !isLoading && (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyStateTitle}>
                  {(() => {
                    const now = new Date();
                    const isToday = selectedDate.toDateString() === now.toDateString();
                    const isLateInDay = isToday && now.getHours() >= 17;
                    if (isLateInDay) return "No more slots today";
                    if (isToday) return "Nothing available right now";
                    return "No sessions available";
                  })()}
                </Text>
                <Text style={styles.emptyStateText}>
                  {(() => {
                    const now = new Date();
                    const isToday = selectedDate.toDateString() === now.toDateString();
                    const isLateInDay = isToday && now.getHours() >= 17;
                    if (isLateInDay && selectedLocationId) {
                      return "It's getting late — try tomorrow, a different location, or a shorter session";
                    } else if (isLateInDay) {
                      return "It's getting late — try tomorrow or a shorter session";
                    } else if (isToday && selectedLocationId) {
                      return "Try a different duration, location, or pick another date";
                    } else if (isToday) {
                      return "Try a different duration or pick another date";
                    } else if (selectedLocationId) {
                      return "Try a different date, location, or duration";
                    } else {
                      return "Try a different date or duration";
                    }
                  })()}
                </Text>
              </View>
            )}
            </>
          )}
        </ScrollView>
      </Animated.View>
    );
  };

  // SLIDE 3: Details
  const renderDetailsSlide = () => (
    <Animated.View entering={FadeIn} style={styles.slideContent}>
      <Text style={styles.slideSubtitle}>Any special requests? (Optional)</Text>

      {/* Court Selection - shown only for new slot requests with available courts */}
      {selectedSlot && !isJoining && availableCourts.length > 0 && (
        <View style={styles.courtSelectionSection}>
          <View style={styles.aiFocusHeader}>
            <Ionicons name="tennisball" size={15} color={Colors.dark.primary} />
            <Text style={[styles.aiFocusLabel, { color: Colors.dark.primary }]}>Court Selection</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.aiFocusChips}>
              {availableCourts.map((court) => {
                const isPreassigned = court.id === selectedSlot.courtId;
                const isSelected = (selectedCourtId ?? selectedSlot.courtId) === court.id;
                return (
                  <Pressable
                    key={court.id}
                    style={[
                      styles.aiFocusChip,
                      isSelected && styles.aiFocusChipSelected,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCourtId(court.id);
                      setSelectedCourtName(court.name);
                    }}
                  >
                    <Text style={[
                      styles.aiFocusChipText,
                      isSelected && styles.aiFocusChipTextSelected,
                    ]}>
                      {court.name}{isPreassigned ? " (suggested)" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* AI Focus Suggestions */}
      <View style={styles.aiFocusSection}>
        <View style={styles.aiFocusHeader}>
          <Ionicons name="sparkles" size={15} color={Colors.dark.xpCyan} />
          <Text style={styles.aiFocusLabel}>AI Focus Suggestions</Text>
          {aiFocusLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.xpCyan} style={{ marginLeft: 4 }} />
          ) : null}
        </View>
        {aiFocusSuggestions.length > 0 ? (
          <View style={styles.aiFocusChips}>
            {aiFocusSuggestions.map((s, i) => (
              <Pressable
                key={i}
                style={[
                  styles.aiFocusChip,
                  playerNote === s && styles.aiFocusChipSelected,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPlayerNote(playerNote === s ? "" : s);
                }}
              >
                <Text style={[
                  styles.aiFocusChipText,
                  playerNote === s && styles.aiFocusChipTextSelected,
                ]}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : !aiFocusLoading ? (
          <Text style={styles.aiFocusEmpty}>Add a custom note below</Text>
        ) : null}
      </View>

      <View style={styles.detailsForm}>
        <View style={styles.inputGroup}>
          <View style={styles.inputLabel}>
            <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.xpCyan} />
            <Text style={styles.inputLabelText}>Note for Coach</Text>
          </View>
          <TextInput
            style={styles.textInput}
            value={playerNote}
            onChangeText={setPlayerNote}
            placeholder="E.g., Working on backhand this week"
            placeholderTextColor={Colors.dark.textSecondary}
            multiline
            numberOfLines={3}
          />
        </View>

        {(sessionType === "semi_private" || sessionType === "group") && (
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <Ionicons name="person-add-outline" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.inputLabelText}>Invite a Friend</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={friendEmail}
              onChangeText={setFriendEmail}
              placeholder="Enter friend's email"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Pressable
              style={styles.browseFriendsButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
                navigation.navigate("PlayerTabs", { screen: "PlayStack", params: { screen: "Players" } });
              }}
            >
              <Ionicons name="people-outline" size={16} color={GlowColors.primary} />
              <Text style={styles.browseFriendsText}>Browse Friends on Glow</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );

  // SLIDE 4: Confirm & Rewards
  const renderConfirmSlide = () => {
    const sessionInfo = selectedSession || selectedSlot;
    if (!sessionInfo) return null;

    const typeCard = SESSION_TYPE_CARDS.find((t) => t.value === sessionType);

    return (
      <Animated.View entering={FadeIn} style={styles.slideContent}>
        {showSuccess ? (
          <View style={styles.successContainer}>
            <View style={styles.successCheckmark}>
              <AnimatedCheck 
                size={72}
                variant="glow"
                autoPlay={true}
              />
            </View>
            <Text style={styles.successTitle}>
              {isJoining ? "You're In!" : "Request Sent!"}
            </Text>
            <Text style={styles.successSubtitle}>
              {isJoining ? "See you on the court!" : "Coach will confirm soon"}
            </Text>
            <Animated.View style={[styles.xpReward, xpStyle]}>
              <Ionicons name="flash" size={24} color={Colors.dark.xpCyan} />
              <Text style={styles.xpRewardText}>+10 Glow XP</Text>
            </Animated.View>
          </View>
        ) : (
          <>
            <Text style={styles.slideSubtitle}>Confirm your booking</Text>

            <View style={styles.confirmCard}>
              <LinearGradient
                colors={[typeCard?.gradient[0] || Colors.dark.backgroundSecondary, typeCard?.gradient[1] || Colors.dark.backgroundRoot]}
                style={styles.confirmCardGradient}
              >
                {/* Session Type Badge */}
                <View style={styles.confirmTypeBadge}>
                  <Ionicons name={typeCard?.icon || "tennisball"} size={20} color={typeCard?.color || Colors.dark.primary} />
                  <Text style={[styles.confirmTypeText, { color: typeCard?.color }]}>
                    {typeCard?.label}
                  </Text>
                </View>

                {/* Time & Date */}
                <View style={styles.confirmRow}>
                  <Ionicons name="time" size={18} color={Colors.dark.xpCyan} />
                  <Text style={styles.confirmText}>
                    {formatDateHeader(selectedDate)} · {formatTime(sessionInfo.startTime)} - {formatTime(sessionInfo.endTime)}
                  </Text>
                </View>

                {/* Location */}
                <View style={styles.confirmRow}>
                  <Ionicons name="location" size={18} color={Colors.dark.xpCyan} />
                  <Text style={styles.confirmText}>
                    {"locationName" in sessionInfo ? sessionInfo.locationName : ""}
                    {" · "}
                    {selectedCourtName ?? ("courtName" in sessionInfo ? sessionInfo.courtName : "")}
                  </Text>
                </View>
                {(() => {
                  const locName = "locationName" in sessionInfo ? sessionInfo.locationName : null;
                  const locId = "locationId" in sessionInfo ? (sessionInfo as AvailableSlot).locationId : null;
                  const loc = locId
                    ? locations.find(l => l.id === locId)
                    : locations.find(l => l.name === locName);
                  if (!locName && !loc?.address) return null;
                  return (
                    <Pressable
                      style={styles.confirmDirectionsRow}
                      onPress={() => openDirections({ lat: loc?.lat, lng: loc?.lng, label: locName, address: loc?.address })}
                    >
                      <Ionicons name="navigate" size={14} color={Colors.dark.primary} />
                      <Text style={styles.confirmDirectionsText}>Get Directions</Text>
                    </Pressable>
                  );
                })()}

                {/* Coach */}
                <View style={styles.confirmRow}>
                  <Ionicons name="person" size={18} color={Colors.dark.xpCyan} />
                  <Text style={styles.confirmText}>
                    Coach: {"coachName" in sessionInfo ? sessionInfo.coachName : ""}
                  </Text>
                </View>

                {/* Players for group */}
                {isJoining && selectedSession && (
                  <View style={styles.confirmRow}>
                    <Ionicons name="people" size={18} color={Colors.dark.xpCyan} />
                    <Text style={styles.confirmText}>
                      {selectedSession.currentPlayers}/{selectedSession.maxPlayers || 6} players joining
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* XP Preview */}
            <View style={styles.rewardPreview}>
              <View style={styles.rewardItem}>
                <Ionicons name="flash" size={20} color={Colors.dark.xpCyan} />
                <Text style={styles.rewardText}>+10 Glow XP</Text>
              </View>
              <View style={styles.rewardItem}>
                <Ionicons name="flame" size={20} color={Colors.dark.orange} />
                <Text style={styles.rewardText}>Streak continues</Text>
              </View>
            </View>
          </>
        )}
      </Animated.View>
    );
  };

  // Render slide content (dynamic based on browse mode)
  const renderSlideContent = () => {
    if (browseMode === "by_coach") {
      // 6 slides: Mode -> Browse -> Coach -> Session -> Details -> Confirm
      switch (currentSlide) {
        case 0: return renderSessionTypeSlide();
        case 1: return renderBrowseModeSlide();
        case 2: return renderSelectCoachSlide();
        case 3: return renderFindSessionSlide();
        case 4: return renderDetailsSlide();
        case 5: return renderConfirmSlide();
        default: return null;
      }
    } else {
      // 5 slides: Mode -> Browse -> Session -> Details -> Confirm
      switch (currentSlide) {
        case 0: return renderSessionTypeSlide();
        case 1: return renderBrowseModeSlide();
        case 2: return renderFindSessionSlide();
        case 3: return renderDetailsSlide();
        case 4: return renderConfirmSlide();
        default: return null;
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Background blur */}
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Backgrounds.card }]} />
        )}

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{getSlideTitle(currentSlide)}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
              <Text style={styles.headerSlide}>
                Step {currentSlide + 1} of {getTotalSlides()}
              </Text>
              <View style={{ backgroundColor: getSportColor(sport) + "22", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: getSportColor(sport), fontSize: 10, fontWeight: "600" }}>
                  {getSportLabel(sport)}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <Animated.View style={[styles.progressBar, progressStyle]}>
            <Animated.View style={[styles.progressGlow, glowStyle]} />
          </Animated.View>
        </View>

        {/* Slide Content */}
        <View style={styles.contentContainer}>{renderSlideContent()}</View>

        {/* Footer Navigation */}
        {!showSuccess && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
            {currentSlide > 0 && (
              <Pressable style={styles.backButton} onPress={goBack}>
                <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
                <Text style={styles.backButtonText}>Back</Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.nextButton,
                !canProceed && styles.nextButtonDisabled,
                currentSlide === getTotalSlides() - 1 && styles.confirmButton,
              ]}
              onPress={currentSlide === getTotalSlides() - 1 ? handleBook : goNext}
              disabled={!canProceed || bookingMutation.isPending}
            >
              {bookingMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>
                    {currentSlide === getTotalSlides() - 1
                      ? isJoining
                        ? "Join Session"
                        : "Request Booking"
                      : "Next"}
                  </Text>
                  {currentSlide < getTotalSlides() - 1 && (
                    <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
                  )}
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* Calendar Modal */}
        <Modal visible={showCalendarModal} transparent animationType="fade">
          <View style={styles.calendarOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCalendarModal(false)} />
            <View style={styles.calendarModal}>
              <View style={styles.calendarHeader}>
                <Pressable
                  onPress={() => {
                    const newDate = new Date(calendarViewDate);
                    newDate.setMonth(newDate.getMonth() - 1);
                    setCalendarViewDate(newDate);
                  }}
                  style={styles.calendarNavButton}
                >
                  <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
                </Pressable>
                <Text style={styles.calendarMonthText}>
                  {calendarViewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </Text>
                <Pressable
                  onPress={() => {
                    const newDate = new Date(calendarViewDate);
                    newDate.setMonth(newDate.getMonth() + 1);
                    setCalendarViewDate(newDate);
                  }}
                  style={styles.calendarNavButton}
                >
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
                  const startPadding = firstDay.getDay();
                  const days: (number | null)[] = [];
                  
                  for (let i = 0; i < startPadding; i++) days.push(null);
                  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
                  
                  return days.map((day, idx) => {
                    if (day === null) {
                      return <View key={`pad-${idx}`} style={styles.calendarDayEmpty} />;
                    }
                    const dateObj = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), day);
                    const isSelected = dateObj.toDateString() === selectedDate.toDateString();
                    const isToday = dateObj.toDateString() === new Date().toDateString();
                    const isPast = dateObj < new Date(new Date().setHours(0, 0, 0, 0));
                    
                    return (
                      <Pressable
                        key={day}
                        style={[
                          styles.calendarDay,
                          isSelected && styles.calendarDaySelected,
                          isToday && !isSelected && styles.calendarDayToday,
                          isPast && styles.calendarDayPast,
                        ]}
                        onPress={() => {
                          if (!isPast) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedDate(dateObj);
                            setShowCalendarModal(false);
                          }
                        }}
                        disabled={isPast}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                            isPast && styles.calendarDayTextPast,
                          ]}
                        >
                          {day}
                        </Text>
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
      </View>
    </Modal>
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
  closeButton: {
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
    fontSize: 18,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  headerSlide: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  progressContainer: {
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: 2,
    position: "relative",
  },
  progressGlow: {
    position: "absolute",
    top: -2,
    right: -2,
    bottom: -2,
    width: 20,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: 10,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  slideContent: {
    flex: 1,
  },
  slideSubtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  sessionTypeGrid: {
    gap: Spacing.md,
  },
  sessionTypeCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.sm,
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
    width: 60,
    height: 60,
    borderRadius: 30,
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
    fontSize: 18,
    fontWeight: 600,
    color: Colors.dark.text,
    flex: 1,
  },
  sessionTypeSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    position: "absolute",
    bottom: Spacing.md,
    left: 88,
  },
  browseModeGrid: {
    gap: Spacing.md,
  },
  browseModeCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.sm,
  },
  browseModeCardGradient: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  browseModeIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  browseModeLabel: {
    fontSize: 20,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  browseModeSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  coachSelectionContainer: {
    marginTop: Spacing.xl,
  },
  coachScroll: {
    marginTop: Spacing.md,
  },
  coachScrollContent: {
    paddingRight: Spacing.lg,
  },
  coachSelectionCard: {
    alignItems: "center",
    padding: Spacing.md,
    marginRight: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minWidth: 100,
  },
  coachSelectionCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  coachSelectionAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coachSelectionPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  coachSelectionAvatarText: {
    fontSize: 24,
    fontWeight: 700,
    color: Colors.dark.buttonText,
  },
  coachSelectionName: {
    fontSize: 14,
    fontWeight: 600,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  coachCheckmark: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: Colors.dark.text,
  },
  locationScroll: {
    flexGrow: 0,
    marginBottom: Spacing.sm,
  },
  locationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  locationChipSelected: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: Colors.dark.xpCyan + "20",
  },
  locationChipText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  locationChipTextSelected: {
    color: Colors.dark.xpCyan,
  },
  dateScroll: {
    flexGrow: 0,
    marginBottom: Spacing.sm,
  },
  dateChip: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.sm,
    minWidth: 70,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateChipSelected: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: Colors.dark.xpCyan + "20",
  },
  dateChipDay: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  dateChipDate: {
    fontSize: 20,
    fontWeight: 700,
    color: Colors.dark.text,
    marginTop: 2,
  },
  dateChipTextSelected: {
    color: Colors.dark.xpCyan,
  },
  durationScroll: {
    flexGrow: 0,
  },
  durationChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  durationChipSelected: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: Colors.dark.xpCyan + "20",
  },
  durationChipText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  durationChipTextSelected: {
    color: Colors.dark.xpCyan,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  emptyCoachesContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  emptyCoachesText: {
    fontSize: 16,
    color: Colors.dark.textMuted,
  },
  coachCardsContainer: {
    paddingBottom: Spacing.lg,
  },
  sessionsList: {
    flex: 1,
  },
  sessionSectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sessionCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sessionCardSelected: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
  },
  sessionCardGradient: {
    padding: Spacing.md,
    position: "relative",
  },
  sessionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sessionTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  sessionTime: {
    fontSize: 18,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  spotsBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primary + "30",
  },
  spotsBadgeHot: {
    backgroundColor: Colors.dark.orange + "30",
  },
  spotsText: {
    fontSize: 12,
    fontWeight: 600,
    color: Colors.dark.primary,
  },
  sessionCardInfo: {
    gap: Spacing.xs,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  coachAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  coachAvatarText: {
    fontSize: 14,
    fontWeight: 700,
    color: Colors.dark.buttonText,
  },
  coachName: {
    fontSize: 16,
    fontWeight: 600,
    color: Colors.dark.text,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  playerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.xpCyan,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  playerAvatarText: {
    fontSize: 10,
    fontWeight: 700,
    color: Colors.dark.buttonText,
  },
  playersLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginLeft: Spacing.sm,
  },
  selectedBadge: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
  },
  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.md,
  },
  slotCardSelected: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: Colors.dark.xpCyan + "10",
  },
  slotTimeColumn: {
    alignItems: "center",
    minWidth: 60,
  },
  slotTime: {
    fontSize: 18,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  slotTimeSelected: {
    color: Colors.dark.xpCyan,
  },
  slotDuration: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  slotInfoColumn: {
    flex: 1,
    gap: 4,
  },
  coachAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  coachAvatarTextSmall: {
    fontSize: 10,
    fontWeight: 700,
    color: Colors.dark.buttonText,
  },
  slotCoachName: {
    fontSize: 14,
    fontWeight: 600,
    color: Colors.dark.text,
  },
  slotLocationText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: Colors.dark.text,
  },
  emptyStateText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  courtSelectionSection: {
    marginBottom: Spacing.lg,
  },
  locationChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  locationChipSelected: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  locationChipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  locationChipTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  aiFocusSection: {
    marginBottom: Spacing.lg,
  },
  aiFocusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  aiFocusLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    flex: 1,
  },
  aiFocusChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  aiFocusChip: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  aiFocusChipSelected: {
    backgroundColor: Colors.dark.xpCyan + "20",
    borderColor: Colors.dark.xpCyan,
  },
  aiFocusChipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  aiFocusChipTextSelected: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  aiFocusEmpty: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  detailsForm: {
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  inputLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  inputLabelText: {
    fontSize: 16,
    fontWeight: 600,
    color: Colors.dark.text,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 80,
    textAlignVertical: "top",
  },
  browseFriendsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  browseFriendsText: {
    fontSize: 14,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  confirmCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  confirmCardGradient: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  confirmTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  confirmTypeText: {
    fontSize: 18,
    fontWeight: 700,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  confirmText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  confirmDirectionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingLeft: 26,
    marginTop: 2,
  },
  confirmDirectionsText: {
    fontSize: 13,
    color: Colors.dark.primary,
    textDecorationLine: "underline",
  },
  rewardPreview: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  rewardItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rewardText: {
    fontSize: 16,
    fontWeight: 600,
    color: Colors.dark.text,
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  successCheckmark: {
    marginBottom: Spacing.md,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  successSubtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  xpReward: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  xpRewardText: {
    fontSize: 18,
    fontWeight: 700,
    color: Colors.dark.xpCyan,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  nextButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.full,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  confirmButton: {
    backgroundColor: GlowColors.primary,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: 700,
    color: Colors.dark.buttonText,
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  calendarModal: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 350,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  calendarNavButton: {
    padding: Spacing.sm,
  },
  calendarMonthText: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  calendarWeekdays: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.sm,
  },
  calendarWeekdayText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    width: 40,
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
    borderRadius: BorderRadius.md,
  },
  calendarDayEmpty: {
    width: "14.28%",
    aspectRatio: 1,
  },
  calendarDaySelected: {
    backgroundColor: Colors.dark.xpCyan,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan,
  },
  calendarDayPast: {
    opacity: 0.3,
  },
  calendarDayText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  calendarDayTextSelected: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  calendarDayTextPast: {
    color: Colors.dark.textMuted,
  },
  calendarCloseButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  calendarCloseButtonText: {
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: "500",
  },
});
