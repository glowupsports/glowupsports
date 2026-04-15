import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Spacing } from "@/constants/theme";
import { styles } from "./calendarStyles";
import {
  parseUTCTimestamp,
  getLocalDateString,
  formatDateObjectInTimezone,
  getTimeInTimezone,
} from "@/lib/dateUtils";
import { getSessionTypeGradient } from "./calendarUtils";
import { WeekDraggableSessionBlock, SlotReservationBlock } from "./SessionBlocks";
import type { SlotReservation } from "@/coach/context/CoachContext";

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

interface BlockedSession {
  id: string;
  startTime: string;
  endTime: string;
  courtId: string | null;
  blocked: true;
}

interface Court {
  id: string;
  name: string;
  locationId?: string | null;
}

interface Location {
  id: string;
  name: string;
}

interface CalendarWeekViewSlotsProps {
  weekDates: Date[];
  setSelectedDate: (date: Date) => void;
  setViewMode: (mode: "day" | "week" | "month") => void;
  hourHeight: number;
  START_HOUR: number;
  END_HOUR: number;
  formatTime: (hour: number) => string;
  timeGrid: number;
  getSessionsForDate: (date: Date) => WeekSession[];
  blockedSessions: BlockedSession[];
  academyTimezone: string;
  courts: Court[];
  allLocations: Location[];
  screenWidth: number;
  TIME_COLUMN_WIDTH: number;
  handleSessionTap: (session: WeekSession) => void;
  handleSessionLongPress: (session: WeekSession) => void;
  handleWeekSessionDragEnd: (session: WeekSession, deltaY: number, deltaX: number, colWidth: number) => void;
  setSelectedSlot: (slot: { courtId: string; time: Date }) => void;
  setShowCreateDrawer: (v: boolean) => void;
  coachBlocks: {
    id: string;
    startTime: string | Date;
    endTime: string | Date;
  }[];
  slotReservations?: SlotReservation[];
}

