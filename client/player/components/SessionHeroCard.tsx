import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, Alert, Platform } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { SwipeBlocker } from "@/components/SwipeBlocker";
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
import { useTabNavigation } from "@/components/TabNavigationContext";
import { GlassCard } from "./GlassCard";
import { GlowAvatar } from "./GlowAvatar";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors, Colors } from "@/constants/theme";
import { usePlayerState } from "../context/PlayerStateContext";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

interface SessionHeroCardProps {
  onCheckIn?: () => void;
  onCancel?: () => void;
  onExtend?: () => void;
  onBookSession?: () => void;
  onFindMatch?: () => void;
}

const ISSUE_TYPES = [
  { id: "equipment", labelKey: "player.home.equipmentIssue", icon: "tool" as const },
  { id: "court", labelKey: "player.home.courtProblem", icon: "grid" as const },
  { id: "safety", labelKey: "player.home.safetyConcern", icon: "alert-triangle" as const },
  { id: "coach", labelKey: "player.home.coachingFeedback", icon: "user" as const },
  { id: "other", labelKey: "player.home.otherIssue", icon: "more-horizontal" as const },
];

const CANCEL_REASONS = [
  { id: "sick", labelKey: "player.home.feelingUnwell", icon: "thermometer" as const },
  { id: "schedule_conflict", labelKey: "player.home.scheduleConflict", icon: "calendar" as const },
  { id: "family_event", labelKey: "player.home.familyEvent", icon: "users" as const },
  { id: "work_trip", labelKey: "player.home.workTrip", icon: "briefcase" as const },
  { id: "other", labelKey: "player.home.otherReason", icon: "more-horizontal" as const },
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
          <Feather name={icon as any} size={12} color={color} />
        </View>
        <Text style={[gamingStyles.stakeCardText, { color: positive ? color : ProTennisColors.textPrimary }]}>
          {text}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

function NeonBorderGlow({ color, children, style }: { color: string; children: React.ReactNode; style?: any }) {
  return (
    <View
      style={[
        gamingStyles.neonBorderContainer,
        {
          borderColor: "rgba(255, 255, 255, 0.08)",
        },
        style,
      ]}
    >
      <View style={gamingStyles.neonBorderInner}>
        {children}
      </View>
    </View>
  );
}

const gamingStyles = StyleSheet.create({
  countdownDigitBox: {
    alignItems: "center",
    marginHorizontal: 4,
  },
  countdownGradientBg: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    minWidth: 52,
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
    fontSize: 28,
    fontWeight: "900",
    color: ProTennisColors.midnightBlue,
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  countdownDigitLabel: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  countdownSeparatorText: {
    fontSize: 24,
    fontWeight: "300",
    color: ProTennisColors.neonCyan,
    alignSelf: "center",
    marginBottom: 12,
    opacity: 0.7,
  },
  stakeCard: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    flex: 1,
  },
  stakeCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    gap: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  stakeIconGlow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stakeCardText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  neonBorderContainer: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
  },
  neonBorderInner: {
    borderRadius: BorderRadius.md - 1,
    padding: Spacing.sm,
  },
});

