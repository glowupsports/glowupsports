import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing } from "@/constants/theme";
import { getStaticAssetsUrl, apiRequest } from "@/lib/query-client";
import { getPrimarySpecialization } from "@/provider/constants/specializations";

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  totalAmount: string;
  items: Array<{
    id: string;
    name: string;
    service?: { id: string; name: string; iconName: string };
  }>;
  player?: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    level: number;
  } | null;
}

interface ProviderProfile {
  specializations: string[];
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

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getWeekDays(): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function ProviderScheduleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const weekDays = useMemo(() => getWeekDays(), []);

  const { data: profile } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const primary = getPrimarySpecialization(profile?.specializations ?? []);

  const dayBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (!b.scheduledAt) return false;
        return isSameDay(new Date(b.scheduledAt), selectedDay);
      })
      .sort((a, b) => {
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
  }, [bookings, selectedDay]);

  const selectedLabel = `${DAY_LABELS[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTH_LABELS[selectedDay.getMonth()]}`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Schedule</Text>
      </View>

      <View style={styles.weekStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDay);
            const isToday = isSameDay(day, today);
            const dayBookingCount = bookings.filter(
              (b) => b.scheduledAt && isSameDay(new Date(b.scheduledAt), day)
            ).length;
            return (
              <Pressable
                key={day.toISOString()}
                style={[styles.dayPill, isSelected && styles.dayPillSelected]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                  {DAY_LABELS[day.getDay()]}
                </Text>
                <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                  {day.getDate()}
                </Text>
                {isToday ? (
                  <View style={[styles.todayDot, isSelected && styles.todayDotSelected]} />
                ) : dayBookingCount > 0 ? (
                  <View style={styles.bookingDot} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.selectedDayRow}>
        <Ionicons name="calendar-outline" size={14} color={Colors.dark.primary} />
        <Text style={styles.selectedDayLabel}>{selectedLabel}</Text>
        {dayBookings.length > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{dayBookings.length}</Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Loading...</Text>
        </View>
      ) : dayBookings.length === 0 ? (
        <Animated.View entering={FadeInUp.duration(300)} style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: primary.color + "15" }]}>
            <Ionicons name={primary.icon} size={36} color={primary.color} />
          </View>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptySubtitle}>{primary.emptySchedule}</Text>
        </Animated.View>
      ) : (
        <FlatList
          data={dayBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const serviceName = item.items?.[0]?.service?.name ?? item.items?.[0]?.name ?? "Service";
            const statusColor = STATUS_COLORS[item.status] ?? Colors.dark.textSecondary;
            const statusLabel = STATUS_LABELS[item.status] ?? item.status;
            return (
              <Animated.View entering={FadeInUp.delay(index * 50).duration(250)}>
                <Pressable
                  style={styles.bookingRow}
                  onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: item.id })}
                >
                  <View style={styles.timeCol}>
                    <Text style={styles.timeText}>{formatTime(item.scheduledAt)}</Text>
                  </View>
                  <View style={[styles.timeBar, { backgroundColor: statusColor }]} />
                  <View style={styles.bookingBody}>
                    <View style={styles.bookingTop}>
                      <Text style={styles.bookingService} numberOfLines={1}>{serviceName}</Text>
                      <View style={[styles.statusPill, { backgroundColor: statusColor + "20" }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    {item.player ? (
                      <View style={styles.playerRow}>
                        {item.player.profilePhotoUrl ? (
                          <Image
                            source={{
                              uri: item.player.profilePhotoUrl.startsWith("/")
                                ? getStaticAssetsUrl() + item.player.profilePhotoUrl
                                : item.player.profilePhotoUrl,
                            }}
                            style={styles.playerAvatar}
                          />
                        ) : (
                          <View style={styles.playerAvatarPlaceholder}>
                            <Ionicons name="person" size={10} color={Colors.dark.textSecondary} />
                          </View>
                        )}
                        <Text style={styles.playerName} numberOfLines={1}>{item.player.name}</Text>
                        <View style={styles.levelPill}>
                          <Text style={styles.levelText}>Lv.{item.player.level}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.dark.textSecondary} />
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  weekStrip: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  weekRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  dayPill: {
    width: 48,
    height: 72,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: 3,
  },
  dayPillSelected: {
    backgroundColor: Colors.dark.primary,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
  },
  dayLabelSelected: { color: "#000" },
  dayNum: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dayNumSelected: { color: "#000" },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  todayDotSelected: { backgroundColor: "#000" },
  bookingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.dark.textSecondary,
  },
  selectedDayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  selectedDayLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  countPill: {
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  timeCol: {
    width: 52,
    alignItems: "center",
  },
  timeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  timeBar: {
    width: 3,
    height: 40,
    borderRadius: 2,
  },
  bookingBody: {
    flex: 1,
    gap: 4,
  },
  bookingTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bookingService: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  playerAvatar: { width: 18, height: 18, borderRadius: 9 },
  playerAvatarPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  playerName: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  levelPill: {
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
});
