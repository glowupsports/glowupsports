import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;

interface BookingPartner {
  id: string;
  displayName: string;
  photoUrl?: string;
  xpLevel?: number;
}

interface BookingGuest {
  name: string;
  email?: string;
}

interface OpenMatch {
  id: string;
  title?: string;
  status: string;
  maxPlayers: number;
  currentPlayers: number;
}

interface CourtBooking {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType: string;
  price: string;
  currency: string;
  paymentStatus: string;
  status: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  xpAwarded: number;
  notes?: string;
  createdAt: string;
  partnerType?: "friend" | "guest" | "open_match" | "solo";
  court: {
    id: string;
    name: string;
    surface?: string;
    academy?: {
      name: string;
    };
    location?: {
      name: string;
    };
  };
  partner?: BookingPartner;
  guest?: BookingGuest;
  openMatch?: OpenMatch;
}

type TabType = "upcoming" | "past" | "cancelled";

export default function MyCourtBookingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const [refreshing, setRefreshing] = useState(false);

  const { data: bookings = [], isLoading, isError, refetch } = useQuery<CourtBooking[]>({
    queryKey: ["/api/my-court-bookings"],
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      return apiRequest("POST", `/api/court-bookings/${bookingId}/cancel`, { reason: "User cancelled" });
    },
    onSuccess: () => {
      Alert.alert("Booking Cancelled", "Your booking has been cancelled successfully.");
      queryClient.invalidateQueries({ queryKey: ["/api/my-court-bookings"] });
    },
    onError: (error: Error) => {
      Alert.alert("Cannot Cancel", error.message || "Failed to cancel the booking.");
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCancelBooking = (booking: CourtBooking) => {
    const bookingDate = new Date(`${booking.date}T${booking.startTime}`);
    const hoursUntil = (bookingDate.getTime() - Date.now()) / (1000 * 60 * 60);
    
    if (hoursUntil < 24) {
      Alert.alert(
        "Cannot Cancel",
        "Bookings cannot be cancelled less than 24 hours before the scheduled time.",
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Cancel Booking",
      `Are you sure you want to cancel your booking for ${booking.court.name} on ${new Date(booking.date).toLocaleDateString()}?`,
      [
        { text: "Keep Booking", style: "cancel" },
        { 
          text: "Cancel Booking", 
          style: "destructive",
          onPress: () => cancelMutation.mutate(booking.id),
        },
      ]
    );
  };

  const filteredBookings = bookings.filter(booking => {
    const bookingDate = new Date(`${booking.date}T${booking.endTime}`);
    const now = new Date();
    
    switch (activeTab) {
      case "upcoming":
        return booking.status !== "cancelled" && bookingDate >= now;
      case "past":
        return booking.status !== "cancelled" && bookingDate < now;
      case "cancelled":
        return booking.status === "cancelled";
      default:
        return true;
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return Colors.dark.successNeon;
      case "pending": return Colors.dark.accentWarning;
      case "cancelled": return Colors.dark.accentError;
      default: return Colors.dark.textSecondary;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      weekday: "short", 
      month: "short", 
      day: "numeric" 
    });
  };

  const getSurfaceIcon = (surface?: string) => {
    switch (surface) {
      case "clay": return "leaf-outline";
      case "grass": return "golf-outline";
      case "indoor": return "home-outline";
      default: return "tennisball-outline";
    }
  };

  const getPartnerIcon = (partnerType?: string) => {
    switch (partnerType) {
      case "friend": return "people";
      case "guest": return "person-add";
      case "open_match": return "globe";
      case "solo": return "fitness";
      default: return "person";
    }
  };

  const getPartnerColor = (partnerType?: string) => {
    switch (partnerType) {
      case "friend": return Colors.dark.xpCyan;
      case "guest": return Colors.dark.primaryGlow;
      case "open_match": return "#E040FB";
      case "solo": return "#FF9500";
      default: return Colors.dark.textSecondary;
    }
  };

  const renderPartnerInfo = (booking: CourtBooking) => {
    const apiUrl = getApiUrl();
    
    if (booking.partnerType === "friend" && booking.partner) {
      return (
        <View style={styles.partnerRow}>
          <View style={[styles.partnerIconCircle, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
            {booking.partner.photoUrl ? (
              <Image 
                source={{ uri: `${apiUrl}${booking.partner.photoUrl}` }} 
                style={styles.partnerPhoto}
              />
            ) : (
              <Ionicons name="person" size={14} color={Colors.dark.xpCyan} />
            )}
          </View>
          <View style={styles.partnerInfo}>
            <Text style={styles.partnerLabel}>Playing with</Text>
            <Text style={styles.partnerName}>{booking.partner.displayName}</Text>
          </View>
          {booking.partner.xpLevel && (
            <View style={styles.partnerLevelBadge}>
              <Text style={styles.partnerLevelText}>Lvl {booking.partner.xpLevel}</Text>
            </View>
          )}
        </View>
      );
    }
    
    if (booking.partnerType === "guest" && booking.guest) {
      return (
        <View style={styles.partnerRow}>
          <View style={[styles.partnerIconCircle, { backgroundColor: Colors.dark.primaryGlow + "20" }]}>
            <Ionicons name="person-add" size={14} color={Colors.dark.primaryGlow} />
          </View>
          <View style={styles.partnerInfo}>
            <Text style={styles.partnerLabel}>Guest</Text>
            <Text style={styles.partnerName}>{booking.guest.name}</Text>
          </View>
        </View>
      );
    }
    
    if (booking.partnerType === "open_match" && booking.openMatch) {
      const isFull = booking.openMatch.currentPlayers >= booking.openMatch.maxPlayers;
      return (
        <View style={styles.partnerRow}>
          <View style={[styles.partnerIconCircle, { backgroundColor: "#E040FB20" }]}>
            <Ionicons name="globe" size={14} color="#E040FB" />
          </View>
          <View style={styles.partnerInfo}>
            <Text style={styles.partnerLabel}>Open Match</Text>
            <Text style={styles.partnerName}>
              {booking.openMatch.title || "Looking for players"}
            </Text>
          </View>
          <View style={[styles.openMatchStatus, isFull && styles.openMatchFull]}>
            <Text style={[styles.openMatchStatusText, isFull && styles.openMatchFullText]}>
              {booking.openMatch.currentPlayers}/{booking.openMatch.maxPlayers}
            </Text>
          </View>
        </View>
      );
    }
    
    if (booking.partnerType === "solo") {
      return (
        <View style={styles.partnerRow}>
          <View style={[styles.partnerIconCircle, { backgroundColor: "#FF950020" }]}>
            <Ionicons name="fitness" size={14} color="#FF9500" />
          </View>
          <View style={styles.partnerInfo}>
            <Text style={styles.partnerLabel}>Solo Practice</Text>
            <Text style={styles.partnerName}>Training session</Text>
          </View>
        </View>
      );
    }
    
    return null;
  };

  const renderBookingCard = (booking: CourtBooking) => {
    const bookingDate = new Date(`${booking.date}T${booking.endTime}`);
    const isPast = bookingDate < new Date();
    const canCancel = booking.status === "confirmed" && !isPast;
    const hasPartnerInfo = booking.partnerType && booking.partnerType !== "solo" 
      ? (booking.partner || booking.guest || booking.openMatch) 
      : booking.partnerType === "solo";

    return (
      <View key={booking.id} style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <View style={styles.courtInfo}>
            <Ionicons 
              name={getSurfaceIcon(booking.court.surface)} 
              size={20} 
              color={Colors.dark.xpCyan} 
            />
            <Text style={styles.courtName}>{booking.court.name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + "20" }]}>
            <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.bookingDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.dark.textSecondary} />
            <Text style={styles.detailText}>{formatDate(booking.date)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={Colors.dark.textSecondary} />
            <Text style={styles.detailText}>{booking.startTime} - {booking.endTime}</Text>
          </View>
          {booking.court.location && (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.detailText}>{booking.court.location.name}</Text>
            </View>
          )}
        </View>

        {hasPartnerInfo && (
          <View style={styles.partnerSection}>
            {renderPartnerInfo(booking)}
          </View>
        )}

        <View style={styles.bookingFooter}>
          <Text style={styles.priceText}>
            {parseFloat(booking.price) === 0 ? "Free" : `${booking.currency} ${parseFloat(booking.price).toFixed(0)}`}
          </Text>
          {booking.xpAwarded > 0 && (
            <View style={styles.xpBadge}>
              <Ionicons name="star" size={12} color={Colors.dark.xpCyan} />
              <Text style={styles.xpText}>+{booking.xpAwarded} XP</Text>
            </View>
          )}
          {canCancel && (
            <Pressable 
              style={styles.cancelButton}
              onPress={() => handleCancelBooking(booking)}
              disabled={cancelMutation.isPending}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          )}
        </View>

        {booking.status === "cancelled" && booking.cancelReason && (
          <View style={styles.cancelNote}>
            <Text style={styles.cancelNoteText}>Reason: {booking.cancelReason}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Court Bookings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabsContainer}>
        {(["upcoming", "past", "cancelled"] as TabType[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.bookingsList}
        contentContainerStyle={[styles.bookingsListContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh}
            tintColor={Colors.dark.xpCyan}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
            <Text style={styles.loadingText}>Loading your bookings...</Text>
          </View>
        ) : isError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.accentError} />
            <Text style={styles.errorText}>Failed to load bookings</Text>
          </View>
        ) : filteredBookings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color={Colors.dark.textSecondary} />
            <Text style={styles.emptyText}>
              {activeTab === "upcoming" 
                ? "No upcoming bookings" 
                : activeTab === "past" 
                ? "No past bookings" 
                : "No cancelled bookings"}
            </Text>
            {activeTab === "upcoming" && (
              <Pressable 
                style={styles.bookNewButton}
                onPress={() => navigation.navigate("Schedule", { screen: "CourtBooking" } as any)}
              >
                <Text style={styles.bookNewButtonText}>Book a Court</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredBookings.map(renderBookingCard)
        )}
      </ScrollView>

      <Pressable 
        style={[styles.fab, { bottom: insets.bottom + 100 }]}
        onPress={() => navigation.navigate("Schedule", { screen: "CourtBooking" } as any)}
      >
        <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.card,
  },
  tabActive: {
    backgroundColor: Colors.dark.xpCyan,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  tabTextActive: {
    color: Colors.dark.buttonText,
  },
  bookingsList: {
    flex: 1,
  },
  bookingsListContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.sm,
  },
  errorText: {
    color: Colors.dark.accentError,
    fontSize: 16,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: Spacing.md,
  },
  emptyText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
  },
  bookNewButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.xpCyan,
    borderRadius: BorderRadius.md,
  },
  bookNewButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  bookingCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  courtInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  courtName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  bookingDetails: {
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  bookingFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  priceText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  xpText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  cancelButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.accentError,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.accentError,
  },
  cancelNote: {
    backgroundColor: Colors.dark.accentError + "10",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  cancelNoteText: {
    fontSize: 12,
    color: Colors.dark.accentError,
  },
  fab: {
    position: "absolute",
    right: Spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.xpCyan,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  partnerSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  partnerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  partnerPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginBottom: 1,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  partnerLevelBadge: {
    backgroundColor: Colors.dark.xpCyan + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  partnerLevelText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  openMatchStatus: {
    backgroundColor: "#E040FB20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  openMatchFull: {
    backgroundColor: Colors.dark.successNeon + "20",
  },
  openMatchStatusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#E040FB",
  },
  openMatchFullText: {
    color: Colors.dark.successNeon,
  },
});
