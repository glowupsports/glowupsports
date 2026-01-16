import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;
type RouteProp = NativeStackScreenProps<PlayerStackParamList, "CourtDetail">["route"];

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

const TIME_SLOTS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00",
];

export default function CourtDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const { courtId, date } = route.params;
  
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);

  const detailUrl = `/api/courts/${courtId}/details?date=${date}`;

  const { data: court, isLoading, isError } = useQuery<CourtDetails>({
    queryKey: [detailUrl],
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: { date: string; startTime: string; endTime: string }) => {
      return apiRequest("POST", `/api/courts/${courtId}/book`, data);
    },
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: [detailUrl] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0]?.toString().startsWith("/api/courts/search") ?? false });
      queryClient.invalidateQueries({ queryKey: ["/api/my-court-bookings"] });
    },
    onError: (error: Error) => {
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

  const formatPrice = (price: string | undefined, currency: string = "AED") => {
    if (!price || parseFloat(price) === 0) return "Free";
    return `${currency} ${parseFloat(price).toFixed(0)}`;
  };

  const calculateTotalPrice = () => {
    if (!selectedSlot || !court?.pricePerHour) return "Free";
    const price = parseFloat(court.pricePerHour);
    if (price === 0) return "Free";
    return `${court.currency || "AED"} ${price.toFixed(0)}`;
  };

  const getSurfaceColor = (surface?: string) => {
    switch (surface) {
      case "clay": return "#E07B39";
      case "grass": return "#4CAF50";
      case "indoor": return "#9575CD";
      default: return Colors.dark.xpCyan;
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading court details...</Text>
      </View>
    );
  }

  if (isError || !court) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentError} />
        <Text style={styles.errorText}>Failed to load court details</Text>
        <Pressable style={styles.retryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.retryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{court.name}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.courtInfo}>
          <View style={styles.infoRow}>
            <View style={[styles.surfaceTag, { backgroundColor: getSurfaceColor(court.surface) + "20" }]}>
              <Text style={[styles.surfaceText, { color: getSurfaceColor(court.surface) }]}>
                {court.surface?.charAt(0).toUpperCase() + (court.surface?.slice(1) || "Hard")} Court
              </Text>
            </View>
          </View>

          {court.academy && (
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={18} color={Colors.dark.textSecondary} />
              <Text style={styles.detailText}>{court.academy.name}</Text>
            </View>
          )}

          {court.location && (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={18} color={Colors.dark.textSecondary} />
              <Text style={styles.detailText}>{court.location.name}</Text>
            </View>
          )}

          {court.description && (
            <Text style={styles.description}>{court.description}</Text>
          )}
        </View>

        <View style={styles.pricingSection}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <View style={styles.pricingGrid}>
            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>Standard Rate</Text>
              <Text style={styles.priceValue}>{formatPrice(court.pricePerHour, court.currency)}/hr</Text>
            </View>
            {court.memberPricePerHour && (
              <View style={styles.priceCard}>
                <Text style={styles.priceLabel}>Member Rate</Text>
                <Text style={[styles.priceValue, styles.memberPrice]}>
                  {formatPrice(court.memberPricePerHour, court.currency)}/hr
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.rulesSection}>
          <Text style={styles.sectionTitle}>Booking Rules</Text>
          <View style={styles.rulesGrid}>
            <View style={styles.ruleItem}>
              <Ionicons name="time-outline" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.ruleText}>
                Min: {court.minBookingDurationMinutes || 60} min
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="hourglass-outline" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.ruleText}>
                Max: {court.maxBookingDurationHours || 2} hrs
              </Text>
            </View>
            <View style={styles.ruleItem}>
              <Ionicons name="close-circle-outline" size={20} color={Colors.dark.accentWarning} />
              <Text style={styles.ruleText}>
                Cancel: {court.cancelWindowHours || 24}h before
              </Text>
            </View>
            {court.xpRewardPerHour && court.xpRewardPerHour > 0 && (
              <View style={styles.ruleItem}>
                <Ionicons name="star-outline" size={20} color={Colors.dark.xpCyan} />
                <Text style={styles.ruleText}>
                  +{court.xpRewardPerHour} XP/hr
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.slotsSection}>
          <Text style={styles.sectionTitle}>
            Available Slots - {new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </Text>
          <View style={styles.slotsGrid}>
            {availableSlots.map((slot) => (
              <Pressable
                key={slot.time}
                style={[
                  styles.slotButton,
                  slot.status === "available" && styles.slotAvailable,
                  slot.status === "booked" && styles.slotBooked,
                  slot.status === "blocked" && styles.slotBlocked,
                  slot.status === "past" && styles.slotPast,
                  selectedSlot?.start === slot.time && styles.slotSelected,
                ]}
                onPress={() => handleSlotPress(slot.time, slot.status)}
                disabled={slot.status !== "available"}
              >
                <Text style={[
                  styles.slotTime,
                  slot.status !== "available" && styles.slotTimeDisabled,
                  selectedSlot?.start === slot.time && styles.slotTimeSelected,
                ]}>
                  {slot.time}
                </Text>
                {slot.status === "booked" && (
                  <Ionicons name="close" size={12} color={Colors.dark.accentError} />
                )}
                {slot.status === "blocked" && (
                  <Ionicons name="lock-closed" size={12} color={Colors.dark.textSecondary} />
                )}
              </Pressable>
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
              <View style={[styles.legendDot, { backgroundColor: Colors.dark.textSecondary }]} />
              <Text style={styles.legendText}>Blocked</Text>
            </View>
          </View>
        </View>

        <Pressable 
          style={styles.findPlayerSection}
          onPress={() => navigation.navigate("PlayerFinder" as any)}
        >
          <View style={styles.findPlayerContent}>
            <View style={styles.findPlayerIcon}>
              <Ionicons name="people" size={24} color={Colors.dark.xpCyan} />
            </View>
            <View style={styles.findPlayerText}>
              <Text style={styles.findPlayerTitle}>Looking for a hitting partner?</Text>
              <Text style={styles.findPlayerSubtitle}>Find players nearby to join your session</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.textSecondary} />
          </View>
        </Pressable>
      </ScrollView>

      {selectedSlot && court.canBook && (
        <View style={[styles.bookingBar, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.bookingSummary}>
            <Text style={styles.bookingTime}>
              {selectedSlot.start} - {selectedSlot.end}
            </Text>
            <Text style={styles.bookingPrice}>{calculateTotalPrice()}</Text>
          </View>
          <Pressable 
            style={[styles.bookButton, bookingMutation.isPending && styles.bookButtonDisabled]}
            onPress={handleBook}
            disabled={bookingMutation.isPending}
          >
            {bookingMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <Text style={styles.bookButtonText}>Book Now</Text>
            )}
          </Pressable>
        </View>
      )}

      {showBookingConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmModal, { marginBottom: insets.bottom + Spacing.xl }]}>
            <Text style={styles.confirmTitle}>Confirm Booking</Text>
            <Text style={styles.confirmDetails}>
              {court.name}{"\n"}
              {new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}{"\n"}
              {selectedSlot?.start} - {selectedSlot?.end}
            </Text>
            <Text style={styles.confirmPrice}>Total: {calculateTotalPrice()}</Text>
            
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
                <Text style={styles.confirmBookText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  errorText: {
    color: Colors.dark.accentError,
    fontSize: 16,
    fontWeight: "600",
  },
  retryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  courtInfo: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  surfaceTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  surfaceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  description: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  pricingSection: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  pricingGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  priceCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  memberPrice: {
    color: Colors.dark.successNeon,
  },
  rulesSection: {
    marginBottom: Spacing.md,
  },
  rulesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ruleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  ruleText: {
    fontSize: 12,
    color: Colors.dark.text,
  },
  slotsSection: {
    marginBottom: Spacing.md,
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  slotButton: {
    width: "22%",
    aspectRatio: 1.8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  slotAvailable: {
    borderColor: Colors.dark.successNeon,
    backgroundColor: Colors.dark.successNeon + "10",
  },
  slotBooked: {
    borderColor: Colors.dark.accentError,
    backgroundColor: Colors.dark.accentError + "10",
  },
  slotBlocked: {
    borderColor: Colors.dark.textSecondary,
    backgroundColor: Colors.dark.textSecondary + "10",
  },
  slotPast: {
    opacity: 0.4,
  },
  slotSelected: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: Colors.dark.xpCyan,
  },
  slotTime: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  slotTimeDisabled: {
    color: Colors.dark.textSecondary,
  },
  slotTimeSelected: {
    color: Colors.dark.backgroundRoot,
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  bookingBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  bookingSummary: {
    flex: 1,
  },
  bookingTime: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  bookingPrice: {
    fontSize: 18,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  bookButton: {
    backgroundColor: Colors.dark.xpCyan,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  bookButtonDisabled: {
    opacity: 0.6,
  },
  bookButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  confirmModal: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  confirmDetails: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  confirmPrice: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    textAlign: "center",
  },
  approvalNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.accentWarning + "20",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  approvalText: {
    fontSize: 12,
    color: Colors.dark.accentWarning,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelConfirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  cancelConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  confirmBookButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.xpCyan,
    alignItems: "center",
  },
  confirmBookText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  findPlayerSection: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
    overflow: "hidden",
  },
  findPlayerContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  findPlayerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.xpCyan + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  findPlayerText: {
    flex: 1,
  },
  findPlayerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  findPlayerSubtitle: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
});
