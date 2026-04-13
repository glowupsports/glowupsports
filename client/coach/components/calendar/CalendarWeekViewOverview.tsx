import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";
import { styles } from "./calendarStyles";
import {
  parseUTCTimestamp,
  getLocalDateString,
  formatDateObjectInTimezone,
} from "@/lib/dateUtils";
import { getSessionTypeGradient } from "./calendarUtils";
import { useQuery } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

interface SessionPlayer {
  name: string;
}

interface WeekSession {
  id: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  courtId: string | null;
  players?: SessionPlayer[];
  title?: string | null;
}

interface Court {
  id: string;
  name: string;
  locationId?: string | null;
}

interface CalendarWeekViewOverviewProps {
  allCourts: Court[];
  selectedCourtFilter: string | null;
  setSelectedCourtFilter: (id: string | null) => void;
  weekDates: Date[];
  handleDateSelect: (date: Date) => void;
  ownSessions: WeekSession[];
  academyTimezone: string;
  screenWidth: number;
  setSelectedSessionForDetail: (session: WeekSession) => void;
  courts: Court[];
  setSelectedSlot: (slot: { courtId: string; time: Date }) => void;
  setShowCreateDrawer: (v: boolean) => void;
}

function getTimeInTz(isoStr: string, timezone: string): number {
  const d = parseUTCTimestamp(isoStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(d);
  const h = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const m = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  return h + m / 60;
}

export function CalendarWeekViewOverview({
  allCourts,
  selectedCourtFilter,
  setSelectedCourtFilter,
  weekDates,
  handleDateSelect,
  ownSessions,
  academyTimezone,
  screenWidth,
  setSelectedSessionForDetail,
  courts,
  setSelectedSlot,
  setShowCreateDrawer,
}: CalendarWeekViewOverviewProps) {
  const { coach } = useCoach();
  const [birthdayPopup, setBirthdayPopup] = useState<{ date: string; players: { id: string; name: string; turningAge: number }[] } | null>(null);

  const weekStartISO = weekDates.length > 0
    ? formatDateObjectInTimezone(weekDates[0], academyTimezone)
    : "";

  const { data: weekBirthdays } = useQuery<Record<string, { id: string; name: string; turningAge: number }[]>>({
    queryKey: ["/api/coach/birthdays/week", weekStartISO],
    queryFn: async () => {
      const res = await fetch(
        new URL(`/api/coach/birthdays/week?weekStart=${weekStartISO}`, getApiUrl()).toString(),
        { headers: await getAuthHeaders() }
      );
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!coach?.id && weekDates.length > 0 && !!weekStartISO,
    staleTime: 1000 * 60 * 30,
  });

  return (
    <>
      {allCourts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.courtFilterContainer}
          contentContainerStyle={styles.courtFilterContent}
        >
          <Pressable
            style={[styles.courtFilterChip, !selectedCourtFilter && styles.courtFilterChipActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedCourtFilter(null);
            }}
          >
            <Text style={[styles.courtFilterText, !selectedCourtFilter && styles.courtFilterTextActive]}>All Courts</Text>
          </Pressable>
          {allCourts.map((court) => (
            <Pressable
              key={court.id}
              style={[styles.courtFilterChip, selectedCourtFilter === court.id && styles.courtFilterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedCourtFilter(court.id);
              }}
            >
              <Text style={[styles.courtFilterText, selectedCourtFilter === court.id && styles.courtFilterTextActive]}>{court.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        style={styles.calendarScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
      >
        <View style={styles.weekCalHeader}>
          <View style={styles.weekCalTimeCol}>
            <Text style={styles.weekCalTimeLabel}>TIME</Text>
          </View>
          {weekDates.map((date, idx) => {
            const dayLetters = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <Pressable
                key={idx}
                style={[styles.weekCalDayCol, isToday && styles.weekCalDayColToday]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleDateSelect(date);
                }}
              >
                <Text style={[styles.weekCalDayLabel, isToday && styles.weekCalDayLabelToday]}>{dayLetters[idx]}</Text>
                <Text style={[styles.weekCalDateLabel, isToday && styles.weekCalDateLabelToday]}>{date.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>

        {weekBirthdays && Object.keys(weekBirthdays).length > 0 ? (
          <View style={birthdayStripStyles.row}>
            <View style={birthdayStripStyles.timeCol} />
            {weekDates.map((date, idx) => {
              const isoDate = formatDateObjectInTimezone(date, academyTimezone);
              const bdays = weekBirthdays[isoDate];
              if (!bdays || bdays.length === 0) {
                return <View key={idx} style={birthdayStripStyles.cell} />;
              }
              const firstName = bdays[0].name.split(" ")[0];
              const label = bdays.length > 1 ? `${firstName} +${bdays.length - 1}` : firstName;
              return (
                <Pressable
                  key={idx}
                  style={birthdayStripStyles.cellActive}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setBirthdayPopup({ date: isoDate, players: bdays });
                  }}
                >
                  <MaterialCommunityIcons name="cake-variant-outline" size={10} color="#FF69B4" />
                  <Text style={birthdayStripStyles.cellText} numberOfLines={1}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Modal
          visible={!!birthdayPopup}
          transparent
          animationType="fade"
          onRequestClose={() => setBirthdayPopup(null)}
        >
          <Pressable style={birthdayStripStyles.popupOverlay} onPress={() => setBirthdayPopup(null)}>
            <View style={birthdayStripStyles.popup}>
              <View style={birthdayStripStyles.popupHeader}>
                <Ionicons name="gift" size={16} color="#FF69B4" />
                <Text style={birthdayStripStyles.popupTitle}>
                  {birthdayPopup ? new Date(birthdayPopup.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : ""}
                </Text>
                <TouchableOpacity onPress={() => setBirthdayPopup(null)}>
                  <Ionicons name="close" size={16} color={Colors.dark.tabIconDefault} />
                </TouchableOpacity>
              </View>
              {birthdayPopup?.players.map((p) => (
                <View key={p.id} style={birthdayStripStyles.popupRow}>
                  <View style={birthdayStripStyles.popupDot} />
                  <Text style={birthdayStripStyles.popupName}>{p.name}</Text>
                  <Text style={birthdayStripStyles.popupAge}>turns {p.turningAge}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        </Modal>

        {(() => {
          const filteredSessions = selectedCourtFilter
            ? ownSessions.filter(s => s.courtId === selectedCourtFilter)
            : ownSessions;

          const weekSessionsByDay: Record<number, WeekSession[]> = {};
          const activeHoursSet = new Set<number>();

          weekDates.forEach((date, idx) => {
            const targetDateStr = formatDateObjectInTimezone(date, academyTimezone);
            const daySessions = filteredSessions.filter((s) => {
              const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
              return sessionDateStr === targetDateStr;
            });
            weekSessionsByDay[idx] = daySessions;
            daySessions.forEach(s => {
              const startH = Math.floor(getTimeInTz(s.startTime, academyTimezone));
              const endH = Math.ceil(getTimeInTz(s.endTime, academyTimezone));
              for (let h = startH; h < endH; h++) {
                activeHoursSet.add(h);
              }
            });
          });

          const sortedHours = Array.from(activeHoursSet).sort((a, b) => a - b);

          if (sortedHours.length === 0) {
            return (
              <View style={styles.overviewEmpty}>
                <Ionicons name="calendar-outline" size={48} color={Colors.dark.tabIconDefault} />
                <Text style={styles.overviewEmptyText}>No lessons this week</Text>
              </View>
            );
          }

          const bands: { start: number; end: number }[] = [];
          let bandStart = sortedHours[0];
          let bandEnd = sortedHours[0] + 1;
          for (let i = 1; i < sortedHours.length; i++) {
            if (sortedHours[i] === bandEnd) {
              bandEnd = sortedHours[i] + 1;
            } else {
              bands.push({ start: bandStart, end: bandEnd });
              bandStart = sortedHours[i];
              bandEnd = sortedHours[i] + 1;
            }
          }
          bands.push({ start: bandStart, end: bandEnd });

          const OVERVIEW_ROW_HEIGHT = 56;
          const colCount = 7;
          const timeColWidth = 48;

          return (
            <View>
              {bands.map((band, bandIdx) => {
                const bandHours: number[] = [];
                for (let h = band.start; h < band.end; h++) bandHours.push(h);
                const bandHeightRows = band.end - band.start;

                return (
                  <React.Fragment key={band.start}>
                    {bandIdx > 0 ? (
                      <View style={{ height: 16, justifyContent: "center", alignItems: "center" }}>
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)", width: "90%" }} />
                      </View>
                    ) : null}
                    <View style={{ position: "relative", height: bandHeightRows * OVERVIEW_ROW_HEIGHT }}>
                      {bandHours.map((hour, hIdx) => {
                        const timeStr = `${hour.toString().padStart(2, "0")}:00`;
                        return (
                          <View key={hour} style={[styles.weekCalRow, { height: OVERVIEW_ROW_HEIGHT, position: "absolute", top: hIdx * OVERVIEW_ROW_HEIGHT, left: 0, right: 0 }]}>
                            <View style={styles.weekCalTimeCol}>
                              <Text style={styles.weekCalTimeText}>{timeStr}</Text>
                            </View>
                            {weekDates.map((_, dayIdx) => {
                              const isToday = weekDates[dayIdx].toDateString() === new Date().toDateString();
                              return (
                                <Pressable
                                  key={dayIdx}
                                  style={[styles.weekCalCell, isToday && styles.weekCalCellToday]}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    const slotDate = weekDates[dayIdx];
                                    const slotTime = new Date(slotDate);
                                    slotTime.setHours(hour, 0, 0, 0);
                                    setSelectedSlot({ courtId: courts[0]?.id || "", time: slotTime });
                                    setShowCreateDrawer(true);
                                  }}
                                />
                              );
                            })}
                          </View>
                        );
                      })}

                      {weekDates.map((_, dayIdx) => {
                        const daySessions = weekSessionsByDay[dayIdx] || [];
                        return daySessions.map(session => {
                          const startFrac = getTimeInTz(session.startTime, academyTimezone);
                          const endFrac = getTimeInTz(session.endTime, academyTimezone);
                          if (startFrac < band.start || startFrac >= band.end) return null;
                          const durationHours = endFrac - startFrac;
                          const topOffset = (startFrac - band.start) * OVERVIEW_ROW_HEIGHT;
                          const blockHeight = Math.max(durationHours * OVERVIEW_ROW_HEIGHT, 28);
                          const gradientColors = getSessionTypeGradient(session.sessionType);
                          const typeLabel =
                            session.sessionType === "private" || session.sessionType === "private_adjusted" ? "PVT" :
                            session.sessionType === "semi_private" ? "SEMI" :
                            session.sessionType === "group" ? "GRP" :
                            session.sessionType === "activity" ? "ACT" :
                            session.sessionType === "physical" ? "FIT" : "SES";
                          const playerName = session.players?.[0]?.name?.split(" ")[0] || "";
                          const now = new Date();
                          const sessionEnd = parseUTCTimestamp(session.endTime);
                          const sessionStart = parseUTCTimestamp(session.startTime);
                          const isPast = sessionEnd < now;
                          const isActive = now >= sessionStart && now < sessionEnd;
                          const showTitle = session.title && (session.sessionType === "activity" || session.sessionType === "physical");
                          const playerCount = session.players?.length || 0;
                          const extraPlayers = playerCount > 1 ? `, +${playerCount - 1}` : "";
                          const displayName = showTitle ? (session.title || "") : (playerName ? `${playerName}${extraPlayers}` : "");

                          return (
                            <Pressable
                              key={session.id}
                              style={[
                                styles.weekCalSessionBlock,
                                {
                                  position: "absolute",
                                  top: topOffset,
                                  left: timeColWidth + 2 + (dayIdx * ((screenWidth - timeColWidth - 16) / colCount)),
                                  width: ((screenWidth - timeColWidth - 16) / colCount) - 4,
                                  height: blockHeight,
                                  backgroundColor: gradientColors[0] + "30",
                                  borderLeftColor: gradientColors[0],
                                  zIndex: 10,
                                  overflow: "hidden",
                                },
                                isPast ? styles.weekCalSessionPast : null,
                                isActive ? styles.weekCalSessionActive : null,
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setSelectedSessionForDetail(session);
                              }}
                            >
                              <Text style={[styles.weekCalSessionType, { color: gradientColors[0] }]} numberOfLines={1}>{typeLabel}</Text>
                              {displayName ? <Text style={styles.weekCalSessionPlayer} numberOfLines={1}>{displayName}</Text> : null}
                              {isActive ? <View style={styles.weekCalLiveDot} /> : null}
                            </Pressable>
                          );
                        });
                      })}
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          );
        })()}
      </ScrollView>
    </>
  );
}

const birthdayStripStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 105, 180, 0.06)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 105, 180, 0.15)",
  },
  timeCol: {
    width: 48,
  },
  cell: {
    flex: 1,
    height: 22,
  },
  cellActive: {
    flex: 1,
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
    gap: 2,
  },
  cellText: {
    fontSize: 9,
    color: "#FF69B4",
    fontWeight: "600" as const,
    flexShrink: 1,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  popup: {
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,105,180,0.2)",
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  popupTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  popupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  popupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF69B4",
  },
  popupName: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "500" as const,
  },
  popupAge: {
    fontSize: 12,
    color: "#FF69B4",
    fontWeight: "600" as const,
  },
});
