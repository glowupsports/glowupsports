import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";

interface SessionPlayer {
  id: string;
  name: string;
  status?: string | null;
}

interface NextSession {
  id: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  courtName?: string;
  players?: SessionPlayer[];
  status?: string | null;
}

interface NextSessionCountdownProps {
  session: NextSession;
  onCancel?: () => void;
  onDelay?: () => void;
  onPress?: () => void;
  onAttend?: () => void;
  onExtend?: () => void;
  onEnd?: () => void;
}

type SessionState = "upcoming" | "live" | "ended";

export function NextSessionCountdown({
  session,
  onCancel,
  onDelay,
  onPress,
  onAttend,
  onExtend,
  onEnd,
}: NextSessionCountdownProps) {
  const [timeLeft, setTimeLeft] = useState({ minutes: 0, seconds: 0, totalSeconds: 0 });
  const [sessionState, setSessionState] = useState<SessionState>("upcoming");
  const pulseAnim = useSharedValue(0);
  const ringGlow = useSharedValue(0);
  const liveGlow = useSharedValue(0);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    ringGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    liveGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const calculateTimeAndState = useCallback(() => {
    const now = new Date();
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    
    if (now >= end) {
      return { 
        state: "ended" as SessionState, 
        time: { minutes: 0, seconds: 0, totalSeconds: 0 } 
      };
    }
    
    if (now >= start && now < end) {
      const diffMs = end.getTime() - now.getTime();
      const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return { 
        state: "live" as SessionState, 
        time: { minutes, seconds, totalSeconds } 
      };
    }
    
    const diffMs = start.getTime() - now.getTime();
    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return { 
      state: "upcoming" as SessionState, 
      time: { minutes, seconds, totalSeconds } 
    };
  }, [session.startTime, session.endTime]);

  useEffect(() => {
    const updateTime = () => {
      const result = calculateTimeAndState();
      setSessionState(result.state);
      setTimeLeft(result.time);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, [calculateTimeAndState]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnim.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 1.08]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: ringGlow.value,
  }));

  const liveGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(liveGlow.value, [0, 1], [0.5, 1]),
    transform: [{ scale: interpolate(liveGlow.value, [0, 1], [0.98, 1.02]) }],
  }));

  const formatTime = (mins: number, secs: number) => {
    const m = String(mins).padStart(2, "0");
    const s = String(secs).padStart(2, "0");
    return `${m}:${s}`;
  };

  const getSessionTypeColor = () => {
    switch (session.sessionType?.toLowerCase()) {
      case "private":
        return Colors.dark.orange;
      case "semi_private":
      case "semi-private":
        return Colors.dark.xpCyan;
      case "group":
        return Colors.dark.primary;
      default:
        return Colors.dark.primary;
    }
  };

  const getSessionTypeLabel = () => {
    switch (session.sessionType?.toLowerCase()) {
      case "private":
        return "PRIVATE";
      case "semi_private":
      case "semi-private":
        return "SEMI-PRIVATE";
      case "group":
        return "GROUP";
      default:
        return session.sessionType?.toUpperCase() || "SESSION";
    }
  };

  const sessionColor = getSessionTypeColor();
  const isLive = sessionState === "live";
  const isEnded = sessionState === "ended";
  const isUrgent = !isLive && !isEnded && timeLeft.totalSeconds <= 300;
  
  const circleSize = 100;
  const strokeWidth = 6;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const getProgress = () => {
    if (isLive) {
      const sessionDurationMs = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
      const sessionDurationSeconds = sessionDurationMs / 1000;
      if (sessionDurationSeconds <= 0) return 0;
      return Math.min(timeLeft.totalSeconds / sessionDurationSeconds, 1);
    }
    const maxSeconds = 1800;
    return Math.min(timeLeft.totalSeconds / maxSeconds, 1);
  };
  
  const progress = getProgress();
  const strokeDashoffset = circumference * (1 - progress);
  
  if (isEnded) {
    return null;
  }

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCancel?.();
  };

  const handleDelay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDelay?.();
  };

  const handleAttend = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAttend?.();
  };

  const handleExtend = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onExtend?.();
  };

  const handleEnd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onEnd?.();
  };

  if (isLive) {
    return (
      <Pressable
        style={styles.container}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
      >
        <View style={[styles.liveGradient, { backgroundColor: "rgba(255, 68, 68, 0.08)" }]} />
        
        <View style={styles.content}>
          <View style={styles.liveHeader}>
            <View style={styles.liveIndicatorRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveSessionTitle}>LIVE SESSION</Text>
            </View>
          </View>

          <View style={styles.liveMainContent}>
            <View style={styles.liveTimerSection}>
              <Text style={styles.liveTimerText}>
                {formatTime(timeLeft.minutes, timeLeft.seconds)}
              </Text>
              <Text style={styles.liveRemainingLabel}>REMAINING</Text>
              <Text style={styles.liveSessionInfo}>
                {getSessionTypeLabel()} {session.courtName ? `\u00B7 ${session.courtName}` : ""}
              </Text>
            </View>

            <View style={styles.liveCircleSection}>
              <Animated.View style={[styles.liveCircleGlow, liveGlowStyle]} />
              <View style={styles.liveCircle}>
                <Text style={styles.liveCircleText}>LIVE</Text>
                <Text style={styles.liveCircleSubtext}>IN SESSION</Text>
              </View>
            </View>
          </View>

          <View style={styles.liveActions}>
            <Pressable style={styles.liveActionButton} onPress={handleAttend}>
              <View style={[styles.liveActionIcon, styles.attendIcon]}>
                <Ionicons name="checkmark" size={20} color={Colors.dark.primary} />
              </View>
              <Text style={styles.liveActionText}>ATTEND</Text>
            </Pressable>

            <Pressable style={styles.liveActionButton} onPress={handleExtend}>
              <View style={[styles.liveActionIcon, styles.extendIcon]}>
                <Ionicons name="add" size={20} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.liveActionText}>EXTEND</Text>
            </Pressable>

            <Pressable style={styles.liveActionButton} onPress={handleEnd}>
              <View style={[styles.liveActionIcon, styles.endIcon]}>
                <Ionicons name="stop" size={18} color={Colors.dark.orange} />
              </View>
              <Text style={styles.liveActionText}>END</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      <Animated.View style={[styles.glowBackground, pulseStyle]}>
        <View style={[styles.glowInner, { borderColor: isUrgent ? Colors.dark.error : sessionColor }]} />
      </Animated.View>

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.badges}>
            <View style={[styles.badge, styles.missionBadge]}>
              <Ionicons name="arrow-up" size={12} color={Colors.dark.text} />
              <Text style={styles.badgeText}>NEXT MISSION</Text>
            </View>
            <View style={[styles.badge, styles.statusBadge, isUrgent && styles.urgentBadge]}>
              <Text style={[styles.badgeText, isUrgent && styles.urgentText]}>
                {isUrgent ? "STARTING NOW" : "STARTING SOON"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.mainContent}>
          <View style={styles.leftSection}>
            <View style={[styles.sessionTypeBadge, { backgroundColor: sessionColor }]}>
              <Ionicons name="tennisball" size={12} color={Colors.dark.buttonText} />
              <Text style={styles.sessionTypeText}>{getSessionTypeLabel()}</Text>
            </View>

            {session.courtName ? (
              <View style={styles.infoRow}>
                <Ionicons name="location" size={14} color={Colors.dark.gold} />
                <Text style={styles.infoText}>{session.courtName}</Text>
              </View>
            ) : null}

            {session.players && session.players.length > 0 ? (
              <View style={styles.playersSection}>
                {session.players.slice(0, 3).map((player, index) => (
                  <View key={player.id} style={styles.playerRow}>
                    <View style={[styles.playerDot, { backgroundColor: sessionColor }]} />
                    <Text style={styles.playerName} numberOfLines={1}>
                      {player.name}
                    </Text>
                  </View>
                ))}
                {session.players.length > 3 ? (
                  <Text style={styles.morePlayersText}>
                    +{session.players.length - 3} more
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.rightSection}>
            <View style={styles.countdownCircle}>
              <Animated.View style={[styles.ringGlow, glowStyle, { borderColor: isUrgent ? Colors.dark.error : sessionColor }]} />
              <Svg width={circleSize} height={circleSize} style={styles.svgCircle}>
                <Circle
                  cx={circleSize / 2}
                  cy={circleSize / 2}
                  r={radius}
                  stroke={Colors.dark.backgroundTertiary}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                <Circle
                  cx={circleSize / 2}
                  cy={circleSize / 2}
                  r={radius}
                  stroke={isUrgent ? Colors.dark.error : sessionColor}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${circleSize / 2}, ${circleSize / 2}`}
                />
              </Svg>
              <View style={styles.timerContent}>
                <Text style={[styles.timerText, isUrgent && { color: Colors.dark.error }]}>
                  {formatTime(timeLeft.minutes, timeLeft.seconds)}
                </Text>
                <Text style={styles.timerLabel}>
                  {timeLeft.totalSeconds > 60 ? "min" : "sec"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.actionButton} onPress={handleCancel}>
            <View style={[styles.actionIcon, styles.cancelIcon]}>
              <Ionicons name="close" size={18} color={Colors.dark.error} />
            </View>
            <Text style={styles.actionText}>CANCEL</Text>
          </Pressable>

          <Pressable style={styles.actionButton} onPress={handleDelay}>
            <View style={[styles.actionIcon, styles.delayIcon]}>
              <Ionicons name="time-outline" size={18} color={Colors.dark.xpCyan} />
            </View>
            <Text style={styles.actionText}>DELAY</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
    position: "relative",
  },
  glowBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glowInner: {
    flex: 1,
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
  },
  liveGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  liveHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  liveIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 68, 68, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.error,
  },
  liveSessionTitle: {
    color: Colors.dark.error,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  liveMainContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  liveTimerSection: {
    flex: 1,
    alignItems: "flex-start",
  },
  liveTimerText: {
    color: Colors.dark.text,
    fontSize: 48,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
  },
  liveRemainingLabel: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: -4,
  },
  liveSessionInfo: {
    color: Colors.dark.xpCyan,
    fontSize: 13,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  liveCircleSection: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  liveCircleGlow: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255, 68, 68, 0.3)",
  },
  liveCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255, 68, 68, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.dark.error,
  },
  liveCircleText: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
  },
  liveCircleSubtext: {
    color: Colors.dark.textSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  liveActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  liveActionButton: {
    alignItems: "center",
    gap: 4,
  },
  liveActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  attendIcon: {
    backgroundColor: Colors.dark.primary,
  },
  extendIcon: {
    backgroundColor: Colors.dark.xpCyan,
  },
  endIcon: {
    backgroundColor: Colors.dark.orange,
  },
  liveActionText: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  badges: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  missionBadge: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.text,
  },
  statusBadge: {
    backgroundColor: "rgba(46, 204, 64, 0.2)",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  urgentBadge: {
    backgroundColor: "rgba(255, 68, 68, 0.2)",
    borderColor: Colors.dark.error,
  },
  badgeText: {
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  urgentText: {
    color: Colors.dark.error,
  },
  mainContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  leftSection: {
    flex: 1,
    gap: Spacing.sm,
  },
  sessionTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  sessionTypeText: {
    color: Colors.dark.buttonText,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600",
  },
  playersSection: {
    marginTop: Spacing.xs,
    gap: 4,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  playerName: {
    color: Colors.dark.text,
    fontSize: 13,
    flex: 1,
  },
  morePlayersText: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginLeft: 14,
  },
  rightSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  countdownCircle: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ringGlow: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
  },
  svgCircle: {
    position: "absolute",
  },
  timerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  timerText: {
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: -2,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  actionButton: {
    alignItems: "center",
    gap: 4,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  cancelIcon: {
    borderColor: Colors.dark.error,
    backgroundColor: "rgba(255, 68, 68, 0.1)",
  },
  delayIcon: {
    borderColor: Colors.dark.xpCyan,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
  },
  actionText: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

export default NextSessionCountdown;
