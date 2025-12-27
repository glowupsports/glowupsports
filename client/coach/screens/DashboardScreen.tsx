import React, { useMemo, useState } from "react";
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
import MiniTimeline from "@/coach/components/MiniTimeline";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";
import { CoachStatusPanel } from "@/coach/components/CoachStatusPanel";

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
  const [showStatusPanel, setShowStatusPanel] = useState(false);

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

  const coachStats = useMemo(() => {
    const maxDailyMinutes = 360;
    const totalMinutes = todaysSessions.reduce((acc, s) => acc + s.duration, 0);
    const completedMinutes = todaysSessions
      .filter((s) => new Date(s.endTime) < new Date())
      .reduce((acc, s) => acc + s.duration, 0);
    const remainingMinutes = totalMinutes - completedMinutes;
    
    const staminaPercent = Math.min(100, Math.round((totalMinutes / maxDailyMinutes) * 100));
    const impactPercent = totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0;
    
    let energyState: "rested" | "active" | "focused" | "intense" = "rested";
    if (totalMinutes >= 300) energyState = "intense";
    else if (totalMinutes >= 240) energyState = "focused";
    else if (totalMinutes >= 120) energyState = "active";
    
    return { totalMinutes, completedMinutes, remainingMinutes, staminaPercent, impactPercent, energyState };
  }, [todaysSessions]);

  // Fetch coach XP from API
  const { data: coachXpData } = useQuery<{
    level: number;
    totalXp: number;
    currentLevelXp: number;
    requiredForLevel: number;
    xpPercent: number;
  }>({
    queryKey: ["/api/coach", coach?.id, "xp"],
    enabled: !!coach?.id,
  });
  
  const coachXP = useMemo(() => {
    if (coachXpData) {
      return {
        level: coachXpData.level,
        currentXP: coachXpData.currentLevelXp,
        requiredXP: coachXpData.requiredForLevel,
        xpPercent: coachXpData.xpPercent,
      };
    }
    // Fallback for initial load - matches server loop-based calculation
    const level = coach?.level || 1;
    const totalXp = coach?.totalXp || 0;
    
    // Calculate XP thresholds using same logic as server
    // Each level requires: 500 + (level-1) * 100 XP
    let accumulatedXp = 0;
    for (let lvl = 1; lvl < level; lvl++) {
      accumulatedXp += 500 + (lvl - 1) * 100;
    }
    const requiredXP = 500 + (level - 1) * 100;
    const currentXP = Math.max(0, totalXp - accumulatedXp);
    const xpPercent = Math.min(100, Math.max(0, requiredXP > 0 ? Math.round((currentXP / requiredXP) * 100) : 0));
    return { level, currentXP, requiredXP, xpPercent };
  }, [coachXpData, coach?.level, coach?.totalXp]);

  const pendingFeedbackCount = useMemo(() => {
    return todaysSessions.filter(
      (s) => new Date(s.endTime) < new Date() && s.status !== "completed"
    ).length;
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
    if (diff <= 0) return "Now";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
  };

  const alerts: Alert[] = useMemo(() => {
    const result: Alert[] = [];
    if (pendingFeedbackCount > 0) {
      result.push({
        id: "feedback",
        type: "feedback",
        message: `${pendingFeedbackCount} lessons awaiting feedback`,
        priority: "medium",
      });
    }
    return result;
  }, [pendingFeedbackCount]);

  const handleNavigate = (screen: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const screenMap: Record<string, string> = {
      EditProfile: "CoachProfile",
    };
    const targetScreen = screenMap[screen] || screen;
    (navigation as any).navigate(targetScreen);
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

  const getFocusMessage = () => {
    if (currentSession) {
      return { primary: "In Session", secondary: `${formatTime(currentSession.startTime)} - ${formatTime(currentSession.endTime)}` };
    }
    if (nextSession) {
      return { primary: getTimeUntil(nextSession.startTime), secondary: "until next session" };
    }
    if (todaysSessions.length === 0) {
      if (pendingFeedbackCount > 0) {
        return { primary: "XP Available", secondary: `Complete ${pendingFeedbackCount} feedback to earn XP` };
      }
      return { primary: "Rest Day", secondary: "Good day to review player progress" };
    }
    return { primary: "Day Complete", secondary: "All sessions finished" };
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

  const focusMessage = getFocusMessage();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Coach Level + XP */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.coachName}>{coach.name}</Text>
            
            {/* Coach Level + XP Bar */}
            <View style={styles.xpContainer}>
              <Text style={styles.levelBadge}>Lv {coachXP.level}</Text>
              <View style={styles.xpBarContainer}>
                <View style={[styles.xpBarFill, { width: `${coachXP.xpPercent}%` }]} />
              </View>
              <Text style={styles.xpText}>{coachXP.currentXP}/{coachXP.requiredXP}</Text>
            </View>
          </View>
          
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerButton}
              onPress={() => handleNavigate("Notifications")}
            >
              <Ionicons name="notifications-outline" size={24} color={Colors.dark.text} />
            </Pressable>
            <Pressable
              style={styles.headerButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowStatusPanel(true);
              }}
            >
              {/* Avatar with Glow Ring */}
              <View style={styles.avatarGlowRing}>
                <View style={styles.avatarInner}>
                  <Ionicons name="person" size={18} color={Colors.dark.primary} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Horizontal Quick Nav Menu */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.quickNavScroll}
          contentContainerStyle={styles.quickNavContent}
        >
          <Pressable 
            style={[styles.quickNavChip, styles.quickNavChipActive]}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          >
            <Ionicons name="sunny-outline" size={16} color={Colors.dark.backgroundRoot} />
            <Text style={[styles.quickNavChipText, styles.quickNavChipTextActive]}>Today</Text>
          </Pressable>
          <Pressable 
            style={styles.quickNavChip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleNavigate("Calendar");
            }}
          >
            <Ionicons name="calendar-outline" size={16} color={Colors.dark.text} />
            <Text style={styles.quickNavChipText}>Week</Text>
          </Pressable>
          <Pressable 
            style={styles.quickNavChip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleNavigate("Coaching");
            }}
          >
            <Ionicons name="chatbox-outline" size={16} color={Colors.dark.text} />
            <Text style={styles.quickNavChipText}>Feedback</Text>
            {pendingFeedbackCount > 0 ? (
              <View style={styles.quickNavBadge}>
                <Text style={styles.quickNavBadgeText}>{pendingFeedbackCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable 
            style={styles.quickNavChip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleNavigate("Players");
            }}
          >
            <Ionicons name="people-outline" size={16} color={Colors.dark.text} />
            <Text style={styles.quickNavChipText}>Players</Text>
          </Pressable>
        </ScrollView>

        {/* FOCUS Card (formerly TODAY Card) */}
        <View style={styles.focusCard}>
          <LinearGradient
            colors={["rgba(46, 204, 64, 0.12)", "rgba(46, 204, 64, 0.03)"]}
            style={styles.focusGradient}
          >
            <View style={styles.focusHeader}>
              <Text style={styles.focusLabel}>TODAY</Text>
              <Text style={styles.focusDate}>
                {today.toLocaleDateString("en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>
            </View>

            {/* Main Focus State */}
            <View style={styles.focusMain}>
              {currentSession ? (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>IN PROGRESS</Text>
                </View>
              ) : null}
              <Text style={styles.focusPrimary}>{focusMessage.primary}</Text>
              <Text style={styles.focusSecondary}>{focusMessage.secondary}</Text>
            </View>

            {/* Stats Row (only if sessions exist) */}
            {todaysSessions.length > 0 ? (
              <View style={styles.focusStats}>
                <View style={styles.focusStatItem}>
                  <Text style={styles.focusStatNumber}>{todaysSessions.length}</Text>
                  <Text style={styles.focusStatLabel}>Sessions</Text>
                </View>
                <View style={styles.focusStatDivider} />
                <View style={styles.focusStatItem}>
                  <Text style={styles.focusStatNumber}>
                    {todaysSessions.reduce((acc, s) => acc + s.duration, 0)}
                  </Text>
                  <Text style={styles.focusStatLabel}>Minutes</Text>
                </View>
              </View>
            ) : null}
          </LinearGradient>
        </View>

        {/* Stamina & Impact Card */}
        <View style={styles.energyCard}>
          <View style={styles.energyHeader}>
            <View style={styles.energyTitleRow}>
              <Ionicons name="flash-outline" size={18} color={Colors.dark.primary} />
              <Text style={styles.energyTitle}>Energy</Text>
            </View>
            <View
              style={[
                styles.energyStateBadge,
                {
                  backgroundColor:
                    coachStats.energyState === "intense"
                      ? Colors.dark.error + "15"
                      : coachStats.energyState === "focused"
                      ? Colors.dark.orange + "15"
                      : coachStats.energyState === "active"
                      ? Colors.dark.gold + "15"
                      : Colors.dark.primary + "15",
                },
              ]}
            >
              <Text
                style={[
                  styles.energyStateText,
                  {
                    color:
                      coachStats.energyState === "intense"
                        ? Colors.dark.error
                        : coachStats.energyState === "focused"
                        ? Colors.dark.orange
                        : coachStats.energyState === "active"
                        ? Colors.dark.gold
                        : Colors.dark.primary,
                  },
                ]}
              >
                {coachStats.energyState.charAt(0).toUpperCase() + coachStats.energyState.slice(1)}
              </Text>
            </View>
          </View>

          <View style={styles.energyBarsContainer}>
            {/* Stamina Bar */}
            <View style={styles.energyBarRow}>
              <Text style={styles.energyBarLabel}>Stamina</Text>
              <View style={styles.energyBarBackground}>
                <LinearGradient
                  colors={[
                    coachStats.energyState === "intense"
                      ? Colors.dark.error + "80"
                      : coachStats.energyState === "focused"
                      ? Colors.dark.orange + "80"
                      : Colors.dark.primary + "80",
                    coachStats.energyState === "intense"
                      ? Colors.dark.error + "40"
                      : coachStats.energyState === "focused"
                      ? Colors.dark.orange + "40"
                      : Colors.dark.primary + "40",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.energyBarFill, { width: `${coachStats.staminaPercent}%` }]}
                />
              </View>
              <Text style={styles.energyBarValue}>{coachStats.staminaPercent}%</Text>
            </View>

            {/* Impact Bar */}
            <View style={styles.energyBarRow}>
              <Text style={styles.energyBarLabel}>Impact</Text>
              <View style={styles.energyBarBackground}>
                <LinearGradient
                  colors={[Colors.dark.xpCyan + "80", Colors.dark.xpCyan + "40"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.energyBarFill, { width: `${coachStats.impactPercent}%` }]}
                />
              </View>
              <Text style={styles.energyBarValue}>{coachStats.impactPercent}%</Text>
            </View>
          </View>

          <Text style={styles.energySubtext}>
            {coachStats.impactPercent === 100
              ? "High impact sessions give bonus XP"
              : coachStats.completedMinutes > 0
              ? `${coachStats.completedMinutes}m coached, ${coachStats.remainingMinutes}m remaining`
              : coachStats.totalMinutes > 0
              ? `${coachStats.totalMinutes}m scheduled today`
              : "Ready for action"}
          </Text>
        </View>

        {/* Alerts */}
        {alerts.length > 0 ? (
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            {alerts.map((alert) => (
              <Pressable 
                key={alert.id} 
                style={styles.alertCard}
                onPress={() => handleNavigate("Coaching")}
              >
                <View
                  style={[
                    styles.alertIcon,
                    {
                      backgroundColor:
                        alert.priority === "high"
                          ? Colors.dark.error + "15"
                          : Colors.dark.orange + "15",
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
                <Text style={styles.alertXP}>+{pendingFeedbackCount * 15} XP</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Today's Timeline */}
        {todaysSessions.length > 0 ? (
          <View style={styles.sessionsSection}>
            <Text style={styles.sectionTitle}>Today's Timeline</Text>
            <View style={styles.timelineCard}>
              <MiniTimeline
                sessions={todaysSessions.map(s => ({
                  ...s,
                  players: (s as any).players || [],
                }))}
              />
            </View>
          </View>
        ) : null}

        {/* Today's Lessons */}
        {todaysSessions.length > 0 ? (
          <View style={styles.sessionsSection}>
            <Text style={styles.sectionTitle}>Sessions</Text>
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

      <CoachChatFooter />

      <CoachStatusPanel
        visible={showStatusPanel}
        onClose={() => setShowStatusPanel(false)}
        onNavigate={(screen) => {
          if (screen === "Logout") {
            return;
          }
          handleNavigate(screen);
        }}
      />
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
  
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xl,
  },
  headerLeft: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  greeting: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    opacity: 0.8,
  },
  coachName: {
    ...Typography.h1,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  
  // Coach XP
  xpContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  levelBadge: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  xpBarContainer: {
    flex: 1,
    maxWidth: 80,
    height: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 2,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  xpText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  
  // Avatar with Glow Ring
  avatarGlowRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.primary + "40",
  },
  avatarInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  
  // Quick Nav Menu
  quickNavScroll: {
    marginHorizontal: -Spacing.lg,
    marginBottom: Spacing.lg,
  },
  quickNavContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  quickNavChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  quickNavChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  quickNavChipText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  quickNavChipTextActive: {
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  quickNavBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  quickNavBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  
  // Focus Card (formerly TODAY)
  focusCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  focusGradient: {
    padding: Spacing.lg,
  },
  focusHeader: {
    marginBottom: Spacing.md,
  },
  focusLabel: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1.5,
    opacity: 0.9,
  },
  focusDate: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    marginTop: 2,
    opacity: 0.8,
    textTransform: "capitalize",
  },
  focusMain: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  liveText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  focusPrimary: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  focusSecondary: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  focusStats: {
    flexDirection: "row",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.md,
  },
  focusStatItem: {
    flex: 1,
    alignItems: "center",
  },
  focusStatNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  focusStatLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    opacity: 0.8,
  },
  focusStatDivider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  
  // Energy Card
  energyCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  energyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  energyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  energyTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
  },
  energyStateBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  energyStateText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
  },
  energyBarsContainer: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  energyBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  energyBarLabel: {
    width: 55,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  energyBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  energyBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  energyBarValue: {
    width: 35,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.text,
    textAlign: "right",
    opacity: 0.8,
  },
  energySubtext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    marginTop: Spacing.xs,
    opacity: 0.7,
  },
  
  // Alerts
  alertsSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    opacity: 0.9,
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
  alertXP: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  
  // Quick Actions
  quickActions: {
    marginBottom: Spacing.lg,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  actionCard: {
    width: "48%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionCardActive: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  actionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconActive: {
    backgroundColor: Colors.dark.primary + "15",
  },
  actionText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
    opacity: 0.9,
  },
  
  // Sessions
  sessionsSection: {
    marginBottom: Spacing.lg,
  },
  timelineCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
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
    opacity: 0.5,
  },
  sessionCardCurrent: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
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
    backgroundColor: Colors.dark.primary + "15",
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
    backgroundColor: Colors.dark.tabIconDefault + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  pastBadgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
});
