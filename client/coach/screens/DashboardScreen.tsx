import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert as RNAlert,
  Platform,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import MiniTimeline from "@/coach/components/MiniTimeline";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";
import { CoachStatusPanel } from "@/coach/components/CoachStatusPanel";
import { FreelanceLicenseWizard } from "@/coach/components/FreelanceLicenseWizard";
import { BurnoutRiskCard } from "@/coach/components/BurnoutRiskCard";
import { LoadForecastCard } from "@/coach/components/LoadForecastCard";
import { CoachEarningsCard } from "@/coach/components/CoachEarningsCard";
import { AcademySwitcher } from "@/coach/components/AcademySwitcher";
import CollapsibleModeSwitcher from "@/components/CollapsibleModeSwitcher";
import { filterSessionsByDate } from "@/lib/dateUtils";
import { getApiUrl } from "@/lib/query-client";
import { NextSessionCountdown } from "@/coach/components/NextSessionCountdown";
import { SeriesSummaryCard } from "@/coach/components/SeriesSummaryCard";
import SessionDetailDrawer from "@/coach/components/SessionDetailDrawer";
import { PlayersByLevelCard } from "@/coach/components/PlayersByLevelCard";
import { useWebSocket } from "@/lib/useWebSocket";

interface Player {
  id: string;
  name: string;
  level?: string;
  ballLevel?: string | null;
  status?: string;
}

interface Session {
  id: string;
  coachId: string | null;
  courtId: string | null;
  locationId?: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  sessionType: string;
  ballLevel?: string | null;
  skillLevel?: number | null;
  isRecurring?: boolean | null;
  paymentStatus?: string | null;
  status: string | null;
  players?: Player[];
}

interface Alert {
  id: string;
  type: "unpaid" | "holiday" | "absent" | "feedback";
  message: string;
  priority: "high" | "medium" | "low";
}

