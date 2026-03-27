import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { styles } from "./calendarStyles";
import { parseUTCTimestamp, formatTimeInTimezone } from "@/lib/dateUtils";
import { getSessionTypeGradient } from "./calendarUtils";

interface SessionPlayer {
  name: string;
}

interface CalendarSession {
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
}

interface CalendarDayViewOverviewProps {
  selectedDate: Date;
  getSessionsForDate: (date: Date) => CalendarSession[];
  courts: Court[];
  academyTimezone: string;
  setSelectedSessionForDetail: (session: CalendarSession) => void;
}

export function CalendarDayViewOverview({
  selectedDate,
  getSessionsForDate,
  courts,
  academyTimezone,
  setSelectedSessionForDetail,
}: CalendarDayViewOverviewProps) {
  const daySessions = getSessionsForDate(selectedDate)
    .sort((a, b) => parseUTCTimestamp(a.startTime).getTime() - parseUTCTimestamp(b.startTime).getTime());

  return (
    <ScrollView
      style={styles.calendarScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.weekCardsContainer}
    >
      {daySessions.length === 0 ? (
        <View style={styles.overviewEmpty}>
          <Ionicons name="calendar-outline" size={48} color={Colors.dark.tabIconDefault} />
          <Text style={styles.overviewEmptyText}>No lessons today</Text>
        </View>
      ) : (
        daySessions.map((session) => {
          const typeLabel =
            session.sessionType === "private" || session.sessionType === "private_adjusted" ? "Private" :
            session.sessionType === "semi_private" ? "Semi-Private" :
            session.sessionType === "group" ? "Group" :
            session.sessionType === "activity" ? "Activity" :
            session.sessionType === "physical" ? "Physical" : "Session";
          const playerNames = session.players?.map(p => p.name.split(" ")[0]).join(", ") || "";
          const courtName = courts.find(c => c.id === session.courtId)?.name || "";
          const gradientColors = getSessionTypeGradient(session.sessionType);
          const now = new Date();
          const sessionStart = parseUTCTimestamp(session.startTime);
          const sessionEnd = parseUTCTimestamp(session.endTime);
          const isPast = sessionEnd < now;
          const isActive = now >= sessionStart && now < sessionEnd;

          return (
            <Pressable
              key={session.id}
              style={[styles.overviewSessionRow, isPast && styles.overviewSessionRowPast]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedSessionForDetail(session);
              }}
            >
              <View style={[styles.overviewSessionAccent, { backgroundColor: gradientColors[0] }]} />
              <View style={styles.overviewSessionTime}>
                <Text style={[styles.overviewTimeText, isPast && styles.overviewTimePast]}>
                  {formatTimeInTimezone(session.startTime, academyTimezone)}
                </Text>
                <Text style={styles.overviewTimeDash}>-</Text>
                <Text style={[styles.overviewTimeText, isPast && styles.overviewTimePast]}>
                  {formatTimeInTimezone(session.endTime, academyTimezone)}
                </Text>
              </View>
              <View style={styles.overviewSessionInfo}>
                <View style={styles.overviewSessionTopRow}>
                  <Text style={[styles.overviewTypeLabel, { color: gradientColors[0] }]}>{typeLabel}</Text>
                  {isActive ? (
                    <View style={styles.overviewLiveBadge}>
                      <View style={styles.overviewLiveDot} />
                      <Text style={styles.overviewLiveText}>LIVE</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.overviewSessionDetails}>
                  {playerNames ? <Text style={styles.overviewPlayerText} numberOfLines={1}>{playerNames}</Text> : null}
                  {courtName ? (
                    <View style={styles.overviewCourtChip}>
                      <Ionicons name="location-outline" size={10} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.overviewCourtText}>{courtName}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.tabIconDefault} />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
