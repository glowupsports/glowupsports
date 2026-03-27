import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/theme";
import { styles } from "./calendarStyles";
import { parseUTCTimestamp } from "@/lib/dateUtils";

interface DayStats {
  sessions: number;
  totalMinutes: number;
  totalHours: number;
}

interface CalendarSession {
  id: string;
  startTime: string;
  endTime: string;
  courtId: string | null;
}

interface Court {
  id: string;
  name: string;
}

interface CalendarMonthViewProps {
  monthMode: "load" | "availability";
  setMonthMode: (mode: "load" | "availability") => void;
  monthDates: (Date | null)[][];
  selectedDate: Date;
  handleDateSelect: (date: Date) => void;
  getDayStats: (date: Date) => DayStats;
  getSessionsForDate: (date: Date) => CalendarSession[];
  courts: Court[];
  setSelectedSlot: (slot: { courtId: string; time: Date } | null) => void;
  setShowCreateDrawer: (v: boolean) => void;
  formatTime: (hour: number) => string;
  bottomInset: number;
}

export function CalendarMonthView({
  monthMode,
  setMonthMode,
  monthDates,
  selectedDate,
  handleDateSelect,
  getDayStats,
  getSessionsForDate,
  courts,
  setSelectedSlot,
  setShowCreateDrawer,
  formatTime,
  bottomInset,
}: CalendarMonthViewProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: bottomInset + 100 }}
    >
      {/* Month Mode Toggle */}
      <View style={styles.monthModeToggle}>
        <Pressable
          style={[styles.monthModeButton, monthMode === "load" && styles.monthModeButtonActive]}
          onPress={() => setMonthMode("load")}
        >
          <Ionicons name="flame-outline" size={14} color={monthMode === "load" ? Colors.dark.backgroundRoot : Colors.dark.text} />
          <Text style={[styles.monthModeText, monthMode === "load" && styles.monthModeTextActive]}>Load</Text>
        </Pressable>
        <Pressable
          style={[styles.monthModeButton, monthMode === "availability" && styles.monthModeButtonActive]}
          onPress={() => setMonthMode("availability")}
        >
          <Ionicons name="calendar-outline" size={14} color={monthMode === "availability" ? Colors.dark.backgroundRoot : Colors.dark.text} />
          <Text style={[styles.monthModeText, monthMode === "availability" && styles.monthModeTextActive]}>Availability</Text>
        </Pressable>
      </View>

      <View>
        {/* Month Day Headers */}
        <View style={styles.monthDayHeaders}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <Text key={day} style={styles.monthDayHeaderText}>{day}</Text>
          ))}
        </View>

        {/* Month Grid */}
        {monthDates.map((week, weekIdx) => (
          <View key={weekIdx} style={styles.monthWeekRowPremium}>
            {week.map((date, dayIdx) => {
              if (!date) {
                return <View key={dayIdx} style={styles.monthDayCardEmpty} />;
              }
              const stats = getDayStats(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const isSelected = date.toDateString() === selectedDate.toDateString();
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              const loadHeight = Math.min(100, (stats.totalMinutes / 480) * 100);
              const loadGradient: [string, string] = stats.totalMinutes >= 360
                ? ["#FF6B35", "#D84315"]
                : stats.totalMinutes >= 240
                  ? ["#FFD54F", "#F9A825"]
                  : stats.totalMinutes > 0
                    ? ["#3AE374", "#1E8449"]
                    : ["transparent", "transparent"];

              const maxCapacity = 8;
              const bookedHours = stats.totalHours;
              const freeHours = Math.max(0, maxCapacity - bookedHours);
              const availabilityStatus = freeHours >= 5 ? "open" : freeHours >= 2 ? "limited" : "full";
              const displaySlots = Math.floor(freeHours);

              return (
                <Pressable
                  key={dayIdx}
                  style={[
                    styles.monthDayCard,
                    isWeekend && styles.monthDayCardWeekend,
                    isToday && styles.monthDayCardToday,
                    isSelected && styles.monthDayCardSelected,
                  ]}
                  onPress={() => handleDateSelect(date)}
                >
                  <Text style={[
                    styles.monthDayCardNumber,
                    isWeekend && styles.monthDayCardNumberWeekend,
                    isToday && styles.monthDayCardNumberToday,
                  ]}>
                    {date.getDate()}
                  </Text>

                  {monthMode === "load" ? (
                    <>
                      {stats.totalMinutes > 0 ? (
                        <View style={[styles.monthLoadFillContainer, { height: `${loadHeight}%` }]}>
                          <LinearGradient
                            colors={loadGradient}
                            style={styles.monthLoadFill}
                            start={{ x: 0, y: 1 }}
                            end={{ x: 0, y: 0 }}
                          />
                        </View>
                      ) : null}
                      {stats.totalHours > 0 ? (
                        <Text style={styles.monthHoursLabel}>{stats.totalHours}h</Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={[
                        styles.monthAvailabilityIndicator,
                        availabilityStatus === "open" && styles.monthAvailabilityOpen,
                        availabilityStatus === "limited" && styles.monthAvailabilityLimited,
                        availabilityStatus === "full" && styles.monthAvailabilityFull,
                      ]} />
                      {availabilityStatus !== "full" && displaySlots > 0 ? (
                        <Text style={styles.monthSlotsLabel}>{displaySlots}h</Text>
                      ) : null}
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Day Context Panel */}
      <View style={styles.dayContextPanel}>
        <View style={styles.dayContextHeader}>
          <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
          <Text style={styles.dayContextDate}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][selectedDate.getDay()]}{" "}
            {selectedDate.getDate()}{" "}
            {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][selectedDate.getMonth()]}
          </Text>
          {selectedDate.toDateString() === new Date().toDateString() ? (
            <Text style={styles.dayContextTodayBadge}>Today</Text>
          ) : null}
        </View>

        {(() => {
          const stats = getDayStats(selectedDate);
          const daySessions = getSessionsForDate(selectedDate);

          const hasAvailability = (() => {
            for (let hour = 8; hour < 22; hour++) {
              const slotStart = new Date(selectedDate);
              slotStart.setHours(hour, 0, 0, 0);
              const slotEnd = new Date(selectedDate);
              slotEnd.setHours(hour + 1, 0, 0, 0);
              for (const court of courts) {
                const isOccupied = daySessions.some(s => {
                  const sStart = parseUTCTimestamp(s.startTime);
                  const sEnd = parseUTCTimestamp(s.endTime);
                  return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                });
                if (!isOccupied) return true;
              }
            }
            return false;
          })();

          if (monthMode === "load") {
            const morningMinutes = daySessions.filter(s => parseUTCTimestamp(s.startTime).getHours() < 12).reduce((sum, s) => {
              return sum + (parseUTCTimestamp(s.endTime).getTime() - parseUTCTimestamp(s.startTime).getTime()) / 60000;
            }, 0);
            const afternoonMinutes = daySessions.filter(s => {
              const hour = parseUTCTimestamp(s.startTime).getHours();
              return hour >= 12 && hour < 17;
            }).reduce((sum, s) => {
              return sum + (parseUTCTimestamp(s.endTime).getTime() - parseUTCTimestamp(s.startTime).getTime()) / 60000;
            }, 0);
            const eveningMinutes = daySessions.filter(s => parseUTCTimestamp(s.startTime).getHours() >= 17).reduce((sum, s) => {
              return sum + (parseUTCTimestamp(s.endTime).getTime() - parseUTCTimestamp(s.startTime).getTime()) / 60000;
            }, 0);

            const peakTime = stats.sessions === 0 ? "—"
              : eveningMinutes >= morningMinutes && eveningMinutes >= afternoonMinutes ? "Evening"
                : afternoonMinutes >= morningMinutes ? "Afternoon" : "Morning";
            const loadLevel = stats.totalMinutes >= 360 ? "High load" : stats.totalMinutes >= 240 ? "Moderate" : "Light";

            return (
              <View style={styles.dayContextContent}>
                <View style={styles.dayContextRow}>
                  <Text style={styles.dayContextLabel}>{stats.sessions} sessions</Text>
                  <Text style={styles.dayContextDot}>·</Text>
                  <Text style={styles.dayContextLabel}>{stats.totalMinutes} min</Text>
                </View>
                {stats.sessions > 0 ? (
                  <View style={styles.dayContextRow}>
                    <View style={styles.peakPill}>
                      <Ionicons
                        name={peakTime === "Morning" ? "sunny-outline" : peakTime === "Afternoon" ? "partly-sunny-outline" : "moon-outline"}
                        size={10}
                        color={Colors.dark.xpCyan}
                      />
                      <Text style={styles.peakPillText}>{peakTime}</Text>
                    </View>
                    <Text style={[
                      styles.dayContextMeta,
                      stats.totalMinutes >= 360 && { color: "#FF6B6B" },
                      stats.totalMinutes >= 240 && stats.totalMinutes < 360 && { color: Colors.dark.gold },
                    ]}>{loadLevel}</Text>
                  </View>
                ) : null}
                <View style={styles.dayContextLoadBar}>
                  <View style={[
                    styles.dayContextLoadFill,
                    {
                      width: `${Math.min(100, (stats.totalMinutes / 480) * 100)}%`,
                      backgroundColor: stats.totalMinutes >= 360 ? "#FF6B6B" : stats.totalMinutes >= 240 ? Colors.dark.gold : Colors.dark.primary,
                    },
                  ]} />
                </View>
              </View>
            );
          } else {
            const freeSlots: { courtId: string; courtName: string; hour: number }[] = [];
            for (let hour = 8; hour < 22; hour++) {
              const slotStart = new Date(selectedDate);
              slotStart.setHours(hour, 0, 0, 0);
              const slotEnd = new Date(selectedDate);
              slotEnd.setHours(hour + 1, 0, 0, 0);
              courts.forEach(court => {
                const isOccupied = daySessions.some(s => {
                  const sStart = parseUTCTimestamp(s.startTime);
                  const sEnd = parseUTCTimestamp(s.endTime);
                  return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
                });
                if (!isOccupied && freeSlots.length < 5) {
                  freeSlots.push({ courtId: court.id, courtName: court.name, hour });
                }
              });
            }

            return (
              <View style={styles.dayContextContent}>
                {freeSlots.length > 0 ? (
                  <>
                    <Text style={styles.dayContextAvailLabel}>Available today:</Text>
                    {freeSlots.slice(0, 3).map((slot, i) => (
                      <Pressable
                        key={i}
                        style={styles.dayContextSlot}
                        onPress={() => {
                          const slotTime = new Date(selectedDate);
                          slotTime.setHours(slot.hour, 0, 0, 0);
                          setSelectedSlot({ courtId: slot.courtId, time: slotTime });
                          setShowCreateDrawer(true);
                        }}
                      >
                        <Text style={styles.dayContextSlotTime}>{formatTime(slot.hour)} - {formatTime(slot.hour + 1)}</Text>
                        <Text style={styles.dayContextSlotCourt}>{slot.courtName}</Text>
                      </Pressable>
                    ))}
                    {freeSlots.length > 3 ? (
                      <Text style={styles.dayContextMoreSlots}>+{freeSlots.length - 3} more available</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.dayContextNoSlots}>Fully booked</Text>
                )}
              </View>
            );
          }
        })()}

        {/* Quick Action */}
        {(() => {
          const daySessions = getSessionsForDate(selectedDate);
          let firstFreeSlot: { courtId: string; time: Date } | null = null;
          for (let hour = 8; hour < 22 && !firstFreeSlot; hour++) {
            const slotStart = new Date(selectedDate);
            slotStart.setHours(hour, 0, 0, 0);
            const slotEnd = new Date(selectedDate);
            slotEnd.setHours(hour + 1, 0, 0, 0);
            for (const court of courts) {
              const isOccupied = daySessions.some(s => {
                const sStart = parseUTCTimestamp(s.startTime);
                const sEnd = parseUTCTimestamp(s.endTime);
                return s.courtId === court.id && sStart < slotEnd && sEnd > slotStart;
              });
              if (!isOccupied) {
                firstFreeSlot = { courtId: court.id, time: slotStart };
                break;
              }
            }
          }
          const isFullyBooked = !firstFreeSlot;
          return (
            <Pressable
              style={[
                styles.dayContextAction,
                isFullyBooked && styles.dayContextActionDisabled,
              ]}
              onPress={() => {
                if (firstFreeSlot) {
                  setSelectedSlot(firstFreeSlot);
                  setShowCreateDrawer(true);
                }
              }}
              disabled={isFullyBooked}
            >
              <Ionicons
                name={isFullyBooked ? "close-circle-outline" : "add-circle-outline"}
                size={16}
                color={isFullyBooked ? Colors.dark.disabled : Colors.dark.primary}
              />
              <Text style={[
                styles.dayContextActionText,
                isFullyBooked && styles.dayContextActionTextDisabled,
              ]}>
                {isFullyBooked ? "Fully booked" : "Book on this day"}
              </Text>
            </Pressable>
          );
        })()}
      </View>
    </ScrollView>
  );
}
