import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  TextInput,
  Modal,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, TextColors, Backgrounds } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { openDirections } from "@/lib/maps";
import type { ScheduleStackParamList, PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { AnimatedCheck } from "@/components/AnimatedCheck";
import { SuccessToast } from "@/components/SuccessToast";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type NavigationProp = NativeStackNavigationProp<ScheduleStackParamList>;
type RouteProp = NativeStackScreenProps<ScheduleStackParamList, "CourtDetail">["route"];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CourtDetails {
  id: string;
  name: string;
  surface?: string;
  visibility?: string;
  pricePerHour?: string;
  peakPricePerHour?: string;
  memberPricePerHour?: string;
  currency?: string;
  description?: string;
  photoUrl?: string;
  creditsPerHour?: number;
  maxBookingDurationHours?: number;
  minBookingDurationMinutes?: number;
  cancelWindowHours?: number;
  guestsAllowed?: boolean;
  requiresApproval?: boolean;
  operatingHours?: Record<string, { open: string; close: string }>;
  xpRewardPerHour?: number;
  academy?: {
    id: string;
    name: string;
    logoUrl?: string;
  };
  location?: {
    id: string;
    name: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
    googlePlaceId?: string | null;
  };
  bookingEnabled?: boolean;
  canBook: boolean;
  availability: Array<{
    id: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
}

interface PlaceDetails {
  rating?: number;
  reviewCount?: number;
  photoRef?: string;
}

const SURFACE_CONFIG = {
  hard: { icon: "tennisball", color: "#00D4FF", label: "Hard Court" },
  clay: { icon: "leaf", color: "#E07B39", label: "Clay Court" },
  grass: { icon: "golf", color: "#4CAF50", label: "Grass Court" },
  indoor: { icon: "home", color: "#9575CD", label: "Indoor Court" },
} as const;

const TIME_SLOTS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00",
];

function TimeSlot({ 
  time, 
  status, 
  isSelected, 
  onPress 
}: { 
  time: string; 
  status: "available" | "booked" | "blocked" | "past"; 
  isSelected: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSelected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [isSelected, glowAnim]);

  const handlePressIn = () => {
    if (status === "available") {
      Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 50 }).start();
    }
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const getSlotStyle = () => {
    if (isSelected) return styles.slotSelected;
    switch (status) {
      case "available": return styles.slotAvailable;
      case "booked": return styles.slotBooked;
      case "blocked": return styles.slotBlocked;
      case "past": return styles.slotPast;
      default: return {};
    }
  };

  const slotWidth = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 3) / 4;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], width: slotWidth }}>
      <Pressable
        style={[styles.slotButton, getSlotStyle()]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={status !== "available"}
      >
        {isSelected && (
          <Animated.View 
            style={[
              styles.slotGlow,
              { opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }) }
            ]} 
          />
        )}
        <Text style={[
          styles.slotTime,
          status !== "available" && styles.slotTimeDisabled,
          isSelected && styles.slotTimeSelected,
        ]}>
          {time}
        </Text>
        {status === "booked" && (
          <View style={styles.slotStatusIcon}>
            <Ionicons name="close" size={10} color={Colors.dark.accentError} />
          </View>
        )}
        {status === "blocked" && (
          <View style={styles.slotStatusIcon}>
            <Ionicons name="lock-closed" size={10} color={TextColors.muted} />
          </View>
        )}
        {isSelected && (
          <View style={styles.slotCheckIcon}>
            <Ionicons name="checkmark" size={12} color={Backgrounds.root} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function CourtDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const apiUrl = getApiUrl();
  
  const { courtId, date, time: preselectedTime } = route.params as { courtId: string; date: string; time?: string };
  
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(() => {
    if (preselectedTime) {
      const endHour = parseInt(preselectedTime.split(":")[0]) + 1;
      const endTime = `${endHour.toString().padStart(2, "0")}:00`;
      return { start: preselectedTime, end: endTime };
    }
    return null;
  });
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  // Enhanced booking flow - Partner selection
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1); // 1: partner type, 2: details, 3: confirm
  const [partnerType, setPartnerType] = useState<"friend" | "guest" | "open_match" | "solo" | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ id: string; name: string; photoUrl?: string } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [openMatchTitle, setOpenMatchTitle] = useState("");
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");

  const detailUrl = `/api/courts/${courtId}/details?date=${date}`;

  const { data: court, isLoading, isError } = useQuery<CourtDetails>({
    queryKey: [detailUrl],
  });

  const googlePlaceId = court?.location?.googlePlaceId;
  const { data: placeDetails } = useQuery<PlaceDetails>({
    queryKey: [`/api/maps/place-details?placeId=${googlePlaceId}`],
    enabled: !!googlePlaceId,
  });

  const locationLat = court?.location?.lat;
  const locationLng = court?.location?.lng;
  const staticMapUrl = (locationLat != null && locationLng != null)
    ? `${apiUrl}/api/maps/static-map?lat=${locationLat}&lng=${locationLng}&size=600x200`
    : null;

  // Fetch friends/academy players for partner selection
  interface SearchPlayer { id: string; displayName: string; photoUrl?: string; ballLevel?: string; xpLevel?: number; }
  const { data: searchResults } = useQuery<SearchPlayer[]>({
    queryKey: ["/api/players/search", playerSearchQuery],
    enabled: playerSearchQuery.length >= 2 && partnerType === "friend",
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: { 
      date: string; 
      startTime: string; 
      endTime: string;
      partnerType?: "friend" | "guest" | "open_match" | "solo";
      partnerId?: string;
      guestName?: string;
      openMatchTitle?: string;
    }) => {
      return apiRequest("POST", `/api/courts/${courtId}/book`, data);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSuccessAnimation(true);
      setShowSuccessToast(true);
      queryClient.invalidateQueries({ queryKey: [detailUrl] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0]?.toString().startsWith("/api/courts/search") ?? false });
      queryClient.invalidateQueries({ queryKey: ["/api/my-court-bookings"] });
      
      setTimeout(() => {
        setShowSuccessAnimation(false);
      }, 300);
      
      setTimeout(() => {
        Alert.alert(
          "Booking Confirmed",
          court?.requiresApproval 
            ? "Your booking request has been submitted and is pending approval."
            : "Your court has been booked successfully!",
          [
            { text: "View My Bookings", onPress: () => navigation.navigate("MyCourtBookings") },
            { text: "Done", onPress: () => navigation.goBack() },
          ]
        );
      }, 800);
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Booking Failed", error.message || "Failed to book the court. Please try again.");
    },
  });

  const getSlotStatus = (time: string): "available" | "booked" | "blocked" | "past" => {
    const now = new Date();
    const DUBAI_OFFSET = 4;
    const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET * 60 * 60 * 1000);
    const dubaiDateStr = dubaiNow.toISOString().split("T")[0];
    const dubaiTimeStr = dubaiNow.toISOString().slice(11, 16);
    
    const isToday = date === dubaiDateStr;
    if (isToday && time <= dubaiTimeStr) return "past";
    
    if (court?.availability) {
      const blocked = court.availability.find(a => 
        a.startTime <= time && a.endTime > time && a.status !== "available"
      );
      if (blocked) return blocked.status === "booked" ? "booked" : "blocked";
    }
    
    return "available";
  };

  const availableSlots = useMemo(() => {
    return TIME_SLOTS.map(time => ({
      time,
      status: getSlotStatus(time),
    }));
  }, [court?.availability, date]);

  const handleSlotPress = (time: string, status: string) => {
    if (status !== "available") return;
    Haptics.selectionAsync();
    
    const endHour = parseInt(time.split(":")[0]) + 1;
    const endTime = `${endHour.toString().padStart(2, "0")}:00`;
    
    if (selectedSlot?.start === time) {
      setSelectedSlot(null);
    } else {
      setSelectedSlot({ start: time, end: endTime });
    }
  };

  const handleBook = () => {
    if (!selectedSlot || !court?.canBook) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowBookingConfirm(true);
  };

  const confirmBooking = () => {
    if (!selectedSlot) return;
    bookingMutation.mutate({
      date,
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
      partnerType: partnerType || "solo",
      partnerId: selectedPartner?.id,
      guestName: guestName || undefined,
      openMatchTitle: openMatchTitle || undefined,
    });
    resetBookingFlow();
  };

  const resetBookingFlow = () => {
    setShowBookingConfirm(false);
    setBookingStep(1);
    setPartnerType(null);
    setSelectedPartner(null);
    setGuestName("");
    setOpenMatchTitle("");
    setPlayerSearchQuery("");
  };

  const handlePartnerTypeSelect = (type: "friend" | "guest" | "open_match" | "solo") => {
    Haptics.selectionAsync();
    setPartnerType(type);
    if (type === "solo") {
      setBookingStep(3); // Skip to confirmation for solo
    } else {
      setBookingStep(2); // Go to details step
    }
  };

  const handlePartnerSelected = (player: SearchPlayer) => {
    Haptics.selectionAsync();
    setSelectedPartner({ id: player.id, name: player.displayName, photoUrl: player.photoUrl });
    setBookingStep(3);
  };

  const handleGuestConfirm = () => {
    if (guestName.trim().length < 2) return;
    Haptics.selectionAsync();
    setBookingStep(3);
  };

  const handleOpenMatchConfirm = () => {
    Haptics.selectionAsync();
    setOpenMatchTitle(openMatchTitle || "Looking for a hitting partner");
    setBookingStep(3);
  };

  const getPartnerDescription = () => {
    if (partnerType === "solo") return "Solo Practice";
    if (partnerType === "friend" && selectedPartner) return `Playing with ${selectedPartner.name}`;
    if (partnerType === "guest" && guestName) return `Playing with ${guestName} (Guest)`;
    if (partnerType === "open_match") return "Open Match - Others can join";
    return "";
  };

  const formatPrice = () => {
    if (court?.creditsPerHour && court.creditsPerHour > 0) {
      return { value: court.creditsPerHour.toString(), unit: "credits/hr", isCredits: true };
    }
    if (!court?.pricePerHour || parseFloat(court.pricePerHour) === 0) {
      return { value: "Free", unit: "", isCredits: false };
    }
    return { value: `${court.currency || "AED"} ${parseFloat(court.pricePerHour).toFixed(0)}`, unit: "/hr", isCredits: false };
  };

  const surfaceConfig = SURFACE_CONFIG[court?.surface as keyof typeof SURFACE_CONFIG] || SURFACE_CONFIG.hard;
  const price = formatPrice();
  const hasPhoto = court?.photoUrl && court.photoUrl.length > 0;
  const heroPhotoUrl = placeDetails?.photoRef
    ? `${apiUrl}/api/maps/place-photo?ref=${encodeURIComponent(placeDetails.photoRef)}&maxwidth=800`
    : hasPhoto ? `${apiUrl}${court!.photoUrl}` : null;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.loadingPulse}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
        <Text style={styles.loadingText}>Loading court details...</Text>
      </View>
    );
  }

  if (isError || !court) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.dark.accentError} />
        </View>
        <Text style={styles.errorTitle}>Failed to load court</Text>
        <Text style={styles.errorSubtitle}>Please check your connection</Text>
        <Pressable 
          style={styles.retryButton} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.heroSection, { paddingTop: insets.top }]}>
        {heroPhotoUrl ? (
          <Image
            source={{ uri: heroPhotoUrl }}
            style={styles.heroImage}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={[surfaceConfig.color + "30", Backgrounds.card]}
            style={styles.heroPlaceholder}
          >
            <Ionicons name="tennisball-outline" size={60} color={surfaceConfig.color + "50"} />
          </LinearGradient>
        )}
        
        <LinearGradient
          colors={["transparent", "rgba(11, 13, 16, 0.6)", Backgrounds.root]}
          style={styles.heroGradient}
        />

        <View style={styles.headerOverlay}>
          <Pressable 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }} 
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={TextColors.primary} />
          </Pressable>
        </View>

        <View style={styles.heroContent}>
          <View style={[styles.surfaceBadge, { borderColor: surfaceConfig.color }]}>
            <Ionicons name={surfaceConfig.icon as any} size={14} color={surfaceConfig.color} />
            <Text style={[styles.surfaceBadgeText, { color: surfaceConfig.color }]}>
              {surfaceConfig.label}
            </Text>
          </View>
          <Text style={styles.courtName}>{court.name}</Text>
          {court.academy && (
            <View style={styles.metaRow}>
              <Ionicons name="business-outline" size={14} color={TextColors.secondary} />
              <Text style={styles.metaText}>{court.academy.name}</Text>
            </View>
          )}
          {court.location && (
            <Pressable
              style={styles.metaRow}
              onPress={() => {
                const addr = court.location!.address || court.location!.name;
                openDirections({ address: addr, label: addr });
              }}
            >
              <Ionicons name="location-outline" size={14} color={TextColors.secondary} />
              <Text style={styles.metaText}>{court.location.address || court.location.name}</Text>
              {court.location.address ? (
                <Ionicons name="navigate-outline" size={12} color="#00D4FF" style={{ marginLeft: 4 }} />
              ) : null}
            </Pressable>
          )}
          {placeDetails?.rating != null && (
            <View style={styles.metaRow}>
              <Ionicons name="star" size={13} color="#FFD700" />
              <Text style={[styles.metaText, { color: "#FFD700" }]}>
                {placeDetails.rating.toFixed(1)}{placeDetails.reviewCount ? ` · ${placeDetails.reviewCount.toLocaleString()} reviews` : ""}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: 145 + 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pricingCard}>
          <LinearGradient
            colors={[Backgrounds.elevated, Backgrounds.card]}
            style={styles.pricingGradient}
          >
            <View style={styles.pricingRow}>
              <View style={styles.priceMain}>
                <Text style={[styles.priceValue, price.isCredits && styles.priceCredits]}>
                  {price.value}
                </Text>
                {price.unit && <Text style={styles.priceUnit}>{price.unit}</Text>}
              </View>
              {court.xpRewardPerHour && court.xpRewardPerHour > 0 && (
                <View style={styles.xpBadge}>
                  <Ionicons name="flash" size={12} color={Colors.dark.primaryGlow} />
                  <Text style={styles.xpBadgeText}>+{court.xpRewardPerHour} XP/hr</Text>
                </View>
              )}
            </View>
            
            <View style={styles.rulesRow}>
              <View style={styles.ruleChip}>
                <Ionicons name="time-outline" size={14} color={Colors.dark.primary} />
                <Text style={styles.ruleText}>Min {court.minBookingDurationMinutes || 60}m</Text>
              </View>
              <View style={styles.ruleChip}>
                <Ionicons name="hourglass-outline" size={14} color={Colors.dark.primary} />
                <Text style={styles.ruleText}>Max {court.maxBookingDurationHours || 2}h</Text>
              </View>
              <View style={styles.ruleChip}>
                <Ionicons name="close-circle-outline" size={14} color={Colors.dark.accentWarning} />
                <Text style={styles.ruleText}>{court.cancelWindowHours || 24}h cancel</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.slotsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Available Slots</Text>
            <Text style={styles.sectionDate}>
              {new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </Text>
          </View>

          <View style={styles.slotsGrid}>
            {availableSlots.map((slot) => (
              <TimeSlot
                key={slot.time}
                time={slot.time}
                status={slot.status}
                isSelected={selectedSlot?.start === slot.time}
                onPress={() => handleSlotPress(slot.time, slot.status)}
              />
            ))}
          </View>

          <View style={styles.legendContainer}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.dark.successNeon }]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.dark.accentError }]} />
              <Text style={styles.legendText}>Booked</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#4A4F5C" }]} />
              <Text style={styles.legendText}>Blocked</Text>
            </View>
          </View>
        </View>

        {staticMapUrl && (
          <Pressable
            style={styles.staticMapCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openDirections({ lat: locationLat, lng: locationLng, label: court?.location?.name || court?.name || "Court" });
            }}
          >
            <Image
              source={{ uri: staticMapUrl }}
              style={styles.staticMapImage}
              contentFit="cover"
            />
            <View style={styles.staticMapOverlay}>
              <View style={styles.staticMapBadge}>
                <Ionicons name="navigate" size={14} color={TextColors.primary} />
                <Text style={styles.staticMapBadgeText}>Open in Maps</Text>
              </View>
            </View>
          </Pressable>
        )}

        <Pressable 
          style={styles.findPartnerCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("PlayerFinder" as any);
          }}
        >
          <LinearGradient
            colors={[Backgrounds.elevated, Backgrounds.card]}
            style={styles.findPartnerGradient}
          >
            <View style={styles.findPartnerIcon}>
              <Ionicons name="people" size={24} color={Colors.dark.primary} />
            </View>
            <View style={styles.findPartnerContent}>
              <Text style={styles.findPartnerTitle}>Looking for a hitting partner?</Text>
              <Text style={styles.findPartnerSubtitle}>Find players nearby to join your session</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={TextColors.muted} />
          </LinearGradient>
        </Pressable>
      </ScrollView>

      {court.bookingEnabled === false && (
        <View style={styles.communityOnlyBar}>
          <View style={styles.communityOnlyContent}>
            <Ionicons name="people" size={20} color="#FF9500" />
            <View style={styles.communityOnlyTextWrap}>
              <Text style={styles.communityOnlyTitle}>Community Only</Text>
              <Text style={styles.communityOnlySubtitle}>This court is not available for direct booking</Text>
            </View>
          </View>
        </View>
      )}

      {selectedSlot && court.canBook && court.bookingEnabled !== false && (
        <View style={[styles.bookingBar, { paddingBottom: Spacing.md }]}>
          <LinearGradient
            colors={["rgba(23, 27, 34, 0.98)", "rgba(17, 20, 26, 0.98)"]}
            style={styles.bookingBarGradient}
          >
            <View style={styles.bookingSummary}>
              <Text style={styles.bookingLabel}>Selected Time</Text>
              <Text style={styles.bookingTime}>
                {selectedSlot.start} - {selectedSlot.end}
              </Text>
            </View>
            <Pressable 
              style={[styles.bookButton, bookingMutation.isPending && styles.bookButtonDisabled]}
              onPress={handleBook}
              disabled={bookingMutation.isPending}
            >
              <LinearGradient
                colors={bookingMutation.isPending ? ["#4A4F5C", "#4A4F5C"] : [Colors.dark.primary, "#00A8CC"]}
                style={styles.bookButtonGradient}
              >
                {bookingMutation.isPending ? (
                  <ActivityIndicator size="small" color={TextColors.primary} />
                ) : (
                  <>
                    <Text style={styles.bookButtonText}>Book Now</Text>
                    <Text style={styles.bookButtonPrice}>{price.value}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>
      )}

      {showBookingConfirm && (
        <Modal
          visible={showBookingConfirm}
          animationType="slide"
          transparent={true}
          onRequestClose={resetBookingFlow}
        >
          <View style={styles.confirmOverlay}>
            <Pressable style={styles.confirmBackdrop} onPress={resetBookingFlow} />
            <View style={[styles.confirmModal, { marginBottom: 145 + Spacing.xl, maxHeight: "80%" }]}>
              <LinearGradient
                colors={[Backgrounds.surface, Backgrounds.elevated]}
                style={styles.confirmGradient}
              >
                {/* Header with step indicator */}
                <View style={styles.confirmHeader}>
                  <View style={styles.stepIndicator}>
                    <View style={[styles.stepDot, bookingStep >= 1 && styles.stepDotActive]} />
                    <View style={[styles.stepLine, bookingStep >= 2 && styles.stepLineActive]} />
                    <View style={[styles.stepDot, bookingStep >= 2 && styles.stepDotActive]} />
                    <View style={[styles.stepLine, bookingStep >= 3 && styles.stepLineActive]} />
                    <View style={[styles.stepDot, bookingStep >= 3 && styles.stepDotActive]} />
                  </View>
                  <Text style={styles.confirmTitle}>
                    {bookingStep === 1 && "Who are you playing with?"}
                    {bookingStep === 2 && partnerType === "friend" && "Select a Player"}
                    {bookingStep === 2 && partnerType === "guest" && "Enter Guest Name"}
                    {bookingStep === 2 && partnerType === "open_match" && "Create Open Match"}
                    {bookingStep === 3 && "Confirm Booking"}
                  </Text>
                </View>

                {/* Step 1: Partner Type Selection */}
                {bookingStep === 1 && (
                  <ScrollView style={styles.partnerOptions} showsVerticalScrollIndicator={false}>
                    <Pressable 
                      style={styles.partnerOptionCard}
                      onPress={() => handlePartnerTypeSelect("friend")}
                    >
                      <LinearGradient colors={["#1A2332", "#151C28"]} style={styles.partnerOptionGradient}>
                        <View style={[styles.partnerIconCircle, { backgroundColor: Colors.dark.primary + "20" }]}>
                          <Ionicons name="people" size={24} color={Colors.dark.primary} />
                        </View>
                        <View style={styles.partnerOptionText}>
                          <Text style={styles.partnerOptionTitle}>Academy Player</Text>
                          <Text style={styles.partnerOptionDesc}>Invite a friend from your academy</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
                      </LinearGradient>
                    </Pressable>

                    <Pressable 
                      style={styles.partnerOptionCard}
                      onPress={() => handlePartnerTypeSelect("guest")}
                    >
                      <LinearGradient colors={["#1A2332", "#151C28"]} style={styles.partnerOptionGradient}>
                        <View style={[styles.partnerIconCircle, { backgroundColor: Colors.dark.primaryGlow + "20" }]}>
                          <Ionicons name="person-add" size={24} color={Colors.dark.primaryGlow} />
                        </View>
                        <View style={styles.partnerOptionText}>
                          <Text style={styles.partnerOptionTitle}>Invite a Guest</Text>
                          <Text style={styles.partnerOptionDesc}>Bring someone not in the system</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
                      </LinearGradient>
                    </Pressable>

                    <Pressable 
                      style={styles.partnerOptionCard}
                      onPress={() => handlePartnerTypeSelect("open_match")}
                    >
                      <LinearGradient colors={["#1A2332", "#151C28"]} style={styles.partnerOptionGradient}>
                        <View style={[styles.partnerIconCircle, { backgroundColor: "#E040FB20" }]}>
                          <Ionicons name="globe" size={24} color="#E040FB" />
                        </View>
                        <View style={styles.partnerOptionText}>
                          <Text style={styles.partnerOptionTitle}>Create Open Match</Text>
                          <Text style={styles.partnerOptionDesc}>Let other players join you</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
                      </LinearGradient>
                    </Pressable>

                    <Pressable 
                      style={styles.partnerOptionCard}
                      onPress={() => handlePartnerTypeSelect("solo")}
                    >
                      <LinearGradient colors={["#1A2332", "#151C28"]} style={styles.partnerOptionGradient}>
                        <View style={[styles.partnerIconCircle, { backgroundColor: "#FF950020" }]}>
                          <Ionicons name="fitness" size={24} color="#FF9500" />
                        </View>
                        <View style={styles.partnerOptionText}>
                          <Text style={styles.partnerOptionTitle}>Solo Practice</Text>
                          <Text style={styles.partnerOptionDesc}>Book for yourself (training, wall, etc.)</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
                      </LinearGradient>
                    </Pressable>
                  </ScrollView>
                )}

                {/* Step 2: Friend Search */}
                {bookingStep === 2 && partnerType === "friend" && (
                  <View style={styles.searchStep}>
                    <View style={styles.searchInputContainer}>
                      <Ionicons name="search" size={20} color={Colors.dark.textSecondary} />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search players..."
                        placeholderTextColor={Colors.dark.textSecondary}
                        value={playerSearchQuery}
                        onChangeText={setPlayerSearchQuery}
                        autoFocus
                      />
                    </View>
                    <ScrollView style={styles.searchResults} showsVerticalScrollIndicator={false}>
                      {searchResults && searchResults.map((player) => (
                        <Pressable 
                          key={player.id}
                          style={styles.playerResultCard}
                          onPress={() => handlePartnerSelected(player)}
                        >
                          <View style={styles.playerAvatar}>
                            {player.photoUrl ? (
                              <Image source={{ uri: `${apiUrl}${player.photoUrl}` }} style={styles.playerPhoto} />
                            ) : (
                              <Ionicons name="person" size={20} color={Colors.dark.textSecondary} />
                            )}
                          </View>
                          <View style={styles.playerInfo}>
                            <Text style={styles.playerName}>{player.displayName}</Text>
                            <Text style={styles.playerLevel}>Level {player.xpLevel || 1}</Text>
                          </View>
                          <Ionicons name="add-circle" size={24} color={Colors.dark.primary} />
                        </Pressable>
                      ))}
                      {playerSearchQuery.length >= 2 && (!searchResults || searchResults.length === 0) && (
                        <Text style={styles.noResultsText}>No players found</Text>
                      )}
                    </ScrollView>
                    <Pressable style={styles.backStepButton} onPress={() => setBookingStep(1)}>
                      <Ionicons name="arrow-back" size={18} color={Colors.dark.text} />
                      <Text style={styles.backStepText}>Back</Text>
                    </Pressable>
                  </View>
                )}

                {/* Step 2: Guest Name Input */}
                {bookingStep === 2 && partnerType === "guest" && (
                  <View style={styles.guestStep}>
                    <Text style={styles.guestLabel}>Guest Name</Text>
                    <TextInput
                      style={styles.guestInput}
                      placeholder="Enter your guest's name..."
                      placeholderTextColor={Colors.dark.textSecondary}
                      value={guestName}
                      onChangeText={setGuestName}
                      autoFocus
                    />
                    <Text style={styles.guestHint}>Your guest will need to check in at reception</Text>
                    
                    <View style={styles.guestButtons}>
                      <Pressable style={styles.backStepButton} onPress={() => setBookingStep(1)}>
                        <Ionicons name="arrow-back" size={18} color={Colors.dark.text} />
                        <Text style={styles.backStepText}>Back</Text>
                      </Pressable>
                      <Pressable 
                        style={[styles.nextStepButton, guestName.trim().length < 2 && styles.nextStepButtonDisabled]} 
                        onPress={handleGuestConfirm}
                        disabled={guestName.trim().length < 2}
                      >
                        <Text style={styles.nextStepText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={18} color={Backgrounds.root} />
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Step 2: Open Match Setup */}
                {bookingStep === 2 && partnerType === "open_match" && (
                  <View style={styles.openMatchStep}>
                    <Text style={styles.guestLabel}>Match Title (Optional)</Text>
                    <TextInput
                      style={styles.guestInput}
                      placeholder="Looking for a hitting partner..."
                      placeholderTextColor={Colors.dark.textSecondary}
                      value={openMatchTitle}
                      onChangeText={setOpenMatchTitle}
                    />
                    <View style={styles.openMatchInfo}>
                      <Ionicons name="information-circle" size={16} color={Colors.dark.primary} />
                      <Text style={styles.openMatchInfoText}>
                        Other players in your academy will see this match and can request to join
                      </Text>
                    </View>
                    
                    <View style={styles.guestButtons}>
                      <Pressable style={styles.backStepButton} onPress={() => setBookingStep(1)}>
                        <Ionicons name="arrow-back" size={18} color={Colors.dark.text} />
                        <Text style={styles.backStepText}>Back</Text>
                      </Pressable>
                      <Pressable style={styles.nextStepButton} onPress={handleOpenMatchConfirm}>
                        <Text style={styles.nextStepText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={18} color={Backgrounds.root} />
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Step 3: Final Confirmation */}
                {bookingStep === 3 && (
                  <View style={styles.finalConfirmStep}>
                    <View style={styles.confirmDetails}>
                      <Text style={styles.confirmCourtName}>{court.name}</Text>
                      <Text style={styles.confirmDate}>
                        {new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </Text>
                      <Text style={styles.confirmTime}>{selectedSlot?.start} - {selectedSlot?.end}</Text>
                    </View>

                    <View style={styles.partnerSummary}>
                      <Ionicons 
                        name={partnerType === "friend" ? "people" : partnerType === "guest" ? "person-add" : partnerType === "open_match" ? "globe" : "fitness"} 
                        size={20} 
                        color={Colors.dark.primary} 
                      />
                      <Text style={styles.partnerSummaryText}>{getPartnerDescription()}</Text>
                    </View>

                    <View style={styles.confirmPriceRow}>
                      <Text style={styles.confirmPriceLabel}>Total</Text>
                      <Text style={[styles.confirmPriceValue, price.isCredits && styles.priceCredits]}>
                        {price.value} {price.unit}
                      </Text>
                    </View>
                    
                    {court.requiresApproval && (
                      <View style={styles.approvalNote}>
                        <Ionicons name="information-circle" size={16} color={Colors.dark.accentWarning} />
                        <Text style={styles.approvalText}>This booking requires academy approval</Text>
                      </View>
                    )}
                    
                    <View style={styles.confirmButtons}>
                      <Pressable style={styles.backStepButton} onPress={() => setBookingStep(partnerType === "solo" ? 1 : 2)}>
                        <Ionicons name="arrow-back" size={18} color={Colors.dark.text} />
                        <Text style={styles.backStepText}>Back</Text>
                      </Pressable>
                      <Pressable 
                        style={[styles.confirmBookButton, bookingMutation.isPending && styles.confirmBookButtonDisabled]} 
                        onPress={confirmBooking}
                        disabled={bookingMutation.isPending}
                      >
                        <LinearGradient
                          colors={bookingMutation.isPending ? ["#4A4F5C", "#4A4F5C"] : [Colors.dark.primary, "#00A8CC"]}
                          style={styles.confirmBookGradient}
                        >
                          {bookingMutation.isPending ? (
                            <ActivityIndicator size="small" color={TextColors.primary} />
                          ) : (
                            <Text style={styles.confirmBookText}>Book Now</Text>
                          )}
                        </LinearGradient>
                      </Pressable>
                    </View>
                  </View>
                )}
              </LinearGradient>
            </View>
          </View>
        </Modal>
      )}

      {showSuccessAnimation && (
        <View style={styles.successOverlay}>
          <AnimatedCheck 
            size={80}
            variant="glow"
            autoPlay={true}
            onComplete={() => setShowSuccessAnimation(false)}
          />
        </View>
      )}

      <SuccessToast
        visible={showSuccessToast}
        message="Court booked successfully!"
        variant="success"
        duration={3000}
        onHide={() => setShowSuccessToast(false)}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
    marginBottom: 85,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: TextColors.muted,
    fontSize: 14,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.accentError + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: TextColors.primary,
  },
  errorSubtitle: {
    fontSize: 14,
    color: TextColors.muted,
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    color: Backgrounds.root,
    fontWeight: "700",
    fontSize: 14,
  },

  heroSection: {
    height: 280,
    position: "relative",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  surfaceBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  surfaceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  courtName: {
    fontSize: 26,
    fontWeight: "800",
    color: TextColors.primary,
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: TextColors.secondary,
  },

  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    marginTop: -Spacing.md,
  },

  pricingCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  pricingGradient: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceMain: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  priceValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  priceCredits: {
    color: Colors.dark.primaryGlow,
  },
  priceUnit: {
    fontSize: 14,
    color: TextColors.muted,
    fontWeight: "500",
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.primaryGlow + "20",
  },
  xpBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primaryGlow,
  },
  rulesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ruleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.surface,
  },
  ruleText: {
    fontSize: 12,
    color: TextColors.primary,
    fontWeight: "500",
  },

  slotsSection: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  sectionDate: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  slotButton: {
    width: "100%",
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Backgrounds.surface,
    backgroundColor: Backgrounds.card,
    position: "relative",
    overflow: "hidden",
  },
  slotAvailable: {
    borderColor: Colors.dark.successNeon + "60",
    backgroundColor: Colors.dark.successNeon + "10",
  },
  slotBooked: {
    borderColor: Colors.dark.accentError + "40",
    backgroundColor: Colors.dark.accentError + "08",
  },
  slotBlocked: {
    borderColor: "#4A4F5C40",
    backgroundColor: "#4A4F5C08",
  },
  slotPast: {
    opacity: 0.35,
  },
  slotSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary,
  },
  slotGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.primary,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: "600",
    color: TextColors.primary,
  },
  slotTimeDisabled: {
    color: TextColors.muted,
  },
  slotTimeSelected: {
    color: Backgrounds.root,
    fontWeight: "700",
  },
  slotStatusIcon: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  slotCheckIcon: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Backgrounds.root,
    alignItems: "center",
    justifyContent: "center",
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: TextColors.muted,
  },

  findPartnerCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  findPartnerGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  findPartnerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  findPartnerContent: {
    flex: 1,
  },
  findPartnerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TextColors.primary,
    marginBottom: 2,
  },
  findPartnerSubtitle: {
    fontSize: 13,
    color: TextColors.muted,
  },

  communityOnlyBar: {
    position: "absolute",
    bottom: 145,
    left: 0,
    right: 0,
    backgroundColor: "rgba(17, 20, 26, 0.98)",
    borderTopWidth: 1,
    borderTopColor: "#FF950040",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  communityOnlyContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  communityOnlyTextWrap: {
    flex: 1,
  },
  communityOnlyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FF9500",
  },
  communityOnlySubtitle: {
    fontSize: 12,
    color: TextColors.muted,
    marginTop: 2,
  },
  bookingBar: {
    position: "absolute",
    bottom: 145,
    left: 0,
    right: 0,
  },
  bookingBarGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Backgrounds.surface,
  },
  bookingSummary: {
    flex: 1,
  },
  bookingLabel: {
    fontSize: 12,
    color: TextColors.muted,
    marginBottom: 2,
  },
  bookingTime: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  bookButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  bookButtonDisabled: {
    opacity: 0.6,
  },
  bookButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  bookButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Backgrounds.root,
  },
  bookButtonPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: Backgrounds.root,
    opacity: 0.8,
  },

  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmModal: {
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  confirmGradient: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  confirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TextColors.primary,
  },
  confirmDetails: {
    gap: 4,
  },
  confirmCourtName: {
    fontSize: 18,
    fontWeight: "600",
    color: TextColors.primary,
  },
  confirmDate: {
    fontSize: 14,
    color: TextColors.secondary,
  },
  confirmTime: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  confirmPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Backgrounds.surface,
  },
  confirmPriceLabel: {
    fontSize: 16,
    color: TextColors.muted,
  },
  confirmPriceValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  approvalNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.dark.accentWarning + "15",
    borderRadius: BorderRadius.md,
  },
  approvalText: {
    fontSize: 13,
    color: Colors.dark.accentWarning,
    flex: 1,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  cancelConfirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.lg,
  },
  cancelConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: TextColors.primary,
  },
  confirmBookButton: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  confirmBookGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  confirmBookText: {
    fontSize: 16,
    fontWeight: "700",
    color: Backgrounds.root,
  },
  confirmBookButtonDisabled: {
    opacity: 0.6,
  },

  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Step indicator
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Backgrounds.surface,
  },
  stepDotActive: {
    backgroundColor: Colors.dark.primary,
  },
  stepLine: {
    width: 30,
    height: 2,
    backgroundColor: Backgrounds.surface,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: Colors.dark.primary,
  },

  // Partner options
  partnerOptions: {
    maxHeight: 320,
  },
  partnerOptionCard: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  partnerOptionGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  partnerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  partnerOptionText: {
    flex: 1,
  },
  partnerOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: TextColors.primary,
    marginBottom: 2,
  },
  partnerOptionDesc: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },

  // Search step
  searchStep: {
    flex: 1,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    fontSize: 15,
    color: TextColors.primary,
  },
  searchResults: {
    maxHeight: 200,
  },
  playerResultCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: "#151B24",
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    overflow: "hidden",
  },
  playerPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: TextColors.primary,
  },
  playerLevel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  noResultsText: {
    textAlign: "center",
    color: Colors.dark.textSecondary,
    paddingVertical: Spacing.xl,
  },

  // Guest step
  guestStep: {
    paddingTop: Spacing.sm,
  },
  guestLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  guestInput: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: TextColors.primary,
    borderWidth: 1,
    borderColor: Backgrounds.surface,
    marginBottom: Spacing.sm,
  },
  guestHint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.lg,
  },
  guestButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },

  // Open match step
  openMatchStep: {
    paddingTop: Spacing.sm,
  },
  openMatchInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.primary + "15",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  openMatchInfoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.primary,
    lineHeight: 18,
  },

  // Navigation buttons
  backStepButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  backStepText: {
    fontSize: 15,
    color: Colors.dark.text,
  },
  nextStepButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  nextStepButtonDisabled: {
    opacity: 0.5,
  },
  nextStepText: {
    fontSize: 15,
    fontWeight: "600",
    color: Backgrounds.root,
  },

  // Final confirm step
  finalConfirmStep: {
    paddingTop: Spacing.sm,
  },
  partnerSummary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#151B24",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.md,
    gap: Spacing.sm,
  },
  partnerSummaryText: {
    fontSize: 14,
    color: TextColors.primary,
    fontWeight: "500",
  },

  staticMapCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    height: 200,
  },
  staticMapImage: {
    width: "100%",
    height: "100%",
  },
  staticMapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    alignItems: "flex-end",
  },
  staticMapBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,212,255,0.9)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  staticMapBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Backgrounds.root,
  },
}));
