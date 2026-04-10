import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { useDesktop } from "@/hooks/useDesktop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography, CardStyles, GlowColors, RoleColors } from "@/constants/theme";
import { SportBadge } from "@/components/SportBadge";
import { SPORTS, type Sport } from "@shared/sportConfig";
import CreateSessionWizard from "@/coach/components/CreateSessionWizard";
import { TIME_COLUMN_WIDTH, START_HOUR } from "@/coach/components/calendar/calendarConstants";
const ADMIN_COLOR = RoleColors.admin;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HOUR_HEIGHT = 60;
const END_HOUR = 23;

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  sessionType?: string;
  ballLevel?: string;
  status?: string;
  coachId?: string;
  courtId?: string;
  sport?: string | null;
  maxCapacity?: number;
  players?: { id: string; name: string }[];
}

interface Coach {
  id: string;
  name: string;
}

interface Court {
  id: string;
  name: string;
}

const COACH_COLORS = [
  "#F97316",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
  "#EC4899",
  "#14B8A6",
  "#EAB308",
  "#EF4444",
];

export default function AdminCalendarScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });
  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });
  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
  });

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [gridMode, setGridMode] = useState<"coach" | "court">("coach");
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<Sport | "all">("all");
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    coachId?: string;
    courtId?: string;
    hour: number;
    date: Date;
  } | null>(null);
  const [wizardCoachId, setWizardCoachId] = useState<string | undefined>(undefined);
  const [currentTime, setCurrentTime] = useState(new Date());
  const isDesktop = useDesktop();
  const [desktopSelectedSession, setDesktopSelectedSession] = useState<Session | null>(null);

  const isToday = useCallback((date: Date) => {
    return date.toDateString() === new Date().toDateString();
  }, []);

  // Update current time every minute for the time indicator line
  const handleSlotPress = (hour: number, coachId?: string, courtId?: string, date?: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedSlot({
      coachId,
      courtId,
      hour,
      date: date || selectedDate,
    });
    setWizardCoachId(coachId);
    setShowCreateSession(true);
  };

  const handleCloseWizard = () => {
    setShowCreateSession(false);
    setSelectedSlot(null);
    setWizardCoachId(undefined);
    queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
  };

  const getCoachName = (coachId?: string) => {
    if (!coachId) return "Unassigned";
    const coach = coaches.find((c) => c.id === coachId);
    return coach?.name || "Unknown";
  };

  const getCoachColor = (coachId?: string) => {
    if (!coachId) return Colors.dark.textMuted;
    const index = coaches.findIndex((c) => c.id === coachId);
    return COACH_COLORS[index % COACH_COLORS.length];
  };

  const getCourtName = (courtId?: string) => {
    if (!courtId) return "No Court";
    const court = courts.find((c) => c.id === courtId);
    return court?.name || "Unknown";
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, "0")}:00`;
  };

  const sportFilteredSessions = useMemo(() => {
    if (sportFilter === "all") return sessions;
    return sessions.filter(s => (s.sport || "tennis") === sportFilter);
  }, [sessions, sportFilter]);

  const allTodaySessions = useMemo(() => {
    const today = selectedDate.toDateString();
    return sportFilteredSessions
      .filter((s) => new Date(s.startTime).toDateString() === today)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [sportFilteredSessions, selectedDate]);

  const todaySessions = useMemo(() => {
    if (selectedCoachFilter && gridMode === "coach") {
      return allTodaySessions.filter((s) => s.coachId === selectedCoachFilter);
    }
    return allTodaySessions;
  }, [allTodaySessions, selectedCoachFilter, gridMode]);

  const weekDays = useMemo(() => {
    const days: { date: Date; sessions: Session[] }[] = [];
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      const dayString = day.toDateString();
      
      let daySessions = sportFilteredSessions.filter((s) => {
        const sessionDate = new Date(s.startTime).toDateString();
        return sessionDate === dayString;
      });
      if (selectedCoachFilter) {
        daySessions = daySessions.filter((s) => s.coachId === selectedCoachFilter);
      }
      daySessions.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      
      days.push({ date: day, sessions: daySessions });
    }
    return days;
  }, [sportFilteredSessions, selectedDate, selectedCoachFilter]);

  const totalWeekSessions = useMemo(() => {
    return weekDays.reduce((sum, day) => sum + day.sessions.length, 0);
  }, [weekDays]);

  const upcomingSessions = useMemo(() => {
    const now = new Date();
    return todaySessions.filter(s => new Date(s.startTime) > now);
  }, [todaySessions]);

  const completedSessions = useMemo(() => {
    return todaySessions.filter(s => s.status === "completed");
  }, [todaySessions]);

  const navigateDate = (direction: number) => {
    const newDate = new Date(selectedDate);
    const increment = viewMode === "week" ? 7 : 1;
    newDate.setDate(newDate.getDate() + (direction * increment));
    setSelectedDate(newDate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const formatWeekRange = () => {
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const startMonth = startOfWeek.toLocaleDateString("en-US", { month: "short" });
    const endMonth = endOfWeek.toLocaleDateString("en-US", { month: "short" });
    const startDay = startOfWeek.getDate();
    const endDay = endOfWeek.getDate();
    
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  };

  const formatDayShort = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

    const getSessionPosition = (session: Session) => {
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    const height = (endHour - startHour) * HOUR_HEIGHT;
    return { top, height };
  };

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const coachLaneWidth = Math.max(80, (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / Math.max(coaches.length, 1));
  const weekDayWidth = (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / 7;

  const isSlotOccupied = (hour: number, coachId?: string, courtId?: string) => {
    const sessionsToCheck = gridMode === "court" ? allTodaySessions : todaySessions;
    return sessionsToCheck.some((session) => {
      const startHour = new Date(session.startTime).getHours();
      const endHour = new Date(session.endTime).getHours();
      const sessionMatches = hour >= startHour && hour < endHour;
      if (gridMode === "coach") {
        return sessionMatches && session.coachId === coachId;
      } else {
        return sessionMatches && session.courtId === courtId;
      }
    });
  };

  const COURT_COLORS = [
    "#22C55E",
    "#3B82F6",
    "#A855F7",
    "#EC4899",
    "#14B8A6",
    "#EAB308",
    "#EF4444",
    "#F97316",
  ];

  const courtLaneWidth = Math.max(80, (SCREEN_WIDTH - TIME_COLUMN_WIDTH - Spacing.lg * 2) / Math.max(courts.length, 1));

  const now = new Date();
  const isTodaySelected = selectedDate.toDateString() === now.toDateString();
  const showTimeIndicator = isTodaySelected && now.getHours() >= START_HOUR && now.getHours() <= END_HOUR;
  const currentTimePosition = (now.getHours() - START_HOUR + now.getMinutes() / 60) * HOUR_HEIGHT;

  const renderDayView = () => (
    <View style={styles.calendarGrid}>
      <View style={styles.coachHeaderRow}>
        <View style={[styles.timeColumnHeader, { width: TIME_COLUMN_WIDTH }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.coachHeaders}>
            {gridMode === "coach" ? (
              (selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches).map((coach, index) => (
                <View key={coach.id} style={[styles.coachHeader, { width: coachLaneWidth }]}>
                  <View style={[styles.coachDot, { backgroundColor: COACH_COLORS[index % COACH_COLORS.length] }]} />
                  <Text style={styles.coachHeaderText} numberOfLines={1}>{coach.name}</Text>
                </View>
              ))
            ) : (
              courts.map((court, index) => (
                <View key={court.id} style={[styles.coachHeader, { width: courtLaneWidth }]}>
                  <View style={[styles.coachDot, { backgroundColor: COURT_COLORS[index % COURT_COLORS.length] }]} />
                  <Text style={styles.coachHeaderText} numberOfLines={1}>{court.name}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.gridContainer}>
          <View style={[styles.timeColumn, { width: TIME_COLUMN_WIDTH }]}>
            {hours.map((hour) => (
              <View key={hour} style={[styles.timeSlot, { height: HOUR_HEIGHT }]}>
                <Text style={styles.timeText}>{formatHour(hour)}</Text>
              </View>
            ))}
          </View>

          {showTimeIndicator ? (
            <View style={[styles.currentTimeIndicator, { top: currentTimePosition }]}>
              <View style={styles.currentTimeDot} />
              <View style={styles.currentTimeLine} />
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.coachLanesContainer}>
              {gridMode === "coach" ? (
                (selectedCoachFilter ? coaches.filter(c => c.id === selectedCoachFilter) : coaches).map((coach, coachIndex) => {
                  const coachSessions = todaySessions.filter(s => s.coachId === coach.id);
                  return (
                    <View key={coach.id} style={[styles.coachLane, { width: coachLaneWidth }]}>
                      {hours.map((hour) => {
                        const occupied = isSlotOccupied(hour, coach.id, undefined);
                        return (
                          <Pressable
                            key={hour}
                            style={[styles.hourSlot, styles.clickableSlot, { height: HOUR_HEIGHT }]}
                            onPress={occupied ? undefined : () => handleSlotPress(hour, coach.id, undefined)}
                            disabled={occupied}
                          >
                            {!occupied ? (
                              <View style={styles.emptySlotIndicator}>
                                <Ionicons name="add" size={14} color={Colors.dark.textMuted + "40"} />
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                      
                      {coachSessions.map((session) => {
                        const { top, height } = getSessionPosition(session);
                        const color = COACH_COLORS[coachIndex % COACH_COLORS.length];
                        return (
                          <Pressable
                            key={session.id}
                            style={[
                              styles.sessionBlock,
                              {
                                top,
                                height: height - 4,
                                opacity: session.status === "completed" ? 0.6 : 1,
                              },
                            ]}
                            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                          >
                            <LinearGradient
                              colors={[color, `${color}CC`]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.sessionGradient}
                            >
                              <Text style={styles.sessionText} numberOfLines={1}>
                                {session.sessionType || "Training"}
                              </Text>
                              <Text style={styles.sessionTime} numberOfLines={1}>
                                {formatTime(session.startTime)}
                              </Text>
                              <Text style={styles.sessionCourt} numberOfLines={1}>
                                {getCourtName(session.courtId)}
                              </Text>
                              {session.players && session.players.length > 0 ? (
                                <Text style={styles.sessionPlayers} numberOfLines={1}>
                                  {session.players.length} player{session.players.length > 1 ? "s" : ""}
                                </Text>
                              ) : null}
                              {session.sport && session.sport !== "tennis" ? (
                                <SportBadge sport={session.sport} size="sm" showLabel={false} />
                              ) : null}
                            </LinearGradient>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })
              ) : (
                courts.map((court, courtIndex) => {
                  const courtSessions = allTodaySessions.filter(s => s.courtId === court.id);
                  return (
                    <View key={court.id} style={[styles.coachLane, { width: courtLaneWidth }]}>
                      {hours.map((hour) => {
                        const occupied = isSlotOccupied(hour, undefined, court.id);
                        return (
                          <Pressable
                            key={hour}
                            style={[styles.hourSlot, styles.clickableSlot, { height: HOUR_HEIGHT }]}
                            onPress={occupied ? undefined : () => handleSlotPress(hour, undefined, court.id)}
                            disabled={occupied}
                          >
                            {!occupied ? (
                              <View style={styles.emptySlotIndicator}>
                                <Ionicons name="add" size={14} color={Colors.dark.textMuted + "40"} />
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                      
                      {courtSessions.map((session) => {
                        const { top, height } = getSessionPosition(session);
                        const color = COURT_COLORS[courtIndex % COURT_COLORS.length];
                        return (
                          <Pressable
                            key={session.id}
                            style={[
                              styles.sessionBlock,
                              {
                                top,
                                height: height - 4,
                                opacity: session.status === "completed" ? 0.6 : 1,
                              },
                            ]}
                            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                          >
                            <LinearGradient
                              colors={[color, `${color}CC`]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.sessionGradient}
                            >
                              <Text style={styles.sessionText} numberOfLines={1}>
                                {session.sessionType || "Training"}
                              </Text>
                              <Text style={styles.sessionTime} numberOfLines={1}>
                                {formatTime(session.startTime)}
                              </Text>
                              <Text style={styles.sessionCourt} numberOfLines={1}>
                                {getCoachName(session.coachId)}
                              </Text>
                              {session.players && session.players.length > 0 ? (
                                <Text style={styles.sessionPlayers} numberOfLines={1}>
                                  {session.players.length} player{session.players.length > 1 ? "s" : ""}
                                </Text>
                              ) : null}
                            </LinearGradient>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );

  const renderWeekView = () => (
    <View style={styles.calendarGrid}>
      <View style={styles.weekHeaderRow}>
        <View style={[styles.timeColumnHeader, { width: TIME_COLUMN_WIDTH }]} />
        {weekDays.map(({ date }) => (
          <View key={date.toISOString()} style={[styles.weekDayHeader, { width: weekDayWidth }]}>
            <Text style={[styles.weekDayText, isToday(date) && styles.weekDayTextToday]}>
              {formatDayShort(date)}
            </Text>
            <View style={[styles.weekDayNumber, isToday(date) && styles.weekDayNumberToday]}>
              <Text style={[styles.weekDayNumberText, isToday(date) && styles.weekDayNumberTextToday]}>
                {date.getDate()}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.gridContainer}>
          <View style={[styles.timeColumn, { width: TIME_COLUMN_WIDTH }]}>
            {hours.map((hour) => (
              <View key={hour} style={[styles.timeSlot, { height: HOUR_HEIGHT }]}>
                <Text style={styles.timeText}>{formatHour(hour)}</Text>
              </View>
            ))}
          </View>

          {weekDays.map(({ date, sessions: daySessions }) => (
            <View key={date.toISOString()} style={[styles.weekDayColumn, { width: weekDayWidth }]}>
              {hours.map((hour) => (
                <View key={hour} style={[styles.hourSlot, { height: HOUR_HEIGHT }]} />
              ))}
              
              {daySessions.map((session) => {
                const { top, height } = getSessionPosition(session);
                const color = getCoachColor(session.coachId);
                return (
                  <Pressable
                    key={session.id}
                    style={[
                      styles.weekSessionBlock,
                      {
                        top,
                        height: Math.max(height - 2, 20),
                        opacity: session.status === "completed" ? 0.6 : 1,
                      },
                    ]}
                    onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                  >
                    <LinearGradient
                      colors={[color, `${color}CC`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.weekSessionGradient}
                    >
                      <Text style={styles.weekSessionText} numberOfLines={1}>
                        {getCoachName(session.coachId).split(" ")[0]}
                      </Text>
                      {height > 30 ? (
                        <Text style={styles.weekSessionTime} numberOfLines={1}>
                          {formatTime(session.startTime)}
                        </Text>
                      ) : null}
                    </LinearGradient>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const getBallLevelColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case "blue": return "#4FC3F7";
      case "red": return "#FF4D4D";
      case "orange": return "#FF851B";
      case "green": return "#C8FF3D";
      case "yellow": return "#FFD700";
      case "glow": return "#E040FB";
      default: return "#7C8290";
    }
  };

  if (sessionsLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isDesktop ? 0 : insets.top }]}>
        <ActivityIndicator size="large" color={ADMIN_COLOR} />
      </View>
    );
  }

  if (isDesktop) {
    const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
    const HOUR_H = 56;

    return (
      <View style={calStyles.root}>
        <View style={calStyles.toolbar}>
          <Pressable style={calStyles.todayBtn} onPress={goToToday}>
            <Text style={calStyles.todayBtnText}>Today</Text>
          </Pressable>
          <Pressable onPress={() => navigateDate(-1)}>
            <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
          </Pressable>
          <Pressable onPress={() => navigateDate(1)}>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
          </Pressable>
          <Text style={calStyles.rangeText}>{formatWeekRange()}</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            style={calStyles.newSessionBtn}
            onPress={() => setShowCreateSession(true)}
          >
            <Ionicons name="add" size={16} color="#0B0D10" />
            <Text style={calStyles.newSessionBtnText}>New Session</Text>
          </Pressable>
        </View>

        <View style={calStyles.calendarArea}>
          <ScrollView style={calStyles.calendarScroll} showsVerticalScrollIndicator={false}>
            <View style={calStyles.weekGrid}>
              <View style={calStyles.timeGutter}>
                <View style={calStyles.dayHeaderCell} />
                {HOURS.map((h) => (
                  <View key={h} style={[calStyles.timeCell, { height: HOUR_H }]}>
                    <Text style={calStyles.timeText}>{`${h.toString().padStart(2, "0")}:00`}</Text>
                  </View>
                ))}
              </View>

              {weekDays.map(({ date, sessions: daySessions }) => {
                const isToday = date.toDateString() === new Date().toDateString();
                return (
                  <View key={date.toISOString()} style={calStyles.dayCol}>
                    <View style={[calStyles.dayHeaderCell, isToday && calStyles.dayHeaderToday]}>
                      <Text style={[calStyles.dayHeaderDay, isToday && calStyles.dayHeaderDayToday]}>
                        {date.toLocaleDateString("en-US", { weekday: "short" })}
                      </Text>
                      <Text style={[calStyles.dayHeaderDate, isToday && calStyles.dayHeaderDateToday]}>
                        {date.getDate()}
                      </Text>
                    </View>
                    <View style={[calStyles.dayBody, { height: HOURS.length * HOUR_H }]}>
                      {HOURS.map((h) => (
                        <Pressable
                          key={h}
                          style={[calStyles.hourSlot, { height: HOUR_H }]}
                          onPress={() => handleSlotPress(h, undefined, undefined, date)}
                        />
                      ))}
                      {daySessions.map((session) => {
                        const start = new Date(session.startTime);
                        const end = new Date(session.endTime);
                        const topOffset = (start.getHours() - START_HOUR + start.getMinutes() / 60) * HOUR_H;
                        const height = Math.max(20, ((end.getTime() - start.getTime()) / 3600000) * HOUR_H);
                        const color = getBallLevelColor(session.ballLevel);
                        const isSelected = desktopSelectedSession?.id === session.id;

                        return (
                          <Pressable
                            key={session.id}
                            style={[calStyles.sessionBlock, { top: topOffset, height, borderColor: color, borderLeftWidth: 3, ...(isSelected ? { borderColor: "#C8FF3D", borderWidth: 1 } : {}) }]}
                            onPress={() => setDesktopSelectedSession(isSelected ? null : session)}
                          >
                            <LinearGradient
                              colors={[`${color}30`, `${color}15`]}
                              style={calStyles.sessionBlockGradient}
                            >
                              <Text style={calStyles.sessionBlockTime} numberOfLines={1}>
                                {start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                              </Text>
                              <Text style={[calStyles.sessionBlockType, { color }]} numberOfLines={1}>
                                {session.sessionType || session.ballLevel || "Session"}
                              </Text>
                              {height > 36 ? (
                                <Text style={calStyles.sessionBlockCoach} numberOfLines={1}>
                                  {getCoachName(session.coachId)}
                                </Text>
                              ) : null}
                              {height > 52 ? (
                                <Text style={calStyles.sessionBlockCapacity} numberOfLines={1}>
                                  {session.players?.length ?? 0}/{session.maxCapacity ?? "?"} players
                                </Text>
                              ) : null}
                            </LinearGradient>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {desktopSelectedSession ? (
            <View style={calStyles.rightPanel}>
              <View style={calStyles.panelHeader}>
                <Text style={calStyles.panelTitle}>Session Details</Text>
                <Pressable onPress={() => setDesktopSelectedSession(null)}>
                  <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
                </Pressable>
              </View>
              <View style={calStyles.panelContent}>
                {(() => {
                  const s = desktopSelectedSession;
                  const start = new Date(s.startTime);
                  const end = new Date(s.endTime);
                  const color = getBallLevelColor(s.ballLevel);
                  return (
                    <>
                      <View style={[calStyles.panelColorBar, { backgroundColor: color }]} />
                      {[
                        { label: "Type", value: s.sessionType || "Session" },
                        { label: "Ball Level", value: s.ballLevel || "—" },
                        { label: "Coach", value: getCoachName(s.coachId) },
                        { label: "Court", value: getCourtName(s.courtId) },
                        { label: "Start", value: start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) },
                        { label: "End", value: end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) },
                        { label: "Status", value: s.status || "upcoming" },
                        { label: "Players", value: s.players?.length ? `${s.players.length} enrolled` : "0 enrolled" },
                      ].map(({ label, value }) => (
                        <View key={label} style={calStyles.panelRow}>
                          <Text style={calStyles.panelRowLabel}>{label}</Text>
                          <Text style={calStyles.panelRowValue}>{value}</Text>
                        </View>
                      ))}
                      {s.players && s.players.length > 0 ? (
                        <View style={calStyles.playerList}>
                          <Text style={calStyles.playerListTitle}>
                            Players ({s.players.length}/{s.maxCapacity ?? "?"})
                          </Text>
                          {s.players.map((p) => (
                            <View key={p.id} style={calStyles.playerListRow}>
                              <View style={calStyles.playerListDot} />
                              <Text style={calStyles.playerListName}>{p.name}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <View style={calStyles.quickActionsRow}>
                        <Pressable
                          style={calStyles.quickAction}
                          onPress={() => {
                            setSelectedSlot({
                              hour: new Date(s.startTime).getHours(),
                              coachId: s.coachId,
                              courtId: s.courtId,
                              date: new Date(s.startTime),
                            });
                            setShowCreateSession(true);
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={14} color="#C8FF3D" />
                          <Text style={calStyles.quickActionText}>New this slot</Text>
                        </Pressable>
                        <Pressable
                          style={[calStyles.quickAction, { borderColor: "rgba(255,133,27,0.3)", backgroundColor: "rgba(255,133,27,0.08)" }]}
                          onPress={() => setDesktopSelectedSession(null)}
                        >
                          <Ionicons name="close-outline" size={14} color={Colors.dark.orange} />
                          <Text style={[calStyles.quickActionText, { color: Colors.dark.orange }]}>Dismiss</Text>
                        </Pressable>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
          ) : null}
        </View>

        {showCreateSession ? (
          <CreateSessionWizard
            visible={showCreateSession}
            onClose={handleCloseWizard}
            initialDate={selectedSlot?.date || selectedDate}
            initialHour={selectedSlot?.hour}
            initialCoachId={wizardCoachId}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(249,115,22,0.12)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <View style={styles.headerToggles}>
          
            <View style={styles.viewToggle}>
              <Pressable
                style={[styles.viewButton, viewMode === "day" && styles.viewButtonActive]}
                onPress={() => { setViewMode("day"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.viewButtonText, viewMode === "day" && styles.viewButtonTextActive]}>Day</Text>
              </Pressable>
              <Pressable
                style={[styles.viewButton, viewMode === "week" && styles.viewButtonActive]}
                onPress={() => { setViewMode("week"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.viewButtonText, viewMode === "week" && styles.viewButtonTextActive]}>Week</Text>
              </Pressable>
            </View>
          
        </View>
      </View>

      {viewMode === "day" ? (
        <View style={styles.gridModeToggle}>
          <Pressable
            style={[styles.gridModeButton, gridMode === "coach" && styles.gridModeButtonActive]}
            onPress={() => { setGridMode("coach"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="people" size={14} color={gridMode === "coach" ? Colors.dark.text : Colors.dark.textMuted} />
            <Text style={[styles.gridModeText, gridMode === "coach" && styles.gridModeTextActive]}>Coaches</Text>
          </Pressable>
          <Pressable
            style={[styles.gridModeButton, gridMode === "court" && styles.gridModeButtonActive]}
            onPress={() => { setGridMode("court"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Ionicons name="tennisball" size={14} color={gridMode === "court" ? Colors.dark.text : Colors.dark.textMuted} />
            <Text style={[styles.gridModeText, gridMode === "court" && styles.gridModeTextActive]}>Courts</Text>
          </Pressable>
        </View>
      ) : null}

      
        <View style={styles.dateNav}>
          <Pressable style={styles.navButton} onPress={() => navigateDate(-1)}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Pressable style={styles.dateDisplay} onPress={goToToday}>
            <Text style={styles.dateText}>
              {viewMode === "day" ? formatDate(selectedDate) : formatWeekRange()}
            </Text>
            {isToday(selectedDate) ? (
              <View style={styles.todayBadge}>
                <Text style={styles.todayText}>Today</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable style={styles.navButton} onPress={() => navigateDate(1)}>
            <Ionicons name="chevron-forward" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>
      

      
        <View style={styles.statsRow}>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={styles.statValue}>{viewMode === "day" ? todaySessions.length : totalWeekSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={styles.statValue}>{viewMode === "day" ? upcomingSessions.length : weekDays.filter(d => isToday(d.date) || d.date > new Date()).reduce((sum, d) => sum + d.sessions.length, 0)}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={[styles.statCard, CardStyles.elevated]}>
            <Text style={styles.statValue}>{viewMode === "day" ? completedSessions.length : weekDays.reduce((sum, d) => sum + d.sessions.filter(s => s.status === "completed").length, 0)}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>
      

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.coachFilter}
        contentContainerStyle={styles.coachFilterContent}
      >
        <Pressable
          style={[styles.filterChip, !selectedCoachFilter && styles.filterChipActive]}
          onPress={() => { setSelectedCoachFilter(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Text style={[styles.filterChipText, !selectedCoachFilter && styles.filterChipTextActive]}>All Coaches</Text>
        </Pressable>
        {coaches.map((coach, index) => (
          <Pressable
            key={coach.id}
            style={[
              styles.filterChip, 
              selectedCoachFilter === coach.id && styles.filterChipActive,
              { borderColor: COACH_COLORS[index % COACH_COLORS.length] + "60" }
            ]}
            onPress={() => { setSelectedCoachFilter(coach.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <View style={[styles.filterDot, { backgroundColor: COACH_COLORS[index % COACH_COLORS.length] }]} />
            <Text style={[styles.filterChipText, selectedCoachFilter === coach.id && styles.filterChipTextActive]}>
              {coach.name.split(" ")[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.coachFilter}
        contentContainerStyle={styles.coachFilterContent}
      >
        <Pressable
          style={[styles.filterChip, sportFilter === "all" && styles.filterChipActive]}
          onPress={() => { setSportFilter("all"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Text style={[styles.filterChipText, sportFilter === "all" && styles.filterChipTextActive]}>All Sports</Text>
        </Pressable>
        {SPORTS.map((sport) => (
          <Pressable
            key={sport}
            style={[styles.filterChip, sportFilter === sport && styles.filterChipActive]}
            onPress={() => { setSportFilter(sport); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <SportBadge sport={sport} size="sm" showLabel={false} />
            <Text style={[styles.filterChipText, sportFilter === sport && styles.filterChipTextActive]}>
              {sport.charAt(0).toUpperCase() + sport.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.calendarContainer, { paddingBottom: insets.bottom + 80 }]}>
        {viewMode === "day" ? renderDayView() : renderWeekView()}
      </View>

      
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 90 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSelectedSlot(null);
            setShowCreateSession(true);
          }}
        >
          <LinearGradient
            colors={[ADMIN_COLOR, "#EA580C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
          </LinearGradient>
        </Pressable>
      

      <CreateSessionWizard
        visible={showCreateSession}
        onClose={handleCloseWizard}
        adminMode={true}
        coaches={coaches}
        selectedCoachId={wizardCoachId}
        onCoachIdChange={setWizardCoachId}
        initialTime={selectedSlot ? (() => {
          const date = new Date(selectedSlot.date);
          date.setHours(selectedSlot.hour, 0, 0, 0);
          return date;
        })() : undefined}
        initialCourtId={selectedSlot?.courtId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: ADMIN_COLOR,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 4,
  },
  viewButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  viewButtonActive: {
    backgroundColor: ADMIN_COLOR,
  },
  viewButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  viewButtonTextActive: {
    color: Colors.dark.text,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  dateDisplay: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  dateText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  todayBadge: {
    backgroundColor: ADMIN_COLOR,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  todayText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  statLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  coachFilter: {
    maxHeight: 44,
    marginBottom: Spacing.sm,
  },
  coachFilterContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
    gap: Spacing.xs,
  },
  filterChipActive: {
    backgroundColor: ADMIN_COLOR + "30",
    borderColor: ADMIN_COLOR,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: ADMIN_COLOR,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  calendarGrid: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  coachHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  timeColumnHeader: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  coachHeaders: {
    flexDirection: "row",
  },
  coachHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
    gap: Spacing.xs,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  coachDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  coachHeaderText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    fontSize: 10,
  },
  weekHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot,
  },
  weekDayHeader: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  weekDayText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  weekDayTextToday: {
    color: ADMIN_COLOR,
  },
  weekDayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  weekDayNumberToday: {
    backgroundColor: ADMIN_COLOR,
  },
  weekDayNumberText: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  weekDayNumberTextToday: {
    color: Colors.dark.text,
    fontWeight: "700",
  },
  gridContainer: {
    flexDirection: "row",
    position: "relative",
  },
  currentTimeIndicator: {
    position: "absolute",
    left: TIME_COLUMN_WIDTH,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 100,
  },
  currentTimeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.error,
    marginLeft: -5,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.dark.error,
  },
  timeColumn: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  timeSlot: {
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingRight: 4,
    alignItems: "flex-end",
  },
  timeText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  coachLanesContainer: {
    flexDirection: "row",
  },
  coachLane: {
    position: "relative",
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  weekDayColumn: {
    position: "relative",
    borderRightWidth: 1,
    borderRightColor: Colors.dark.backgroundRoot,
  },
  hourSlot: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundRoot + "50",
  },
  clickableSlot: {
    justifyContent: "center",
    alignItems: "center",
  },
  emptySlotIndicator: {
    opacity: 0,
  },
  headerToggles: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  gridModeToggle: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  gridModeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  gridModeButtonActive: {
    backgroundColor: ADMIN_COLOR,
  },
  gridModeText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  gridModeTextActive: {
    color: Colors.dark.text,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: ADMIN_COLOR,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  fabGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 6,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  sessionGradient: {
    flex: 1,
    padding: 4,
    justifyContent: "flex-start",
  },
  sessionText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.text,
    textTransform: "uppercase",
  },
  sessionTime: {
    fontSize: 8,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: 1,
  },
  sessionCourt: {
    fontSize: 7,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  sessionPlayers: {
    fontSize: 7,
    fontWeight: "500",
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  weekSessionBlock: {
    position: "absolute",
    left: 1,
    right: 1,
    borderRadius: 4,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  weekSessionGradient: {
    flex: 1,
    padding: 2,
    justifyContent: "center",
  },
  weekSessionText: {
    fontSize: 7,
    fontWeight: "800",
    color: Colors.dark.text,
    textTransform: "uppercase",
  },
  weekSessionTime: {
    fontSize: 6,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});

const calStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0D10",
    flexDirection: "column",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 12,
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  todayBtnText: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  rangeText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    marginLeft: 4,
  },
  newSessionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#C8FF3D",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newSessionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B0D10",
  },
  calendarArea: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  calendarScroll: {
    flex: 1,
    overflow: "scroll",
  },
  weekGrid: {
    flexDirection: "row",
    minWidth: 700,
  },
  timeGutter: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.07)",
  },
  dayCol: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.05)",
  },
  dayHeaderCell: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  dayHeaderToday: {
    backgroundColor: "rgba(200,255,61,0.05)",
  },
  dayHeaderDay: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dayHeaderDayToday: {
    color: "#C8FF3D",
  },
  dayHeaderDate: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: 2,
  },
  dayHeaderDateToday: {
    color: "#C8FF3D",
  },
  dayBody: {
    position: "relative",
    overflow: "hidden",
  },
  timeCell: {
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingRight: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  timeText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    textAlign: "right",
  },
  hourSlot: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  sessionBlock: {
    position: "absolute",
    left: 2,
    right: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  sessionBlockGradient: {
    flex: 1,
    padding: 4,
  },
  sessionBlockTime: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  sessionBlockType: {
    fontSize: 11,
    fontWeight: "700",
  },
  sessionBlockCoach: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 1,
  },
  rightPanel: {
    width: 280,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#11141A",
    overflow: "scroll",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  panelContent: {
    padding: 16,
  },
  panelColorBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  panelRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  panelRowLabel: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  panelRowValue: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  playerList: {
    marginTop: 16,
  },
  playerListTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  playerListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  playerListDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#C8FF3D",
  },
  playerListName: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  sessionBlockCapacity: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    marginTop: 1,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.3)",
    backgroundColor: "rgba(200,255,61,0.08)",
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C8FF3D",
  },
});