export function CalendarWeekViewSlots({
  weekDates,
  setSelectedDate,
  setViewMode,
  hourHeight,
  START_HOUR,
  END_HOUR,
  formatTime,
  timeGrid,
  getSessionsForDate,
  blockedSessions,
  academyTimezone,
  courts,
  allLocations,
  screenWidth,
  TIME_COLUMN_WIDTH,
  handleSessionTap,
  handleSessionLongPress,
  handleWeekSessionDragEnd,
  setSelectedSlot,
  setShowCreateDrawer,
  coachBlocks,
  slotReservations = [],
}: CalendarWeekViewSlotsProps) {
  const weekHours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const getWeekNowPosition = (): number | null => {
    const now = new Date();
    const currentHours = now.getHours() + now.getMinutes() / 60;
    if (currentHours < START_HOUR || currentHours > END_HOUR) return null;
    return (currentHours - START_HOUR) * hourHeight;
  };
  const weekNowPosition = getWeekNowPosition();

  const getBlockedSessionsForDate = (date: Date): BlockedSession[] => {
    const targetDateStr = formatDateObjectInTimezone(date, academyTimezone);
    return blockedSessions.filter((s) => {
      const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
      return sessionDateStr === targetDateStr;
    });
  };

  const getWeekSessionPosition = (session: { startTime: string; endTime: string }) => {
    const startLocal = getTimeInTimezone(session.startTime, academyTimezone);
    const endLocal = getTimeInTimezone(session.endTime, academyTimezone);
    const startHour = startLocal.hours + startLocal.minutes / 60;
    const endHour = endLocal.hours + endLocal.minutes / 60;
    const top = (startHour - START_HOUR) * hourHeight;
    const height = (endHour - startHour) * hourHeight;
    return { top, height };
  };

  return (
    <>
      <View style={styles.weekGridHeader}>
        <View style={styles.weekTimeColumnHeader}>
          <Text style={styles.weekTimeHeaderText}>Time</Text>
        </View>
        {weekDates.map((date, dayIdx) => {
          const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <Pressable
              key={dayIdx}
              style={[styles.weekDayHeader, isToday && styles.weekDayHeaderToday]}
              onPress={() => {
                setSelectedDate(date);
                setViewMode("day");
              }}
            >
              <Text style={[styles.weekDayName, isToday && styles.weekDayNameToday]}>
                {dayNames[dayIdx]}
              </Text>
              <Text style={[styles.weekDayNumber, isToday && styles.weekDayNumberToday]}>
                {date.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.weekGridScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.weekGridBody}>
          <View style={styles.weekTimeColumn}>
            {weekHours.map((hour) => (
              <View key={hour} style={[styles.weekTimeSlot, { height: hourHeight }]}>
                <Text style={styles.weekTimeText}>{formatTime(hour)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.weekDayColumns}>
            {weekDates.map((date, dayIdx) => {
              const isDayToday = date.toDateString() === new Date().toDateString();
              const daySessions = getSessionsForDate(date);
              const dayBlockedSessions = getBlockedSessionsForDate(date);
              const dayColumnWidth = (screenWidth - TIME_COLUMN_WIDTH - Spacing.lg * 2) / 7;

              return (
                <View key={dayIdx} style={[styles.weekDayColumn, isDayToday && styles.weekDayColumnToday]}>
                  {weekHours.map((hour) => (
                    <Pressable
                      key={hour}
                      style={[styles.weekHourSlot, { height: hourHeight }]}
                      onPress={() => {
                        const time = new Date(date);
                        time.setHours(hour, 0, 0, 0);
                        setSelectedDate(date);
                        setSelectedSlot({ courtId: courts[0]?.id || "", time });
                        setShowCreateDrawer(true);
                      }}
                    >
                      <View style={styles.weekHourLine} />
                      {timeGrid === 30 && <View style={[styles.weekHalfHourLine, { top: hourHeight / 2 }]} />}
                    </Pressable>
                  ))}

                  {dayBlockedSessions.map((session) => {
                    const { top, height } = getWeekSessionPosition(session);
                    return (
                      <View
                        key={session.id}
                        style={[styles.weekBlockedBlock, { top, height: Math.max(height - 2, 20) }]}
                      >
                        <Text style={styles.weekBlockedText}>Blocked</Text>
                      </View>
                    );
                  })}

                  {coachBlocks
                    .filter((block) => {
                      const blockDateStr = getLocalDateString(new Date(block.startTime), academyTimezone);
                      const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
                      return blockDateStr === dateStr;
                    })
                    .map((block) => {
                      const startDt = new Date(block.startTime);
                      const endDt = new Date(block.endTime);
                      const startHour = startDt.getUTCHours() + startDt.getUTCMinutes() / 60;
                      const endHour = endDt.getUTCHours() + endDt.getUTCMinutes() / 60;
                      const top = (startHour - START_HOUR) * hourHeight;
                      const height = (endHour - startHour) * hourHeight;
                      return (
                        <View key={block.id + "-week"} style={[styles.coachBlockStyle, { top, height: Math.max(height - 2, 16) }]}>
                          <Text style={[styles.coachBlockText, { fontSize: 7 }]}>MY BLOCK</Text>
                        </View>
                      );
                    })}

                  {slotReservations
                    .filter((r) => {
                      const rDateStr = getLocalDateString(r.startTime, academyTimezone);
                      const colDateStr = formatDateObjectInTimezone(date, academyTimezone);
                      return rDateStr === colDateStr;
                    })
                    .map((r) => {
                      const { top, height } = getWeekSessionPosition(r);
                      return (
                        <SlotReservationBlock
                          key={r.id}
                          top={top}
                          height={height}
                          playerName={r.playerName}
                          expiresAt={r.expiresAt}
                        />
                      );
                    })}

                  {daySessions.map((session) => {
                    const { top, height } = getWeekSessionPosition(session);
                    const now = new Date();
                    const sessionEnd = parseUTCTimestamp(session.endTime);
                    const sessionStart = parseUTCTimestamp(session.startTime);
                    const isPast = sessionEnd < now;
                    const isActive = now >= sessionStart && now < sessionEnd;
                    const gradientColors = getSessionTypeGradient(session.sessionType);
                    const typeLabel =
                      session.sessionType === "private" || session.sessionType === "private_adjusted" ? "PRIVATE" :
                      session.sessionType === "semi_private" ? "SEMI" :
                      session.sessionType === "group" ? "GROUP" :
                      session.sessionType === "activity" ? "ACT" :
                      session.sessionType === "physical" ? "PHYS" : "";
                    const playerNames = session.players?.map(p => p.name.split(" ")[0]).join(", ") || "";
                    const sessionCourt = courts.find(c => c.id === session.courtId);
                    const courtLocation = sessionCourt?.locationId ? allLocations.find(l => l.id === sessionCourt.locationId) : null;
                    const locationShortName = courtLocation?.name?.split(" ")[0] || "";
                    const sessionSubtitle = playerNames || locationShortName;

                    return (
                      <WeekDraggableSessionBlock
                        key={session.id}
                        session={session}
                        top={top}
                        height={height}
                        isPast={isPast}
                        isActive={isActive}
                        gradientColors={gradientColors}
                        sessionLabel={typeLabel}
                        formattedTime={sessionSubtitle}
                        hourHeight={hourHeight}
                        dayColumnWidth={dayColumnWidth}
                        onTap={() => {
                          setSelectedDate(date);
                          handleSessionTap(session);
                        }}
                        onLongPress={() => handleSessionLongPress(session)}
                        onDragEnd={(deltaY: number, deltaX: number) => handleWeekSessionDragEnd(session, deltaY, deltaX, dayColumnWidth)}
                      />
                    );
                  })}

                  {isDayToday && weekNowPosition !== null && (
                    <View style={[styles.weekNowLine, { top: weekNowPosition }]} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </>
  );
}
