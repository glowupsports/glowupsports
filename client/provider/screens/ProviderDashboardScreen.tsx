import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  Image,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl, apiRequest } from "@/lib/query-client";
import {
  getPrimarySpecialization,
  PROVIDER_SPECIALIZATIONS,
  ProviderSpecialization,
} from "@/provider/constants/specializations";

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  totalAmount: string;
  items: Array<{
    id: string;
    name: string;
    service?: { id: string; name: string; iconName: string; durationMinutes: number | null };
  }>;
  player?: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    level: number;
  } | null;
}

interface ProviderProfile {
  id: string;
  displayName: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  specializations: string[];
  rating: string | null;
  totalBookings: number;
  isOnboarded: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFD700",
  confirmed: Colors.dark.primary,
  completed: Colors.dark.textSecondary,
  cancelled: Colors.dark.error,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Done",
  cancelled: "Cancelled",
};

function formatTime(iso: string | null): string {
  if (!iso) return "No time set";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisWeek(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

function PlayerAvatar({ uri, size = 32 }: { uri: string | null | undefined; size?: number }) {
  const resolvedUri = uri
    ? uri.startsWith("/") ? getStaticAssetsUrl() + uri : uri
    : null;
  if (resolvedUri) {
    return <Image source={{ uri: resolvedUri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.dark.backgroundDefault, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="person" size={size * 0.45} color={Colors.dark.textSecondary} />
    </View>
  );
}

function ActionCard({
  booking,
  onConfirm,
  onDecline,
  onPress,
  isUpdating,
}: {
  booking: Booking;
  onConfirm: () => void;
  onDecline: () => void;
  onPress: () => void;
  isUpdating: boolean;
}) {
  const serviceName = booking.items?.[0]?.service?.name ?? booking.items?.[0]?.name ?? "Service Booking";
  return (
    <Pressable style={styles.actionCard} onPress={onPress}>
      <View style={styles.actionCardTop}>
        <PlayerAvatar uri={booking.player?.profilePhotoUrl} size={36} />
        <View style={styles.actionCardInfo}>
          <Text style={styles.actionCardPlayer} numberOfLines={1}>
            {booking.player?.name ?? "Unknown Player"}
          </Text>
          <Text style={styles.actionCardService} numberOfLines={1}>{serviceName}</Text>
        </View>
        <View style={styles.actionCardTime}>
          <Ionicons name="time-outline" size={12} color={Colors.dark.textSecondary} />
          <Text style={styles.actionCardTimeText}>{formatTime(booking.scheduledAt)}</Text>
        </View>
      </View>
      <View style={styles.actionButtons}>
        <Pressable
          style={[styles.actionBtn, styles.declineBtn, isUpdating && { opacity: 0.5 }]}
          onPress={onDecline}
          disabled={isUpdating}
        >
          <Text style={styles.declineBtnText}>Decline</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.confirmBtn, isUpdating && { opacity: 0.5 }]}
          onPress={onConfirm}
          disabled={isUpdating}
        >
          <Text style={styles.confirmBtnText}>Confirm</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function ScheduleRow({ booking, onPress }: { booking: Booking; onPress: () => void }) {
  const serviceName = booking.items?.[0]?.service?.name ?? booking.items?.[0]?.name ?? "Service";
  const statusColor = STATUS_COLORS[booking.status] ?? Colors.dark.textSecondary;
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;
  return (
    <Pressable style={styles.scheduleRow} onPress={onPress}>
      <View style={styles.timeCol}>
        <Text style={styles.scheduleTime}>{formatTime(booking.scheduledAt)}</Text>
      </View>
      <View style={[styles.scheduleBar, { backgroundColor: statusColor }]} />
      <View style={styles.scheduleBody}>
        <Text style={styles.scheduleName} numberOfLines={1}>{serviceName}</Text>
        {booking.player ? (
          <View style={styles.schedulePlayerRow}>
            <PlayerAvatar uri={booking.player.profilePhotoUrl} size={16} />
            <Text style={styles.schedulePlayerName} numberOfLines={1}>{booking.player.name}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: statusColor + "20" }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
    </Pressable>
  );
}

export default function ProviderDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: profile } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  const { data: todayBookings = [], isLoading: loadingToday, refetch: refetchToday } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings", { date: "today" }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/provider/me/bookings?date=today");
      return res.json();
    },
  });

  const { data: allBookings = [], isLoading: loadingAll, refetch: refetchAll } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const isLoading = loadingToday || loadingAll;
  const refetch = () => { refetchToday(); refetchAll(); };

  const pendingBookings = useMemo(() => allBookings.filter((b) => b.status === "pending"), [allBookings]);
  const weekTotal = useMemo(() => allBookings.filter((b) => isThisWeek(b.scheduledAt)).length, [allBookings]);
  const rating = Number(profile?.rating ?? 0);

  const primary = getPrimarySpecialization(profile?.specializations ?? []);
  const extraSpecs = (profile?.specializations ?? []).length - 1;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const firstName = profile?.displayName?.split(" ")[0] ?? user?.name?.split(" ")[0] ?? "Provider";

  const updateBookingStatus = async (orderId: string, status: "confirmed" | "cancelled") => {
    setUpdatingId(orderId);
    try {
      const res = await apiRequest("PATCH", `/api/provider/bookings/${orderId}/status`, { status });
      if (!res.ok) throw new Error("Failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/provider/me/bookings"] });
    } catch {
      Alert.alert("Error", "Could not update booking. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDecline = (booking: Booking) => {
    Alert.alert(
      "Decline Booking",
      `Are you sure you want to decline this booking from ${booking.player?.name ?? "this player"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () => updateBookingStatus(booking.id, "cancelled"),
        },
      ]
    );
  };

  const sortedToday = useMemo(
    () =>
      [...todayBookings].sort((a, b) => {
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }),
    [todayBookings]
  );

  const profilePhotoUri = profile?.profilePhotoUrl
    ? profile.profilePhotoUrl.startsWith("/")
      ? getStaticAssetsUrl() + profile.profilePhotoUrl
      : profile.profilePhotoUrl
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.dark.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(0).duration(350)}>
          <View style={styles.careerCard}>
            <View style={styles.careerLeft}>
              {profilePhotoUri ? (
                <Image source={{ uri: profilePhotoUri }} style={styles.careerAvatar} />
              ) : (
                <View style={[styles.careerAvatarPlaceholder, { backgroundColor: primary.color + "20" }]}>
                  <Ionicons name={primary.icon} size={28} color={primary.color} />
                </View>
              )}
            </View>
            <View style={styles.careerBody}>
              <Text style={styles.careerGreeting}>{greeting},</Text>
              <Text style={styles.careerName} numberOfLines={1}>{firstName}</Text>
              <View style={styles.careerSpecRow}>
                <View style={[styles.specBadge, { backgroundColor: primary.color + "20" }]}>
                  <Ionicons name={primary.icon} size={12} color={primary.color} />
                  <Text style={[styles.specBadgeText, { color: primary.color }]}>{primary.label}</Text>
                </View>
                {extraSpecs > 0 ? (
                  <View style={styles.extraSpecsPill}>
                    <Text style={styles.extraSpecsText}>+{extraSpecs} more</Text>
                  </View>
                ) : null}
              </View>
              {rating > 0 ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                  <Text style={styles.totalBookingsText}>· {profile?.totalBookings ?? 0} bookings</Text>
                </View>
              ) : (
                <Text style={styles.greetingSuffix}>{primary.greetingSuffix}</Text>
              )}
              <View style={styles.rankPlaceholder}>
                <Ionicons name="ribbon-outline" size={12} color={Colors.dark.textSecondary} />
                <Text style={styles.rankPlaceholderText}>Rank system coming soon</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(80).duration(300)} style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayBookings.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={[styles.statCard, pendingBookings.length > 0 && styles.statCardWarning]}>
            <Text style={[styles.statValue, pendingBookings.length > 0 && styles.statValueWarning]}>
              {pendingBookings.length}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{weekTotal}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {rating > 0 ? rating.toFixed(1) : "—"}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </Animated.View>

        {pendingBookings.length > 0 ? (
          <Animated.View entering={FadeInUp.delay(140).duration(300)}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flash" size={14} color="#FFD700" />
              <Text style={[styles.sectionTitle, { color: "#FFD700" }]}>NEEDS ACTION</Text>
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentBadgeText}>{pendingBookings.length}</Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.actionCardsScroll}
            >
              {pendingBookings.map((booking) => (
                <ActionCard
                  key={booking.id}
                  booking={booking}
                  isUpdating={updatingId === booking.id}
                  onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: booking.id })}
                  onConfirm={() => updateBookingStatus(booking.id, "confirmed")}
                  onDecline={() => handleDecline(booking)}
                />
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(200).duration(300)}>
          <View style={styles.sectionHeader}>
            <Ionicons name="today-outline" size={14} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>TODAY'S SCHEDULE</Text>
          </View>

          {sortedToday.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: primary.color + "15" }]}>
                <Ionicons name={primary.icon} size={32} color={primary.color} />
              </View>
              <Text style={styles.emptyTitle}>All clear today</Text>
              <Text style={styles.emptySubtitle}>{primary.emptySchedule}</Text>
            </View>
          ) : (
            sortedToday.map((booking) => (
              <ScheduleRow
                key={booking.id}
                booking={booking}
                onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: booking.id })}
              />
            ))
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },

  careerCard: {
    flexDirection: "row",
    backgroundColor: "#0F141B",
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  careerLeft: { justifyContent: "center" },
  careerAvatar: { width: 64, height: 64, borderRadius: 32 },
  careerAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  careerBody: { flex: 1, gap: 5 },
  careerGreeting: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  careerName: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
    lineHeight: 24,
  },
  careerSpecRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  specBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  specBadgeText: { fontSize: 11, fontWeight: "700" },
  extraSpecsPill: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  extraSpecsText: { fontSize: 10, color: Colors.dark.textSecondary, fontWeight: "600" },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: { fontSize: 13, fontWeight: "700", color: "#FFD700" },
  totalBookingsText: { fontSize: 12, color: Colors.dark.textSecondary },
  greetingSuffix: { fontSize: 12, color: Colors.dark.textSecondary },
  rankPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  rankPlaceholderText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },

  statsRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statCardWarning: {
    backgroundColor: "#FFD700" + "15",
    borderWidth: 1,
    borderColor: "#FFD700" + "30",
  },
  statValue: { fontSize: 22, fontWeight: "800", color: Colors.dark.text },
  statValueWarning: { color: "#FFD700" },
  statLabel: {
    fontSize: 9,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    flex: 1,
  },
  urgentBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  urgentBadgeText: { fontSize: 10, fontWeight: "800", color: "#000" },
  actionCardsScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
    marginBottom: Spacing.md,
  },
  actionCard: {
    width: 260,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "#FFD700" + "30",
  },
  actionCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionCardInfo: { flex: 1, gap: 2 },
  actionCardPlayer: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  actionCardService: { fontSize: 12, color: Colors.dark.textSecondary },
  actionCardTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  actionCardTimeText: { fontSize: 11, color: Colors.dark.textSecondary },
  actionButtons: { flexDirection: "row", gap: Spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  confirmBtn: { backgroundColor: Colors.dark.primary },
  confirmBtnText: { fontSize: 13, fontWeight: "700", color: "#000" },
  declineBtn: {
    backgroundColor: Colors.dark.error + "15",
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  declineBtnText: { fontSize: 13, fontWeight: "700", color: Colors.dark.error },

  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },

  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  timeCol: { width: 56, alignItems: "center" },
  scheduleTime: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary, textAlign: "center" },
  scheduleBar: { width: 3, height: 40, borderRadius: 2 },
  scheduleBody: { flex: 1, gap: 4 },
  scheduleName: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  schedulePlayerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  schedulePlayerName: { fontSize: 12, color: Colors.dark.textSecondary },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "600" },
});
