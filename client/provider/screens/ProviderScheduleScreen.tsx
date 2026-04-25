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
import { buildPhotoUrl } from "@/lib/query-client";
import { getPrimarySpecialization } from "@/provider/constants/specializations";

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  totalAmount: string;
  total: string;
  items: {
    id: string;
    name: string;
    service?: { id: string; name: string; iconName: string };
  }[];
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
const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type CalendarView = "day" | "week" | "month";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getWeekDays(refDate: Date): Date[] {
  const dayOfWeek = refDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(refDate);
  startOfWeek.setDate(refDate.getDate() + mondayOffset);
  startOfWeek.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
}

function getMonthDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const offset = startDow === 0 ? 6 : startDow - 1;
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
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

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function BookingCard({ item, onPress }: { item: Booking; onPress: () => void }) {
  const serviceName = item.items?.[0]?.service?.name ?? item.items?.[0]?.name ?? "Service";
  const statusColor = STATUS_COLORS[item.status] ?? Colors.dark.textSecondary;
  const statusLabel = STATUS_LABELS[item.status] ?? item.status;
  return (
    <Pressable style={styles.bookingRow} onPress={onPress}>
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
                  uri: buildPhotoUrl(item.player.profilePhotoUrl)!,
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
  );
}

export default function ProviderScheduleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [view, setView] = useState<CalendarView>("week");
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [weekRef, setWeekRef] = useState<Date>(today);
  const [monthRef, setMonthRef] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));

  const weekDays = useMemo(() => getWeekDays(weekRef), [weekRef]);
  const monthCells = useMemo(() => getMonthDays(monthRef.getFullYear(), monthRef.getMonth()), [monthRef]);

  const { data: profile } = useQuery<ProviderProfile>({
    queryKey: ["/api/provider/me"],
  });

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const primary = getPrimarySpecialization(profile?.specializations ?? []);

  const dayBookings = useMemo(() => {
    return bookings
      .filter((b) => b.scheduledAt && isSameDay(new Date(b.scheduledAt), selectedDay))
      .sort((a, b) => {
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
  }, [bookings, selectedDay]);

  function countForDay(d: Date) {
    return bookings.filter((b) => b.scheduledAt && isSameDay(new Date(b.scheduledAt), d)).length;
  }

  const selectedLabel = `${DAY_FULL[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTH_LABELS[selectedDay.getMonth()]}`;

  function prevWeek() {
    const d = new Date(weekRef);
    d.setDate(d.getDate() - 7);
    setWeekRef(d);
  }
  function nextWeek() {
    const d = new Date(weekRef);
    d.setDate(d.getDate() + 7);
    setWeekRef(d);
  }
  function prevMonth() {
    setMonthRef((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }
  function nextMonth() {
    setMonthRef((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Schedule</Text>
        <View style={styles.viewToggle}>
          {(["day", "week", "month"] as CalendarView[]).map((v) => (
            <Pressable
              key={v}
              style={[styles.toggleBtn, view === v && styles.toggleBtnActive]}
              onPress={() => setView(v)}
            >
              <Text style={[styles.toggleBtnText, view === v && styles.toggleBtnTextActive]}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {view === "day" ? (
        <DayView
          selectedDay={selectedDay}
          onChangeDay={setSelectedDay}
          bookings={bookings}
          isLoading={isLoading}
          today={today}
          insets={insets}
          navigation={navigation}
        />
      ) : view === "week" ? (
        <WeekView
          weekDays={weekDays}
          selectedDay={selectedDay}
          today={today}
          onSelectDay={(d) => { setSelectedDay(d); }}
          onPrevWeek={prevWeek}
          onNextWeek={nextWeek}
          countForDay={countForDay}
          bookings={bookings}
          isLoading={isLoading}
          dayBookings={dayBookings}
          selectedLabel={selectedLabel}
          primary={primary}
          insets={insets}
          navigation={navigation}
        />
      ) : (
        <MonthView
          monthRef={monthRef}
          monthCells={monthCells}
          selectedDay={selectedDay}
          today={today}
          onSelectDay={(d) => { setSelectedDay(d); setView("day"); }}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          countForDay={countForDay}
          insets={insets}
        />
      )}
    </View>
  );
}

function DayView({
  selectedDay,
  onChangeDay,
  bookings,
  isLoading,
  today,
  insets,
  navigation,
}: {
  selectedDay: Date;
  onChangeDay: (d: Date) => void;
  bookings: Booking[];
  isLoading: boolean;
  today: Date;
  insets: { bottom: number };
  navigation: any;
}) {
  const dayBookings = useMemo(() => {
    return bookings
      .filter((b) => b.scheduledAt && isSameDay(new Date(b.scheduledAt), selectedDay))
      .sort((a, b) => {
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
  }, [bookings, selectedDay]);

  function prevDay() {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() - 1);
    onChangeDay(d);
  }
  function nextDay() {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() + 1);
    onChangeDay(d);
  }

  const label = `${DAY_FULL[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTH_LABELS[selectedDay.getMonth()]}`;

  return (
    <>
      <View style={styles.navRow}>
        <Pressable style={styles.navBtn} onPress={prevDay}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Ionicons name="calendar-outline" size={14} color={Colors.dark.primary} />
          <Text style={styles.navLabel}>{label}</Text>
          {isSameDay(selectedDay, today) ? (
            <View style={styles.todayChip}><Text style={styles.todayChipText}>Today</Text></View>
          ) : null}
        </View>
        <Pressable style={styles.navBtn} onPress={nextDay}>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.dayTimeline, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {HOURS.map((hour) => {
          const hourBookings = dayBookings.filter((b) => {
            if (!b.scheduledAt) return false;
            return new Date(b.scheduledAt).getHours() === hour;
          });
          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourLabel}>{formatHour(hour)}</Text>
              <View style={styles.hourLine} />
              {hourBookings.length > 0 ? (
                <View style={styles.hourBookings}>
                  {hourBookings.map((b) => {
                    const statusColor = STATUS_COLORS[b.status] ?? Colors.dark.textSecondary;
                    const serviceName = b.items?.[0]?.service?.name ?? b.items?.[0]?.name ?? "Service";
                    return (
                      <Pressable
                        key={b.id}
                        style={[styles.hourBlock, { borderLeftColor: statusColor }]}
                        onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: b.id })}
                      >
                        <Text style={styles.hourBlockTitle} numberOfLines={1}>{serviceName}</Text>
                        {b.player ? (
                          <Text style={styles.hourBlockSub} numberOfLines={1}>{b.player.name}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

function WeekView({
  weekDays,
  selectedDay,
  today,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  countForDay,
  bookings,
  isLoading,
  dayBookings,
  selectedLabel,
  primary,
  insets,
  navigation,
}: {
  weekDays: Date[];
  selectedDay: Date;
  today: Date;
  onSelectDay: (d: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  countForDay: (d: Date) => number;
  bookings: Booking[];
  isLoading: boolean;
  dayBookings: Booking[];
  selectedLabel: string;
  primary: any;
  insets: { bottom: number };
  navigation: any;
}) {
  const weekLabel = `${weekDays[0].getDate()} ${MONTH_LABELS[weekDays[0].getMonth()]} – ${weekDays[6].getDate()} ${MONTH_LABELS[weekDays[6].getMonth()]}`;

  return (
    <>
      <View style={styles.navRow}>
        <Pressable style={styles.navBtn} onPress={onPrevWeek}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.navLabel}>{weekLabel}</Text>
        <Pressable style={styles.navBtn} onPress={onNextWeek}>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View style={styles.weekStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekRow}>
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDay);
            const isToday = isSameDay(day, today);
            const cnt = countForDay(day);
            return (
              <Pressable
                key={day.toISOString()}
                style={[styles.dayPill, isSelected && styles.dayPillSelected]}
                onPress={() => onSelectDay(day)}
              >
                <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                  {DAY_LABELS[day.getDay()]}
                </Text>
                <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                  {day.getDate()}
                </Text>
                {isToday ? (
                  <View style={[styles.todayDot, isSelected && styles.todayDotSelected]} />
                ) : cnt > 0 ? (
                  <View style={styles.bookingDot} />
                ) : null}
                {cnt > 0 && !isToday ? (
                  <Text style={[styles.dayCntText, isSelected && { color: Colors.dark.buttonText }]}>{cnt}</Text>
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
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(index * 50).duration(250)}>
              <BookingCard item={item} onPress={() => navigation.navigate("ProviderBookingDetail", { orderId: item.id })} />
            </Animated.View>
          )}
        />
      )}
    </>
  );
}

function MonthView({
  monthRef,
  monthCells,
  selectedDay,
  today,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  countForDay,
  insets,
}: {
  monthRef: Date;
  monthCells: (Date | null)[];
  selectedDay: Date;
  today: Date;
  onSelectDay: (d: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  countForDay: (d: Date) => number;
  insets: { bottom: number };
}) {
  const monthLabel = `${MONTH_FULL[monthRef.getMonth()]} ${monthRef.getFullYear()}`;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
      <View style={styles.navRow}>
        <Pressable style={styles.navBtn} onPress={onPrevMonth}>
          <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.navLabel}>{monthLabel}</Text>
        <Pressable style={styles.navBtn} onPress={onNextMonth}>
          <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View style={styles.monthDowRow}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <Text key={d} style={styles.monthDow}>{d}</Text>
        ))}
      </View>

      <View style={styles.monthGrid}>
        {monthCells.map((cell, idx) => {
          if (!cell) {
            return <View key={`empty-${idx}`} style={styles.monthCell} />;
          }
          const cnt = countForDay(cell);
          const isSelected = isSameDay(cell, selectedDay);
          const isToday = isSameDay(cell, today);
          return (
            <Pressable
              key={cell.toISOString()}
              style={[
                styles.monthCell,
                isSelected && styles.monthCellSelected,
                isToday && !isSelected && styles.monthCellToday,
              ]}
              onPress={() => onSelectDay(cell)}
            >
              <Text style={[
                styles.monthCellNum,
                isSelected && styles.monthCellNumSelected,
                isToday && !isSelected && styles.monthCellNumToday,
              ]}>
                {cell.getDate()}
              </Text>
              {cnt > 0 ? (
                <View style={[styles.monthDot, isSelected && styles.monthDotSelected]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
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
  viewToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  toggleBtnTextActive: {
    color: Colors.dark.buttonText,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  navCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  todayChip: {
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  dayTimeline: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  hourRow: {
    minHeight: 52,
    flexDirection: "column",
    paddingVertical: 4,
  },
  hourLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
    width: 52,
    position: "absolute",
    top: 4,
  },
  hourLine: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginLeft: 60,
    marginTop: 10,
    opacity: 0.5,
  },
  hourBookings: {
    marginLeft: 60,
    gap: 4,
    marginTop: 4,
  },
  hourBlock: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 8,
    padding: Spacing.sm,
    borderLeftWidth: 3,
  },
  hourBlockTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  hourBlockSub: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
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
    height: 80,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
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
  dayLabelSelected: { color: Colors.dark.buttonText },
  dayNum: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dayNumSelected: { color: Colors.dark.buttonText },
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
  dayCntText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
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
  monthDowRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  monthDow: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.lg,
    gap: 4,
  },
  monthCell: {
    width: "13%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    gap: 2,
    marginVertical: 2,
  },
  monthCellSelected: {
    backgroundColor: Colors.dark.primary,
  },
  monthCellToday: {
    backgroundColor: Colors.dark.primary + "20",
  },
  monthCellNum: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  monthCellNumSelected: {
    color: Colors.dark.buttonText,
    fontWeight: "800",
  },
  monthCellNumToday: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  monthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  monthDotSelected: {
    backgroundColor: "#000",
  },
});