export function SessionHeroCard({
  onCheckIn,
  onCancel,
  onExtend,
  onBookSession,
  onFindMatch,
}: SessionHeroCardProps) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
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
      Alert.alert(t("player.home.issueReported"), t("player.home.issueReportedMsg"));
    },
    onError: (error: any) => {
      Alert.alert(t("common.error"), error?.message || t("player.home.failedReportIssue"));
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      if (onCancel) {
        onCancel();
      }
      Alert.alert(
        t("player.home.sessionCancelled"),
        response?.isLateCancellation 
          ? t("player.home.lateCancellationMsg")
          : t("player.home.sessionCancelledMsg")
      );
    },
    onError: (error: any) => {
      Alert.alert(t("common.error"), error?.message || t("player.home.failedCancelSession"));
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
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/coach/calendar"), refetchType: "all" });
      Alert.alert(t("player.home.coachNotified"), t("player.home.coachNotifiedMsg"));
    },
    onError: (error: any) => {
      Alert.alert(t("common.error"), error?.message || t("player.home.failedNotifyCoach"));
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/player/me/sessions/${sessionId}/check-in`, {});
    },
    onSuccess: (response: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      const xpMsg = response?.xpAwarded ? `\n+${response.xpAwarded} XP` : "";
      Alert.alert(t("player.home.checkedIn"), `${t("player.home.checkedInMsg")}${xpMsg}`);
    },
    onError: (error: any) => {
      Alert.alert(t("player.home.checkInFailed"), error?.message || t("player.home.failedCheckIn"));
    },
  });

  const handleReportSubmit = () => {
    if (!sessionId) {
      Alert.alert(t("common.error"), t("player.home.noActiveSession"));
      return;
    }
    if (!selectedIssueType) {
      Alert.alert(t("player.home.selectIssueType"), t("player.home.selectIssueTypeMsg"));
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
      navigateToTab("Schedule");
    }
  };

  const handleBookCourt = () => {
    console.log("[SessionHeroCard] handleBookCourt called");
    // Navigate to Schedule tab, then to CourtBooking screen
    navigateToTab("Schedule", { screen: "CourtBooking" });
  };

  const handleFindMatch = () => {
    console.log("[SessionHeroCard] handleFindMatch called");
    if (onFindMatch) {
      onFindMatch();
    } else {
      // Navigate to Play tab with Players sub-tab selected
      navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Players" } });
    }
  };

  const handleJoinOpenGroup = () => {
    console.log("[SessionHeroCard] handleJoinOpenGroup called");
    // Navigate to Play tab with Group Lessons sub-tab
    navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Group Lessons" } });
  };

  const handleCheckIn = () => {
    if (sessionId) {
      checkInMutation.mutate();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t("common.error"), t("player.home.noSessionFound"));
    }
  };

  const handleExtend = () => {
    if (onExtend) {
      onExtend();
    } else {
      Alert.alert(t("player.home.extendSession"), t("player.home.contactCoachExtend"));
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCancelModal(true);
  };

  const handleCancelSubmit = () => {
    if (!sessionId) {
      Alert.alert(t("common.error"), t("player.home.noActiveSession"));
      return;
    }
    if (!cancelReason) {
      Alert.alert(t("player.home.selectReason"), t("player.home.selectReasonMsg"));
      return;
    }
    if (cancelReason === "other" && !cancelReasonText.trim()) {
      Alert.alert(t("player.home.enterReason"), t("player.home.enterReasonMsg"));
      return;
    }
    
    if (Platform.OS === "web") {
      const confirmed = window.confirm(t("player.home.confirmCancelMsg"));
      if (confirmed) {
        cancelSessionMutation.mutate({ reason: cancelReason, reasonText: cancelReasonText });
      }
    } else {
      Alert.alert(
        t("player.home.confirmCancellation"),
        t("player.home.confirmCancelMsg"),
        [
          {
            text: t("player.home.goBack"),
            style: "cancel",
          },
          {
            text: t("player.home.yesCancelSession"),
            style: "destructive",
            onPress: () => {
              cancelSessionMutation.mutate({ reason: cancelReason, reasonText: cancelReasonText });
            },
          },
        ]
      );
    }
  };

  const handleLate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLateModal(true);
  };

  const handleLateSubmit = () => {
    if (!sessionId) {
      Alert.alert(t("common.error"), t("player.home.noActiveSession"));
      return;
    }
    if (!lateMinutes || lateMinutes < 1) {
      Alert.alert(t("player.home.selectTime"), t("player.home.selectTimeMsg"));
      return;
    }
    notifyLateMutation.mutate({ minutes: lateMinutes, message: lateMessage });
  };

  if (sessionStatus === "none") {
    return (
      <NeonBorderGlow color={ProTennisColors.electricGreen} style={styles.heroCard}>
        <View style={styles.noSessionContent}>
          {/* Premium Tennis Header */}
          <View style={styles.tennisOpenDayHeader}>
            <View style={styles.tennisCourtIconWrapper}>
              <LinearGradient
                colors={[`${ProTennisColors.electricGreen}25`, `${ProTennisColors.electricGreen}08`]}
                style={styles.tennisCourtIconBg}
              >
                {/* Tennis Court SVG-style icon using nested views */}
                <View style={styles.miniCourtContainer}>
                  <View style={styles.miniCourtOuter}>
                    <View style={styles.miniCourtNet} />
                    <View style={styles.miniCourtInner}>
                      <Ionicons name="tennisball" size={16} color={ProTennisColors.electricGreen} />
                    </View>
                  </View>
                </View>
              </LinearGradient>
              <View style={styles.tennisCourtPulse} />
            </View>
            <View style={styles.openDayTextContainer}>
              <Text style={styles.openDayTitleGlow}>{t("player.home.courtTime")}</Text>
              <Text style={styles.openDaySubtitle}>{t("player.home.noSessionsToday")}</Text>
            </View>
          </View>

          {/* XP Stakes with tennis ball accent */}
          <View style={styles.tennisStakesRow}>
            <View style={styles.tennisStakeCard}>
              <View style={[styles.tennisStakeIconCircle, { backgroundColor: `${ProTennisColors.warning}15` }]}>
                <Ionicons name="flash" size={14} color={ProTennisColors.warning} />
              </View>
              <Text style={[styles.tennisStakeText, { color: ProTennisColors.warning }]}>{t("player.home.xpForBooking")}</Text>
            </View>
            <View style={styles.tennisStakeCard}>
              <View style={[styles.tennisStakeIconCircle, { backgroundColor: `${ProTennisColors.electricGreen}15` }]}>
                <Ionicons name="flame" size={14} color={ProTennisColors.electricGreen} />
              </View>
              <Text style={[styles.tennisStakeText, { color: ProTennisColors.electricGreen }]}>{t("player.home.keepStreakAlive")}</Text>
            </View>
          </View>

          {/* Premium Action Buttons */}
          <View style={styles.tennisActionsContainer}>
            <SwipeBlocker style={styles.tennisPrimaryRow}>
              {/* Book Lesson - Tennis Racket Theme */}
              <Pressable
                style={({ pressed }) => [
                  styles.tennisPrimaryButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleBookSession}
              >
                <LinearGradient
                  colors={[ProTennisColors.electricGreen, "#9AE62E"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tennisPrimaryGradient}
                >
                  <View style={styles.tennisButtonIconWrapper}>
                    <Ionicons name="person" size={18} color={ProTennisColors.midnightBlue} />
                    <View style={styles.tennisRacketAccent}>
                      <Ionicons name="tennisball-outline" size={10} color={ProTennisColors.midnightBlue} />
                    </View>
                  </View>
                  <Text style={styles.tennisPrimaryButtonText}>{t("player.home.bookLesson")}</Text>
                </LinearGradient>
              </Pressable>

              {/* Book Court - Court Theme */}
              <Pressable
                style={({ pressed }) => [
                  styles.tennisPrimaryButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleBookCourt}
              >
                <LinearGradient
                  colors={[ProTennisColors.neonCyan, "#00D4FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tennisPrimaryGradient}
                >
                  <View style={styles.tennisButtonIconWrapper}>
                    <Ionicons name="grid" size={18} color={ProTennisColors.midnightBlue} />
                  </View>
                  <Text style={styles.tennisPrimaryButtonText}>{t("player.home.bookCourt")}</Text>
                </LinearGradient>
              </Pressable>
            </SwipeBlocker>

            {/* Secondary Actions - Clean Glass Style */}
            <SwipeBlocker style={styles.tennisSecondaryRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.tennisSecondaryButton,
                  pressed && styles.tennisSecondaryPressed,
                ]}
                onPress={handleFindMatch}
              >
                <Ionicons name="people" size={16} color={ProTennisColors.neonCyan} />
                <Text style={[styles.tennisSecondaryText, { color: ProTennisColors.neonCyan }]}>{t("player.home.findPlayers").toUpperCase()}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.tennisSecondaryButton,
                  pressed && styles.tennisSecondaryPressed,
                ]}
                onPress={handleJoinOpenGroup}
              >
                <Ionicons name="globe" size={16} color={ProTennisColors.electricGreen} />
                <Text style={[styles.tennisSecondaryText, { color: ProTennisColors.electricGreen }]}>{t("player.home.joinOpenGroup")}</Text>
              </Pressable>
            </SwipeBlocker>
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
              <Text style={styles.openDayTitle}>{t("player.home.courtTime")}</Text>
              <Text style={styles.openDaySubtitle}>{t("player.home.noSessionsToday")}</Text>
            </View>
          </View>

          <View style={styles.openDayStakes}>
            <View style={styles.stakeItem}>
              <Feather name="zap" size={14} color={ProTennisColors.warning} />
              <Text style={styles.stakeText}>{t("player.home.xpForBooking")}</Text>
            </View>
            <View style={styles.stakeItem}>
              <Feather name="trending-up" size={14} color={ProTennisColors.electricGreen} />
              <Text style={styles.stakeText}>{t("player.home.keepStreakAlive")}</Text>
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
              <Text style={styles.primaryButtonText}>{t("player.home.bookLesson")}</Text>
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
                <Text style={styles.openDaySmallButtonText}>{t("player.home.findPlayers").toUpperCase()}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.openDaySmallButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleJoinOpenGroup}
              >
                <Feather name="play-circle" size={16} color={ProTennisColors.electricGreen} />
                <Text style={[styles.openDaySmallButtonText, { color: ProTennisColors.electricGreen }]}>{t("player.home.joinOpenGroup")}</Text>
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
              <Text style={styles.liveTextGlow}>{t("player.home.liveNow")}</Text>
            </View>
            <View style={styles.liveTimerContainer}>
              <Text style={styles.liveTimerLabel}>{t("player.home.timeLeft")}</Text>
              <View style={styles.liveCountdownRow}>
                <GradientCountdownDigit value={countdown.hours} label={t("player.home.hrs")} />
                <Text style={gamingStyles.countdownSeparatorText}>:</Text>
                <GradientCountdownDigit value={countdown.minutes} label={t("player.home.min")} />
                <Text style={gamingStyles.countdownSeparatorText}>:</Text>
                <GradientCountdownDigit value={countdown.seconds} label={t("player.home.sec")} />
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
              <Text style={styles.sessionTypeGlow}>{sessionType || t("player.home.trainingSession")}</Text>
              <Text style={styles.coachLabel}>{t("player.home.withCoach", { name: coachName || t("common.coach") })}</Text>
              {sessionCourtName && (
                <Text style={styles.courtLabel}>{sessionCourtName}</Text>
              )}
            </View>
          </View>

          <View style={styles.gamingStakesRow}>
            <AnimatedStakeCard 
              icon="eye" 
              text={t("player.home.coachTrackingProgress")} 
              color={ProTennisColors.neonCyan} 
              positive
            />
            <AnimatedStakeCard 
              icon="zap" 
              text={t("player.home.xpCompletion")} 
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
              <Text style={styles.attendButtonText}>{t("player.home.attend")}</Text>
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
              <Text style={[styles.liveButtonText, { color: ProTennisColors.neonCyan }]}>{t("player.home.extend")}</Text>
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
              <Text style={[styles.liveButtonText, { color: ProTennisColors.warning }]}>{t("player.home.report")}</Text>
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
              <Text style={[styles.actionLabel, { color: ProTennisColors.danger }]}>{t("common.cancel").toUpperCase()}</Text>
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
              <Text style={[styles.actionLabel, { color: ProTennisColors.warning }]}>{t("player.home.delay")}</Text>
            </Pressable>
          </View>

          {/* Report Issue Modal */}
          <Modal
            visible={showReportModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowReportModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowReportModal(false)} />
              <View style={styles.modalContent}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{t("player.home.reportIssue")}</Text>
                    <Pressable onPress={() => setShowReportModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <Text style={styles.modalSubtitle}>{t("player.home.whatsTheIssue")}</Text>
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
                          {t(type.labelKey)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.modalSubtitle}>{t("player.home.detailsOptional")}</Text>
                  <TextInput
                    style={styles.issueInput}
                    placeholder={t("player.home.describeIssue")}
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
                      <Text style={styles.modalCancelButtonText}>{t("common.cancel")}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalSubmitButton, !sessionId && styles.modalButtonDisabled]}
                      onPress={handleReportSubmit}
                      disabled={reportIssueMutation.isPending || !sessionId}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {reportIssueMutation.isPending ? t("player.home.sending") : t("player.home.reportIssue")}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </View>
            </View>
          </Modal>

          {/* Cancel Session Modal */}
          <Modal
            visible={showCancelModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCancelModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCancelModal(false)} />
              <View style={styles.modalContent}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{t("player.home.cancelSession")}</Text>
                    <Pressable onPress={() => setShowCancelModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <View style={styles.policySection}>
                    <Text style={styles.policySectionTitle}>{t("player.home.cancellationPolicy")}</Text>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.electricGreen + "20" }]}>
                        <Feather name="check-circle" size={14} color={ProTennisColors.electricGreen} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>{t("player.home.hoursBeforeFull")}</Text>
                        <Text style={styles.policyRuleDesc}>{t("player.home.freeCancellation")}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.warning + "20" }]}>
                        <Feather name="alert-circle" size={14} color={ProTennisColors.warning} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>{t("player.home.hoursBeforePartial")}</Text>
                        <Text style={styles.policyRuleDesc}>{t("player.home.partialCharge")}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.danger + "20" }]}>
                        <Feather name="x-circle" size={14} color={ProTennisColors.danger} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>{t("player.home.lessThan2Hours")}</Text>
                        <Text style={styles.policyRuleDesc}>{t("player.home.fullCharge")}</Text>
                      </View>
                    </View>
                    
                    {minutesToNextSession !== undefined && minutesToNextSession < 120 && (
                      <View style={styles.currentPenaltyNotice}>
                        <Feather name="alert-triangle" size={16} color={ProTennisColors.danger} />
                        <Text style={styles.currentPenaltyText}>
                          {t("player.home.cancellingNowFull")}
                        </Text>
                      </View>
                    )}
                    {minutesToNextSession !== undefined && minutesToNextSession >= 120 && minutesToNextSession < 1440 && (
                      <View style={styles.partialPenaltyNotice}>
                        <Feather name="alert-circle" size={16} color={ProTennisColors.warning} />
                        <Text style={styles.partialPenaltyText}>
                          {t("player.home.cancellingNowPartial")}
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.modalSubtitle}>{t("player.home.reasonForCancellation")}</Text>
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
                          {t(reason.labelKey)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {cancelReason === "other" && (
                    <>
                      <Text style={styles.modalSubtitle}>{t("player.home.pleaseExplain")}</Text>
                      <TextInput
                        style={styles.issueInput}
                        placeholder={t("player.home.whyCancel")}
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
                      <Text style={styles.modalCancelButtonText}>{t("player.home.neverMind")}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalDangerButton, !cancelReason && styles.modalButtonDisabled]}
                      onPress={handleCancelSubmit}
                      disabled={cancelSessionMutation.isPending || !cancelReason}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {cancelSessionMutation.isPending ? t("player.home.cancelling") : t("player.home.confirmCancel")}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </View>
            </View>
          </Modal>

          {/* Running Late Modal */}
          <Modal
            visible={showLateModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowLateModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLateModal(false)} />
              <View style={styles.modalContent}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Feather name="clock" size={24} color={ProTennisColors.warning} />
                      <Text style={styles.modalTitle}>{t("player.home.runningLate")}</Text>
                    </View>
                    <Pressable onPress={() => setShowLateModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <Text style={styles.lateModalDescription}>
                    {t("player.home.lateDescription")}
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
                          {t("player.home.minLabel", { count: mins })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.modalSubtitle}>{t("player.home.messageOptional")}</Text>
                  <TextInput
                    style={styles.issueInput}
                    placeholder={t("player.home.latePlaceholder")}
                    placeholderTextColor={ProTennisColors.textMuted}
                    value={lateMessage}
                    onChangeText={setLateMessage}
                  />

                  <View style={styles.modalButtonsRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => setShowLateModal(false)}
                    >
                      <Text style={styles.modalCancelButtonText}>{t("common.cancel")}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalWarningButton]}
                      onPress={handleLateSubmit}
                      disabled={notifyLateMutation.isPending}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {notifyLateMutation.isPending ? t("player.home.notifying") : t("player.home.notifyCoach")}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </View>
            </View>
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
              <Text style={[styles.nextSessionTextGlow, { color: borderColor }]}>
                {isSoon ? t("player.home.startingSoon") : t("player.home.nextSession")}
              </Text>
            </View>
            {isSoon && (
              <Animated.View style={[styles.soonPulse, livePulseStyle]} />
            )}
          </View>

          <View style={styles.gamingCountdownRow}>
            <GradientCountdownDigit value={countdown.hours} label={t("player.home.hrs")} />
            <Text style={gamingStyles.countdownSeparatorText}>:</Text>
            <GradientCountdownDigit value={countdown.minutes} label={t("player.home.min")} />
            <Text style={gamingStyles.countdownSeparatorText}>:</Text>
            <GradientCountdownDigit value={countdown.seconds} label={t("player.home.sec")} />
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              source={coachPhotoUrl}
              name={coachName || t("common.coach")}
              size="lg"
              showGlow
              glowColor={borderColor}
              pulsing={isSoon}
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionTypeGlow}>{sessionType || t("player.home.trainingSession")}</Text>
              <Text style={styles.coachLabel}>{t("player.home.withCoach", { name: coachName || t("common.coach") })}</Text>
              {sessionCourtName && (
                <Text style={styles.courtLabel}>{sessionCourtName}</Text>
              )}
            </View>
          </View>

          <View style={styles.upcomingStakes}>
            <Text style={styles.stakesTitle}>{t("player.home.whatsAtStake")}</Text>
            <View style={styles.gamingStakesRow}>
              <AnimatedStakeCard icon="zap" text={t("player.home.xpAttendance")} color={ProTennisColors.electricGreen} positive />
              <AnimatedStakeCard icon="trending-up" text={t("player.home.levelProgress")} color={ProTennisColors.neonCyan} positive />
            </View>
          </View>

          {isSoon && (
            <Pressable
              style={({ pressed }) => [
                styles.gamingPrimaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCheckIn}
              disabled={checkInMutation.isPending}
            >
              <LinearGradient
                colors={[ProTennisColors.electricGreen, `${ProTennisColors.electricGreen}CC`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.gamingButtonGradient, checkInMutation.isPending && { opacity: 0.7 }]}
              >
                <Feather name="check-circle" size={20} color={ProTennisColors.midnightBlue} />
                <Text style={styles.gamingPrimaryButtonText}>{checkInMutation.isPending ? t("player.home.checkingIn") : t("player.home.checkInEarly")}</Text>
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
              <Text style={[styles.actionLabel, { color: ProTennisColors.danger }]}>{t("common.cancel").toUpperCase()}</Text>
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
              <Text style={[styles.actionLabel, { color: ProTennisColors.warning }]}>{t("player.home.delay")}</Text>
            </Pressable>
          </View>

          {/* Cancel Session Modal */}
          <Modal
            visible={showCancelModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCancelModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCancelModal(false)} />
              <View style={styles.modalContent}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{t("player.home.cancelSession")}</Text>
                    <Pressable onPress={() => setShowCancelModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <View style={styles.policySection}>
                    <Text style={styles.policySectionTitle}>{t("player.home.cancellationPolicy")}</Text>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.electricGreen + "20" }]}>
                        <Feather name="check-circle" size={14} color={ProTennisColors.electricGreen} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>{t("player.home.hoursBeforeFull")}</Text>
                        <Text style={styles.policyRuleDesc}>{t("player.home.freeCancellation")}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.warning + "20" }]}>
                        <Feather name="alert-circle" size={14} color={ProTennisColors.warning} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>{t("player.home.hoursBeforePartial")}</Text>
                        <Text style={styles.policyRuleDesc}>{t("player.home.partialCharge")}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.policyRule}>
                      <View style={[styles.policyBadge, { backgroundColor: ProTennisColors.danger + "20" }]}>
                        <Feather name="x-circle" size={14} color={ProTennisColors.danger} />
                      </View>
                      <View style={styles.policyRuleContent}>
                        <Text style={styles.policyRuleTitle}>{t("player.home.lessThan2Hours")}</Text>
                        <Text style={styles.policyRuleDesc}>{t("player.home.fullCharge")}</Text>
                      </View>
                    </View>
                    
                    {minutesToNextSession !== undefined && minutesToNextSession < 120 && (
                      <View style={styles.currentPenaltyNotice}>
                        <Feather name="alert-triangle" size={16} color={ProTennisColors.danger} />
                        <Text style={styles.currentPenaltyText}>
                          {t("player.home.cancellingNowFull")}
                        </Text>
                      </View>
                    )}
                    {minutesToNextSession !== undefined && minutesToNextSession >= 120 && minutesToNextSession < 1440 && (
                      <View style={styles.partialPenaltyNotice}>
                        <Feather name="alert-circle" size={16} color={ProTennisColors.warning} />
                        <Text style={styles.partialPenaltyText}>
                          {t("player.home.cancellingNowPartial")}
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.modalSubtitle}>{t("player.home.reasonForCancellation")}</Text>
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
                          {t(reason.labelKey)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {cancelReason === "other" && (
                    <>
                      <Text style={styles.modalSubtitle}>{t("player.home.pleaseExplain")}</Text>
                      <TextInput
                        style={styles.issueInput}
                        placeholder={t("player.home.whyCancel")}
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
                      <Text style={styles.modalCancelButtonText}>{t("player.home.neverMind")}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalDangerButton, !cancelReason && styles.modalButtonDisabled]}
                      onPress={handleCancelSubmit}
                      disabled={cancelSessionMutation.isPending || !cancelReason}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {cancelSessionMutation.isPending ? t("player.home.cancelling") : t("player.home.confirmCancel")}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </View>
            </View>
          </Modal>

          {/* Running Late Modal */}
          <Modal
            visible={showLateModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowLateModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLateModal(false)} />
              <View style={styles.modalContent}>
                <KeyboardAwareScrollViewCompat 
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <Feather name="clock" size={24} color={ProTennisColors.warning} />
                      <Text style={styles.modalTitle}>{t("player.home.runningLate")}</Text>
                    </View>
                    <Pressable onPress={() => setShowLateModal(false)}>
                      <Feather name="x" size={24} color={ProTennisColors.textMuted} />
                    </Pressable>
                  </View>
                  
                  <Text style={styles.lateModalDescription}>
                    {t("player.home.lateDescription")}
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
                          {t("player.home.minLabel", { count: mins })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.modalSubtitle}>{t("player.home.messageOptional")}</Text>
                  <TextInput
                    style={styles.issueInput}
                    placeholder={t("player.home.latePlaceholder")}
                    placeholderTextColor={ProTennisColors.textMuted}
                    value={lateMessage}
                    onChangeText={setLateMessage}
                  />

                  <View style={styles.modalButtonsRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => setShowLateModal(false)}
                    >
                      <Text style={styles.modalCancelButtonText}>{t("common.cancel")}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalWarningButton]}
                      onPress={handleLateSubmit}
                      disabled={notifyLateMutation.isPending}
                    >
                      <Text style={styles.modalSubmitButtonText}>
                        {notifyLateMutation.isPending ? t("player.home.notifying") : t("player.home.notifyCoach")}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </View>
            </View>
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
    width: "100%",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    minHeight: 52,
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
    letterSpacing: 1,
  },
  liveTextGlow: {
    color: ProTennisColors.live,
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 1,
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
    letterSpacing: 1,
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
    backgroundColor: Backgrounds.card,
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
    width: "100%",
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
    width: "100%",
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
    marginBottom: Spacing.xs,
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
    padding: Spacing.sm,
    marginTop: Spacing.xs,
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

  // Premium Tennis Redesign Styles
  tennisOpenDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  tennisCourtIconWrapper: {
    position: "relative",
    width: 56,
    height: 56,
  },
  tennisCourtIconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  tennisCourtPulse: {
    display: "none",
  },
  miniCourtContainer: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  miniCourtOuter: {
    width: 32,
    height: 32,
    borderWidth: 1.5,
    borderColor: "rgba(200, 255, 61, 0.5)",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  miniCourtNet: {
    position: "absolute",
    left: "50%",
    marginLeft: -0.5,
    top: 4,
    bottom: 4,
    width: 1,
    backgroundColor: "rgba(200, 255, 61, 0.3)",
  },
  miniCourtInner: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tennisStakesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tennisStakeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: `${ProTennisColors.surfaceElevated}50`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  tennisStakeIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tennisStakeText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  tennisActionsContainer: {
    gap: Spacing.md,
    width: "100%",
  },
  tennisPrimaryRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  tennisPrimaryButton: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  tennisPrimaryGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  tennisButtonIconWrapper: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tennisRacketAccent: {
    position: "absolute",
    top: -4,
    right: -6,
  },
  tennisPrimaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: ProTennisColors.midnightBlue,
    letterSpacing: 0.8,
  },
  tennisSecondaryRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  tennisSecondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  tennisSecondaryPressed: {
    opacity: 0.7,
    backgroundColor: `${ProTennisColors.surfaceElevated}60`,
  },
  tennisSecondaryText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
