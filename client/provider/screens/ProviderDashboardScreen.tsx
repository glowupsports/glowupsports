import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl } from "@/lib/query-client";

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  notes: string | null;
  totalAmount: string;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: string;
    service?: {
      id: string;
      name: string;
      iconName: string;
      durationMinutes: number | null;
    };
  }>;
  player?: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    level: number;
  };
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
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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

function BookingCard({
  booking,
  onPress,
}: {
  booking: Booking;
  onPress: () => void;
}) {
  const serviceName =
    booking.items?.[0]?.service?.name ?? "Service Booking";
  const iconName =
    (booking.items?.[0]?.service?.iconName as any) ?? "build-outline";
  const statusColor = STATUS_COLORS[booking.status] ?? Colors.dark.textSecondary;
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;

  return (
    <Pressable style={styles.bookingCard} onPress={onPress}>
      <View style={styles.bookingIconContainer}>
        <Ionicons name={iconName} size={22} color={Colors.dark.primary} />
      </View>
      <View style={styles.bookingInfo}>
        <Text style={styles.bookingServiceName} numberOfLines={1}>
          {serviceName}
        </Text>
        <View style={styles.bookingMeta}>
          {booking.player ? (
            <View style={styles.playerMini}>
              {booking.player.profilePhotoUrl ? (
                <Image
                  source={{
                    uri: booking.player.profilePhotoUrl.startsWith("/")
                      ? getStaticAssetsUrl() + booking.player.profilePhotoUrl
                      : booking.player.profilePhotoUrl,
                  }}
                  style={styles.playerAvatar}
                />
              ) : (
                <View style={styles.playerAvatarPlaceholder}>
                  <Ionicons name="person" size={10} color={Colors.dark.textSecondary} />
                </View>
              )}
              <Text style={styles.playerName} numberOfLines={1}>
                {booking.player.name}
              </Text>
            </View>
          ) : null}
          <Ionicons
            name="time-outline"
            size={12}
            color={Colors.dark.textSecondary}
          />
          <Text style={styles.bookingTime}>
            {formatTime(booking.scheduledAt)}
          </Text>
        </View>
      </View>
      <View style={[styles.statusPill, { backgroundColor: statusColor + "20" }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={Colors.dark.textSecondary}
      />
    </Pressable>
  );
}

export default function ProviderDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const { data: todayBookings = [], isLoading: isLoadingToday, refetch: refetchToday } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings", { date: "today" }],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const res = await fetch(`${getApiUrl()}/api/provider/me/bookings?date=today`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch today's bookings");
      return res.json();
    },
  });

  const { data: allBookings = [], refetch: refetchAll } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const isLoading = isLoadingToday;

  const refetch = () => {
    refetchToday();
    refetchAll();
  };

  const pendingCount = useMemo(
    () => allBookings.filter((b) => b.status === "pending").length,
    [allBookings]
  );

  const weekTotal = useMemo(
    () => allBookings.filter((b) => isThisWeek(b.scheduledAt)).length,
    [allBookings]
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const today = new Date();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {greeting}, {user?.name?.split(" ")[0] ?? "Provider"}
          </Text>
          <Text style={styles.dateLabel}>{formatDateLabel(today.toISOString())}</Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="construct-outline" size={20} color={Colors.dark.primary} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={Colors.dark.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(50).duration(300)} style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayBookings.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={[styles.statCard, styles.statCardHighlight]}>
            <Text style={[styles.statValue, styles.statValueHighlight]}>
              {pendingCount}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{weekTotal}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(300)}>
          <View style={styles.sectionHeader}>
            <Ionicons name="today-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>TODAY'S SCHEDULE</Text>
          </View>

          {todayBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="checkmark-circle-outline"
                size={48}
                color={Colors.dark.textSecondary}
              />
              <Text style={styles.emptyTitle}>All clear today</Text>
              <Text style={styles.emptySubtitle}>
                No bookings scheduled for today
              </Text>
            </View>
          ) : (
            todayBookings
              .sort((a, b) => {
                if (!a.scheduledAt) return 1;
                if (!b.scheduledAt) return -1;
                return (
                  new Date(a.scheduledAt).getTime() -
                  new Date(b.scheduledAt).getTime()
                );
              })
              .map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onPress={() =>
                    navigation.navigate("ProviderBookingDetail", {
                      booking,
                    })
                  }
                />
              ))
          )}
        </Animated.View>

        {allBookings.filter((b) => b.status === "pending").length > 0 ? (
          <Animated.View entering={FadeInUp.delay(200).duration(300)}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color="#FFD700"
              />
              <Text style={[styles.sectionTitle, { color: "#FFD700" }]}>
                NEEDS ATTENTION
              </Text>
            </View>
            {allBookings
              .filter((b) => b.status === "pending" && !isToday(b.scheduledAt))
              .slice(0, 3)
              .map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onPress={() =>
                    navigation.navigate("ProviderBookingDetail", {
                      booking,
                    })
                  }
                />
              ))}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
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
  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  headerBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    alignItems: "center",
  },
  statCardHighlight: {
    backgroundColor: "#FFD700" + "15",
    borderWidth: 1,
    borderColor: "#FFD700" + "30",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statValueHighlight: {
    color: "#FFD700",
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  bookingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  bookingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  bookingInfo: {
    flex: 1,
    gap: 4,
  },
  bookingServiceName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  bookingMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playerMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 4,
  },
  playerAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  playerAvatarPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  playerName: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    maxWidth: 80,
  },
  bookingTime: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
