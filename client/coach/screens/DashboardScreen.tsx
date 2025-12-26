import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  status: string | null;
}

interface Alert {
  id: string;
  type: "unpaid" | "holiday" | "absent" | "feedback";
  message: string;
  priority: "high" | "medium" | "low";
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { coach, calendarData, isLoading } = useCoach();

  const today = new Date();
  const todaysSessions = useMemo(() => {
    if (!calendarData?.ownSessions) return [];
    return calendarData.ownSessions.filter((session) => {
      const sessionDate = new Date(session.startTime);
      return (
        sessionDate.getFullYear() === today.getFullYear() &&
        sessionDate.getMonth() === today.getMonth() &&
        sessionDate.getDate() === today.getDate() &&
        session.status !== "cancelled"
      );
    });
  }, [calendarData?.ownSessions, today]);

  const nextSession = useMemo(() => {
    const now = new Date();
    const upcoming = todaysSessions
      .filter((s) => new Date(s.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return upcoming[0] || null;
  }, [todaysSessions]);

  const currentSession = useMemo(() => {
    const now = new Date();
    return todaysSessions.find((session) => {
      const start = new Date(session.startTime);
      const end = new Date(session.endTime);
      return now >= start && now < end;
    });
  }, [todaysSessions]);

  const getTimeUntil = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diff = start.getTime() - now.getTime();
    if (diff <= 0) return "Nu";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}u ${minutes}m`;
    return `${minutes} min`;
  };

  const alerts: Alert[] = useMemo(() => {
    const result: Alert[] = [];
    const sessionsNeedingFeedback = todaysSessions.filter(
      (s) => new Date(s.endTime) < new Date() && s.status !== "completed"
    );
    if (sessionsNeedingFeedback.length > 0) {
      result.push({
        id: "feedback",
        type: "feedback",
        message: `${sessionsNeedingFeedback.length} lessons awaiting feedback`,
        priority: "medium",
      });
    }
    return result;
  }, [todaysSessions]);

  const handleNavigate = (screen: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    (navigation as any).navigate(screen);
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  if (!coach) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.coachName}>{coach.name}</Text>
        </View>

        <View style={styles.todayCard}>
          <LinearGradient
            colors={["rgba(46, 204, 64, 0.15)", "rgba(46, 204, 64, 0.05)"]}
            style={styles.todayGradient}
          >
            <View style={styles.todayHeader}>
              <Text style={styles.todayLabel}>VANDAAG</Text>
              <Text style={styles.todayDate}>
                {today.toLocaleDateString("nl-NL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>
            </View>

            <View style={styles.todayStats}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{todaysSessions.length}</Text>
                <Text style={styles.statLabel}>Lessons</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {todaysSessions.reduce((acc, s) => acc + s.duration, 0)}
                </Text>
                <Text style={styles.statLabel}>Minutes</Text>
              </View>
            </View>

            {currentSession ? (
              <View style={styles.nextLessonContainer}>
                <View style={styles.nextLessonBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.nextLessonBadgeText}>IN PROGRESS</Text>
                </View>
                <Text style={styles.nextLessonTime}>
                  {formatTime(currentSession.startTime)} - {formatTime(currentSession.endTime)}
                </Text>
              </View>
            ) : nextSession ? (
              <View style={styles.nextLessonContainer}>
                <Text style={styles.nextLessonLabel}>Next lesson in</Text>
                <Text style={styles.nextLessonTime}>{getTimeUntil(nextSession.startTime)}</Text>
              </View>
            ) : todaysSessions.length === 0 ? (
              <View style={styles.nextLessonContainer}>
                <Text style={styles.noLessonsText}>No lessons today</Text>
              </View>
            ) : (
              <View style={styles.nextLessonContainer}>
                <Text style={styles.noLessonsText}>All lessons completed</Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {alerts.length > 0 ? (
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            {alerts.map((alert) => (
              <Pressable key={alert.id} style={styles.alertCard}>
                <View
                  style={[
                    styles.alertIcon,
                    {
                      backgroundColor:
                        alert.priority === "high"
                          ? Colors.dark.error + "20"
                          : Colors.dark.orange + "20",
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      alert.type === "feedback"
                        ? "document-text-outline"
                        : alert.type === "holiday"
                        ? "airplane-outline"
                        : "alert-circle-outline"
                    }
                    size={20}
                    color={alert.priority === "high" ? Colors.dark.error : Colors.dark.orange}
                  />
                </View>
                <Text style={styles.alertText}>{alert.message}</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <Pressable style={styles.actionCard} onPress={() => handleNavigate("Calendar")}>
              <View style={[styles.actionIconContainer, { backgroundColor: Colors.dark.primary + "20" }]}>
                <Ionicons name="calendar-outline" size={24} color={Colors.dark.primary} />
              </View>
              <Text style={styles.actionText}>Calendar</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={() => handleNavigate("Players")}>
              <View style={[styles.actionIconContainer, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                <Ionicons name="people-outline" size={24} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.actionText}>Players</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={() => handleNavigate("Coaching")}>
              <View style={[styles.actionIconContainer, { backgroundColor: Colors.dark.orange + "20" }]}>
                <Ionicons name="clipboard-outline" size={24} color={Colors.dark.orange} />
              </View>
              <Text style={styles.actionText}>Feedback</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={() => handleNavigate("History")}>
              <View style={[styles.actionIconContainer, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="time-outline" size={24} color={Colors.dark.gold} />
              </View>
              <Text style={styles.actionText}>History</Text>
            </Pressable>
          </View>
        </View>

        {todaysSessions.length > 0 ? (
          <View style={styles.sessionsSection}>
            <Text style={styles.sectionTitle}>Today's Lessons</Text>
            {todaysSessions.map((session) => {
              const isPast = new Date(session.endTime) < new Date();
              const isCurrent =
                new Date(session.startTime) <= new Date() && new Date(session.endTime) > new Date();
              return (
                <Pressable
                  key={session.id}
                  style={[
                    styles.sessionCard,
                    isPast && styles.sessionCardPast,
                    isCurrent && styles.sessionCardCurrent,
                  ]}
                >
                  <View style={styles.sessionTime}>
                    <Text style={[styles.sessionTimeText, isPast && styles.sessionTimePast]}>
                      {formatTime(session.startTime)}
                    </Text>
                    <Text style={styles.sessionDuration}>{session.duration}m</Text>
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text style={[styles.sessionType, isPast && styles.sessionTypePast]}>
                      {session.sessionType === "private"
                        ? "Private"
                        : session.sessionType === "semi_private"
                        ? "Semi-Private"
                        : session.sessionType === "group"
                        ? "Group"
                        : session.sessionType}
                    </Text>
                    {isCurrent ? (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>NOW</Text>
                      </View>
                    ) : isPast ? (
                      <View style={styles.pastBadge}>
                        <Text style={styles.pastBadgeText}>Done</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={isPast ? Colors.dark.disabled : Colors.dark.tabIconDefault}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.md,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  greeting: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  coachName: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  todayCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(46, 204, 64, 0.2)",
  },
  todayGradient: {
    padding: Spacing.lg,
  },
  todayHeader: {
    marginBottom: Spacing.md,
  },
  todayLabel: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  todayDate: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: 2,
    textTransform: "capitalize",
  },
  todayStats: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: Spacing.lg,
  },
  nextLessonContainer: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  nextLessonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  nextLessonBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  nextLessonLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  nextLessonTime: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  noLessonsText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  alertsSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  alertText: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  quickActions: {
    marginBottom: Spacing.xl,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  actionCard: {
    width: "47%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  sessionsSection: {
    marginBottom: Spacing.xl,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  sessionCardPast: {
    opacity: 0.6,
  },
  sessionCardCurrent: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  sessionTime: {
    alignItems: "center",
    minWidth: 50,
  },
  sessionTimeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  sessionTimePast: {
    color: Colors.dark.tabIconDefault,
  },
  sessionDuration: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  sessionInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionType: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  sessionTypePast: {
    color: Colors.dark.tabIconDefault,
  },
  currentBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  currentBadgeText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  pastBadge: {
    backgroundColor: Colors.dark.disabled + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pastBadgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.disabled,
  },
});
