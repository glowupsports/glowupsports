import React from "react";
import { View, Text, ScrollView, Pressable, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { styles } from "./calendarStyles";
import {
  parseUTCTimestamp,
  getLocalDateString,
  formatDateObjectInTimezone,
  formatTimeInTimezone,
  getTimeInTimezone,
} from "@/lib/dateUtils";
import { getSessionTypeGradient } from "./calendarUtils";
import { DraggableSessionBlock, PulsingDot, SlotReservationBlock } from "./SessionBlocks";
import { CalendarFilterOverlay } from "./CalendarFilterOverlay";
import type { SlotReservation } from "@/coach/context/CoachContext";

interface SessionPlayer {
  name: string;
}

interface DaySession {
  id: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  courtId: string | null;
  status?: string | null;
  skipReason?: string | null;
  players?: SessionPlayer[];
  title?: string | null;
}

interface BlockedSession {
  id: string;
  startTime: string;
  endTime: string;
  courtId: string | null;
  blocked?: true;
  blockedReason?: string;
  isCourtBlock?: boolean;
}

interface Court {
  id: string;
  name: string;
  locationId?: string | null;
}

interface Location {
  id: string;
  name: string;
  timezone?: string | null;
}

interface TravelBlock {
  id: string;
  startTime: string;
  endTime: string;
  minutes: number;
}

interface BusyBlock {
  id: string;
  startTime: string;
  endTime: string;
  courtId: string | null;
  busyAtLocation: string;
}

interface CoachBlock {
  id: string;
  startTime: string | Date;
  endTime: string | Date;
  blockReason?: string;
}

interface CalendarDayViewSlotsProps {
  courtHeaderScrollRef: React.RefObject<ScrollView>;
  courtLanesScrollRef: React.RefObject<ScrollView>;
  showFilterOverlay: boolean;
  setShowFilterOverlay: (v: boolean) => void;
  allLocations: Location[];
  locationFilteredCourts: Court[];
  selectedLocationFilter: string | null;
  setSelectedLocationFilter: (id: string | null) => void;
  selectedCourtFilter: string | null;
  setSelectedCourtFilter: (id: string | null) => void;
  courts: Court[];
  dynamicLaneWidth: number;
  totalCourtsWidth: number;
  hours: number[];
  hourHeight: number;
  timeGrid: number;
  formatTime: (hour: number) => string;
  isCellSelected: (courtId: string, hour: number) => boolean;
  handleSlotPress: (courtId: string, hour: number) => void;
  handleSlotLongPress: (courtId: string, courtName: string, hour: number, courtIndex: number) => void;
  ownSessions: DaySession[];
  selectedDate: Date;
  academyTimezone: string;
  getSessionPosition: (session: { startTime: string; endTime: string }) => { top: number; height: number };
  handleSessionTap: (session: DaySession) => void;
  handleSessionLongPress: (session: DaySession) => void;
  handleSessionDragEnd: (session: DaySession, deltaY: number, deltaX: number, courtIndex: number) => void;
  checkDragConflict: (session: DaySession, deltaY: number, deltaX: number, courtIndex: number, isDragging: boolean) => void;
  dragConflict: string | null;
  setHoveredSession: (session: DaySession | null) => void;
  setPressedSession: React.Dispatch<React.SetStateAction<DaySession | null>>;
  setPressedSessionPos: (pos: { x: number; y: number } | null) => void;
  blockedSessions: BlockedSession[];
  handleBlockedSlotPress: (session: BlockedSession) => void;
  coachBlocks: CoachBlock[];
  crossLocationBusyBlocks: BusyBlock[];
  travelTimeBlocks: TravelBlock[];
  focusBaseHour: number;
  nowPosition: number | null;
  isToday: boolean;
  START_HOUR: number;
  slotReservations?: SlotReservation[];
}

export function CalendarDayViewSlots({
  courtHeaderScrollRef,
  courtLanesScrollRef,
  showFilterOverlay,
  setShowFilterOverlay,
  allLocations,
  locationFilteredCourts,
  selectedLocationFilter,
  setSelectedLocationFilter,
  selectedCourtFilter,
  setSelectedCourtFilter,
  courts,
  dynamicLaneWidth,
  totalCourtsWidth,
  hours,
  hourHeight,
  timeGrid,
  formatTime,
  isCellSelected,
  handleSlotPress,
  handleSlotLongPress,
  ownSessions,
  selectedDate,
  academyTimezone,
  getSessionPosition,
  handleSessionTap,
  handleSessionLongPress,
  handleSessionDragEnd,
  checkDragConflict,
  dragConflict,
  setHoveredSession,
  setPressedSession,
  setPressedSessionPos,
  blockedSessions,
  handleBlockedSlotPress,
  coachBlocks,
  crossLocationBusyBlocks,
  travelTimeBlocks,
  focusBaseHour,
  nowPosition,
  isToday,
  START_HOUR,
  slotReservations = [],
}: CalendarDayViewSlotsProps) {
  return (
    <>
      <CalendarFilterOverlay
        visible={showFilterOverlay}
        onClose={() => setShowFilterOverlay(false)}
        allLocations={allLocations}
        locationFilteredCourts={locationFilteredCourts}
        selectedLocationFilter={selectedLocationFilter}
        setSelectedLocationFilter={setSelectedLocationFilter}
        selectedCourtFilter={selectedCourtFilter}
        setSelectedCourtFilter={setSelectedCourtFilter}
      />

      <View style={styles.courtHeaders}>
        <View style={styles.timeColumnHeader} />
        <ScrollView
          ref={courtHeaderScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            courtLanesScrollRef.current?.scrollTo({
              x: e.nativeEvent.contentOffset.x,
              animated: false,
            });
          }}
          contentContainerStyle={{ width: totalCourtsWidth }}
        >
          {courts.map((court, index) => (
            <View key={court.id} style={[
              styles.courtHeader,
              { width: dynamicLaneWidth },
              index > 0 && styles.courtHeaderWithDivider,
            ]}>
              <Text style={styles.courtHeaderText} numberOfLines={1}>{court.name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.calendarScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
        <View style={styles.calendarGrid}>
          <View style={styles.timeColumn}>
            {hours.map((hour) => (
              <View key={hour} style={[styles.timeSlot, { height: hourHeight }]}>
                <Text style={styles.timeText}>{formatTime(hour)}</Text>
              </View>
            ))}
          </View>

          <ScrollView
            ref={courtLanesScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled={true}
            scrollEventThrottle={16}
            onScroll={(e) => {
              courtHeaderScrollRef.current?.scrollTo({
                x: e.nativeEvent.contentOffset.x,
                animated: false,
              });
            }}
            contentContainerStyle={{ width: totalCourtsWidth }}
            style={styles.courtLanesContainer}
          >
            {courts.map((court, courtIndex) => (
              <View key={court.id} style={[
                styles.courtLane,
                { width: dynamicLaneWidth },
                courtIndex > 0 && styles.courtLaneWithDivider,
              ]}>
                {hours.map((hour, hourIndex) => (
                  <Pressable
                    key={hour}
                    style={[
                      styles.hourSlot,
                      { height: hourHeight },
                      hourIndex % 2 === 0 ? styles.hourSlotEven : styles.hourSlotOdd,
                      isCellSelected(court.id, hour) && styles.hourSlotSelected,
                    ]}
                    onPress={() => handleSlotPress(court.id, hour)}
                    onLongPress={() => handleSlotLongPress(court.id, court.name, hour, courtIndex)}
                    delayLongPress={400}
                  >
                    <View style={styles.hourLine} />
                    {timeGrid === 30 && <View style={[styles.halfHourLine, { top: hourHeight / 2 }]} />}
                    {isCellSelected(court.id, hour) && (
                      <View style={styles.selectedCellOverlay}>
                        <Feather name="check" size={14} color={Colors.dark.primary} />
                      </View>
                    )}
                  </Pressable>
                ))}

                {ownSessions
                  .filter((s) => {
                    const sessionDateStr = getLocalDateString(s.startTime, academyTimezone);
                    const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                    if (sessionDateStr !== selectedDateStr) return false;
                    return s.courtId === court.id || (s.courtId === null && courtIndex === 0);
                  })
                  .map((session) => {
                    const { top, height } = getSessionPosition(session);
                    const now = new Date();
                    const sessionEnd = parseUTCTimestamp(session.endTime);
                    const sessionStart = parseUTCTimestamp(session.startTime);
                    const isPast = sessionEnd < now;
                    const isActive = now >= sessionStart && now < sessionEnd;
                    const typeLabel =
                      session.sessionType === "private" || session.sessionType === "private_adjusted" ? "Private" :
                      session.sessionType === "semi_private" ? "Semi" :
                      session.sessionType === "group" ? "Group" :
                      session.sessionType === "activity" ? "Activity" :
                      session.sessionType === "physical" ? "Physical" : "";
                    const playerName = session.players?.[0]?.name?.split(" ")[0] || "";
                    const isAllHolidayCancelled = session.status === "cancelled" && session.skipReason === "all_players_on_holiday";
                    const sessionLabel = isAllHolidayCancelled
                      ? "Geannuleerd"
                      : (playerName ? `${typeLabel}\n${playerName}` : typeLabel);
                    const gradientColors = isAllHolidayCancelled
                      ? ["#4A4A6A", "#2E2E4E"] as [string, string]
                      : getSessionTypeGradient(session.sessionType);
                    return (
                      <React.Fragment key={session.id}>
                        <DraggableSessionBlock
                          session={session}
                          top={top}
                          height={height}
                          isPast={isAllHolidayCancelled ? true : isPast}
                          isActive={isAllHolidayCancelled ? false : isActive}
                          gradientColors={gradientColors}
                          sessionLabel={sessionLabel}
                          formattedTime={formatTimeInTimezone(session.startTime, academyTimezone)}
                          formattedEndTime={formatTimeInTimezone(session.endTime, academyTimezone)}
                          hourHeight={hourHeight}
                          courtLaneWidth={dynamicLaneWidth}
                          onTap={() => handleSessionTap(session)}
                          onLongPress={() => handleSessionLongPress(session)}
                          onDragEnd={(deltaY: number, deltaX: number) => handleSessionDragEnd(session, deltaY, deltaX, courtIndex)}
                          onDragUpdate={(deltaY: number, deltaX: number, isDragging: boolean) => checkDragConflict(session, deltaY, deltaX, courtIndex, isDragging)}
                          hasConflict={dragConflict === session.id}
                          onHoverIn={Platform.OS === "web" ? () => setHoveredSession(session) : undefined}
                          onHoverOut={Platform.OS === "web" ? () => setHoveredSession(null) : undefined}
                          onWebPress={Platform.OS === "web" ? (_clientX: number, _clientY: number) => {
                            handleSessionTap(session);
                          } : undefined}
                        />
                        {isAllHolidayCancelled ? (
                          <View
                            style={{
                              position: "absolute",
                              top: top + (height - 2) / 2 - 8,
                              left: 4,
                              right: 4,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 3,
                              zIndex: 2,
                            }}
                            pointerEvents="none"
                          >
                            <Ionicons name="airplane" size={9} color="#A0A0C8" />
                            {height > 38 ? (
                              <Text style={{ color: "#A0A0C8", fontSize: 8, fontWeight: "600" }} numberOfLines={1}>Iedereen op vakantie</Text>
                            ) : null}
                          </View>
                        ) : null}
                      </React.Fragment>
                    );
                  })}

                {blockedSessions
                  .filter((s) => s.courtId === court.id || (s.courtId === null && courtIndex === 0))
                  .map((session) => {
                    const { top, height } = getSessionPosition(session);
                    const isCourtBlock = session.isCourtBlock;
                    return (
                      <Pressable
                        key={session.id}
                        style={[
                          isCourtBlock ? styles.blockedBlock : styles.blockedBlockOther,
                          { top, height: height - 2 },
                        ]}
                        onPress={() => handleBlockedSlotPress(session)}
                      >
                        {isCourtBlock ? (
                          <>
                            <Feather name="lock" size={12} color="#FF4444" style={{ marginBottom: 2 }} />
                            <Text style={styles.blockedTextCourt}>BLOCKED</Text>
                            {session.blockedReason && height > 40 ? (
                              <Text style={styles.blockedReasonText}>{session.blockedReason}</Text>
                            ) : null}
                          </>
                        ) : (
                          <Text style={styles.blockedText}>Unavailable</Text>
                        )}
                      </Pressable>
                    );
                  })}

                {coachBlocks
                  .filter((block) => {
                    const blockDateStr = getLocalDateString(new Date(block.startTime), academyTimezone);
                    const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                    return blockDateStr === selectedDateStr;
                  })
                  .map((block) => {
                    const startDt = new Date(block.startTime);
                    const endDt = new Date(block.endTime);
                    const startHour = startDt.getUTCHours() + startDt.getUTCMinutes() / 60;
                    const endHour = endDt.getUTCHours() + endDt.getUTCMinutes() / 60;
                    const top = (startHour - START_HOUR) * hourHeight;
                    const height = (endHour - startHour) * hourHeight;
                    return (
                      <View key={block.id + "-" + court.id} style={[styles.coachBlockStyle, { top, height: height - 2 }]}>
                        <Feather name="user-x" size={10} color="#FFA500" style={{ marginBottom: 1 }} />
                        <Text style={styles.coachBlockText}>MY BLOCK</Text>
                        {height > 30 && block.blockReason ? (
                          <Text style={[styles.coachBlockText, { fontWeight: "400", fontSize: 8 }]}>{block.blockReason}</Text>
                        ) : null}
                      </View>
                    );
                  })}

                {courtIndex === 0 && slotReservations
                  .filter((r) => {
                    const rDateStr = getLocalDateString(r.startTime, academyTimezone);
                    const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                    return rDateStr === selectedDateStr;
                  })
                  .map((r) => {
                    const { top, height } = getSessionPosition(r);
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

                {crossLocationBusyBlocks
                  .filter((block) => {
                    const blockDateStr = getLocalDateString(block.startTime, academyTimezone);
                    const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                    if (blockDateStr !== selectedDateStr) return false;
                    return block.courtId === court.id;
                  })
                  .map((block) => {
                    const startLocal = getTimeInTimezone(block.startTime, academyTimezone);
                    const endLocal = getTimeInTimezone(block.endTime, academyTimezone);
                    const startHour = startLocal.hours + startLocal.minutes / 60;
                    const endHour = endLocal.hours + endLocal.minutes / 60;
                    const top = (startHour - focusBaseHour) * hourHeight;
                    const height = (endHour - startHour) * hourHeight;
                    return (
                      <View key={block.id} style={[styles.busyElsewhereBlock, { top, height: Math.max(height - 2, 24) }]}>
                        <Feather name="map-pin" size={10} color={Colors.dark.gold} style={{ marginRight: 2 }} />
                        <Text style={styles.busyElsewhereText} numberOfLines={1}>@ {block.busyAtLocation}</Text>
                      </View>
                    );
                  })}

                {courtIndex === 0 && travelTimeBlocks
                  .filter((block) => {
                    const blockDateStr = getLocalDateString(block.startTime, academyTimezone);
                    const selectedDateStr = formatDateObjectInTimezone(selectedDate, academyTimezone);
                    return blockDateStr === selectedDateStr;
                  })
                  .map((block) => {
                    const startLocal = getTimeInTimezone(block.startTime, academyTimezone);
                    const endLocal = getTimeInTimezone(block.endTime, academyTimezone);
                    const startHour = startLocal.hours + startLocal.minutes / 60;
                    const endHour = endLocal.hours + endLocal.minutes / 60;
                    const top = (startHour - focusBaseHour) * hourHeight;
                    const height = (endHour - startHour) * hourHeight;
                    return (
                      <View key={block.id} style={[styles.travelTimeBlock, { top, height: Math.max(height - 2, 24), width: courts.length * dynamicLaneWidth - 4 }]}>
                        <Feather name="navigation" size={12} color={Colors.dark.gold} style={{ marginRight: 4 }} />
                        <Text style={styles.travelTimeBlockText}>{block.minutes} min travel</Text>
                      </View>
                    );
                  })}
              </View>
            ))}

            {nowPosition !== null && isToday && (
              <View style={[styles.nowLine, { top: nowPosition, width: totalCourtsWidth }]}>
                <PulsingDot />
                <View style={[styles.nowLineBar, { width: totalCourtsWidth }]} />
              </View>
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </>
  );
}
