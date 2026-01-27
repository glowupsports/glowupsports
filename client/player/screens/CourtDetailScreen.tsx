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
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { ScheduleStackParamList, PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { AnimatedCheck } from "@/components/AnimatedCheck";
import { SuccessToast } from "@/components/SuccessToast";

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
  };
  canBook: boolean;
  availability: Array<{
    id: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
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

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
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
            <Ionicons name="lock-closed" size={10} color="#7C8290" />
          </View>
        )}
        {isSelected && (
          <View style={styles.slotCheckIcon}>
            <Ionicons name="checkmark" size={12} color="#0B0D10" />
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
  
  const { courtId, date } = route.params;
  
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const detailUrl = `/api/courts/${courtId}/details?date=${date}`;

  const { data: court, isLoading, isError } = useQuery<CourtDetails>({
    queryKey: [detailUrl],
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: { date: string; startTime: string; endTime: string }) => {
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
    const slotDate = new Date(date);
    const [hours, minutes] = time.split(":").map(Number);
    slotDate.setHours(hours, minutes, 0, 0);
    
    if (slotDate < now) return "past";
    
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
    });
    setShowBookingConfirm(false);
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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.loadingPulse}>
          <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
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
        {hasPhoto ? (
          <Image
            source={{ uri: `${apiUrl}${court.photoUrl}` }}
            style={styles.heroImage}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={[surfaceConfig.color + "30", "#11141A"]}
            style={styles.heroPlaceholder}
          >
            <Ionicons name="tennisball-outline" size={60} color={surfaceConfig.color + "50"} />
          </LinearGradient>
        )}
        
        <LinearGradient
          colors={["transparent", "rgba(11, 13, 16, 0.6)", "#0B0D10"]}
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
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
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
              <Ionicons name="business-outline" size={14} color="#B8BCC6" />
              <Text style={styles.metaText}>{court.academy.name}</Text>
            </View>
          )}
          {court.location && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color="#B8BCC6" />
              <Text style={styles.metaText}>{court.location.name}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pricingCard}>
          <LinearGradient
            colors={["#171B22", "#11141A"]}
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
                <Ionicons name="time-outline" size={14} color={Colors.dark.xpCyan} />
                <Text style={styles.ruleText}>Min {court.minBookingDurationMinutes || 60}m</Text>
              </View>
              <View style={styles.ruleChip}>
                <Ionicons name="hourglass-outline" size={14} color={Colors.dark.xpCyan} />
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

        <Pressable 
          style={styles.findPartnerCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("PlayerFinder" as any);
          }}
        >
          <LinearGradient
            colors={["#171B22", "#11141A"]}
            style={styles.findPartnerGradient}
          >
            <View style={styles.findPartnerIcon}>
              <Ionicons name="people" size={24} color={Colors.dark.xpCyan} />
            </View>
            <View style={styles.findPartnerContent}>
              <Text style={styles.findPartnerTitle}>Looking for a hitting partner?</Text>
              <Text style={styles.findPartnerSubtitle}>Find players nearby to join your session</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#7C8290" />
          </LinearGradient>
        </Pressable>
      </ScrollView>

      {selectedSlot && court.canBook && (
        <View style={[styles.bookingBar, { paddingBottom: insets.bottom + Spacing.md }]}>
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
                colors={bookingMutation.isPending ? ["#4A4F5C", "#4A4F5C"] : [Colors.dark.xpCyan, "#00A8CC"]}
                style={styles.bookButtonGradient}
              >
                {bookingMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
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
        <View style={styles.confirmOverlay}>
          <Pressable style={styles.confirmBackdrop} onPress={() => setShowBookingConfirm(false)} />
          <View style={[styles.confirmModal, { marginBottom: insets.bottom + Spacing.xl }]}>
            <LinearGradient
              colors={["#1F2430", "#171B22"]}
              style={styles.confirmGradient}
            >
              <View style={styles.confirmHeader}>
                <Ionicons name="calendar" size={24} color={Colors.dark.xpCyan} />
                <Text style={styles.confirmTitle}>Confirm Booking</Text>
              </View>
              
              <View style={styles.confirmDetails}>
                <Text style={styles.confirmCourtName}>{court.name}</Text>
                <Text style={styles.confirmDate}>
                  {new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </Text>
                <Text style={styles.confirmTime}>{selectedSlot?.start} - {selectedSlot?.end}</Text>
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
                <Pressable 
                  style={styles.cancelConfirmButton} 
                  onPress={() => setShowBookingConfirm(false)}
                >
                  <Text style={styles.cancelConfirmText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmBookButton} onPress={confirmBooking}>
                  <LinearGradient
                    colors={[Colors.dark.xpCyan, "#00A8CC"]}
                    style={styles.confirmBookGradient}
                  >
                    <Text style={styles.confirmBookText}>Confirm</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0D10",
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
    backgroundColor: "#171B22",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#7C8290",
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
    color: "#FFFFFF",
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#7C8290",
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    color: "#0B0D10",
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
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: "#B8BCC6",
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
    borderColor: "#1F2430",
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
    color: Colors.dark.xpCyan,
  },
  priceCredits: {
    color: Colors.dark.primaryGlow,
  },
  priceUnit: {
    fontSize: 14,
    color: "#7C8290",
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
    backgroundColor: "#1F2430",
  },
  ruleText: {
    fontSize: 12,
    color: "#FFFFFF",
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
    color: "#FFFFFF",
  },
  sectionDate: {
    fontSize: 14,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  slotButton: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 3) / 4,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "#1F2430",
    backgroundColor: "#11141A",
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
    borderColor: Colors.dark.xpCyan,
    backgroundColor: Colors.dark.xpCyan,
  },
  slotGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.xpCyan,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  slotTimeDisabled: {
    color: "#7C8290",
  },
  slotTimeSelected: {
    color: "#0B0D10",
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
    backgroundColor: "#0B0D10",
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
    color: "#7C8290",
  },

  findPartnerCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1F2430",
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
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  findPartnerContent: {
    flex: 1,
  },
  findPartnerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  findPartnerSubtitle: {
    fontSize: 13,
    color: "#7C8290",
  },

  bookingBar: {
    position: "absolute",
    bottom: 0,
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
    borderTopColor: "#1F2430",
  },
  bookingSummary: {
    flex: 1,
  },
  bookingLabel: {
    fontSize: 12,
    color: "#7C8290",
    marginBottom: 2,
  },
  bookingTime: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
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
    color: "#0B0D10",
  },
  bookButtonPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0B0D10",
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
    color: "#FFFFFF",
  },
  confirmDetails: {
    gap: 4,
  },
  confirmCourtName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  confirmDate: {
    fontSize: 14,
    color: "#B8BCC6",
  },
  confirmTime: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  confirmPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#1F2430",
  },
  confirmPriceLabel: {
    fontSize: 16,
    color: "#7C8290",
  },
  confirmPriceValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.xpCyan,
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
    backgroundColor: "#1F2430",
    borderRadius: BorderRadius.lg,
  },
  cancelConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
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
    color: "#0B0D10",
  },

  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
});
