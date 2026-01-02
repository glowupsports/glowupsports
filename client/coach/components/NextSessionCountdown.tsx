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
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

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
}

export function NextSessionCountdown({
  session,
  onCancel,
  onDelay,
  onPress,
}: NextSessionCountdownProps) {
  const [timeLeft, setTimeLeft] = useState({ minutes: 0, seconds: 0, totalSeconds: 0 });
  const pulseAnim = useSharedValue(0);
  const ringGlow = useSharedValue(0);

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
  }, []);

  const calculateTimeLeft = useCallback(() => {
    const now = new Date();
    const start = new Date(session.startTime);
    const diffMs = start.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return { minutes: 0, seconds: 0, totalSeconds: 0 };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return { minutes, seconds, totalSeconds };
  }, [session.startTime]);

  useEffect(() => {
    const updateTime = () => {
      setTimeLeft(calculateTimeLeft());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, [calculateTimeLeft]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnim.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 1.08]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: ringGlow.value,
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
  const isUrgent = timeLeft.totalSeconds <= 300;
  const isStartingSoon = timeLeft.totalSeconds <= 1800;
  
  const circleSize = 100;
  const strokeWidth = 6;
  const radius = (circleSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const maxSeconds = 1800;
  const progress = Math.min(timeLeft.totalSeconds / maxSeconds, 1);
  const strokeDashoffset = circumference * (1 - progress);

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCancel?.();
  };

  const handleDelay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDelay?.();
  };

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
              <Ionicons name="tennisball" size={12} color="#000" />
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
  content: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
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
    color: "#000",
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
