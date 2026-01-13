import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
  interpolateColor,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { GlassCard } from "./GlassCard";
import { GlowAvatar } from "./GlowAvatar";
import { ProTennisColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { usePlayerState } from "../context/PlayerStateContext";

interface SessionHeroCardProps {
  onCheckIn?: () => void;
  onCancel?: () => void;
  onExtend?: () => void;
  onBookSession?: () => void;
  onFindMatch?: () => void;
}

export function SessionHeroCard({
  onCheckIn,
  onCancel,
  onExtend,
  onBookSession,
  onFindMatch,
}: SessionHeroCardProps) {
  const navigation = useNavigation<any>();
  const { state } = usePlayerState();
  const { sessionStatus, minutesToNextSession, coachName } = state;

  const pulseValue = useSharedValue(0);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (sessionStatus === "soon" || sessionStatus === "live") {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0, { duration: 1000 })
        ),
        -1,
        true
      );
    }
  }, [sessionStatus, pulseValue]);

  useEffect(() => {
    if (minutesToNextSession && minutesToNextSession > 0) {
      const totalSeconds = minutesToNextSession * 60;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      setCountdown({ hours, minutes, seconds });

      const interval = setInterval(() => {
        setCountdown(prev => {
          let newSeconds = prev.seconds - 1;
          let newMinutes = prev.minutes;
          let newHours = prev.hours;

          if (newSeconds < 0) {
            newSeconds = 59;
            newMinutes -= 1;
          }
          if (newMinutes < 0) {
            newMinutes = 59;
            newHours -= 1;
          }
          if (newHours < 0) {
            return { hours: 0, minutes: 0, seconds: 0 };
          }

          return { hours: newHours, minutes: newMinutes, seconds: newSeconds };
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [minutesToNextSession]);

  const livePulseStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      pulseValue.value,
      [0, 1],
      [ProTennisColors.live, "#FF6666"]
    );
    return { backgroundColor };
  });

  const handleBookSession = () => {
    if (onBookSession) {
      onBookSession();
    } else {
      navigation.navigate("CourtBooking");
    }
  };

  const handleFindMatch = () => {
    if (onFindMatch) {
      onFindMatch();
    } else {
      navigation.navigate("PlayerFinder");
    }
  };

  if (sessionStatus === "none") {
    return (
      <GlassCard variant="hero" style={styles.heroCard}>
        <View style={styles.noSessionContent}>
          <View style={styles.courtVisual}>
            <LinearGradient
              colors={["rgba(204, 255, 0, 0.1)", "rgba(0, 0, 0, 0)"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.spotlightGradient}
            />
            <Feather name="target" size={48} color={ProTennisColors.electricGreen} />
          </View>
          
          <Text style={styles.offSeasonTitle}>TRAINING TIME</Text>
          <Text style={styles.offSeasonSubtitle}>Book a session or find a match</Text>

          <View style={styles.actionButtonsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleBookSession}
            >
              <Feather name="calendar" size={18} color={ProTennisColors.midnightBlue} />
              <Text style={styles.primaryButtonText}>HIT THE COURT</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleFindMatch}
            >
              <Feather name="users" size={18} color={ProTennisColors.neonCyan} />
              <Text style={styles.secondaryButtonText}>FIND MATCH</Text>
            </Pressable>
          </View>
        </View>
      </GlassCard>
    );
  }

  if (sessionStatus === "live") {
    return (
      <GlassCard variant="neon" neonColor={ProTennisColors.electricGreen} animated style={styles.heroCard}>
        <View style={styles.liveContent}>
          <View style={styles.liveHeader}>
            <View style={styles.liveIndicatorRow}>
              <Animated.View style={[styles.liveDot, livePulseStyle]} />
              <Text style={styles.liveText}>LIVE NOW</Text>
            </View>
            <Text style={styles.liveTimer}>
              {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
            </Text>
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              name={coachName || "Coach"}
              size="lg"
              showGlow
              glowColor={ProTennisColors.electricGreen}
              pulsing
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionType}>Private Training</Text>
              <Text style={styles.coachLabel}>with {coachName || "Your Coach"}</Text>
            </View>
          </View>

          <View style={styles.liveButtonsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.liveButton,
                styles.endButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={onExtend}
            >
              <Feather name="plus-circle" size={18} color={ProTennisColors.white} />
              <Text style={styles.liveButtonText}>EXTEND</Text>
            </Pressable>
          </View>
        </View>
      </GlassCard>
    );
  }

  if (sessionStatus === "soon" || sessionStatus === "upcoming") {
    const isSoon = sessionStatus === "soon";
    
    return (
      <GlassCard 
        variant={isSoon ? "neon" : "default"} 
        neonColor={isSoon ? ProTennisColors.warning : undefined}
        animated={isSoon}
        style={styles.heroCard}
      >
        <View style={styles.upcomingContent}>
          <View style={styles.upcomingHeader}>
            <Text style={styles.upcomingLabel}>NEXT SESSION</Text>
            {isSoon && (
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>SOON</Text>
              </View>
            )}
          </View>

          <View style={styles.countdownContainer}>
            <View style={styles.countdownBox}>
              <Text style={styles.countdownNumber}>{String(countdown.hours).padStart(2, "0")}</Text>
              <Text style={styles.countdownLabel}>HRS</Text>
            </View>
            <Text style={styles.countdownSeparator}>:</Text>
            <View style={styles.countdownBox}>
              <Text style={styles.countdownNumber}>{String(countdown.minutes).padStart(2, "0")}</Text>
              <Text style={styles.countdownLabel}>MIN</Text>
            </View>
            <Text style={styles.countdownSeparator}>:</Text>
            <View style={styles.countdownBox}>
              <Text style={styles.countdownNumber}>{String(countdown.seconds).padStart(2, "0")}</Text>
              <Text style={styles.countdownLabel}>SEC</Text>
            </View>
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              name={coachName || "Coach"}
              size="md"
              showGlow={isSoon}
              glowColor={isSoon ? ProTennisColors.warning : ProTennisColors.electricGreen}
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionType}>Private Training</Text>
              <Text style={styles.coachLabel}>with {coachName || "Your Coach"}</Text>
              <Text style={styles.courtInfo}>Maple Court</Text>
            </View>
          </View>

          <View style={styles.upcomingButtonsRow}>
            {isSoon && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.checkInButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={onCheckIn}
              >
                <Feather name="check-circle" size={18} color={ProTennisColors.midnightBlue} />
                <Text style={styles.checkInButtonText}>CHECK IN</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={onCancel}
            >
              <Feather name="x-circle" size={18} color={ProTennisColors.danger} />
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </Pressable>
          </View>
        </View>
      </GlassCard>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  heroCard: {
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
  },
  noSessionContent: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  courtVisual: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  spotlightGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  offSeasonTitle: {
    ...Typography.h2,
    color: ProTennisColors.white,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  offSeasonSubtitle: {
    ...Typography.small,
    color: ProTennisColors.textMuted,
    marginBottom: Spacing.xl,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  primaryButton: {
    backgroundColor: ProTennisColors.electricGreen,
  },
  primaryButtonText: {
    color: ProTennisColors.midnightBlue,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: ProTennisColors.neonCyan,
  },
  secondaryButtonText: {
    color: ProTennisColors.neonCyan,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  liveContent: {
    padding: Spacing.sm,
  },
  liveHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  liveIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ProTennisColors.live,
  },
  liveText: {
    color: ProTennisColors.live,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 1,
  },
  liveTimer: {
    ...Typography.numberLarge,
    color: ProTennisColors.white,
    fontVariant: ["tabular-nums"],
  },
  sessionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sessionDetails: {
    flex: 1,
  },
  sessionType: {
    ...Typography.h3,
    color: ProTennisColors.white,
    marginBottom: Spacing.xs,
  },
  coachLabel: {
    ...Typography.small,
    color: ProTennisColors.textSecondary,
  },
  courtInfo: {
    ...Typography.caption,
    color: ProTennisColors.textMuted,
    marginTop: Spacing.xs,
  },
  liveButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  liveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  endButton: {
    backgroundColor: ProTennisColors.surfaceElevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  liveButtonText: {
    color: ProTennisColors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  upcomingContent: {
    padding: Spacing.sm,
  },
  upcomingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  upcomingLabel: {
    ...Typography.labelSmall,
    color: ProTennisColors.textMuted,
    letterSpacing: 1.5,
  },
  soonBadge: {
    backgroundColor: `${ProTennisColors.warning}30`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: ProTennisColors.warning,
  },
  soonBadgeText: {
    color: ProTennisColors.warning,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 1,
  },
  countdownContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  countdownBox: {
    alignItems: "center",
    minWidth: 60,
  },
  countdownNumber: {
    ...Typography.numberLarge,
    fontSize: 42,
    color: ProTennisColors.white,
    fontVariant: ["tabular-nums"],
  },
  countdownLabel: {
    ...Typography.labelSmall,
    color: ProTennisColors.textMuted,
    marginTop: -4,
  },
  countdownSeparator: {
    ...Typography.numberLarge,
    fontSize: 32,
    color: ProTennisColors.textMuted,
    marginHorizontal: Spacing.sm,
  },
  upcomingButtonsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "center",
  },
  checkInButton: {
    backgroundColor: ProTennisColors.electricGreen,
  },
  checkInButtonText: {
    color: ProTennisColors.midnightBlue,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: `${ProTennisColors.danger}50`,
  },
  cancelButtonText: {
    color: ProTennisColors.danger,
    fontWeight: "600",
    fontSize: 14,
  },
});
