import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert as RNAlert,
  Platform,
} from "react-native";
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
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCoach } from "@/coach/context/CoachContext";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import MiniTimeline from "@/coach/components/MiniTimeline";
import { CoachChatFooter } from "@/coach/components/CoachChatFooter";
import { CoachStatusPanel } from "@/coach/components/CoachStatusPanel";
import { BurnoutRiskCard } from "@/coach/components/BurnoutRiskCard";
import { LoadForecastCard } from "@/coach/components/LoadForecastCard";
import { AcademySwitcher } from "@/coach/components/AcademySwitcher";
import ModeSwitcher from "@/components/ModeSwitcher";
import { filterSessionsByDate } from "@/lib/dateUtils";

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

interface WeeklyCalendarData {
  ownSessions: Session[];
  blockedSessions: any[];
  courts: any[];
  dateRange: { start: string; end: string };
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { coach, academy, calendarData, isLoading } = useCoach();
  const { logout } = useAuth();
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(true);
  const [focusCollapsed, setFocusCollapsed] = useState(false);
  const [energyCollapsed, setEnergyCollapsed] = useState(false);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  
  const todayDateStr = new Date().toISOString().split("T")[0];
  const weeklyCalendarPath = coach?.id 
    ? `/api/coach/calendar?coachId=${coach.id}&date=${todayDateStr}&view=week` 
    : null;
  const { data: weeklyCalendarData } = useQuery<WeeklyCalendarData>({
    queryKey: [weeklyCalendarPath],
    enabled: !!coach?.id && !!weeklyCalendarPath,
  });
  
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
    
    // Day intensity for personality
    let dayIntensity: "rest" | "light" | "normal" | "heavy" = "rest";
    if (totalMinutes === 0) dayIntensity = "rest";
    else if (totalMinutes <= 120) dayIntensity = "light";
    else if (totalMinutes <= 240) dayIntensity = "normal";
    else dayIntensity = "heavy";
    
    return { totalMinutes, completedMinutes, remainingMinutes, staminaPercent, impactPercent, energyState, dayIntensity };
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

