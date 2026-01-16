import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, Alert, Platform } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
  interpolateColor,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "./GlassCard";
import { GlowAvatar } from "./GlowAvatar";
import { ProTennisColors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors, Colors } from "@/constants/theme";
import { usePlayerState } from "../context/PlayerStateContext";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

interface SessionHeroCardProps {
  onCheckIn?: () => void;
  onCancel?: () => void;
  onExtend?: () => void;
  onBookSession?: () => void;
  onFindMatch?: () => void;
}

const ISSUE_TYPES = [
  { id: "equipment", label: "Equipment issue", icon: "tool" as const },
  { id: "court", label: "Court problem", icon: "grid" as const },
  { id: "safety", label: "Safety concern", icon: "alert-triangle" as const },
  { id: "coach", label: "Coaching feedback", icon: "user" as const },
  { id: "other", label: "Other issue", icon: "more-horizontal" as const },
];

const CANCEL_REASONS = [
  { id: "sick", label: "Feeling unwell", icon: "thermometer" as const },
  { id: "schedule_conflict", label: "Schedule conflict", icon: "calendar" as const },
  { id: "family_event", label: "Family event", icon: "users" as const },
  { id: "work_trip", label: "Work/School trip", icon: "briefcase" as const },
  { id: "other", label: "Other reason", icon: "more-horizontal" as const },
];

const LATE_MINUTES_OPTIONS = [5, 10, 15, 20, 30];

