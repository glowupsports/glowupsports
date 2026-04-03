import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing } from "@/constants/theme";
import { buildPhotoUrl } from "@/lib/query-client";

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

type FilterTab = "all" | "pending" | "confirmed" | "completed";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
];

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

function formatDateTime(iso: string | null): string {
  if (!iso) return "No time set";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function BookingRow({
  booking,
  onPress,
}: {
  booking: Booking;
  onPress: () => void;
}) {
  const serviceName = booking.items?.[0]?.service?.name ?? "Service Booking";
  const iconName = (booking.items?.[0]?.service?.iconName as any) ?? "build-outline";
  const statusColor = STATUS_COLORS[booking.status] ?? Colors.dark.textSecondary;
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;

  return (
    <Pressable style={styles.bookingRow} onPress={onPress}>
      <View style={styles.rowIconContainer}>
        <Ionicons name={iconName} size={20} color={Colors.dark.primary} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowServiceName} numberOfLines={1}>
          {serviceName}
        </Text>
        <View style={styles.rowMeta}>
          {booking.player ? (
            <>
              {booking.player.profilePhotoUrl ? (
                <Image
                  source={{
                      uri: buildPhotoUrl(booking.player.profilePhotoUrl)!,
                  }}
                  style={styles.miniAvatar}
                />
              ) : (
                <View style={styles.miniAvatarPlaceholder}>
                  <Ionicons name="person" size={9} color={Colors.dark.textSecondary} />
                </View>
              )}
              <Text style={styles.rowPlayerName} numberOfLines={1}>
                {booking.player.name}
              </Text>
              <Text style={styles.rowDot}>·</Text>
            </>
          ) : null}
          <Text style={styles.rowDateTime}>{formatDateTime(booking.scheduledAt)}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.statusPill, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
      </View>
    </Pressable>
  );
}

export default function ProviderBookingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<FilterTab>("all");

  const { data: bookings = [], isLoading, refetch } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const filtered = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => {
      if (!a.scheduledAt) return 1;
      if (!b.scheduledAt) return -1;
      return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
    });
    if (filter === "all") return sorted;
    return sorted.filter((b) => b.status === filter);
  }, [bookings, filter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>All Bookings</Text>
        <Text style={styles.headerCount}>{bookings.length} total</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === "all"
              ? bookings.length
              : bookings.filter((b) => b.status === tab.key).length;
          const isActive = filter === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setFilter(tab.key)}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {tab.label}
              </Text>
              {count > 0 ? (
                <View
                  style={[
                    styles.filterBadge,
                    isActive && styles.filterBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBadgeText,
                      isActive && styles.filterBadgeTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookingRow
            booking={item}
            onPress={() =>
              navigation.navigate("ProviderBookingDetail", { orderId: item.id })
            }
          />
        )}
        contentContainerStyle={[
          styles.listContent,
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
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color={Colors.dark.textSecondary}
            />
            <Text style={styles.emptyTitle}>
              {filter === "all" ? "No bookings yet" : `No ${filter} bookings`}
            </Text>
            <Text style={styles.emptySubtitle}>
              Bookings from players will appear here
            </Text>
          </View>
        }
      />
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerCount: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: 4,
  },
  filterTabActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeActive: {
    backgroundColor: Colors.dark.primary,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  filterBadgeTextActive: {
    color: Colors.dark.backgroundDefault,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  rowIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  rowServiceName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  miniAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  miniAvatarPlaceholder: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  rowPlayerName: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    maxWidth: 90,
  },
  rowDot: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  rowDateTime: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
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
});