  const sessionTimeRemaining = useMemo(() => {
    if (!currentSession) return "--:--";
    const now = new Date();
    const end = new Date(currentSession.endTime);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return "0:00";
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [currentSession]);

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

      {/* Mode Switcher - always visible at top */}
      <View style={styles.modeSwitcherContainer}>
        <ModeSwitcher />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.footerCollapsed + 100 }]}
        showsVerticalScrollIndicator={false}
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
                    <View style={styles.avatarInnerBg}>
                      <Ionicons name="person" size={28} color={Colors.dark.primary} />
                    </View>
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
                  <Text style={styles.academyName}>{academy?.name || "Academy"}</Text>
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
                    <View style={styles.liveHud}>
                      <Animated.View style={[styles.liveHudGlow, pulseAnimatedStyle]} />
                      <LinearGradient
                        colors={[Colors.dark.primary + "30", Colors.dark.primary + "10"]}
                        style={styles.liveHudBg}
                      >
                        <View style={styles.liveHudHeader}>
                          <View style={styles.liveIndicatorNew}>
                            <Animated.View style={[styles.livePulseRing, pulseAnimatedStyle]} />
                            <View style={styles.liveDotCore} />
                          </View>
                          <Text style={styles.liveStatusText}>LIVE SESSION</Text>
                        </View>
                        
                        <Text style={styles.countdownTimer}>{sessionTimeRemaining}</Text>
                        <Text style={styles.countdownLabel}>REMAINING</Text>
                        
                        <View style={styles.sessionMeta}>
                          <Text style={styles.sessionMetaText}>
                            {getSessionTypeLabel(currentSession.sessionType)} · {calendarData?.courts?.find(c => c.id === currentSession.courtId)?.name || "Court"}
                          </Text>
                        </View>
                      </LinearGradient>
                    </View>
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
                      <View style={[styles.actionBtnIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
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
                      <View style={[styles.actionBtnIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                        <Ionicons name="time" size={18} color={Colors.dark.xpCyan} />
                      </View>
                      <Text style={[styles.actionBtnLabel, { color: Colors.dark.xpCyan }]}>EXTEND</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBarBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        (navigation as any).navigate("Calendar", { openSessionId: currentSession.id, action: "end" });
                      }}
                    >
                      <View style={[styles.actionBtnIcon, { backgroundColor: Colors.dark.orange + "20" }]}>
                        <Ionicons name="stop-circle" size={18} color={Colors.dark.orange} />
                      </View>
                      <Text style={[styles.actionBtnLabel, { color: Colors.dark.orange }]}>END</Text>
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

        {/* Stamina & Impact Card */}
        <View style={styles.energyCard}>
          <Pressable 
            style={styles.energyHeader}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setEnergyCollapsed(!energyCollapsed);
            }}
          >
            <View style={styles.energyTitleRow}>
              <Ionicons name="flash-outline" size={18} color={Colors.dark.primary} />
              <Text style={styles.energyTitle}>Energy</Text>
            </View>
            <View
              style={[
                styles.energyStateBadge,
                {
                  backgroundColor:
                    todaysSessions.length === 0
                      ? Colors.dark.xpCyan + "15"
                      : coachStats.energyState === "intense"
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
                      todaysSessions.length === 0
                        ? Colors.dark.xpCyan
                        : coachStats.energyState === "intense"
                        ? Colors.dark.error
                        : coachStats.energyState === "focused"
                        ? Colors.dark.orange
                        : coachStats.energyState === "active"
                        ? Colors.dark.gold
                        : Colors.dark.primary,
                  },
                ]}
              >
                {todaysSessions.length === 0 
                  ? "Rested" 
                  : coachStats.energyState.charAt(0).toUpperCase() + coachStats.energyState.slice(1)}
              </Text>
            </View>
            <Ionicons 
              name={energyCollapsed ? "chevron-down" : "chevron-up"} 
              size={18} 
              color={Colors.dark.tabIconDefault} 
            />
          </Pressable>

          {energyCollapsed ? (
            <View style={styles.collapsedPreview}>
              <Text style={styles.collapsedPreviewText}>
                Stamina {todaysSessions.length === 0 ? "100" : coachStats.staminaPercent}% · Impact {todaysSessions.length === 0 ? "100" : coachStats.impactPercent}%
              </Text>
            </View>
          ) : (
          <>
          <View style={styles.energyBarsContainer}>
            {/* Stamina Bar */}
            <View style={styles.energyBarRow}>
              <Text style={styles.energyBarLabel}>Stamina</Text>
              <View style={styles.energyBarBackground}>
                <LinearGradient
                  colors={
                    todaysSessions.length === 0
                      ? [Colors.dark.xpCyan + "80", Colors.dark.xpCyan + "40"]
                      : coachStats.energyState === "intense"
                      ? [Colors.dark.error + "80", Colors.dark.error + "40"]
                      : coachStats.energyState === "focused"
                      ? [Colors.dark.orange + "80", Colors.dark.orange + "40"]
                      : [Colors.dark.primary + "80", Colors.dark.primary + "40"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.energyBarFill, { width: todaysSessions.length === 0 ? "100%" : `${coachStats.staminaPercent}%` }]}
                />
              </View>
              <Text style={styles.energyBarValue}>{todaysSessions.length === 0 ? "100" : coachStats.staminaPercent}%</Text>
            </View>

            {/* Impact Bar */}
            <View style={styles.energyBarRow}>
              <Text style={styles.energyBarLabel}>Impact</Text>
              <View style={styles.energyBarBackground}>
                {todaysSessions.length > 0 && coachStats.completedMinutes === 0 ? (
                  <View style={[styles.energyBarFill, { width: "100%", backgroundColor: Colors.dark.disabled + "30" }]} />
                ) : (
                  <LinearGradient
                    colors={[Colors.dark.xpCyan + "80", Colors.dark.xpCyan + "40"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.energyBarFill, { width: todaysSessions.length === 0 ? "100%" : `${coachStats.impactPercent}%` }]}
                  />
                )}
              </View>
              <Text style={styles.energyBarValue}>
                {todaysSessions.length === 0 
                  ? "100%" 
                  : coachStats.completedMinutes === 0 
                    ? "Pending" 
                    : `${coachStats.impactPercent}%`}
              </Text>
            </View>
          </View>

          <Text style={styles.energySubtext}>
            {todaysSessions.length === 0
              ? "Fully recharged and ready"
              : coachStats.impactPercent === 100
              ? "High impact sessions give bonus XP"
              : coachStats.completedMinutes > 0
              ? `${coachStats.completedMinutes}m coached, ${coachStats.remainingMinutes}m remaining`
              : coachStats.totalMinutes > 0
              ? `Impact updates after sessions · ${coachStats.totalMinutes}m scheduled`
              : "Ready for action"}
          </Text>
          </>
          )}
        </View>

        {/* Burnout Risk & Load Forecast */}
        <View style={styles.collapsibleCard}>
          <Pressable 
            style={styles.collapsibleHeader}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setInsightsCollapsed(!insightsCollapsed);
            }}
          >
            <View style={styles.collapsibleTitleRow}>
              <Ionicons name="analytics-outline" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.collapsibleTitle}>Insights</Text>
            </View>
            <Ionicons 
              name={insightsCollapsed ? "chevron-down" : "chevron-up"} 
              size={18} 
              color={Colors.dark.tabIconDefault} 
            />
          </Pressable>
          {insightsCollapsed ? (
            <View style={styles.collapsedPreview}>
              <Text style={styles.collapsedPreviewText}>
                Load forecast and burnout risk
              </Text>
            </View>
          ) : (
            <>
              <BurnoutRiskCard />
              <LoadForecastCard 
                onDayPress={(date) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleNavigate("Calendar");
                }}
              />
            </>
          )}
        </View>

        {/* Alerts */}
        {alerts.length > 0 ? (
          <View style={styles.collapsibleCard}>
            <Pressable 
              style={styles.collapsibleHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAlertsCollapsed(!alertsCollapsed);
              }}
            >
              <View style={styles.collapsibleTitleRow}>
                <Ionicons name="notifications-outline" size={18} color={Colors.dark.orange} />
                <Text style={styles.collapsibleTitle}>Alerts</Text>
              </View>
              <View style={styles.collapsibleToggle}>
                <View style={styles.collapsibleBadge}>
                  <Text style={styles.collapsibleBadgeText}>{alerts.length}</Text>
                </View>
                <Ionicons 
                  name={alertsCollapsed ? "chevron-down" : "chevron-up"} 
                  size={18} 
                  color={Colors.dark.tabIconDefault} 
                />
              </View>
            </Pressable>
            {alertsCollapsed ? null : alerts.map((alert) => (
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
          <View style={styles.collapsibleCard}>
            <Pressable 
              style={styles.collapsibleHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTimelineCollapsed(!timelineCollapsed);
              }}
            >
              <View style={styles.collapsibleTitleRow}>
                <Ionicons name="time-outline" size={18} color={Colors.dark.primary} />
                <Text style={styles.collapsibleTitle}>Today's Timeline</Text>
              </View>
              <Ionicons 
                name={timelineCollapsed ? "chevron-down" : "chevron-up"} 
                size={18} 
                color={Colors.dark.tabIconDefault} 
              />
            </Pressable>
            {timelineCollapsed ? (
              <View style={styles.collapsedPreview}>
                <Text style={styles.collapsedPreviewText}>
                  {(() => {
                    const now = new Date();
                    const nextSession = todaysSessions.find(s => new Date(s.startTime) > now);
                    const currentSession = todaysSessions.find(s => 
                      new Date(s.startTime) <= now && new Date(s.endTime) > now
                    );
                    if (currentSession) return "In session now";
                    if (nextSession) return `Next: ${formatTime(nextSession.startTime)}`;
                    return "All sessions complete";
                  })()}
                </Text>
              </View>
            ) : (
              <View style={styles.timelineCard}>
                <MiniTimeline
                  sessions={todaysSessions.map(s => ({
                    ...s,
                    players: (s as any).players || [],
                  }))}
                />
              </View>
            )}
          </View>
        ) : null}

        {/* Today's Lessons - Collapsible */}
        {todaysSessions.length > 0 ? (
          <View style={styles.collapsibleCard}>
            <Pressable 
              style={styles.collapsibleHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSessionsCollapsed(!sessionsCollapsed);
              }}
            >
              <View style={styles.collapsibleTitleRow}>
                <Ionicons name="tennisball-outline" size={18} color={Colors.dark.gold} />
                <Text style={styles.collapsibleTitle}>Sessions</Text>
              </View>
              <View style={styles.collapsibleToggle}>
                <View style={styles.collapsibleBadge}>
                  <Text style={styles.collapsibleBadgeText}>{todaysSessions.length}</Text>
                </View>
                <Ionicons 
                  name={sessionsCollapsed ? "chevron-down" : "chevron-up"} 
                  size={18} 
                  color={Colors.dark.tabIconDefault} 
                />
              </View>
            </Pressable>
            {sessionsCollapsed ? (
              <View style={styles.collapsedPreview}>
                <Text style={styles.collapsedPreviewText}>
                  {(() => {
                    const totalDuration = todaysSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
                    const playerCount = todaysSessions.reduce((sum, s) => sum + ((s as any).players?.length || 0), 0);
                    return `${totalDuration}m total · ${playerCount} player${playerCount !== 1 ? 's' : ''}`;
                  })()}
                </Text>
              </View>
            ) : todaysSessions.map((session) => {
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
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
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
  actionBtnLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 1,
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
});