interface WeeklyCalendarData {
  ownSessions: Session[];
  blockedSessions: any[];
  courts: any[];
  dateRange: { start: string; end: string };
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { coach, academy, calendarData, isLoading, refetchCalendar } = useCoach();
  const { logout } = useAuth();
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [showFreelanceWizard, setShowFreelanceWizard] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(true);
  const [focusCollapsed, setFocusCollapsed] = useState(false);
  const [energyCollapsed, setEnergyCollapsed] = useState(false);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentSecond, setCurrentSecond] = useState(() => Math.floor(Date.now() / 1000));
  const [selectedSessionForDetail, setSelectedSessionForDetail] = useState<Session | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSecond(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const todayDateStr = new Date().toISOString().split("T")[0];
  const weeklyCalendarPath = coach?.id 
    ? `/api/coach/calendar?coachId=${coach.id}&date=${todayDateStr}&view=week` 
    : null;
  const { data: weeklyCalendarData, refetch: refetchWeeklyCalendar } = useQuery<WeeklyCalendarData>({
    queryKey: [weeklyCalendarPath],
    enabled: !!coach?.id && !!weeklyCalendarPath,
  });

  // WebSocket for real-time updates (placed after weeklyCalendar query to access refetchWeeklyCalendar)
  useWebSocket({
    onNewMessage: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/unread-count"] });
    }, [queryClient]),
    onNewSession: useCallback(() => {
      if (refetchCalendar) refetchCalendar();
      refetchWeeklyCalendar();
      queryClient.invalidateQueries({ queryKey: ["/api/coach/sessions"] });
    }, [queryClient, refetchCalendar, refetchWeeklyCalendar]),
    onSessionUpdate: useCallback(() => {
      if (refetchCalendar) refetchCalendar();
      refetchWeeklyCalendar();
      queryClient.invalidateQueries({ queryKey: ["/api/coach/sessions"] });
    }, [queryClient, refetchCalendar, refetchWeeklyCalendar]),
    onConnected: useCallback(() => {
      // Refresh calendar data when WebSocket reconnects
      if (refetchCalendar) {
        refetchCalendar();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/coach/notifications"] });
    }, [queryClient, refetchCalendar]),
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchCalendar(),
        refetchWeeklyCalendar(),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.startsWith('/api/coach');
          }
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchCalendar, refetchWeeklyCalendar, queryClient]);
  
  const allSessions = weeklyCalendarData?.ownSessions || calendarData?.ownSessions || [];

  // Pulse animation for live indicator
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);
  
  // Gaming animations
  const glowPulse = useSharedValue(0);
  const avatarGlow = useSharedValue(0.5);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    
    // Continuous glow pulse
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    
    // Avatar glow breathing
    avatarGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    
  }, []);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));
  
  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.05]) }],
  }));
  
  const avatarGlowStyle = useAnimatedStyle(() => ({
    opacity: avatarGlow.value,
    transform: [{ scale: interpolate(avatarGlow.value, [0.5, 1], [1, 1.1]) }],
  }));
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);

  const today = new Date();
  
  const getDateForOffset = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
  };
  
  const selectedDate = getDateForOffset(selectedDayOffset);
  
  const todaysSessions = useMemo(() => filterSessionsByDate(allSessions, today), [allSessions]);
  const selectedDaySessions = useMemo(() => filterSessionsByDate(allSessions, selectedDate), [allSessions, selectedDayOffset]);
  
  const getDayLabel = (offset: number) => {
    if (offset === 0) return "TODAY";
    if (offset === 1) return "TOMORROW";
    if (offset === -1) return "YESTERDAY";
    return getDateForOffset(offset).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  };

  const nextSession = useMemo(() => {
    const now = new Date();
    const upcoming = todaysSessions
      .filter((s) => new Date(s.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return upcoming[0] || null;
  }, [todaysSessions]);

  const sessionForCountdown = useMemo(() => {
    const now = new Date();
    
    const liveSession = todaysSessions.find((s) => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      return now >= start && now < end;
    });
    if (liveSession) return liveSession;
    
    if (!nextSession) return null;
    const sessionStart = new Date(nextSession.startTime);
    const minutesUntil = (sessionStart.getTime() - now.getTime()) / (1000 * 60);
    if (minutesUntil <= 30 && minutesUntil > 0) {
      return nextSession;
    }
    return null;
  }, [todaysSessions, nextSession, currentSecond]);

  const coachStats = useMemo(() => {
    const maxDailyMinutes = 360;
    const totalMinutes = todaysSessions.reduce((acc, s) => acc + s.duration, 0);
    const completedMinutes = todaysSessions
      .filter((s) => new Date(s.endTime) < new Date())
      .reduce((acc, s) => acc + s.duration, 0);
    const remainingMinutes = totalMinutes - completedMinutes;
    
    const loadPercent = Math.min(100, Math.round((totalMinutes / maxDailyMinutes) * 100));
    const staminaPercent = Math.max(0, 100 - loadPercent);
    const impactPercent = totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0;
    
    let energyState: "fullpower" | "charged" | "draining" | "depleted" = "fullpower";
    if (staminaPercent <= 20) energyState = "depleted";
    else if (staminaPercent <= 50) energyState = "draining";
    else if (staminaPercent < 100) energyState = "charged";
    
    // Day intensity for personality
    let dayIntensity: "rest" | "light" | "normal" | "heavy" = "rest";
    if (totalMinutes === 0) dayIntensity = "rest";
    else if (totalMinutes <= 120) dayIntensity = "light";
    else if (totalMinutes <= 240) dayIntensity = "normal";
    else dayIntensity = "heavy";
    
    return { totalMinutes, completedMinutes, remainingMinutes, staminaPercent, impactPercent, energyState, dayIntensity };
  }, [todaysSessions]);

  // Fetch burnout risk for recovery-aware stamina calculation
  const { data: burnoutRiskData } = useQuery<{
    riskScore: number;
    riskLevel: string;
    metrics: {
      restDaysLastWeek: number;
      avgDailyMinutesPast: number;
    };
  }>({
    queryKey: ["/api/coaches", coach?.id, "burnout-risk"],
    enabled: !!coach?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate recovery-aware stamina: uses burnout risk which accounts for rest days
  const recoveryAwareStamina = useMemo(() => {
    if (!burnoutRiskData) return null;
    // Stamina = 100 - burnout risk (so more rest = higher stamina)
    return Math.max(0, 100 - burnoutRiskData.riskScore);
  }, [burnoutRiskData]);

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

  const sessionTimeRemaining = useMemo(() => {
    if (!currentSession) return "--:--";
    const now = new Date();
    const end = new Date(currentSession.endTime);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return "0:00";
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [currentSession, currentSecond]);

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

  const dayPersonality = useMemo(() => {
    const sessionCount = todaysSessions.length;
    const totalMinutes = coachStats.totalMinutes;
    
    if (sessionCount === 0) {
      return { label: "Rest Day", color: Colors.dark.xpCyan };
    }
    if (totalMinutes <= 120) {
      return { label: "Light Day", color: Colors.dark.primary };
    }
    if (totalMinutes <= 240) {
      return { label: "Normal Day", color: Colors.dark.gold };
    }
    return { label: "Heavy Day", color: Colors.dark.orange };
  }, [todaysSessions.length, coachStats.totalMinutes]);

  const selectedDayPersonality = useMemo(() => {
    const sessions = selectedDaySessions;
    const totalMinutes = sessions.reduce((acc, s) => acc + s.duration, 0);
    
    if (sessions.length === 0) {
      return { label: "Rest Day", color: Colors.dark.xpCyan };
    }
    if (totalMinutes <= 120) {
      return { label: "Light Day", color: Colors.dark.primary };
    }
    if (totalMinutes <= 240) {
      return { label: "Normal Day", color: Colors.dark.gold };
    }
    return { label: "Heavy Day", color: Colors.dark.orange };
  }, [selectedDaySessions]);
  
  const selectedDayStats = useMemo(() => {
    const totalMinutes = selectedDaySessions.reduce((acc, s) => acc + s.duration, 0);
    return { sessionCount: selectedDaySessions.length, totalMinutes };
  }, [selectedDaySessions]);
  
  const getSelectedDayFocusMessage = () => {
    if (selectedDaySessions.length === 0) {
      return { primary: "Rest Day", secondary: "No sessions scheduled" };
    }
    const firstSession = selectedDaySessions.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    )[0];
    const context = getSessionContext(firstSession);
    return { 
      primary: `${selectedDaySessions.length} Session${selectedDaySessions.length > 1 ? 's' : ''}`, 
      secondary: `First: ${formatTime(firstSession.startTime)} - ${context}` 
    };
  };

  const getSessionTypeLabel = (type: string) => {
    switch (type) {
      case "private": return "Private";
      case "semi_private": return "Semi-Private";
      case "group": return "Group";
      case "physical": return "Physical";
      default: return type;
    }
  };

  const getSessionContext = (session: Session) => {
    const type = getSessionTypeLabel(session.sessionType);
    const court = calendarData?.courts?.find(c => c.id === session.courtId);
    const courtName = court?.name || "";
    const timeStr = `${formatTime(session.startTime)} - ${formatTime(session.endTime)}`;
    const parts = [type];
    if (courtName) parts.push(courtName);
    const context = parts.join(" · ");
    return context || timeStr;
  };

  const getFocusMessage = () => {
    if (currentSession) {
      const context = getSessionContext(currentSession);
      return { primary: "In Session", secondary: context || `${formatTime(currentSession.startTime)} - ${formatTime(currentSession.endTime)}` };
    }
    if (nextSession) {
      const context = getSessionContext(nextSession);
      return { primary: `Next session in ${getTimeUntil(nextSession.startTime)}`, secondary: context };
    }
    if (todaysSessions.length === 0) {
      if (pendingFeedbackCount > 0) {
        return { primary: "XP Available", secondary: `Complete ${pendingFeedbackCount} feedback to earn XP` };
      }
      return { primary: "Off Court", secondary: "Perfect time to review player progress" };
    }
    return { primary: "Match Point", secondary: "All sessions complete" };
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

      {/* Collapsible Mode Switcher */}
      <CollapsibleModeSwitcher />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.footerCollapsed + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
      >
        {/* === GAMING PLAYER CARD HEADER === */}
        <View style={styles.playerCard}>
          {/* Neon border glow effect */}
          <Animated.View style={[styles.playerCardGlow, glowAnimatedStyle]} />
          
          {/* Glass panel background */}
          <LinearGradient
            colors={["rgba(46, 204, 64, 0.08)", "rgba(0, 212, 255, 0.04)", "rgba(26, 26, 26, 0.95)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playerCardGradient}
          >
            {/* Top accent line */}
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan, Colors.dark.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.playerCardTopLine}
            />
            
            {/* Main content row */}
            <View style={styles.playerCardContent}>
              {/* Left: Holographic Avatar */}
              <Pressable
                style={styles.holoAvatarContainer}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowStatusPanel(true);
                }}
              >
                {/* Outer glow ring */}
                <Animated.View style={[styles.avatarOuterGlow, avatarGlowStyle]}>
                  <LinearGradient
                    colors={[Colors.dark.primary + "60", Colors.dark.xpCyan + "40", Colors.dark.primary + "60"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGlowGradient}
                  />
                </Animated.View>
                
                {/* Avatar frame */}
                <View style={styles.avatarFrame}>
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarBorder}
                  >
                    {coach?.photoUrl ? (
                      <Image
                        source={{ uri: `${getApiUrl()}${coach.photoUrl}` }}
                        style={styles.avatarPhoto}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.avatarInnerBg}>
                        <Ionicons name="person" size={28} color={Colors.dark.primary} />
                      </View>
                    )}
                  </LinearGradient>
                </View>
                
                {/* Level emblem - uses theme gold colors */}
                <Animated.View style={[styles.levelEmblem, avatarGlowStyle]}>
                  <LinearGradient
                    colors={[Colors.dark.gold, Colors.dark.orange, Colors.dark.gold]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.levelEmblemGradient}
                  >
                    <Text style={styles.levelEmblemText}>{coachXP.level}</Text>
                  </LinearGradient>
                </Animated.View>
              </Pressable>
              
              {/* Center: Player Info */}
              <View style={styles.playerInfo}>
                <Text style={styles.playerRank}>COACH</Text>
                <Text style={styles.playerName}>{coach.name}</Text>
                <View style={styles.academyRow}>
                  <Ionicons name="shield" size={12} color={Colors.dark.xpCyan} />
                  <AcademySwitcher />
                </View>
                
                {/* XP Progress Ring */}
                <View style={styles.xpProgressSection}>
                  <View style={styles.xpBarWrapper}>
                    <View style={styles.xpBarTrack}>
                      <LinearGradient
                        colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.xpBarProgress, { width: `${coachXP.xpPercent}%` }]}
                      />
                      <Animated.View style={[styles.xpBarShine, glowAnimatedStyle]} />
                    </View>
                    <View style={styles.xpLabels}>
                      <Text style={styles.xpCurrent}>{coachXP.currentXP} XP</Text>
                      <Text style={styles.xpRequired}>/ {coachXP.requiredXP}</Text>
                    </View>
                  </View>
                </View>
              </View>
              
              {/* Right: Quick Actions */}
              <View style={styles.playerActions}>
                <Pressable
                  style={styles.actionBtnGlow}
                  onPress={() => handleNavigate("Notifications")}
                >
                  <View style={styles.actionBtnInner}>
                    <Ionicons name="notifications" size={20} color={Colors.dark.xpCyan} />
                  </View>
                </Pressable>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* === COURT COMMAND - Tennis Control Centre === */}
        <View style={styles.missionConsole}>
          {/* Neon frame */}
          <View style={styles.missionFrame}>
            <LinearGradient
              colors={[Colors.dark.primary + "40", "transparent", Colors.dark.xpCyan + "40"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.missionFrameTop}
            />
          </View>
          
          <LinearGradient
            colors={["rgba(0, 0, 0, 0.6)", "rgba(45, 45, 45, 0.8)"]}
            style={styles.missionGradient}
          >
            {/* Court Command Header */}
            <View style={styles.missionHeader}>
              <View style={styles.missionTitleSection}>
                <View style={styles.missionIconWrapper}>
                  <Ionicons name="tennisball" size={16} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.missionTitle}>COURT COMMAND</Text>
              </View>
              
              {/* Day Navigation Pills + Collapse Toggle */}
              <View style={styles.missionControls}>
                <View style={styles.dayPills}>
                  <Pressable 
                    style={styles.dayPillArrow}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDayOffset(prev => Math.max(prev - 1, -7));
                    }}
                  >
                    <Ionicons name="caret-back" size={14} color={selectedDayOffset <= -7 ? Colors.dark.tabIconDefault : Colors.dark.primary} />
                  </Pressable>
                  
                  <View style={styles.dayPillCenter}>
                    <Text style={styles.dayPillLabel}>{getDayLabel(selectedDayOffset)}</Text>
                  </View>
                  
                  <Pressable 
                    style={styles.dayPillArrow}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedDayOffset(prev => Math.min(prev + 1, 7));
                    }}
                  >
                    <Ionicons name="caret-forward" size={14} color={selectedDayOffset >= 7 ? Colors.dark.tabIconDefault : Colors.dark.primary} />
                  </Pressable>
                </View>
                
                <Pressable 
                  style={styles.collapseToggle}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFocusCollapsed(!focusCollapsed);
                  }}
                >
                  <Ionicons 
                    name={focusCollapsed ? "chevron-down" : "chevron-up"} 
                    size={16} 
                    color={Colors.dark.tabIconDefault} 
                  />
                </Pressable>
              </View>
            </View>
            
            {/* Date Row */}
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>
              <View style={[styles.intensityChip, { backgroundColor: selectedDayPersonality.color + "25" }]}>
                <View style={[styles.intensityDot, { backgroundColor: selectedDayPersonality.color }]} />
                <Text style={[styles.intensityLabel, { color: selectedDayPersonality.color }]}>
                  {selectedDayPersonality.label.toUpperCase()}
                </Text>
              </View>
            </View>
            
            {/* Back to Today */}
            {selectedDayOffset !== 0 ? (
              <Pressable 
                style={styles.backToTodayChip}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDayOffset(0);
                }}
              >
                <Ionicons name="return-down-back" size={12} color={Colors.dark.primary} />
                <Text style={styles.backToTodayLabel}>RETURN TO TODAY</Text>
              </Pressable>
            ) : null}

            {focusCollapsed ? null : (
              <>
                {/* Main Mission Display */}
                <View style={styles.missionDisplay}>
                  {selectedDayOffset === 0 && currentSession ? (
                    <Pressable 
                      style={styles.liveHud}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedSessionForDetail(currentSession);
                      }}
                    >
                      <View style={styles.liveHudBgClean}>
                        <View style={styles.liveHudContent}>
                          <View style={styles.liveHudLeft}>
                            <Text style={styles.countdownTimer}>{sessionTimeRemaining}</Text>
                            <Text style={styles.countdownLabel}>REMAINING</Text>
                            
                            <View style={styles.sessionMeta}>
                              <Text style={styles.sessionMetaText}>
                                {getSessionTypeLabel(currentSession.sessionType)} {calendarData?.courts?.find(c => c.id === currentSession.courtId)?.name ? `· ${calendarData?.courts?.find(c => c.id === currentSession.courtId)?.name}` : ""}
                              </Text>
                            </View>
                          </View>
                          
                          <View style={styles.liveHudRight}>
                            <Animated.View style={[styles.liveCircleGlow, pulseAnimatedStyle]} />
                            <View style={styles.liveCircleBadge}>
                              <Text style={styles.liveCircleText}>LIVE</Text>
                              <Text style={styles.liveCircleSubtext}>IN SESSION</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  ) : selectedDayOffset === 0 && nextSession ? (
                    <Pressable 
                      style={styles.missionContent}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setSelectedSessionForDetail(nextSession);
                      }}
                    >
                      <Text style={styles.missionPrimary}>{focusMessage.primary}</Text>
                      <Text style={styles.missionSecondary}>{focusMessage.secondary}</Text>
                      <View style={styles.tapHint}>
                        <Ionicons name="hand-left-outline" size={14} color={Colors.dark.primary} />
                        <Text style={styles.tapHintText}>TAP FOR OPTIONS</Text>
                      </View>
                    </Pressable>
                  ) : selectedDayOffset === 0 ? (
                    <View style={styles.missionContent}>
                      <Text style={styles.missionPrimary}>{focusMessage.primary}</Text>
                      <Text style={styles.missionSecondary}>{focusMessage.secondary}</Text>
                    </View>
                  ) : (
                    <View style={styles.missionContent}>
                      <Text style={styles.missionPrimary}>{getSelectedDayFocusMessage().primary}</Text>
                      <Text style={styles.missionSecondary}>{getSelectedDayFocusMessage().secondary}</Text>
                    </View>
                  )}
                </View>

                {/* Action Bar */}
                {selectedDayOffset === 0 && currentSession ? (
                  <View style={styles.actionBar}>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        (navigation as any).navigate("Calendar", { openSessionId: currentSession.id, action: "attendance" });
                      }}
                    >
                      <View style={[styles.gameActionIcon, { backgroundColor: Colors.dark.primary }]}>
                        <Ionicons name="checkmark-circle" size={24} color="#000" />
                      </View>
                      <Text style={styles.actionBtnLabel}>ATTEND</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        (navigation as any).navigate("Calendar", { openSessionId: currentSession.id, action: "extend" });
                      }}
                    >
                      <View style={[styles.gameActionIcon, { backgroundColor: Colors.dark.xpCyan }]}>
                        <Ionicons name="time" size={24} color="#000" />
                      </View>
                      <Text style={styles.actionBtnLabel}>EXTEND</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedSessionForDetail(currentSession);
                      }}
                    >
                      <View style={[styles.gameActionIcon, { backgroundColor: Colors.dark.warning }]}>
                        <Ionicons name="close-circle" size={24} color="#000" />
                      </View>
                      <Text style={styles.actionBtnLabel}>CANCEL</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        (navigation as any).navigate("Calendar", { openSessionId: currentSession.id, action: "end" });
                      }}
                    >
                      <View style={[styles.gameActionIcon, { backgroundColor: Colors.dark.orange }]}>
                        <Ionicons name="stop-circle" size={24} color="#000" />
                      </View>
                      <Text style={styles.actionBtnLabel}>END</Text>
                    </Pressable>
                  </View>
                ) : selectedDaySessions.length > 0 ? (
                  <View style={styles.statsBar}>
                    <View style={styles.statBlock}>
                      <Text style={styles.statValue}>{selectedDaySessions.length}</Text>
                      <Text style={styles.statLabel}>SESSIONS</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBlock}>
                      <Text style={styles.statValue}>
                        {selectedDaySessions.reduce((acc, s) => acc + s.duration, 0)}
                      </Text>
                      <Text style={styles.statLabel}>MINUTES</Text>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    style={styles.missionCta}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      handleNavigate("Players");
                    }}
                  >
                    <Ionicons name="arrow-forward-circle" size={18} color={Colors.dark.primary} />
                    <Text style={styles.missionCtaText}>REVIEW PLAYER PROGRESS</Text>
                  </Pressable>
                )}
              </>
            )}
          </LinearGradient>
        </View>

        {/* === POWER GAUGE - Gaming Energy HUD === */}
        <View style={styles.gamingCard}>
          {/* Neon top accent */}
          <LinearGradient
            colors={[Colors.dark.primary + "60", "transparent", Colors.dark.xpCyan + "60"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gamingCardTopLine}
          />
          
          <LinearGradient
            colors={["rgba(0, 0, 0, 0.7)", "rgba(35, 35, 35, 0.9)"]}
            style={styles.gamingCardGradient}
          >
            <Pressable 
              style={styles.gamingCardHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEnergyCollapsed(!energyCollapsed);
              }}
            >
              <View style={styles.gamingCardTitleRow}>
                <View style={styles.gamingIconWrapper}>
                  <Ionicons name="flash" size={14} color={Colors.dark.primary} />
                </View>
                <Text style={styles.gamingCardTitle}>POWER GAUGE</Text>
              </View>
              <View style={styles.gamingCardControls}>
                <View
                  style={[
                    styles.gamingStateBadge,
                    {
                      borderColor:
                        coachStats.energyState === "depleted"
                          ? Colors.dark.error
                          : coachStats.energyState === "draining"
                          ? Colors.dark.orange
                          : coachStats.energyState === "charged"
                          ? Colors.dark.gold
                          : Colors.dark.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.gamingStateText,
                      {
                        color:
                          coachStats.energyState === "depleted"
                            ? Colors.dark.error
                            : coachStats.energyState === "draining"
                            ? Colors.dark.orange
                            : coachStats.energyState === "charged"
                            ? Colors.dark.gold
                            : Colors.dark.primary,
                      },
                    ]}
                  >
                    {coachStats.energyState === "fullpower" 
                      ? "FULL POWER" 
                      : coachStats.energyState.toUpperCase()}
                  </Text>
                </View>
                <Pressable style={styles.gamingCollapseBtn}>
                  <Ionicons 
                    name={energyCollapsed ? "chevron-down" : "chevron-up"} 
                    size={16} 
                    color={Colors.dark.textSecondary} 
                  />
                </Pressable>
              </View>
            </Pressable>

            {energyCollapsed ? (
              <View style={styles.gamingCollapsedPreview}>
                <Text style={styles.gamingCollapsedText}>
                  STM {recoveryAwareStamina !== null ? recoveryAwareStamina : (todaysSessions.length === 0 ? "100" : coachStats.staminaPercent)}% | IMP {todaysSessions.length === 0 ? "100" : coachStats.impactPercent}%
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.gamingBarsContainer}>
                  {/* Stamina Power Bar */}
                  <View style={styles.gamingBarRow}>
                    <View style={styles.gamingBarLabelRow}>
                      <Text style={styles.gamingBarLabel}>STAMINA</Text>
                      <Text style={styles.gamingBarValue}>{recoveryAwareStamina !== null ? recoveryAwareStamina : (todaysSessions.length === 0 ? "100" : coachStats.staminaPercent)}%</Text>
                    </View>
                    <View style={styles.gamingBarTrack}>
                      <LinearGradient
                        colors={
                          coachStats.energyState === "depleted"
                            ? [Colors.dark.error, Colors.dark.orange]
                            : coachStats.energyState === "draining"
                            ? [Colors.dark.orange, Colors.dark.gold]
                            : [Colors.dark.primary, Colors.dark.xpCyan]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.gamingBarFill, { width: recoveryAwareStamina !== null ? `${recoveryAwareStamina}%` : (todaysSessions.length === 0 ? "100%" : `${coachStats.staminaPercent}%`) }]}
                      />
                      <View style={styles.gamingBarGlow} />
                    </View>
                  </View>

                  {/* Impact Power Bar */}
                  <View style={styles.gamingBarRow}>
                    <View style={styles.gamingBarLabelRow}>
                      <Text style={styles.gamingBarLabel}>IMPACT</Text>
                      <Text style={styles.gamingBarValue}>
                        {todaysSessions.length === 0 
                          ? "100%" 
                          : coachStats.completedMinutes === 0 
                            ? "---" 
                            : `${coachStats.impactPercent}%`}
                      </Text>
                    </View>
                    <View style={styles.gamingBarTrack}>
                      {todaysSessions.length > 0 && coachStats.completedMinutes === 0 ? (
                        <View style={[styles.gamingBarFill, { width: "100%", backgroundColor: Colors.dark.disabled + "40" }]} />
                      ) : (
                        <LinearGradient
                          colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.gamingBarFill, { width: todaysSessions.length === 0 ? "100%" : `${coachStats.impactPercent}%` }]}
                        />
                      )}
                      <View style={styles.gamingBarGlow} />
                    </View>
                  </View>
                </View>

                <View style={styles.gamingSubtextRow}>
                  <Ionicons name="information-circle" size={12} color={Colors.dark.textSecondary} />
                  <Text style={styles.gamingSubtext}>
                    {todaysSessions.length === 0
                      ? "Fully recharged - ready for court"
                      : coachStats.impactPercent === 100
                      ? "Max impact unlocks bonus XP"
                      : coachStats.completedMinutes > 0
                      ? `${coachStats.completedMinutes}m played | ${coachStats.remainingMinutes}m remaining`
                      : coachStats.totalMinutes > 0
                      ? `${coachStats.totalMinutes}m scheduled today`
                      : "Ready for action"}
                  </Text>
                </View>
              </>
            )}
          </LinearGradient>
        </View>

        {/* === COACH ANALYTICS - Gaming Insights HUD === */}
        <View style={styles.gamingCard}>
          <LinearGradient
            colors={[Colors.dark.xpCyan + "60", "transparent", Colors.dark.primary + "60"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gamingCardTopLine}
          />
          
          <LinearGradient
            colors={["rgba(0, 0, 0, 0.7)", "rgba(35, 35, 35, 0.9)"]}
            style={styles.gamingCardGradient}
          >
            <Pressable 
              style={styles.gamingCardHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setInsightsCollapsed(!insightsCollapsed);
              }}
            >
              <View style={styles.gamingCardTitleRow}>
                <View style={[styles.gamingIconWrapper, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                  <Ionicons name="stats-chart" size={14} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.gamingCardTitle}>COACH ANALYTICS</Text>
              </View>
              <Pressable style={styles.gamingCollapseBtn}>
                <Ionicons 
                  name={insightsCollapsed ? "chevron-down" : "chevron-up"} 
                  size={16} 
                  color={Colors.dark.textSecondary} 
                />
              </Pressable>
            </Pressable>
            
            {insightsCollapsed ? (
              <View style={styles.gamingCollapsedPreview}>
                <Text style={styles.gamingCollapsedText}>
                  Load forecast & performance metrics
                </Text>
              </View>
            ) : (
              <View style={styles.gamingInsightsContent}>
                <CoachEarningsCard 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate("CoachEarnings" as never);
                  }}
                />
                <BurnoutRiskCard />
                <LoadForecastCard 
                  onDayPress={(date) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleNavigate("Calendar");
                  }}
                />
              </View>
            )}
          </LinearGradient>
        </View>

        {/* === COACHING SERIES SUMMARY === */}
        <SeriesSummaryCard 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleNavigate("Coaching");
          }}
          onViewAll={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleNavigate("Coaching");
          }}
        />

        {/* === PLAYERS BY LEVEL DASHBOARD === */}
        <PlayersByLevelCard />

        {/* === ACTION QUEUE - Gaming Alerts HUD === */}
        {alerts.length > 0 ? (
          <View style={styles.gamingCard}>
            <LinearGradient
              colors={[Colors.dark.orange + "60", "transparent", Colors.dark.gold + "60"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gamingCardTopLine}
            />
            
            <LinearGradient
              colors={["rgba(0, 0, 0, 0.7)", "rgba(35, 35, 35, 0.9)"]}
              style={styles.gamingCardGradient}
            >
              <Pressable 
                style={styles.gamingCardHeader}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAlertsCollapsed(!alertsCollapsed);
                }}
              >
                <View style={styles.gamingCardTitleRow}>
                  <View style={[styles.gamingIconWrapper, { backgroundColor: Colors.dark.orange + "20" }]}>
                    <Ionicons name="warning" size={14} color={Colors.dark.orange} />
                  </View>
                  <Text style={styles.gamingCardTitle}>ACTION QUEUE</Text>
                </View>
                <View style={styles.gamingCardControls}>
                  <View style={styles.gamingAlertBadge}>
                    <Text style={styles.gamingAlertBadgeText}>{alerts.length}</Text>
                  </View>
                  <Pressable style={styles.gamingCollapseBtn}>
                    <Ionicons 
                      name={alertsCollapsed ? "chevron-down" : "chevron-up"} 
                      size={16} 
                      color={Colors.dark.textSecondary} 
                    />
                  </Pressable>
                </View>
              </Pressable>
              
              {alertsCollapsed ? null : alerts.map((alert) => (
                <Pressable 
                  key={alert.id} 
                  style={styles.gamingAlertCard}
                  onPress={() => handleNavigate("Coaching")}
                >
                  <View
                    style={[
                      styles.gamingAlertIcon,
                      {
                        borderColor:
                          alert.priority === "high"
                            ? Colors.dark.error
                            : Colors.dark.orange,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        alert.type === "feedback"
                          ? "document-text"
                          : alert.type === "holiday"
                          ? "airplane"
                          : "alert-circle"
                      }
                      size={18}
                      color={alert.priority === "high" ? Colors.dark.error : Colors.dark.orange}
                    />
                  </View>
                  <Text style={styles.gamingAlertText}>{alert.message}</Text>
                  <View style={styles.gamingXpBadge}>
                    <Text style={styles.gamingXpText}>+{pendingFeedbackCount * 15} XP</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.dark.primary} />
                </Pressable>
              ))}
            </LinearGradient>
          </View>
        ) : null}

        {/* === TODAY'S SCHEDULE - Unified Gaming HUD === */}
        {todaysSessions.length > 0 ? (
          <View style={styles.todayScheduleCard}>
            {/* Multi-color animated top border */}
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.xpCyan, Colors.dark.gold, Colors.dark.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.todayScheduleTopLine}
            />
            
            <LinearGradient
              colors={["rgba(0, 0, 0, 0.85)", "rgba(20, 25, 30, 0.95)"]}
              style={styles.todayScheduleGradient}
            >
              {/* Header with stats */}
              <Pressable 
                style={styles.todayScheduleHeader}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSessionsCollapsed(!sessionsCollapsed);
                }}
              >
                <View style={styles.todayScheduleTitleRow}>
                  <View style={styles.todayScheduleIconStack}>
                    <LinearGradient
                      colors={[Colors.dark.primary + "30", Colors.dark.xpCyan + "20"]}
                      style={styles.todayScheduleIconBg}
                    >
                      <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
                    </LinearGradient>
                  </View>
                  <View>
                    <Text style={styles.todayScheduleTitle}>TODAY'S SCHEDULE</Text>
                    <Text style={styles.todayScheduleSubtitle}>
                      {(() => {
                        const now = new Date();
                        const currentSession = todaysSessions.find(s => 
                          new Date(s.startTime) <= now && new Date(s.endTime) > now
                        );
                        const completed = todaysSessions.filter(s => new Date(s.endTime) < now).length;
                        const upcoming = todaysSessions.filter(s => new Date(s.startTime) > now).length;
                        if (currentSession) return "Session in progress";
                        if (upcoming > 0) return `${completed} done, ${upcoming} upcoming`;
                        return "All sessions complete";
                      })()}
                    </Text>
                  </View>
                </View>
                <View style={styles.todayScheduleStats}>
                  <View style={styles.todayScheduleStatBadge}>
                    <Text style={styles.todayScheduleStatValue}>{todaysSessions.length}</Text>
                    <Text style={styles.todayScheduleStatLabel}>sessions</Text>
                  </View>
                  <View style={[styles.todayScheduleStatBadge, { backgroundColor: Colors.dark.gold + "15", borderColor: Colors.dark.gold + "40" }]}>
                    <Text style={[styles.todayScheduleStatValue, { color: Colors.dark.gold }]}>
                      {todaysSessions.reduce((sum, s) => sum + (s.duration || 0), 0)}m
                    </Text>
                    <Text style={[styles.todayScheduleStatLabel, { color: Colors.dark.gold + "80" }]}>court</Text>
                  </View>
                  <Pressable style={styles.todayScheduleCollapseBtn}>
                    <Ionicons 
                      name={sessionsCollapsed ? "chevron-down" : "chevron-up"} 
                      size={18} 
                      color={Colors.dark.textSecondary} 
                    />
                  </Pressable>
                </View>
              </Pressable>
              
              {/* Timeline preview when collapsed */}
              {sessionsCollapsed ? (
                <View style={styles.todayScheduleCollapsed}>
                  <View style={styles.todayScheduleTimelinePreview}>
                    {todaysSessions.slice(0, 5).map((session, index) => {
                      const now = new Date();
                      const isPast = new Date(session.endTime) < now;
                      const isCurrent = new Date(session.startTime) <= now && new Date(session.endTime) > now;
                      return (
                        <View key={session.id} style={styles.todayScheduleTimelineDot}>
                          <View style={[
                            styles.todayScheduleDot,
                            isPast && styles.todayScheduleDotDone,
                            isCurrent && styles.todayScheduleDotLive,
                          ]}>
                            {isCurrent && <View style={styles.todayScheduleDotPulse} />}
                          </View>
                          <Text style={[
                            styles.todayScheduleDotTime,
                            isPast && { color: Colors.dark.disabled },
                            isCurrent && { color: Colors.dark.primary },
                          ]}>{formatTime(session.startTime)}</Text>
                        </View>
                      );
                    })}
                    {todaysSessions.length > 5 && (
                      <View style={styles.todayScheduleTimelineDot}>
                        <Text style={styles.todayScheduleMoreText}>+{todaysSessions.length - 5}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.todayScheduleExpanded}>
                  {/* Visual Timeline */}
                  <View style={styles.todayScheduleTimeline}>
                    <MiniTimeline
                      sessions={todaysSessions.map(s => ({
                        ...s,
                        players: (s as any).players || [],
                      }))}
                    />
                  </View>
                  
                  {/* Divider */}
                  <View style={styles.todayScheduleDivider}>
                    <View style={styles.todayScheduleDividerLine} />
                    <Text style={styles.todayScheduleDividerText}>SESSION DETAILS</Text>
                    <View style={styles.todayScheduleDividerLine} />
                  </View>
                  
                  {/* Session Cards - compute next session ID once */}
                  {(() => {
                    const now = new Date();
                    const nextSessionId = todaysSessions.find(s => new Date(s.startTime) > now)?.id || null;
                    
                    return todaysSessions.map((session, index) => {
                      const isPast = new Date(session.endTime) < now;
                      const isCurrent = new Date(session.startTime) <= now && new Date(session.endTime) > now;
                      const isNext = !isCurrent && !isPast && session.id === nextSessionId;
                    
                    return (
                      <Pressable
                        key={session.id}
                        style={[
                          styles.todayScheduleSession,
                          isCurrent && styles.todayScheduleSessionLive,
                          isNext && styles.todayScheduleSessionNext,
                          isPast && styles.todayScheduleSessionPast,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setSelectedSessionForDetail(session);
                        }}
                      >
                        {/* Time block */}
                        <View style={styles.todayScheduleTimeBlock}>
                          <Text style={[
                            styles.todayScheduleTimeText,
                            isCurrent && { color: Colors.dark.primary },
                            isPast && { color: Colors.dark.disabled },
                          ]}>
                            {formatTime(session.startTime)}
                          </Text>
                          <View style={[
                            styles.todayScheduleDurationBadge,
                            isCurrent && { backgroundColor: Colors.dark.primary + "20" },
                          ]}>
                            <Text style={[
                              styles.todayScheduleDurationText,
                              isCurrent && { color: Colors.dark.primary },
                            ]}>{session.duration}m</Text>
                          </View>
                        </View>
                        
                        {/* Vertical connector line */}
                        <View style={styles.todayScheduleConnector}>
                          <View style={[
                            styles.todayScheduleConnectorDot,
                            isCurrent && { backgroundColor: Colors.dark.primary, shadowColor: Colors.dark.primary },
                            isPast && { backgroundColor: Colors.dark.disabled },
                            isNext && { backgroundColor: Colors.dark.gold },
                          ]} />
                          {index < todaysSessions.length - 1 && (
                            <View style={[
                              styles.todayScheduleConnectorLine,
                              isPast && { backgroundColor: Colors.dark.disabled + "40" },
                            ]} />
                          )}
                        </View>
                        
                        {/* Session info */}
                        <View style={styles.todayScheduleSessionInfo}>
                          <View style={styles.todayScheduleSessionHeader}>
                            <Text style={[
                              styles.todayScheduleSessionType,
                              isPast && { color: Colors.dark.disabled },
                            ]}>
                              {session.sessionType === "private"
                                ? "Private Lesson"
                                : session.sessionType === "semi_private"
                                ? "Semi-Private"
                                : session.sessionType === "group"
                                ? "Group Training"
                                : session.sessionType}
                            </Text>
                            {isCurrent && (
                              <View style={styles.todayScheduleLiveBadge}>
                                <Animated.View style={[styles.todayScheduleLivePulse, pulseAnimatedStyle]} />
                                <View style={styles.todayScheduleLiveDot} />
                                <Text style={styles.todayScheduleLiveText}>LIVE</Text>
                              </View>
                            )}
                            {isNext && (
                              <View style={styles.todayScheduleNextBadge}>
                                <Text style={styles.todayScheduleNextText}>UP NEXT</Text>
                              </View>
                            )}
                            {isPast && (
                              <View style={styles.todayScheduleDoneBadge}>
                                <Ionicons name="checkmark" size={12} color={Colors.dark.disabled} />
                                <Text style={styles.todayScheduleDoneText}>Done</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[
                            styles.todayScheduleSessionTime,
                            isPast && { color: Colors.dark.disabled },
                          ]}>
                            {formatTime(session.startTime)} - {formatTime(session.endTime)}
                          </Text>
                        </View>
                        
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={isPast ? Colors.dark.disabled : isCurrent ? Colors.dark.primary : Colors.dark.textSecondary}
                        />
                      </Pressable>
                    );
                  });
                  })()}
                </View>
              )}
            </LinearGradient>
          </View>
        ) : null}
      </ScrollView>

      <CoachChatFooter />

      <CoachStatusPanel
        visible={showStatusPanel}
        onClose={() => setShowStatusPanel(false)}
        onNavigate={(screen) => {
          if (screen === "Logout") {
            if (Platform.OS === "web") {
              const confirmed = window.confirm("Are you sure you want to sign out?");
              if (confirmed) {
                logout();
              }
            } else {
              RNAlert.alert(
                "Sign Out",
                "Are you sure you want to sign out?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: () => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      logout();
                    },
                  },
                ]
              );
            }
            return;
          }
          if (screen === "FreelanceLicense") {
            setShowFreelanceWizard(true);
            return;
          }
          handleNavigate(screen);
        }}
      />

      <FreelanceLicenseWizard
        visible={showFreelanceWizard}
        onClose={() => setShowFreelanceWizard(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/coach/freelance-profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/coach/academies"] });
        }}
      />

      {/* Session Detail Drawer - Cancel session, attendance, etc. */}
      <SessionDetailDrawer
        visible={!!selectedSessionForDetail}
        session={selectedSessionForDetail}
        courts={calendarData?.courts || []}
        onClose={() => setSelectedSessionForDetail(null)}
        onAttendance={() => {
          if (selectedSessionForDetail) {
            (navigation as any).navigate("Calendar", { openSessionId: selectedSessionForDetail.id, action: "attendance" });
            setSelectedSessionForDetail(null);
          }
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
  modeSwitcherContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  greeting: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "400",
    letterSpacing: 0.3,
  },
  coachName: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  academyName: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    fontWeight: "500",
  },
  
  // Coach XP
  xpContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  levelBadgeContainer: {
    overflow: "hidden",
    borderRadius: 12,
  },
  levelBadgeGradient: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  levelBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  xpBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 3,
    overflow: "hidden",
    position: "relative" as const,
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  xpBarGlow: {
    position: "absolute" as const,
    top: -2,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: "transparent",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  xpText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  
  // === GAMING PLAYER CARD STYLES ===
  playerCard: {
    position: "relative" as const,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  playerCardGlow: {
    position: "absolute" as const,
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: BorderRadius.lg + 2,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    opacity: 0.5,
  },
  playerCardGradient: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    overflow: "hidden",
  },
  playerCardTopLine: {
    height: 3,
    width: "100%",
  },
  playerCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  holoAvatarContainer: {
    position: "relative" as const,
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOuterGlow: {
    position: "absolute" as const,
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: "hidden",
  },
  avatarGlowGradient: {
    width: "100%",
    height: "100%",
  },
  avatarFrame: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
  },
  avatarBorder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInnerBg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhoto: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  levelEmblem: {
    position: "absolute" as const,
    bottom: -4,
    right: -4,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  levelEmblemGradient: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelEmblemText: {
    fontSize: 12,
    fontWeight: "900",
    color: Colors.dark.backgroundRoot,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerRank: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 2,
  },
  playerName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpProgressSection: {
    marginTop: Spacing.sm,
  },
  xpBarWrapper: {
    gap: 4,
  },
  xpBarTrack: {
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative" as const,
  },
  xpBarProgress: {
    height: "100%",
    borderRadius: 4,
  },
  xpBarShine: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 4,
  },
  xpLabels: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpCurrent: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  xpRequired: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  playerActions: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionBtnGlow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  actionBtnInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  
  // === MISSION CONSOLE STYLES ===
  missionConsole: {
    position: "relative" as const,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  missionFrame: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  missionFrameTop: {
    height: 2,
  },
  missionGradient: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: Spacing.md,
  },
  missionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  missionTitleSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  missionIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.dark.xpCyan + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  missionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.xpCyan,
    letterSpacing: 2,
  },
  missionControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  collapseToggle: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: BorderRadius.sm,
  },
  dayPills: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  dayPillArrow: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPillCenter: {
    paddingHorizontal: Spacing.md,
  },
  dayPillLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  dateText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  intensityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  intensityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  intensityLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  backToTodayChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  backToTodayLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  missionDisplay: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  missionContent: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  missionPrimary: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: -1,
  },
  missionSecondary: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  tapHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.primary + "15",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  tapHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  liveHud: {
    position: "relative" as const,
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  liveHudGlow: {
    position: "absolute" as const,
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    backgroundColor: Colors.dark.primary,
    opacity: 0.2,
    borderRadius: BorderRadius.md + 4,
  },
  liveHudBg: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  liveHudBgClean: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  liveHudContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  liveHudLeft: {
    flex: 1,
  },
  liveHudRight: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative" as const,
    marginLeft: Spacing.md,
  },
  liveCircleGlow: {
    position: "absolute" as const,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.dark.error,
  },
  liveCircleBadge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FF3333",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#ffffff",
  },
  liveCircleText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  liveCircleSubtext: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
    marginTop: 2,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  liveHudHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  liveIndicatorNew: {
    position: "relative" as const,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  livePulseRing: {
    position: "absolute" as const,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
  },
  liveDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  liveStatusText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 2,
  },
  countdownTimer: {
    fontSize: 56,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: -2,
    textShadowColor: Colors.dark.primary + "40",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  countdownLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 2,
    marginTop: -4,
  },
  sessionMeta: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.primary + "20",
  },
  sessionMetaText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
    textAlign: "center",
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    marginTop: Spacing.sm,
  },
  actionBarBtn: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  actionBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  gameActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  actionBtnLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statsBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    marginTop: Spacing.sm,
  },
  statBlock: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  missionCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    marginTop: Spacing.sm,
  },
  missionCtaText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  
  // Avatar with Glow Ring (legacy)
  avatarGlowRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.primary + "30",
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  dayNavHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  dayNavArrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  dayNavCollapseBtn: {
    marginLeft: Spacing.xs,
    padding: Spacing.xs,
  },
  focusHeaderCenter: {
    flex: 1,
    alignItems: "center",
  },
  backToTodayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  backToTodayText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
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
  focusHeaderLeft: {
    flex: 1,
  },
  focusTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dayIntensityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  dayIntensityText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
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
  liveDotPulse: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    opacity: 0.3,
    left: -4,
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
  focusPrimaryLarge: {
    fontSize: 48,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: -1,
  },
  focusSecondaryMuted: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: -Spacing.xs,
    opacity: 0.7,
  },
  focusContext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
    textAlign: "center",
    marginTop: Spacing.sm,
    fontWeight: "500",
  },
  sessionActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.md,
  },
  sessionActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: BorderRadius.md,
  },
  sessionActionText: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
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
  focusCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.md,
  },
  focusCtaText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
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
  
  // Collapsible Cards
  collapsibleCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  collapsibleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  collapsibleTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  collapsibleToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  collapsibleBadge: {
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: "center",
  },
  collapsibleBadgeText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  collapsedPreview: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
    marginTop: Spacing.sm,
  },
  collapsedPreviewText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  insightsSection: {
    marginBottom: Spacing.lg,
  },
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
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  alertIcon: {
    width: 32,
    height: 32,
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
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
    paddingTop: Spacing.sm,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
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
  
  // === GAMING CARD STYLES ===
  gamingCard: {
    position: "relative" as const,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  gamingCardTopLine: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 1,
  },
  gamingCardGradient: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  gamingCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gamingCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  gamingCardTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  gamingCardControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingStateBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  gamingStateText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  gamingCollapseBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: BorderRadius.sm,
  },
  gamingCollapsedPreview: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    marginTop: Spacing.sm,
  },
  gamingCollapsedText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  
  // Gaming Power Bars
  gamingBarsContainer: {
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingBarRow: {
    gap: 6,
  },
  gamingBarLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  gamingBarLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  gamingBarValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  gamingBarTrack: {
    height: 8,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative" as const,
  },
  gamingBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  gamingBarGlow: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    width: 20,
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  gamingSubtextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingSubtext: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  gamingInsightsContent: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  
  // Gaming Alerts
  gamingAlertBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.orange + "20",
    borderWidth: 1,
    borderColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  gamingAlertBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.orange,
  },
  gamingAlertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gamingAlertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  gamingXpBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  gamingXpText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
  gamingTimelineContent: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  
  // Gaming Session Cards
  gamingSessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  gamingSessionCardLive: {
    borderColor: Colors.dark.primary + "60",
    backgroundColor: Colors.dark.primary + "08",
  },
  gamingSessionTime: {
    alignItems: "center",
    minWidth: 50,
  },
  gamingSessionTimeText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  gamingSessionTimePast: {
    color: Colors.dark.textMuted,
  },
  gamingSessionDuration: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
  gamingSessionInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gamingSessionType: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  gamingSessionTypePast: {
    color: Colors.dark.textMuted,
  },
  gamingLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  gamingLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  gamingLiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  gamingDoneBadge: {
    backgroundColor: Colors.dark.disabled + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  gamingDoneText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  
  // === TODAY'S SCHEDULE - Unified Gaming HUD ===
  todayScheduleCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  todayScheduleTopLine: {
    height: 3,
  },
  todayScheduleGradient: {
    padding: Spacing.md,
  },
  todayScheduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  todayScheduleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  todayScheduleIconStack: {
    position: "relative" as const,
  },
  todayScheduleIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  todayScheduleTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  todayScheduleSubtitle: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  todayScheduleStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  todayScheduleStatBadge: {
    backgroundColor: Colors.dark.primary + "15",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  todayScheduleStatValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  todayScheduleStatLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.primary + "80",
    letterSpacing: 0.5,
  },
  todayScheduleCollapseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.xs,
  },
  todayScheduleCollapsed: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  todayScheduleTimelinePreview: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  todayScheduleTimelineDot: {
    alignItems: "center",
    gap: 6,
  },
  todayScheduleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.textSecondary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundDefault,
  },
  todayScheduleDotDone: {
    backgroundColor: Colors.dark.disabled,
    borderColor: Colors.dark.disabled + "40",
  },
  todayScheduleDotLive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary + "40",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  todayScheduleDotPulse: {
    position: "absolute" as const,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "30",
    top: -6,
    left: -6,
  },
  todayScheduleDotTime: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  todayScheduleMoreText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  todayScheduleExpanded: {
    marginTop: Spacing.md,
  },
  todayScheduleTimeline: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  todayScheduleDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  todayScheduleDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  todayScheduleDividerText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
  },
  todayScheduleSession: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  todayScheduleSessionLive: {
    borderColor: Colors.dark.primary + "50",
    backgroundColor: Colors.dark.primary + "08",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  todayScheduleSessionNext: {
    borderColor: Colors.dark.gold + "40",
    backgroundColor: Colors.dark.gold + "05",
  },
  todayScheduleSessionPast: {
    opacity: 0.6,
  },
  todayScheduleTimeBlock: {
    alignItems: "center",
    minWidth: 50,
    marginRight: Spacing.xs,
  },
  todayScheduleTimeText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  todayScheduleDurationBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  todayScheduleDurationText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  todayScheduleConnector: {
    width: 24,
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: 4,
  },
  todayScheduleConnectorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.textSecondary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 4,
  },
  todayScheduleConnectorLine: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginTop: 4,
  },
  todayScheduleSessionInfo: {
    flex: 1,
    paddingLeft: Spacing.xs,
  },
  todayScheduleSessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  todayScheduleSessionType: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  todayScheduleSessionTime: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  todayScheduleLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "50",
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  todayScheduleLivePulse: {
    position: "absolute" as const,
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.primary + "30",
    borderRadius: BorderRadius.sm,
  },
  todayScheduleLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },
  todayScheduleLiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
  },
  todayScheduleNextBadge: {
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "40",
  },
  todayScheduleNextText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.gold,
    letterSpacing: 0.5,
  },
  todayScheduleDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.disabled + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  todayScheduleDoneText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.disabled,
  },
});