function GradientCountdownDigit({ value, label }: { value: number; label: string }) {
  const shimmerValue = useSharedValue(0);
  
  useEffect(() => {
    shimmerValue.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, [shimmerValue]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + shimmerValue.value * 0.2,
  }));

  return (
    <View style={gamingStyles.countdownDigitBox}>
      <LinearGradient
        colors={[ProTennisColors.neonCyan, ProTennisColors.electricGreen, ProTennisColors.neonCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={gamingStyles.countdownGradientBg}
      >
        <Animated.View style={[gamingStyles.countdownShimmer, shimmerStyle]} />
        <Text style={gamingStyles.countdownDigitValue}>
          {String(value).padStart(2, "0")}
        </Text>
      </LinearGradient>
      <Text style={gamingStyles.countdownDigitLabel}>{label}</Text>
    </View>
  );
}

function AnimatedStakeCard({ icon, text, color, positive = true }: { icon: string; text: string; color: string; positive?: boolean }) {
  const glowPulse = useSharedValue(0.3);
  const scaleValue = useSharedValue(1);
  
  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1500 }),
        withTiming(0.3, { duration: 1500 })
      ),
      -1,
      true
    );
  }, [glowPulse]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowPulse.value,
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Animated.View style={[gamingStyles.stakeCard, { shadowColor: color }, glowStyle]}>
      <LinearGradient
        colors={[`${color}20`, `${color}08`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={gamingStyles.stakeCardGradient}
      >
        <View style={[gamingStyles.stakeIconGlow, { backgroundColor: `${color}30` }]}>
          <Feather name={icon as any} size={16} color={color} />
        </View>
        <Text style={[gamingStyles.stakeCardText, { color: positive ? color : ProTennisColors.textPrimary }]}>
          {text}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

function NeonBorderGlow({ color, children, style }: { color: string; children: React.ReactNode; style?: any }) {
  const glowValue = useSharedValue(0.4);
  
  useEffect(() => {
    glowValue.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1200 }),
        withTiming(0.4, { duration: 1200 })
      ),
      -1,
      true
    );
  }, [glowValue]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowValue.value,
  }));

  return (
    <Animated.View
      style={[
        gamingStyles.neonBorderContainer,
        {
          shadowColor: color,
          borderColor: color,
        },
        animatedGlowStyle,
        style,
      ]}
    >
      <LinearGradient
        colors={[`${color}15`, `${color}05`, `${color}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={gamingStyles.neonBorderInner}
      >
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

const gamingStyles = StyleSheet.create({
  countdownDigitBox: {
    alignItems: "center",
    marginHorizontal: Spacing.xs,
  },
  countdownGradientBg: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  countdownShimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  countdownDigitValue: {
    fontSize: 48,
    fontWeight: "900",
    color: ProTennisColors.midnightBlue,
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  countdownDigitLabel: {
    marginTop: Spacing.xs,
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  countdownSeparatorText: {
    fontSize: 40,
    fontWeight: "300",
    color: ProTennisColors.neonCyan,
    alignSelf: "center",
    marginBottom: 20,
    opacity: 0.7,
  },
  stakeCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 6,
    flex: 1,
  },
  stakeCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  stakeIconGlow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stakeCardText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  neonBorderContainer: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    elevation: 8,
  },
  neonBorderInner: {
    borderRadius: BorderRadius.lg - 2,
    overflow: "hidden",
  },
});

export function SessionHeroCard({
  onCheckIn,
  onCancel,
  onExtend,
  onBookSession,
  onFindMatch,
}: SessionHeroCardProps) {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { state } = usePlayerState();
  const { sessionStatus, minutesToNextSession, minutesRemaining, coachName, sessionCourtName, sessionType, coachPhotoUrl, sessionId } = state;

  const pulseValue = useSharedValue(0);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedIssueType, setSelectedIssueType] = useState<string | null>(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showLateModal, setShowLateModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState("");
  const [lateMinutes, setLateMinutes] = useState(10);
  const [lateMessage, setLateMessage] = useState("");

  const reportIssueMutation = useMutation({
    mutationFn: async ({ issueType, description }: { issueType: string; description: string }) => {
      return apiRequest("POST", `/api/player/me/sessions/${sessionId}/report-issue`, { issueType, description });
    },
    onSuccess: () => {
      setShowReportModal(false);
      setSelectedIssueType(null);
      setIssueDescription("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Issue Reported", "Your coach will be notified about this issue.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to report issue");
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: async ({ reason, reasonText }: { reason: string; reasonText?: string }) => {
      return apiRequest("POST", `/api/player/me/sessions/${sessionId}/cancel`, { reason, reasonText });
    },
    onSuccess: (response: any) => {
      setShowCancelModal(false);
      setCancelReason(null);
      setCancelReasonText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      if (onCancel) {
        onCancel();
      }
      Alert.alert(
        "Session Cancelled",
        response?.isLateCancellation 
          ? "This counts as a late cancellation. -50 XP"
          : "Your session has been cancelled."
      );
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to cancel session");
    },
  });

  const notifyLateMutation = useMutation({
    mutationFn: async ({ minutes, message }: { minutes: number; message?: string }) => {
      return apiRequest("POST", `/api/player/me/sessions/${sessionId}/late`, { minutes, message });
    },
    onSuccess: () => {
      setShowLateModal(false);
      setLateMinutes(10);
      setLateMessage("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      Alert.alert("Coach Notified", "Your coach has been notified that you're running late.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to notify coach");
    },
  });

  const handleReportSubmit = () => {
    if (!sessionId) {
      Alert.alert("Error", "No active session found. Please try again.");
      return;
    }
    if (!selectedIssueType) {
      Alert.alert("Select Issue Type", "Please select the type of issue you're experiencing.");
      return;
    }
    reportIssueMutation.mutate({ issueType: selectedIssueType, description: issueDescription });
  };

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
    // For live sessions, use minutesRemaining (time until session ends)
    // For upcoming sessions, use minutesToNextSession (time until session starts)
    const timeToUse = sessionStatus === "live" ? minutesRemaining : minutesToNextSession;
    
    if (timeToUse && timeToUse > 0) {
      const totalSeconds = timeToUse * 60;
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
  }, [sessionStatus, minutesToNextSession, minutesRemaining]);

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

  const handleJoinOpenGroup = () => {
    navigation.navigate("OpenMatchFeed");
  };

  const handleCheckIn = () => {
    if (onCheckIn) {
      onCheckIn();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Checked In", "You're checked in for this session!");
    }
  };

  const handleExtend = () => {
    if (onExtend) {
      onExtend();
    } else {
      Alert.alert("Extend Session", "Contact your coach to extend this session.");
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCancelModal(true);
  };

  const handleCancelSubmit = () => {
    if (!sessionId) {
      Alert.alert("Error", "No active session found.");
      return;
    }
    if (!cancelReason) {
      Alert.alert("Select Reason", "Please select a reason for cancellation.");
      return;
    }
    if (cancelReason === "other" && !cancelReasonText.trim()) {
      Alert.alert("Enter Reason", "Please explain why you need to cancel.");
      return;
    }
    cancelSessionMutation.mutate({ reason: cancelReason, reasonText: cancelReasonText });
  };

  const handleLate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLateModal(true);
  };

  const handleLateSubmit = () => {
    if (!sessionId) {
      Alert.alert("Error", "No active session found.");
      return;
    }
    if (!lateMinutes || lateMinutes < 1) {
      Alert.alert("Select Time", "Please select how late you'll be.");
      return;
    }
    notifyLateMutation.mutate({ minutes: lateMinutes, message: lateMessage });
  };

  if (sessionStatus === "none") {
    return (
      <NeonBorderGlow color={ProTennisColors.electricGreen} style={styles.heroCard}>
        <View style={styles.noSessionContent}>
          <View style={styles.openDayHeader}>
            <LinearGradient
              colors={[`${ProTennisColors.electricGreen}30`, `${ProTennisColors.electricGreen}10`]}
              style={styles.openDayIconContainer}
            >
              <Feather name="sun" size={32} color={ProTennisColors.electricGreen} />
            </LinearGradient>
            <View style={styles.openDayTextContainer}>
              <Text style={styles.openDayTitleGlow}>TODAY IS OPEN</Text>
              <Text style={styles.openDaySubtitle}>No sessions scheduled - make it count!</Text>
            </View>
          </View>

          <View style={styles.gamingStakesRow}>
            <AnimatedStakeCard 
              icon="zap" 
              text="+50 XP for booking" 
              color={ProTennisColors.warning} 
              positive
            />
            <AnimatedStakeCard 
              icon="trending-up" 
              text="Keep streak alive" 
              color={ProTennisColors.electricGreen} 
              positive
            />
          </View>

          <View style={styles.openDayActions}>
            <View style={styles.bookingButtonsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.gamingPrimaryButtonHalf,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleBookSession}
              >
                <LinearGradient
                  colors={[ProTennisColors.electricGreen, `${ProTennisColors.electricGreen}CC`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gamingButtonGradientFill}
                >
                  <Feather name="calendar" size={18} color={ProTennisColors.midnightBlue} />
                  <Text style={styles.gamingPrimaryButtonText}>BOOK LESSON</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.gamingPrimaryButtonHalf,
                  { shadowColor: ProTennisColors.neonCyan },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => navigation.navigate("CourtBooking")}
              >
                <LinearGradient
                  colors={[ProTennisColors.neonCyan, `${ProTennisColors.neonCyan}CC`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gamingButtonGradientFill}
                >
                  <Feather name="grid" size={18} color={ProTennisColors.midnightBlue} />
                  <Text style={styles.gamingPrimaryButtonText}>BOOK COURT</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <View style={styles.openDaySecondaryRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.gamingSecondaryButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleFindMatch}
              >
                <Feather name="users" size={16} color={ProTennisColors.neonCyan} />
                <Text style={[styles.gamingSecondaryButtonText, { color: ProTennisColors.neonCyan }]}>FIND PLAYERS</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.gamingSecondaryButton,
                  { borderColor: `${ProTennisColors.electricGreen}50` },
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleJoinOpenGroup}
              >
                <Feather name="play-circle" size={16} color={ProTennisColors.electricGreen} />
                <Text style={[styles.gamingSecondaryButtonText, { color: ProTennisColors.electricGreen }]}>JOIN OPEN GROUP</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </NeonBorderGlow>
    );
  }

  if (false as boolean) {
    return (
      <GlassCard variant="hero" style={styles.heroCard}>
        <View style={styles.noSessionContent}>
          <View style={styles.openDayHeader}>
            <View style={styles.openDayIconContainer}>
              <Feather name="sun" size={32} color={ProTennisColors.electricGreen} />
            </View>
            <View style={styles.openDayTextContainer}>
              <Text style={styles.openDayTitle}>TODAY IS OPEN</Text>
              <Text style={styles.openDaySubtitle}>No sessions scheduled - make it count!</Text>
            </View>
          </View>

          <View style={styles.openDayStakes}>
            <View style={styles.stakeItem}>
              <Feather name="zap" size={14} color={ProTennisColors.warning} />
              <Text style={styles.stakeText}>+50 XP for booking</Text>
            </View>
            <View style={styles.stakeItem}>
              <Feather name="trending-up" size={14} color={ProTennisColors.electricGreen} />
              <Text style={styles.stakeText}>Keep your streak alive</Text>
            </View>
          </View>

          <View style={styles.openDayActions}>
            <Pressable
              style={({ pressed }) => [
                styles.openDayButton,
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleBookSession}
            >
              <Feather name="calendar" size={18} color={ProTennisColors.midnightBlue} />
              <Text style={styles.primaryButtonText}>BOOK SESSION</Text>
            </Pressable>

            <View style={styles.openDaySecondaryRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.openDaySmallButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleFindMatch}
              >
                <Feather name="users" size={16} color={ProTennisColors.neonCyan} />
                <Text style={styles.openDaySmallButtonText}>FIND PLAYERS</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.openDaySmallButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleJoinOpenGroup}
              >
                <Feather name="play-circle" size={16} color={ProTennisColors.electricGreen} />
                <Text style={[styles.openDaySmallButtonText, { color: ProTennisColors.electricGreen }]}>JOIN OPEN GROUP</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </GlassCard>
    );
  }

  if (sessionStatus === "live") {
    return (
      <NeonBorderGlow color={ProTennisColors.live} style={styles.heroCard}>
        <View style={styles.liveContent}>
          <View style={styles.liveHeader}>
            <View style={styles.liveIndicatorRow}>
              <Animated.View style={[styles.liveDot, livePulseStyle]} />
              <Text style={styles.liveTextGlow}>LIVE NOW</Text>
            </View>
            <View style={styles.liveTimerContainer}>
              <Text style={styles.liveTimerLabel}>TIME LEFT</Text>
              <View style={styles.liveCountdownRow}>
                <GradientCountdownDigit value={countdown.hours} label="HRS" />
                <Text style={gamingStyles.countdownSeparatorText}>:</Text>
                <GradientCountdownDigit value={countdown.minutes} label="MIN" />
                <Text style={gamingStyles.countdownSeparatorText}>:</Text>
                <GradientCountdownDigit value={countdown.seconds} label="SEC" />
              </View>
            </View>
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              source={coachPhotoUrl}
              name={coachName || "Coach"}
              size="lg"
              showGlow
              glowColor={ProTennisColors.live}
              pulsing
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionTypeGlow}>{sessionType || "Training"}</Text>
              <Text style={styles.coachLabel}>with {coachName || "Your Coach"}</Text>
              {sessionCourtName && (
                <Text style={styles.courtLabel}>{sessionCourtName}</Text>
              )}
            </View>
          </View>

          <View style={styles.gamingStakesRow}>
            <AnimatedStakeCard 
              icon="eye" 
              text="Coach tracking progress" 
              color={ProTennisColors.neonCyan} 
              positive
            />
            <AnimatedStakeCard 
              icon="zap" 
              text="+100 XP completion" 
              color={ProTennisColors.electricGreen} 
              positive
            />
          </View>

          <View style={styles.liveButtonsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.liveButton,
                styles.attendButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCheckIn}
            >
              <Feather name="check-circle" size={18} color={ProTennisColors.midnightBlue} />
              <Text style={styles.attendButtonText}>ATTEND</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.liveButton,
                styles.extendButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleExtend}
            >
              <Feather name="plus-circle" size={18} color={ProTennisColors.neonCyan} />
              <Text style={[styles.liveButtonText, { color: ProTennisColors.neonCyan }]}>EXTEND</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.liveButton,
                styles.reportButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowReportModal(true);
              }}
            >
              <Feather name="alert-circle" size={18} color={ProTennisColors.warning} />
              <Text style={[styles.liveButtonText, { color: ProTennisColors.warning }]}>REPORT</Text>
            </Pressable>
          </View>

          <View style={styles.sessionActionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.sessionActionButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCancel}
            >
              <View style={[styles.actionGlow, { backgroundColor: ProTennisColors.danger + "15" }]}>
                <Feather name="x-circle" size={20} color={ProTennisColors.danger} />
              </View>
              <Text style={[styles.actionLabel, { color: ProTennisColors.danger }]}>CANCEL</Text>
            </Pressable>
            <View style={styles.actionDivider} />
            <Pressable
              style={({ pressed }) => [
                styles.sessionActionButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleLate}
            >
              <View style={[styles.actionGlow, { backgroundColor: ProTennisColors.warning + "15" }]}>
                <Feather name="clock" size={20} color={ProTennisColors.warning} />
              </View>
              <Text style={[styles.actionLabel, { color: ProTennisColors.warning }]}>DELAY</Text>
            </Pressable>
          </View>

          {/* Report Issue Modal */}
          <Modal
            visible={showReportModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowReportModal(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowReportModal(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Report Issue</Text>
                    <Pressable onPress={() => setShowReportModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <Text style={styles.modalSubtitle}>What's the issue?</Text>
                  <View style={styles.issueTypesContainer}>
                    {ISSUE_TYPES.map((type) => (
                      <Pressable
                        key={type.id}
                        style={[
                          styles.issueTypeButton,
                          selectedIssueType === type.id && styles.issueTypeButtonSelected,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedIssueType(type.id);
                        }}
                      >
                        <Feather
                          name={type.icon}
                          size={18}
                          color={selectedIssueType === type.id ? ProTennisColors.danger : ProTennisColors.textMuted}
                        />
                        <Text
                          style={[
                            styles.issueTypeText,
                            selectedIssueType === type.id && styles.issueTypeTextSelected,
                          ]}
                        >
                          {type.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.modalSubtitle}>Details (optional)</Text>
                  <TextInput
                    style={styles.issueInput}
                    placeholder="Describe the issue..."
                    placeholderTextColor={ProTennisColors.textMuted}
                    multiline
                    numberOfLines={3}
                    value={issueDescription}
                    onChangeText={setIssueDescription}
                  />

                  <View style={styles.modalButtonsRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => setShowReportModal(false)}
                    >
                      <Text style={styles.modalCancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalSubmitButton, !sessionId && styles.modalButtonDisabled]}
                      onPress={handleReportSubmit}
                      disabled={reportIssueMutation.isPending || !sessionId}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {reportIssueMutation.isPending ? "Sending..." : "Report Issue"}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Cancel Session Modal */}
          <Modal
            visible={showCancelModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCancelModal(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowCancelModal(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Cancel Session?</Text>
                    <Pressable onPress={() => setShowCancelModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <View style={styles.policySection}>
                    <Text style={styles.policySectionTitle}>CANCELLATION POLICY</Text>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.electricGreen + "20" }]}>
                        <Feather name="check-circle" size={14} color={ProTennisColors.electricGreen} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>24+ hours before</Text>
                        <Text style={styles.policyRuleDesc}>Free cancellation - No charge</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.warning + "20" }]}>
                        <Feather name="alert-circle" size={14} color={ProTennisColors.warning} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>2-24 hours before</Text>
                        <Text style={styles.policyRuleDesc}>50% session fee charged, -25 XP</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.danger + "20" }]}>
                        <Feather name="x-circle" size={14} color={ProTennisColors.danger} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>Less than 2 hours</Text>
                        <Text style={styles.policyRuleDesc}>100% session fee charged, -50 XP</Text>
                      </View>
                    </View>
                    
                    {minutesToNextSession !== undefined && minutesToNextSession < 120 && (
                      <View style={styles.currentPenaltyNotice}>
                        <Feather name="alert-triangle" size={16} color={ProTennisColors.danger} />
                        <Text style={styles.currentPenaltyText}>
                          Cancelling now = Full payment + -50 XP
                        </Text>
                      </View>
                    )}
                    {minutesToNextSession !== undefined && minutesToNextSession >= 120 && minutesToNextSession < 1440 && (
                      <View style={styles.partialPenaltyNotice}>
                        <Feather name="alert-circle" size={16} color={ProTennisColors.warning} />
                        <Text style={styles.partialPenaltyText}>
                          Cancelling now = 50% payment + -25 XP
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.modalSubtitle}>Reason for cancellation</Text>
                  <View style={styles.issueTypesContainer}>
                    {CANCEL_REASONS.map((reason) => (
                      <Pressable
                        key={reason.id}
                        style={[
                          styles.issueTypeButton,
                          cancelReason === reason.id && styles.issueTypeButtonSelected,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setCancelReason(reason.id);
                        }}
                      >
                        <Feather
                          name={reason.icon}
                          size={18}
                          color={cancelReason === reason.id ? ProTennisColors.danger : ProTennisColors.textMuted}
                        />
                        <Text
                          style={[
                            styles.issueTypeText,
                            cancelReason === reason.id && styles.issueTypeTextSelected,
                          ]}
                        >
                          {reason.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {cancelReason === "other" && (
                    <>
                      <Text style={styles.modalSubtitle}>Please explain</Text>
                      <TextInput
                        style={styles.issueInput}
                        placeholder="Why do you need to cancel?"
                        placeholderTextColor={ProTennisColors.textMuted}
                        multiline
                        numberOfLines={2}
                        value={cancelReasonText}
                        onChangeText={setCancelReasonText}
                      />
                    </>
                  )}

                  <View style={styles.modalButtonsRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => { setShowCancelModal(false); setCancelReason(null); setCancelReasonText(""); }}
                    >
                      <Text style={styles.modalCancelButtonText}>Never Mind</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalDangerButton, !cancelReason && styles.modalButtonDisabled]}
                      onPress={handleCancelSubmit}
                      disabled={cancelSessionMutation.isPending || !cancelReason}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {cancelSessionMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Running Late Modal */}
          <Modal
            visible={showLateModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowLateModal(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowLateModal(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Feather name="clock" size={24} color={ProTennisColors.warning} />
                      <Text style={styles.modalTitle}>Running Late?</Text>
                    </View>
                    <Pressable onPress={() => setShowLateModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <Text style={styles.lateModalDescription}>
                    Let your coach know you're on the way. How late will you be?
                  </Text>
                  
                  <View style={styles.lateMinutesPicker}>
                    {LATE_MINUTES_OPTIONS.map((mins) => (
                      <Pressable
                        key={mins}
                        style={[
                          styles.lateMinutesOption,
                          lateMinutes === mins && styles.lateMinutesOptionSelected,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setLateMinutes(mins);
                        }}
                      >
                        <Text
                          style={[
                            styles.lateMinutesText,
                            lateMinutes === mins && styles.lateMinutesTextSelected,
                          ]}
                        >
                          {mins} min
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.modalSubtitle}>Message (optional)</Text>
                  <TextInput
                    style={styles.issueInput}
                    placeholder="e.g. Traffic, will be there soon!"
                    placeholderTextColor={ProTennisColors.textMuted}
                    value={lateMessage}
                    onChangeText={setLateMessage}
                  />

                  <View style={styles.modalButtonsRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => setShowLateModal(false)}
                    >
                      <Text style={styles.modalCancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalWarningButton]}
                      onPress={handleLateSubmit}
                      disabled={notifyLateMutation.isPending}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {notifyLateMutation.isPending ? "Notifying..." : "Notify Coach"}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      </NeonBorderGlow>
    );
  }

  if (sessionStatus === "soon" || sessionStatus === "upcoming") {
    const isSoon = sessionStatus === "soon";
    const borderColor = isSoon ? ProTennisColors.warning : ProTennisColors.neonCyan;
    
    return (
      <NeonBorderGlow color={borderColor} style={styles.heroCard}>
        <View style={styles.upcomingContent}>
          <View style={styles.upcomingHeader}>
            <View style={[styles.nextSessionBadgeGaming, { borderColor: `${borderColor}50` }]}>
              <Feather name="clock" size={14} color={borderColor} />
              <Text style={[styles.nextSessionTextGlow, { color: borderColor, textShadowColor: borderColor }]}>
                {isSoon ? "STARTING SOON" : "NEXT SESSION"}
              </Text>
            </View>
            {isSoon && (
              <Animated.View style={[styles.soonPulse, livePulseStyle]} />
            )}
          </View>

          <View style={styles.gamingCountdownRow}>
            <GradientCountdownDigit value={countdown.hours} label="HRS" />
            <Text style={gamingStyles.countdownSeparatorText}>:</Text>
            <GradientCountdownDigit value={countdown.minutes} label="MIN" />
            <Text style={gamingStyles.countdownSeparatorText}>:</Text>
            <GradientCountdownDigit value={countdown.seconds} label="SEC" />
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              source={coachPhotoUrl}
              name={coachName || "Coach"}
              size="lg"
              showGlow
              glowColor={borderColor}
              pulsing={isSoon}
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionTypeGlow}>{sessionType || "Training Session"}</Text>
              <Text style={styles.coachLabel}>with {coachName || "Your Coach"}</Text>
              {sessionCourtName && (
                <Text style={styles.courtLabel}>{sessionCourtName}</Text>
              )}
            </View>
          </View>

          <View style={styles.upcomingStakes}>
            <Text style={styles.stakesTitle}>WHAT'S AT STAKE</Text>
            <View style={styles.gamingStakesRow}>
              <AnimatedStakeCard icon="zap" text="+75 XP Attendance" color={ProTennisColors.electricGreen} positive />
              <AnimatedStakeCard icon="trending-up" text="Level Progress" color={ProTennisColors.neonCyan} positive />
            </View>
          </View>

          {isSoon && (
            <Pressable
              style={({ pressed }) => [
                styles.gamingPrimaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCheckIn}
            >
              <LinearGradient
                colors={[ProTennisColors.electricGreen, `${ProTennisColors.electricGreen}CC`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gamingButtonGradient}
              >
                <Feather name="check-circle" size={20} color={ProTennisColors.midnightBlue} />
                <Text style={styles.gamingPrimaryButtonText}>CHECK IN EARLY</Text>
              </LinearGradient>
            </Pressable>
          )}

          <View style={styles.sessionActionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.sessionActionButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCancel}
            >
              <View style={[styles.actionGlow, { backgroundColor: ProTennisColors.danger + "15" }]}>
                <Feather name="x-circle" size={20} color={ProTennisColors.danger} />
              </View>
              <Text style={[styles.actionLabel, { color: ProTennisColors.danger }]}>CANCEL</Text>
            </Pressable>
            <View style={styles.actionDivider} />
            <Pressable
              style={({ pressed }) => [
                styles.sessionActionButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleLate}
            >
              <View style={[styles.actionGlow, { backgroundColor: ProTennisColors.warning + "15" }]}>
                <Feather name="clock" size={20} color={ProTennisColors.warning} />
              </View>
              <Text style={[styles.actionLabel, { color: ProTennisColors.warning }]}>DELAY</Text>
            </Pressable>
          </View>

          {/* Cancel Session Modal */}
          <Modal
            visible={showCancelModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCancelModal(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowCancelModal(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Cancel Session?</Text>
                    <Pressable onPress={() => setShowCancelModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <View style={styles.policySection}>
                    <Text style={styles.policySectionTitle}>CANCELLATION POLICY</Text>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.electricGreen + "20" }]}>
                        <Feather name="check-circle" size={14} color={ProTennisColors.electricGreen} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>24+ hours before</Text>
                        <Text style={styles.policyRuleDesc}>Free cancellation - No charge</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.warning + "20" }]}>
                        <Feather name="alert-circle" size={14} color={ProTennisColors.warning} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>2-24 hours before</Text>
                        <Text style={styles.policyRuleDesc}>50% session fee charged, -25 XP</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.danger + "20" }]}>
                        <Feather name="x-circle" size={14} color={ProTennisColors.danger} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>Less than 2 hours</Text>
                        <Text style={styles.policyRuleDesc}>100% session fee charged, -50 XP</Text>
                      </View>
                    </View>
                    
                    {minutesToNextSession !== undefined && minutesToNextSession < 120 && (
                      <View style={styles.currentPenaltyNotice}>
                        <Feather name="alert-triangle" size={16} color={ProTennisColors.danger} />
                        <Text style={styles.currentPenaltyText}>
                          Cancelling now = Full payment + -50 XP
                        </Text>
                      </View>
                    )}
                    {minutesToNextSession !== undefined && minutesToNextSession >= 120 && minutesToNextSession < 1440 && (
                      <View style={styles.partialPenaltyNotice}>
                        <Feather name="alert-circle" size={16} color={ProTennisColors.warning} />
                        <Text style={styles.partialPenaltyText}>
                          Cancelling now = 50% payment + -25 XP
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.modalSubtitle}>Reason for cancellation</Text>
                  <View style={styles.issueTypesContainer}>
                    {CANCEL_REASONS.map((reason) => (
                      <Pressable
                        key={reason.id}
                        style={[
                          styles.issueTypeButton,
                          cancelReason === reason.id && styles.issueTypeButtonSelected,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setCancelReason(reason.id);
                        }}
                      >
                        <Feather
                          name={reason.icon}
                          size={18}
                          color={cancelReason === reason.id ? ProTennisColors.danger : ProTennisColors.textMuted}
                        />
                        <Text
                          style={[
                            styles.issueTypeText,
                            cancelReason === reason.id && styles.issueTypeTextSelected,
                          ]}
                        >
                          {reason.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {cancelReason === "other" && (
                    <>
                      <Text style={styles.modalSubtitle}>Please explain</Text>
                      <TextInput
                        style={styles.issueInput}
                        placeholder="Why do you need to cancel?"
                        placeholderTextColor={ProTennisColors.textMuted}
                        multiline
                        numberOfLines={2}
                        value={cancelReasonText}
                        onChangeText={setCancelReasonText}
                      />
                    </>
                  )}

                  <View style={styles.modalButtonsRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => { setShowCancelModal(false); setCancelReason(null); setCancelReasonText(""); }}
                    >
                      <Text style={styles.modalCancelButtonText}>Never Mind</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalDangerButton, !cancelReason && styles.modalButtonDisabled]}
                      onPress={handleCancelSubmit}
                      disabled={cancelSessionMutation.isPending || !cancelReason}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {cancelSessionMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Running Late Modal */}
          <Modal
            visible={showLateModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowLateModal(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowLateModal(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Feather name="clock" size={24} color={ProTennisColors.warning} />
                      <Text style={styles.modalTitle}>Running Late?</Text>
                    </View>
                    <Pressable onPress={() => setShowLateModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <Text style={styles.lateModalDescription}>
                    Let your coach know you're on the way. How late will you be?
                  </Text>
                  
                  <View style={styles.lateMinutesPicker}>
                    {LATE_MINUTES_OPTIONS.map((mins) => (
                      <Pressable
                        key={mins}
                        style={[
                          styles.lateMinutesOption,
                          lateMinutes === mins && styles.lateMinutesOptionSelected,
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setLateMinutes(mins);
                        }}
                      >
                        <Text
                          style={[
                            styles.lateMinutesText,
                            lateMinutes === mins && styles.lateMinutesTextSelected,
                          ]}
                        >
                          {mins} min
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.modalSubtitle}>Message (optional)</Text>
                  <TextInput
                    style={styles.issueInput}
                    placeholder="e.g. Traffic, will be there soon!"
                    placeholderTextColor={ProTennisColors.textMuted}
                    value={lateMessage}
                    onChangeText={setLateMessage}
                  />

                  <View style={styles.modalButtonsRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => setShowLateModal(false)}
                    >
                      <Text style={styles.modalCancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalWarningButton]}
                      onPress={handleLateSubmit}
                      disabled={notifyLateMutation.isPending}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {notifyLateMutation.isPending ? "Notifying..." : "Notify Coach"}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      </NeonBorderGlow>
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
    padding: Spacing.lg,
  },
  gamingStakesRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
    width: "100%",
  },
  gamingPrimaryButton: {
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    shadowColor: ProTennisColors.electricGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  bookingButtonsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  gamingPrimaryButtonHalf: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    shadowColor: ProTennisColors.electricGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  gamingButtonGradientFill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  gamingButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  gamingPrimaryButtonText: {
    color: ProTennisColors.midnightBlue,
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 1.5,
  },
  gamingSecondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: `${ProTennisColors.neonCyan}50`,
    backgroundColor: "rgba(0, 240, 255, 0.05)",
  },
  gamingSecondaryButtonText: {
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  openDayTitleGlow: {
    fontSize: 20,
    fontWeight: "900",
    color: ProTennisColors.electricGreen,
    letterSpacing: 2,
    textShadowColor: ProTennisColors.electricGreen,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  liveTextGlow: {
    color: ProTennisColors.live,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 2,
    textShadowColor: ProTennisColors.live,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  liveCountdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: Spacing.md,
  },
  sessionTypeGlow: {
    fontSize: 22,
    fontWeight: "800",
    color: ProTennisColors.white,
    marginBottom: Spacing.xs,
    textShadowColor: ProTennisColors.neonCyan,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  nextSessionBadgeGaming: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Backgrounds.card,
  },
  nextSessionTextGlow: {
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.5,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  gamingCountdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginVertical: Spacing.xl,
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
  courtLabel: {
    ...Typography.caption,
    color: ProTennisColors.neonCyan,
    marginTop: 2,
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
  reportButton: {
    backgroundColor: `${ProTennisColors.danger}15`,
    borderWidth: 1,
    borderColor: `${ProTennisColors.danger}40`,
    marginRight: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: ProTennisColors.surfaceCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: ProTennisColors.surfaceElevated,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h2,
    color: ProTennisColors.white,
  },
  modalSubtitle: {
    ...Typography.labelSmall,
    color: ProTennisColors.textMuted,
    marginBottom: Spacing.sm,
    letterSpacing: 1,
  },
  issueTypesContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  issueTypeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: ProTennisColors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  issueTypeButtonSelected: {
    borderColor: ProTennisColors.danger,
    backgroundColor: `${ProTennisColors.danger}15`,
  },
  issueTypeText: {
    ...Typography.body,
    color: ProTennisColors.textMuted,
  },
  issueTypeTextSelected: {
    color: ProTennisColors.white,
  },
  issueInput: {
    ...Typography.body,
    color: ProTennisColors.white,
    backgroundColor: ProTennisColors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: ProTennisColors.surfaceDark,
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  modalCancelButton: {
    backgroundColor: ProTennisColors.surfaceElevated,
  },
  modalCancelButtonText: {
    color: ProTennisColors.textMuted,
    fontWeight: "600",
  },
  modalSubmitButton: {
    backgroundColor: ProTennisColors.danger,
  },
  modalSubmitButtonText: {
    color: ProTennisColors.white,
    fontWeight: "700",
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  openDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  openDayIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${ProTennisColors.electricGreen}20`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: `${ProTennisColors.electricGreen}40`,
  },
  openDayTextContainer: {
    flex: 1,
  },
  openDayTitle: {
    ...Typography.h2,
    color: ProTennisColors.white,
    letterSpacing: 1,
  },
  openDaySubtitle: {
    ...Typography.small,
    color: ProTennisColors.textMuted,
  },
  openDayStakes: {
    backgroundColor: `${ProTennisColors.surfaceElevated}80`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  stakeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stakeText: {
    ...Typography.small,
    color: ProTennisColors.textSecondary,
  },
  openDayActions: {
    gap: Spacing.md,
  },
  openDayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  openDaySecondaryRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  openDaySmallButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    backgroundColor: `${ProTennisColors.surfaceElevated}80`,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  openDaySmallButtonText: {
    color: ProTennisColors.neonCyan,
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  liveTimerContainer: {
    alignItems: "flex-end",
  },
  liveTimerLabel: {
    ...Typography.labelSmall,
    color: ProTennisColors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  liveStakes: {
    backgroundColor: `${ProTennisColors.surfaceElevated}60`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  attendButton: {
    backgroundColor: ProTennisColors.electricGreen,
  },
  attendButtonText: {
    color: ProTennisColors.midnightBlue,
    fontWeight: "700",
    fontSize: 14,
  },
  extendButton: {
    backgroundColor: `${ProTennisColors.neonCyan}15`,
    borderWidth: 1,
    borderColor: `${ProTennisColors.neonCyan}40`,
  },
  liveCancelRow: {
    marginTop: Spacing.md,
  },
  liveCancelButton: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
  },
  liveCancelText: {
    color: ProTennisColors.danger,
    fontWeight: "600",
    fontSize: 12,
  },
  cancelButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  consequenceHint: {
    fontSize: 10,
    color: ProTennisColors.danger,
    fontWeight: "700",
    opacity: 0.8,
  },
  nextSessionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${ProTennisColors.surfaceElevated}80`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  nextSessionText: {
    color: ProTennisColors.neonCyan,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  soonPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ProTennisColors.warning,
  },
  upcomingStakes: {
    marginBottom: Spacing.lg,
  },
  stakesTitle: {
    ...Typography.labelSmall,
    color: ProTennisColors.textMuted,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  stakesGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  stakeCard: {
    flex: 1,
    backgroundColor: `${ProTennisColors.surfaceElevated}60`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
  },
  stakeCardValue: {
    color: ProTennisColors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  stakeCardLabel: {
    ...Typography.caption,
    color: ProTennisColors.textMuted,
  },
  sessionActionRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: `${ProTennisColors.surfaceElevated}60`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  sessionActionButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  actionGlow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  actionDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: Spacing.md,
  },
  lateCancelNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${ProTennisColors.warning}15`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  policySection: {
    backgroundColor: `${ProTennisColors.midnightBlue}80`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  policySectionTitle: {
    ...Typography.small,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  policyRule: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  policyBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  policyRuleContent: {
    flex: 1,
  },
  policyRuleTitle: {
    ...Typography.small,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  policyRuleDesc: {
    ...Typography.small,
    color: ProTennisColors.textMuted,
    fontSize: 11,
  },
  currentPenaltyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${ProTennisColors.danger}20`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: ProTennisColors.danger,
  },
  currentPenaltyText: {
    ...Typography.small,
    fontWeight: "600",
    color: ProTennisColors.danger,
    flex: 1,
  },
  partialPenaltyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${ProTennisColors.warning}20`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: ProTennisColors.warning,
  },
  partialPenaltyText: {
    ...Typography.small,
    fontWeight: "600",
    color: ProTennisColors.warning,
    flex: 1,
  },
  lateCancelText: {
    ...Typography.small,
    color: ProTennisColors.warning,
    flex: 1,
  },
  modalDangerButton: {
    backgroundColor: ProTennisColors.danger,
  },
  modalWarningButton: {
    backgroundColor: ProTennisColors.warning,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  lateModalDescription: {
    ...Typography.body,
    color: ProTennisColors.textSecondary,
    marginBottom: Spacing.lg,
  },
  lateMinutesPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  lateMinutesOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    backgroundColor: `${ProTennisColors.surfaceElevated}80`,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  lateMinutesOptionSelected: {
    backgroundColor: `${ProTennisColors.warning}20`,
    borderColor: ProTennisColors.warning,
  },
  lateMinutesText: {
    color: ProTennisColors.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
  lateMinutesTextSelected: {
    color: ProTennisColors.warning,
  },
});
