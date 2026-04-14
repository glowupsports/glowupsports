import logger from "@/lib/logger";
import React, { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, Alert } from "react-native";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { GlassCard } from "./GlassCard";
import { GlowAvatar } from "./GlowAvatar";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors, Colors, CardElevation } from "@/constants/theme";
import { usePlayerState } from "../context/PlayerStateContext";
import { apiRequest, getApiUrl, getAuthHeaders, getEffectivePlayerId } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
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
        colors={[ProTennisColors.electricGreen, GlowColors.soft, ProTennisColors.electricGreen]}
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
    color: GlowColors.primary,
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
  const { sessionStatus, minutesToNextSession, minutesRemaining, coachName, sessionCourtName, sessionType, coachPhotoUrl, sessionId, sessionDuration } = state;
  const { user } = useAuth();
  const playerId = getEffectivePlayerId(user?.playerId);

  const { data: dashboardData } = useQuery<{ nextSession?: { playerCheckedIn?: boolean } | null }>({
    queryKey: ["/api/player/me/dashboard"],
    enabled: !!user?.playerId,
  });
  const [hasCheckedIn, setHasCheckedIn] = useState<boolean>(
    () => dashboardData?.nextSession?.playerCheckedIn ?? false
  );

  useEffect(() => {
    setHasCheckedIn(dashboardData?.nextSession?.playerCheckedIn ?? false);
  }, [sessionId, dashboardData?.nextSession?.playerCheckedIn]);

  interface ChallengeData {
    id: string;
    challengerId: string;
    opponentId: string;
    status: string;
    matchType: string;
    matchFormat: string;
    scheduledDate: string;
    scheduledTime: string;
    courtName?: string;
    customLocation?: string;
    message?: string;
    challengerName?: string;
    opponentName?: string;
  }

  const { data: challenges = [] } = useQuery<ChallengeData[]>({
    queryKey: ["/api/matches/challenge", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const res = await fetch(
        new URL(`/api/matches/challenge?playerId=${playerId}`, getApiUrl()).toString(),
        { headers: getAuthHeaders(), credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!playerId,
  });

  const isChallengeExpired = (c: ChallengeData) => {
    if (!c.scheduledDate || !c.scheduledTime) return false;
    const [year, month, day] = c.scheduledDate.split("-").map(Number);
    const [h, m] = c.scheduledTime.split(":").map(Number);
    const scheduledMs = new Date(year, month - 1, day, h, m, 0).getTime();
    return Date.now() > scheduledMs;
  };

  const incomingChallenges = challenges.filter(
    (c) => c.status === "pending" && String(c.opponentId) === String(playerId) && !isChallengeExpired(c)
  );
  const acceptedChallenges = challenges.filter(
    (c) => c.status === "accepted" &&
      (String(c.challengerId) === String(playerId) || String(c.opponentId) === String(playerId))
  );
  const sentPendingChallenges = challenges.filter(
    (c) => c.status === "pending" && String(c.challengerId) === String(playerId) && !isChallengeExpired(c)
  );

  const respondToChallengeMutation = useMutation({
    mutationFn: async ({ challengeId, response }: { challengeId: string; response: "accepted" | "declined" }) => {
      return apiRequest(
        "POST",
        `/api/matches/challenge/${challengeId}/respond?playerId=${playerId}`,
        { response }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/notifications/unread-count"] });
    },
  });

  const DISMISSED_REFLECTION_KEY = "@glow_dismissed_reflection_session";
  const [reflectionDismissed, setReflectionDismissed] = useState(false);

  const { data: reflectionData, isLoading: reflectionLoading } = useQuery<{ id: string } | null>({
    queryKey: [`/api/player/sessions/${sessionId}/reflection`],
    enabled: sessionStatus === "ended" && !!sessionId && !reflectionDismissed,
  });

  const reflectionAlreadyExists = !reflectionLoading && !!reflectionData?.id;

  useEffect(() => {
    if (sessionStatus !== "ended" || !sessionId) {
      setReflectionDismissed(false);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(DISMISSED_REFLECTION_KEY).then((dismissedId) => {
      if (!cancelled) {
        setReflectionDismissed(dismissedId === sessionId);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionStatus, sessionId]);

  const handleDismissReflection = useCallback(async () => {
    if (!sessionId) return;
    await AsyncStorage.setItem(DISMISSED_REFLECTION_KEY, sessionId);
    setReflectionDismissed(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sessionId]);

  const handleReflectOnSession = useCallback(() => {
    if (!sessionId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("TrainingDetail", { sessionId });
  }, [sessionId, navigation]);

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
      const endpoint = sessionType === "group"
        ? `/api/player/me/sessions/${sessionId}/mark-unavailable`
        : `/api/player/me/sessions/${sessionId}/cancel`;
      return apiRequest("POST", endpoint, { reason, reasonText });
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
      setHasCheckedIn(true);
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
      navigateToTab("Growth", { screen: "ScheduleMain" });
    }
  };

  const handleBookCourt = () => {
    logger.log("[SessionHeroCard] handleBookCourt called");
    // Navigate to Schedule tab, then to CourtBooking screen
    navigateToTab("Growth", { screen: "CourtBooking" });
  };

  const handleFindMatch = () => {
    logger.log("[SessionHeroCard] handleFindMatch called");
    if (onFindMatch) {
      onFindMatch();
    } else {
      // Navigate to Play tab with Players sub-tab selected
      navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Players" } });
    }
  };

  const handleJoinOpenGroup = () => {
    logger.log("[SessionHeroCard] handleJoinOpenGroup called");
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
    
    cancelSessionMutation.mutate({ reason: cancelReason, reasonText: cancelReasonText });
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

  const hasChallenges = incomingChallenges.length > 0 || acceptedChallenges.length > 0 || sentPendingChallenges.length > 0;

  const primaryChallenge = incomingChallenges[0] || acceptedChallenges[0] || sentPendingChallenges[0];
  const [challengeCountdown, setChallengeCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [challengeElapsed, setChallengeElapsed] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const MATCH_DURATION_MS = 60 * 60 * 1000;
  const [showCancelMatchModal, setShowCancelMatchModal] = useState(false);
  const [showLateMatchModal, setShowLateMatchModal] = useState(false);
  const [matchLateMinutes, setMatchLateMinutes] = useState(10);
  const [matchLateMessage, setMatchLateMessage] = useState("");

  const getChallengeStartTime = (c: typeof primaryChallenge) => {
    if (!c) return 0;
    const dateStr = c.scheduledDate;
    const timeStr = c.scheduledTime || "00:00";
    const [year, month, day] = dateStr.split("-").map(Number);
    const [h, m] = timeStr.split(":").map(Number);
    return new Date(year, month - 1, day, h, m, 0).getTime();
  };

  type ChallengeLifecycle = "incoming" | "confirmed" | "sent" | "match_live" | "post_match";
  const [challengeLifecycle, setChallengeLifecycle] = useState<ChallengeLifecycle>("incoming");

  useEffect(() => {
    if (!primaryChallenge) return;
    const startTime = getChallengeStartTime(primaryChallenge);
    const endTime = startTime + MATCH_DURATION_MS;
    const isAccepted = acceptedChallenges.some((ac) => ac.id === primaryChallenge.id);

    const update = () => {
      const now = Date.now();

      if (isAccepted && now >= endTime) {
        setChallengeLifecycle("post_match");
        setChallengeElapsed({ hours: 0, minutes: 0, seconds: 0 });
      } else if (isAccepted && now >= startTime && now < endTime) {
        setChallengeLifecycle("match_live");
        const elapsed = Math.floor((now - startTime) / 1000);
        setChallengeElapsed({
          hours: Math.floor(elapsed / 3600),
          minutes: Math.floor((elapsed % 3600) / 60),
          seconds: elapsed % 60,
        });
      } else {
        if (incomingChallenges.length > 0) {
          setChallengeLifecycle("incoming");
        } else if (isAccepted) {
          setChallengeLifecycle("confirmed");
        } else {
          setChallengeLifecycle("sent");
        }
      }

      const diff = Math.max(0, startTime - now);
      const totalSec = Math.floor(diff / 1000);
      setChallengeCountdown({
        days: Math.floor(totalSec / 86400),
        hours: Math.floor((totalSec % 86400) / 3600),
        minutes: Math.floor((totalSec % 3600) / 60),
        seconds: totalSec % 60,
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [primaryChallenge?.id, primaryChallenge?.scheduledDate, primaryChallenge?.scheduledTime, acceptedChallenges.length, incomingChallenges.length]);

  const cancelChallengeMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      return apiRequest("POST", `/api/matches/challenge/${challengeId}/cancel?playerId=${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      setShowCancelMatchModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Match Cancelled", "The match has been cancelled and your opponent has been notified.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to cancel the match. Please try again.");
    },
  });

  const matchLateMutation = useMutation({
    mutationFn: async ({ challengeId, minutes, message }: { challengeId: string; minutes: number; message: string }) => {
      return apiRequest("POST", `/api/matches/challenge/${challengeId}/running-late?playerId=${playerId}`, { minutes, message });
    },
    onSuccess: () => {
      setShowLateMatchModal(false);
      setMatchLateMinutes(10);
      setMatchLateMessage("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Notified", "Your opponent has been notified that you're running late.");
    },
    onError: () => {
      Alert.alert("Error", "Failed to send notification. Please try again.");
    },
  });

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreStep, setScoreStep] = useState(1);
  const [scoreResult, setScoreResult] = useState<"win" | "loss" | null>(null);
  const [scoreText, setScoreText] = useState("");
  const [scoreWhatWorked, setScoreWhatWorked] = useState<string[]>([]);
  const [scoreWhatDidnt, setScoreWhatDidnt] = useState<string[]>([]);
  const [scoreBiggestChallenge, setScoreBiggestChallenge] = useState<string | null>(null);
  const [scoreEnergy, setScoreEnergy] = useState<string | null>(null);
  const [scoreMood, setScoreMood] = useState<string | null>(null);
  const [scoreKeyTakeaway, setScoreKeyTakeaway] = useState("");

  const resetScoreModal = () => {
    setScoreStep(1);
    setScoreResult(null);
    setScoreText("");
    setScoreWhatWorked([]);
    setScoreWhatDidnt([]);
    setScoreBiggestChallenge(null);
    setScoreEnergy(null);
    setScoreMood(null);
    setScoreKeyTakeaway("");
    setShowScoreModal(false);
  };

  const toggleScoreChip = (id: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(id)) {
      setList(list.filter(x => x !== id));
    } else if (list.length < 3) {
      setList([...list, id]);
    }
  };

  const completeChallengeMutation = useMutation({
    mutationFn: async (data: { challengeId: string; withScore?: boolean }) => {
      const body: any = {};
      if (data.withScore && scoreResult) {
        const c = primaryChallenge;
        const isChallenger = c && String(c.challengerId) === String(playerId);
        const winnerId = scoreResult === "win" ? playerId : (isChallenger ? c?.opponentId : c?.challengerId);
        body.winnerPlayerId = winnerId;
        body.score = scoreText;
        body.resultStatus = "played";
        if (scoreWhatWorked.length > 0) body.whatWorked = scoreWhatWorked;
        if (scoreWhatDidnt.length > 0) body.whatDidntWork = scoreWhatDidnt;
        if (scoreBiggestChallenge) body.biggestChallenge = scoreBiggestChallenge;
        if (scoreEnergy) body.postMatchEnergy = scoreEnergy;
        if (scoreMood) body.postMatchMood = scoreMood;
        if (scoreKeyTakeaway) body.keyTakeaway = scoreKeyTakeaway;
      }
      const res = await fetch(
        new URL(`/api/matches/challenge/${data.challengeId}/complete?playerId=${playerId}`, getApiUrl()).toString(),
        {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error("Failed to complete challenge");
      return res.json();
    },
    onSuccess: () => {
      resetScoreModal();
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  /* PRIORITY ORDER: Lesson/Session > Challenge > Open Day
   * Challenges only display when sessionStatus === "none" — lessons ALWAYS take precedence */
  if (sessionStatus === "none" && hasChallenges) {
    const c = primaryChallenge!;
    const isChallenger = String(c.challengerId) === String(playerId);
    const opponentDisplayName = isChallenger ? (c.opponentName || "Opponent") : (c.challengerName || "Challenger");
    const opponentInitial = opponentDisplayName.charAt(0).toUpperCase();
    const totalChallenges = incomingChallenges.length + acceptedChallenges.length + sentPendingChallenges.length;

    const lifecycleColors: Record<ChallengeLifecycle, { accent: string; bg: string; gradient: string }> = {
      incoming: { accent: "#FF9500", bg: "rgba(255, 149, 0, 0.12)", gradient: "rgba(255, 149, 0, 0.08)" },
      confirmed: { accent: "#4DA3FF", bg: "rgba(77, 163, 255, 0.12)", gradient: "rgba(77, 163, 255, 0.08)" },
      sent: { accent: GlowColors.primary, bg: "rgba(200, 255, 61, 0.12)", gradient: "rgba(200, 255, 61, 0.06)" },
      match_live: { accent: "#FF4444", bg: "rgba(255, 68, 68, 0.12)", gradient: "rgba(255, 68, 68, 0.08)" },
      post_match: { accent: "#A855F7", bg: "rgba(168, 85, 247, 0.12)", gradient: "rgba(168, 85, 247, 0.08)" },
    };
    const { accent: accentColor, bg: accentBg, gradient: gradientStart } = lifecycleColors[challengeLifecycle];

    const lifecycleIcons: Record<ChallengeLifecycle, string> = {
      incoming: "zap",
      confirmed: "check-circle",
      sent: "send",
      match_live: "activity",
      post_match: "flag",
    };
    const lifecycleLabels: Record<ChallengeLifecycle, string> = {
      incoming: "Challenge Received",
      confirmed: "Match Confirmed",
      sent: "Challenge Sent",
      match_live: "Match in Progress",
      post_match: "Match Complete",
    };

    const formatChallengeTime12 = (timeStr: string) => {
      if (!timeStr) return "";
      const [h, m] = timeStr.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const hour = h % 12 || 12;
      return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    const formatChallengeDate = (dateStr: string) => {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    };

    return (
      <View style={styles.coachStyleCard}>
        <View style={[styles.coachCardAccentLine, { backgroundColor: accentColor }]} />
        <View
          style={[styles.coachCardGradient, { backgroundColor: "#0F141B" }]}
        >
          <View style={styles.commandHeader}>
            <View style={styles.commandTitleSection}>
              <View style={[styles.commandIconWrap, { backgroundColor: accentBg }]}>
                {challengeLifecycle === "match_live" ? (
                  <Animated.View style={[styles.cleanLiveDot, livePulseStyle]} />
                ) : (
                  <Feather name={lifecycleIcons[challengeLifecycle] as any} size={14} color={accentColor} />
                )}
              </View>
              <Text style={[styles.commandLabel, { color: accentColor }]}>
                {lifecycleLabels[challengeLifecycle]}
              </Text>
            </View>
            {totalChallenges > 1 ? (
              <View style={{ backgroundColor: accentColor + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: accentColor }}>
                  +{totalChallenges - 1} more
                </Text>
              </View>
            ) : null}
          </View>

          {challengeLifecycle === "match_live" ? (
            <View style={styles.cleanCountdownRow}>
              <View style={styles.cleanCountdownDigit}>
                <Text style={[styles.cleanCountdownValue, { color: "#FF4444" }]}>{String(challengeElapsed.hours).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.hrs")}</Text>
              </View>
              <Text style={[styles.cleanCountdownSep, { color: "#FF4444" }]}>:</Text>
              <View style={styles.cleanCountdownDigit}>
                <Text style={[styles.cleanCountdownValue, { color: "#FF4444" }]}>{String(challengeElapsed.minutes).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.min")}</Text>
              </View>
              <Text style={[styles.cleanCountdownSep, { color: "#FF4444" }]}>:</Text>
              <View style={styles.cleanCountdownDigit}>
                <Text style={[styles.cleanCountdownValue, { color: "#FF4444" }]}>{String(challengeElapsed.seconds).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.sec")}</Text>
              </View>
            </View>
          ) : (challengeLifecycle === "confirmed" || challengeLifecycle === "sent") ? (
            <View style={styles.cleanCountdownRow}>
              {challengeCountdown.days > 0 ? (
                <>
                  <View style={styles.cleanCountdownDigit}>
                    <Text style={[styles.cleanCountdownValue, { color: accentColor }]}>{String(challengeCountdown.days).padStart(2, "0")}</Text>
                    <Text style={styles.cleanCountdownLabel}>DAY</Text>
                  </View>
                  <Text style={[styles.cleanCountdownSep, { color: accentColor }]}>:</Text>
                </>
              ) : null}
              <View style={styles.cleanCountdownDigit}>
                <Text style={[styles.cleanCountdownValue, { color: accentColor }]}>{String(challengeCountdown.hours).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.hrs")}</Text>
              </View>
              <Text style={[styles.cleanCountdownSep, { color: accentColor }]}>:</Text>
              <View style={styles.cleanCountdownDigit}>
                <Text style={[styles.cleanCountdownValue, { color: accentColor }]}>{String(challengeCountdown.minutes).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.min")}</Text>
              </View>
              <Text style={[styles.cleanCountdownSep, { color: accentColor }]}>:</Text>
              <View style={styles.cleanCountdownDigit}>
                <Text style={[styles.cleanCountdownValue, { color: accentColor }]}>{String(challengeCountdown.seconds).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.sec")}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sessionInfo}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: accentBg,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: accentColor + "40",
            }}>
              <Text style={{ color: accentColor, fontWeight: "800", fontSize: 22 }}>{opponentInitial}</Text>
            </View>
            <View style={styles.sessionDetails}>
              <Text style={styles.cleanSessionType}>
                {challengeLifecycle === "incoming"
                  ? `${opponentDisplayName} challenges you!`
                  : challengeLifecycle === "match_live"
                  ? `Live: vs ${opponentDisplayName}`
                  : challengeLifecycle === "post_match"
                  ? `Played vs ${opponentDisplayName}`
                  : challengeLifecycle === "confirmed"
                  ? `Match vs ${opponentDisplayName}`
                  : `Sent to ${opponentDisplayName}`}
              </Text>
              <Text style={styles.coachLabel}>
                {(c.matchType || "Singles").charAt(0).toUpperCase() + (c.matchType || "singles").slice(1)} · {(c.matchFormat || "Friendly").charAt(0).toUpperCase() + (c.matchFormat || "friendly").slice(1)}
              </Text>
              <View style={{ flexDirection: "row", gap: Spacing.md, marginTop: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather name="calendar" size={11} color={ProTennisColors.textMuted} />
                  <Text style={styles.cleanCourtLabel}>{formatChallengeDate(c.scheduledDate)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather name="clock" size={11} color={ProTennisColors.textMuted} />
                  <Text style={styles.cleanCourtLabel}>{formatChallengeTime12(c.scheduledTime)}</Text>
                </View>
              </View>
              {(c.courtName || c.customLocation) ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 }}>
                  <Ionicons name="location-outline" size={12} color={ProTennisColors.textMuted} />
                  <Text style={styles.cleanCourtLabel}>{c.courtName || c.customLocation}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {c.message && challengeLifecycle !== "post_match" && challengeLifecycle !== "match_live" ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 2, borderLeftColor: accentColor + "40" }}>
              <Text style={{ fontSize: 12, color: ProTennisColors.textSecondary, fontStyle: "italic", lineHeight: 18 }}>"{c.message}"</Text>
            </View>
          ) : null}

          {challengeLifecycle === "incoming" ? (
            <>
              <View style={{ flexDirection: "row", gap: Spacing.md }}>
                <SwipeBlocker style={{ flex: 1 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.commandOutlineButton,
                      { borderColor: "rgba(255,255,255,0.1)" },
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      respondToChallengeMutation.mutate({ challengeId: c.id, response: "declined" });
                    }}
                    disabled={respondToChallengeMutation.isPending}
                  >
                    <Feather name="x" size={16} color={ProTennisColors.textSecondary} />
                    <Text style={styles.commandOutlineButtonText}>Decline</Text>
                  </Pressable>
                </SwipeBlocker>
                <SwipeBlocker style={{ flex: 1 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.cleanPrimaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      respondToChallengeMutation.mutate({ challengeId: c.id, response: "accepted" });
                    }}
                    disabled={respondToChallengeMutation.isPending}
                  >
                    <LinearGradient
                      colors={["#FF9500", "#FFB340"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cleanPrimaryGradient}
                    >
                      <Feather name="check-circle" size={18} color={Backgrounds.root} />
                      <Text style={styles.cleanPrimaryButtonText}>
                        {respondToChallengeMutation.isPending ? "Accepting..." : "Accept Challenge"}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </SwipeBlocker>
              </View>
              {incomingChallenges.length > 1 ? (
                <View style={styles.commandLinkRow}>
                  <SwipeBlocker>
                    <Pressable
                      style={({ pressed }) => [styles.commandLink, pressed && { opacity: 0.6 }]}
                      onPress={() => navigation.navigate("BookingInvites" as never)}
                      hitSlop={16}
                    >
                      <Feather name="inbox" size={14} color="#B8BCC6" />
                      <Text style={styles.commandLinkText}>View all {incomingChallenges.length} challenges</Text>
                    </Pressable>
                  </SwipeBlocker>
                </View>
              ) : null}
            </>
          ) : challengeLifecycle === "sent" ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingVertical: Spacing.sm }}>
              <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: GlowColors.primary }, livePulseStyle]} />
              <Text style={{ fontSize: 13, fontWeight: "500", color: ProTennisColors.textMuted }}>Waiting for response...</Text>
            </View>
          ) : challengeLifecycle === "confirmed" ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, backgroundColor: "rgba(77, 163, 255, 0.08)", borderRadius: 8, paddingVertical: 10 }}>
                <Feather name="check-circle" size={16} color="#4DA3FF" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#4DA3FF" }}>Match is on! See you on the court.</Text>
              </View>
              <View style={styles.cleanTextButtonRow}>
                <Pressable
                  style={({ pressed }) => [styles.cleanTextButton, pressed && { opacity: 0.6 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowCancelMatchModal(true);
                  }}
                >
                  <Feather name="x-circle" size={14} color={ProTennisColors.danger} />
                  <Text style={[styles.cleanTextButtonLabel, { color: ProTennisColors.danger }]}>Cancel Match</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.cleanTextButton, pressed && { opacity: 0.6 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowLateMatchModal(true);
                  }}
                >
                  <Feather name="clock" size={14} color={ProTennisColors.warning} />
                  <Text style={[styles.cleanTextButtonLabel, { color: ProTennisColors.warning }]}>Running Late</Text>
                </Pressable>
              </View>
            </>
          ) : challengeLifecycle === "match_live" ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, backgroundColor: "rgba(255, 68, 68, 0.08)", borderRadius: 8, paddingVertical: 10 }}>
                <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF4444" }, livePulseStyle]} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#FF4444" }}>Give it your all! Focus on every point.</Text>
              </View>
              <View style={{ flexDirection: "row", gap: Spacing.md }}>
                <SwipeBlocker style={{ flex: 1 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.cleanPrimaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      navigation.navigate("StartLiveMatch", {
                        opponentId: c.opponentId,
                        opponentName: opponentDisplayName,
                        challengeId: c.id,
                      });
                    }}
                  >
                    <LinearGradient
                      colors={["#FF4444", "#FF6B6B"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cleanPrimaryGradient}
                    >
                      <Feather name="activity" size={18} color="#FFFFFF" />
                      <Text style={[styles.cleanPrimaryButtonText, { color: "#FFFFFF" }]}>View Match</Text>
                    </LinearGradient>
                  </Pressable>
                </SwipeBlocker>
                <SwipeBlocker style={{ flex: 1 }}>
                  <Pressable
                    style={({ pressed }) => [styles.cleanTextButton, pressed && { opacity: 0.6 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowLateMatchModal(true);
                    }}
                  >
                    <Feather name="clock" size={14} color={ProTennisColors.warning} />
                    <Text style={[styles.cleanTextButtonLabel, { color: ProTennisColors.warning }]}>Running Late</Text>
                  </Pressable>
                </SwipeBlocker>
              </View>
            </>
          ) : challengeLifecycle === "post_match" ? (
            <>
              <View style={{ flexDirection: "row", gap: Spacing.md }}>
                <SwipeBlocker style={{ flex: 1 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.cleanPrimaryButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setShowScoreModal(true);
                    }}
                  >
                    <LinearGradient
                      colors={["#A855F7", "#C084FC"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cleanPrimaryGradient}
                    >
                      <Feather name="edit-3" size={18} color="#FFFFFF" />
                      <Text style={[styles.cleanPrimaryButtonText, { color: "#FFFFFF" }]}>Log Score</Text>
                    </LinearGradient>
                  </Pressable>
                </SwipeBlocker>
                <SwipeBlocker style={{ flex: 1 }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.commandOutlineButton,
                      { borderColor: "rgba(168, 85, 247, 0.2)" },
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      completeChallengeMutation.mutate({ challengeId: c.id });
                    }}
                    disabled={completeChallengeMutation.isPending}
                  >
                    <Feather name="skip-forward" size={16} color={ProTennisColors.textSecondary} />
                    <Text style={styles.commandOutlineButtonText}>
                      {completeChallengeMutation.isPending ? "Skipping..." : "Skip"}
                    </Text>
                  </Pressable>
                </SwipeBlocker>
              </View>
            </>
          ) : null}

          <Modal
            visible={showCancelMatchModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCancelMatchModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCancelMatchModal(false)} />
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Cancel Match</Text>
                  <Text style={styles.modalSubtitle}>
                    Are you sure you want to cancel this match vs {opponentDisplayName}? They will be notified.
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: Spacing.md, marginTop: Spacing.lg }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.commandOutlineButton,
                      { flex: 1, borderColor: "rgba(255,255,255,0.1)" },
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => setShowCancelMatchModal(false)}
                  >
                    <Text style={styles.commandOutlineButtonText}>Keep Match</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [{
                      flex: 1,
                      backgroundColor: ProTennisColors.danger,
                      borderRadius: 8,
                      paddingVertical: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                    }, pressed && { opacity: 0.8 }]}
                    onPress={() => cancelChallengeMutation.mutate(c.id)}
                    disabled={cancelChallengeMutation.isPending}
                  >
                    <Feather name="x-circle" size={16} color="#FFFFFF" />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>
                      {cancelChallengeMutation.isPending ? "Cancelling..." : "Cancel Match"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal
            visible={showLateMatchModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowLateMatchModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowLateMatchModal(false)} />
              <View style={styles.modalContent}>
                <KeyboardAwareScrollViewCompat
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Running Late</Text>
                    <Text style={styles.modalSubtitle}>Let {opponentDisplayName} know you'll be late</Text>
                  </View>
                  <Text style={{ color: ProTennisColors.textSecondary, fontSize: 13, marginTop: Spacing.md, marginBottom: Spacing.sm }}>How many minutes late?</Text>
                  <View style={{ flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" }}>
                    {[5, 10, 15, 20, 30].map((min) => (
                      <Pressable
                        key={min}
                        style={({ pressed }) => [{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: matchLateMinutes === min ? ProTennisColors.warning : "rgba(255,255,255,0.08)",
                          backgroundColor: matchLateMinutes === min ? "rgba(255, 165, 0, 0.12)" : "rgba(255,255,255,0.04)",
                        }, pressed && { opacity: 0.7 }]}
                        onPress={() => setMatchLateMinutes(min)}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: matchLateMinutes === min ? ProTennisColors.warning : ProTennisColors.textSecondary }}>
                          {min} min
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ color: ProTennisColors.textSecondary, fontSize: 13, marginTop: Spacing.md, marginBottom: Spacing.sm }}>Message (optional)</Text>
                  <TextInput
                    style={[styles.cancelReasonInput, { minHeight: 60 }]}
                    placeholder="e.g. Traffic, will be there soon!"
                    placeholderTextColor={ProTennisColors.textMuted}
                    value={matchLateMessage}
                    onChangeText={setMatchLateMessage}
                    multiline
                  />
                  <View style={{ flexDirection: "row", gap: Spacing.md, marginTop: Spacing.lg }}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.commandOutlineButton,
                        { flex: 1, borderColor: "rgba(255,255,255,0.1)" },
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => setShowLateMatchModal(false)}
                    >
                      <Text style={styles.commandOutlineButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [{
                        flex: 1,
                        backgroundColor: ProTennisColors.warning,
                        borderRadius: 8,
                        paddingVertical: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 6,
                      }, pressed && { opacity: 0.8 }]}
                      onPress={() => matchLateMutation.mutate({ challengeId: c.id, minutes: matchLateMinutes, message: matchLateMessage })}
                      disabled={matchLateMutation.isPending}
                    >
                      <Feather name="clock" size={16} color={Backgrounds.root} />
                      <Text style={{ fontSize: 14, fontWeight: "700", color: Backgrounds.root }}>
                        {matchLateMutation.isPending ? "Sending..." : "Notify"}
                      </Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </View>
            </View>
          </Modal>

          <Modal
            visible={showScoreModal}
            transparent
            animationType="slide"
            onRequestClose={resetScoreModal}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={resetScoreModal} />
              <View style={[styles.modalContent, { maxHeight: "85%" }]}>
                <KeyboardAwareScrollViewCompat
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.modalHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.modalTitle}>
                        {scoreStep === 1 ? "Match Result" : scoreStep === 2 ? "What Worked?" : "How Do You Feel?"}
                      </Text>
                      <Text style={{ color: ProTennisColors.textSecondary, fontSize: 12 }}>
                        {scoreStep}/3
                      </Text>
                    </View>
                    <Text style={styles.modalSubtitle}>
                      {scoreStep === 1
                        ? `Match vs ${opponentDisplayName}`
                        : scoreStep === 2
                        ? "Select up to 3 in each category"
                        : "Quick post-match check-in"}
                    </Text>
                  </View>

                  {scoreStep === 1 ? (
                    <View style={{ gap: Spacing.lg, marginTop: Spacing.md }}>
                      <View style={{ flexDirection: "row", gap: Spacing.md }}>
                        <Pressable
                          style={({ pressed }) => [{
                            flex: 1, paddingVertical: 20, borderRadius: 12, alignItems: "center", justifyContent: "center",
                            borderWidth: 2,
                            borderColor: scoreResult === "win" ? "#4ADE80" : "rgba(255,255,255,0.08)",
                            backgroundColor: scoreResult === "win" ? "rgba(74, 222, 128, 0.12)" : "rgba(255,255,255,0.03)",
                          }, pressed && { opacity: 0.8 }]}
                          onPress={() => setScoreResult("win")}
                        >
                          <Feather name="award" size={28} color={scoreResult === "win" ? "#4ADE80" : ProTennisColors.textSecondary} />
                          <Text style={{ fontSize: 16, fontWeight: "700", color: scoreResult === "win" ? "#4ADE80" : "#FFFFFF", marginTop: 8 }}>I Won</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [{
                            flex: 1, paddingVertical: 20, borderRadius: 12, alignItems: "center", justifyContent: "center",
                            borderWidth: 2,
                            borderColor: scoreResult === "loss" ? "#FF6B6B" : "rgba(255,255,255,0.08)",
                            backgroundColor: scoreResult === "loss" ? "rgba(255, 107, 107, 0.12)" : "rgba(255,255,255,0.03)",
                          }, pressed && { opacity: 0.8 }]}
                          onPress={() => setScoreResult("loss")}
                        >
                          <Feather name="shield" size={28} color={scoreResult === "loss" ? "#FF6B6B" : ProTennisColors.textSecondary} />
                          <Text style={{ fontSize: 16, fontWeight: "700", color: scoreResult === "loss" ? "#FF6B6B" : "#FFFFFF", marginTop: 8 }}>I Lost</Text>
                        </Pressable>
                      </View>
                      <View>
                        <Text style={{ color: ProTennisColors.textSecondary, fontSize: 13, marginBottom: Spacing.sm }}>Score (e.g. 6-4, 7-5)</Text>
                        <TextInput
                          style={styles.cancelReasonInput}
                          placeholder="6-4, 6-3"
                          placeholderTextColor={ProTennisColors.textMuted}
                          value={scoreText}
                          onChangeText={setScoreText}
                        />
                      </View>
                    </View>
                  ) : scoreStep === 2 ? (
                    <View style={{ gap: Spacing.lg, marginTop: Spacing.md }}>
                      <View>
                        <Text style={{ color: "#4ADE80", fontSize: 13, fontWeight: "600", marginBottom: Spacing.sm }}>What worked well?</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {["Serve", "Return", "Forehand", "Backhand", "Volleys", "Movement", "Tactics", "Mental"].map(item => (
                            <Pressable
                              key={item}
                              style={[{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                                borderColor: scoreWhatWorked.includes(item.toLowerCase()) ? "#4ADE80" : "rgba(255,255,255,0.08)",
                                backgroundColor: scoreWhatWorked.includes(item.toLowerCase()) ? "rgba(74, 222, 128, 0.12)" : "rgba(255,255,255,0.03)",
                              }]}
                              onPress={() => toggleScoreChip(item.toLowerCase(), scoreWhatWorked, setScoreWhatWorked)}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "500", color: scoreWhatWorked.includes(item.toLowerCase()) ? "#4ADE80" : ProTennisColors.textSecondary }}>
                                {item}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View>
                        <Text style={{ color: "#FF6B6B", fontSize: 13, fontWeight: "600", marginBottom: Spacing.sm }}>What needs work?</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {["Serve", "Return", "Forehand", "Backhand", "Volleys", "Movement", "Tactics", "Mental"].map(item => (
                            <Pressable
                              key={item}
                              style={[{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                                borderColor: scoreWhatDidnt.includes(item.toLowerCase()) ? "#FF6B6B" : "rgba(255,255,255,0.08)",
                                backgroundColor: scoreWhatDidnt.includes(item.toLowerCase()) ? "rgba(255, 107, 107, 0.12)" : "rgba(255,255,255,0.03)",
                              }]}
                              onPress={() => toggleScoreChip(item.toLowerCase(), scoreWhatDidnt, setScoreWhatDidnt)}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "500", color: scoreWhatDidnt.includes(item.toLowerCase()) ? "#FF6B6B" : ProTennisColors.textSecondary }}>
                                {item}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={{ gap: Spacing.lg, marginTop: Spacing.md }}>
                      <View>
                        <Text style={{ color: ProTennisColors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: Spacing.sm }}>Biggest challenge</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {["Nerves", "Opponent Level", "Focus", "Fatigue", "Tactics", "Errors"].map(item => (
                            <Pressable
                              key={item}
                              style={[{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                                borderColor: scoreBiggestChallenge === item.toLowerCase() ? "#A855F7" : "rgba(255,255,255,0.08)",
                                backgroundColor: scoreBiggestChallenge === item.toLowerCase() ? "rgba(168, 85, 247, 0.12)" : "rgba(255,255,255,0.03)",
                              }]}
                              onPress={() => setScoreBiggestChallenge(scoreBiggestChallenge === item.toLowerCase() ? null : item.toLowerCase())}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "500", color: scoreBiggestChallenge === item.toLowerCase() ? "#A855F7" : ProTennisColors.textSecondary }}>
                                {item}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View>
                        <Text style={{ color: ProTennisColors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: Spacing.sm }}>Post-match energy</Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {[
                            { id: "drained", label: "Drained" },
                            { id: "ok", label: "OK" },
                            { id: "energized", label: "Energized" },
                          ].map(item => (
                            <Pressable
                              key={item.id}
                              style={[{
                                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1,
                                borderColor: scoreEnergy === item.id ? "#4DA3FF" : "rgba(255,255,255,0.08)",
                                backgroundColor: scoreEnergy === item.id ? "rgba(77, 163, 255, 0.12)" : "rgba(255,255,255,0.03)",
                              }]}
                              onPress={() => setScoreEnergy(scoreEnergy === item.id ? null : item.id)}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", color: scoreEnergy === item.id ? "#4DA3FF" : ProTennisColors.textSecondary }}>
                                {item.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View>
                        <Text style={{ color: ProTennisColors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: Spacing.sm }}>Post-match mood</Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {[
                            { id: "frustrated", label: "Frustrated" },
                            { id: "neutral", label: "Neutral" },
                            { id: "satisfied", label: "Satisfied" },
                            { id: "happy", label: "Happy" },
                          ].map(item => (
                            <Pressable
                              key={item.id}
                              style={[{
                                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1,
                                borderColor: scoreMood === item.id ? "#FFD700" : "rgba(255,255,255,0.08)",
                                backgroundColor: scoreMood === item.id ? "rgba(255, 215, 0, 0.12)" : "rgba(255,255,255,0.03)",
                              }]}
                              onPress={() => setScoreMood(scoreMood === item.id ? null : item.id)}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "600", color: scoreMood === item.id ? "#FFD700" : ProTennisColors.textSecondary }}>
                                {item.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View>
                        <Text style={{ color: ProTennisColors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: Spacing.sm }}>Key takeaway (optional)</Text>
                        <TextInput
                          style={[styles.cancelReasonInput, { minHeight: 50 }]}
                          placeholder="What did you learn from this match?"
                          placeholderTextColor={ProTennisColors.textMuted}
                          value={scoreKeyTakeaway}
                          onChangeText={(t) => setScoreKeyTakeaway(t.slice(0, 100))}
                          maxLength={100}
                          multiline
                        />
                      </View>
                    </View>
                  )}

                  <View style={{ flexDirection: "row", gap: Spacing.md, marginTop: Spacing.xl }}>
                    {scoreStep > 1 ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.commandOutlineButton,
                          { flex: 1, borderColor: "rgba(255,255,255,0.1)" },
                          pressed && styles.buttonPressed,
                        ]}
                        onPress={() => setScoreStep(scoreStep - 1)}
                      >
                        <Text style={styles.commandOutlineButtonText}>Back</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [
                          styles.commandOutlineButton,
                          { flex: 1, borderColor: "rgba(255,255,255,0.1)" },
                          pressed && styles.buttonPressed,
                        ]}
                        onPress={resetScoreModal}
                      >
                        <Text style={styles.commandOutlineButtonText}>Cancel</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={({ pressed }) => [{
                        flex: 1, borderRadius: 8, paddingVertical: 12,
                        alignItems: "center", justifyContent: "center",
                        flexDirection: "row", gap: 6,
                        backgroundColor: scoreStep === 3 ? "#A855F7" : "rgba(168, 85, 247, 0.8)",
                        opacity: (scoreStep === 1 && !scoreResult) ? 0.5 : 1,
                      }, pressed && { opacity: 0.8 }]}
                      onPress={() => {
                        if (scoreStep < 3) {
                          setScoreStep(scoreStep + 1);
                        } else {
                          completeChallengeMutation.mutate({ challengeId: c.id, withScore: true });
                        }
                      }}
                      disabled={(scoreStep === 1 && !scoreResult) || completeChallengeMutation.isPending}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>
                        {scoreStep === 3
                          ? (completeChallengeMutation.isPending ? "Saving..." : "Submit")
                          : "Next"}
                      </Text>
                      {scoreStep < 3 ? <Feather name="arrow-right" size={16} color="#FFFFFF" /> : null}
                    </Pressable>
                  </View>
                </KeyboardAwareScrollViewCompat>
              </View>
            </View>
          </Modal>

        </View>
      </View>
    );
  }

  if (sessionStatus === "ended" && sessionId && !reflectionDismissed && reflectionLoading) {
    return (
      <View style={styles.coachStyleCard}>
        <View style={[styles.coachCardAccentLine, { backgroundColor: "#A78BFA" }]} />
        <View style={[styles.coachCardGradient, { backgroundColor: "#0F141B" }]}>
          <View style={styles.commandHeader}>
            <View style={styles.commandTitleSection}>
              <View style={styles.commandIconWrap}>
                <Feather name="calendar" size={14} color={GlowColors.primary} />
              </View>
              <Text style={styles.commandLabel}>{t("player.home.courtTime")}</Text>
            </View>
          </View>
          <View style={styles.commandDisplay}>
            <Text style={styles.commandPrimary}>{t("player.home.sessionComplete")}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (sessionStatus === "ended" && sessionId && !reflectionDismissed && !reflectionLoading && !reflectionAlreadyExists) {
    const durationLabel = sessionDuration ? `${sessionDuration} min` : null;
    const sessionSubtitle = [
      coachName ? `with ${coachName}` : null,
      durationLabel,
    ].filter(Boolean).join(" · ");
    return (
      <View style={styles.coachStyleCard}>
        <View style={[styles.coachCardAccentLine, { backgroundColor: "#A78BFA" }]} />
        <View style={[styles.coachCardGradient, { backgroundColor: "#0F141B" }]}>
          <View style={styles.commandHeader}>
            <View style={styles.commandTitleSection}>
              <View style={styles.commandIconWrap}>
                <Feather name="calendar" size={14} color={GlowColors.primary} />
              </View>
              <Text style={styles.commandLabel}>{t("player.home.courtTime")}</Text>
            </View>
            <SwipeBlocker>
              <Pressable
                onPress={handleDismissReflection}
                hitSlop={12}
                style={{ padding: 4 }}
              >
                <Feather name="x" size={18} color="#8A8F9E" />
              </Pressable>
            </SwipeBlocker>
          </View>

          <View style={styles.commandDisplay}>
            <Text style={styles.commandPrimary}>{t("player.home.sessionComplete")}</Text>
            {sessionSubtitle ? (
              <Text style={styles.commandSecondary}>{sessionSubtitle}</Text>
            ) : null}
          </View>

          <View style={[styles.commandActions, { marginTop: Spacing.md }]}>
            <SwipeBlocker>
              <Pressable
                style={({ pressed }) => [
                  styles.cleanPrimaryButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleReflectOnSession}
              >
                <LinearGradient
                  colors={["#7C3AED", "#A78BFA"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cleanPrimaryGradient}
                >
                  <Feather name="mic" size={18} color="#FFFFFF" />
                  <Text style={[styles.cleanPrimaryButtonText, { color: "#FFFFFF" }]}>{t("player.home.reflectOnSession")}</Text>
                </LinearGradient>
              </Pressable>
            </SwipeBlocker>

            <SwipeBlocker>
              <Pressable
                style={({ pressed }) => [
                  styles.commandOutlineButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleBookSession}
              >
                <Feather name="calendar" size={16} color={GlowColors.primary} />
                <Text style={styles.commandOutlineButtonText}>{t("player.home.bookLesson")}</Text>
              </Pressable>
            </SwipeBlocker>
          </View>
        </View>
      </View>
    );
  }

  if (sessionStatus === "none" || sessionStatus === "ended" || !sessionStatus) {
    return (
      <View style={styles.coachStyleCard}>
        <View style={styles.coachCardAccentLine} />
        <View
          style={[styles.coachCardGradient, { backgroundColor: "#0F141B" }]}
        >
          <View style={styles.commandHeader}>
            <View style={styles.commandTitleSection}>
              <View style={styles.commandIconWrap}>
                <Feather name="calendar" size={14} color={GlowColors.primary} />
              </View>
              <Text style={styles.commandLabel}>{t("player.home.courtTime")}</Text>
            </View>
          </View>

          <View style={styles.commandDisplay}>
            <Text style={styles.commandPrimary}>{t("player.home.noSessionsToday")}</Text>
            <Text style={styles.commandSecondary}>{t("player.home.hitTheCourt")}</Text>
          </View>

          <View style={styles.commandActions}>
            <SwipeBlocker>
              <Pressable
                style={({ pressed }) => [
                  styles.cleanPrimaryButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleBookSession}
              >
                <LinearGradient
                  colors={[GlowColors.primary, GlowColors.soft]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cleanPrimaryGradient}
                >
                  <Feather name="calendar" size={18} color={Backgrounds.root} />
                  <Text style={styles.cleanPrimaryButtonText}>{t("player.home.bookLesson")}</Text>
                </LinearGradient>
              </Pressable>
            </SwipeBlocker>

            <SwipeBlocker>
              <Pressable
                style={({ pressed }) => [
                  styles.commandOutlineButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleBookCourt}
              >
                <Feather name="grid" size={16} color={GlowColors.primary} />
                <Text style={styles.commandOutlineButtonText}>{t("player.home.bookCourt")}</Text>
              </Pressable>
            </SwipeBlocker>

            <View style={styles.commandLinkRow}>
              <SwipeBlocker>
                <Pressable
                  style={({ pressed }) => [
                    styles.commandLink,
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={handleFindMatch}
                  hitSlop={16}
                >
                  <Feather name="users" size={14} color="#B8BCC6" />
                  <Text style={styles.commandLinkText}>{t("player.home.findPlayers")}</Text>
                </Pressable>
              </SwipeBlocker>

              <SwipeBlocker>
                <Pressable
                  style={({ pressed }) => [
                    styles.commandLink,
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={handleJoinOpenGroup}
                  hitSlop={16}
                >
                  <Feather name="play-circle" size={14} color="#B8BCC6" />
                  <Text style={styles.commandLinkText}>{t("player.home.joinOpenGroup")}</Text>
                </Pressable>
              </SwipeBlocker>
            </View>
          </View>
        </View>
      </View>
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
                <Feather name="users" size={16} color={GlowColors.primary} />
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
      <View style={styles.coachStyleCard}>
        <View style={[styles.coachCardAccentLine, { backgroundColor: ProTennisColors.live }]} />
        <View
          style={[styles.coachCardGradient, { backgroundColor: "#0F141B" }]}
        >
          <View style={styles.commandHeader}>
            <View style={styles.commandTitleSection}>
              <View style={[styles.commandIconWrap, { backgroundColor: "rgba(255, 68, 68, 0.12)" }]}>
                <Animated.View style={[styles.cleanLiveDot, livePulseStyle]} />
              </View>
              <Text style={[styles.commandLabel, { color: ProTennisColors.live }]}>{t("player.home.liveNow")}</Text>
            </View>
          </View>

          <View style={styles.commandDisplay}>
            <View style={styles.liveCountdownRow}>
              <View style={styles.cleanCountdownDigit}>
                <Text style={styles.cleanCountdownValue}>{String(countdown.hours).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.hrs")}</Text>
              </View>
              <Text style={styles.cleanCountdownSep}>:</Text>
              <View style={styles.cleanCountdownDigit}>
                <Text style={styles.cleanCountdownValue}>{String(countdown.minutes).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.min")}</Text>
              </View>
              <Text style={styles.cleanCountdownSep}>:</Text>
              <View style={styles.cleanCountdownDigit}>
                <Text style={styles.cleanCountdownValue}>{String(countdown.seconds).padStart(2, "0")}</Text>
                <Text style={styles.cleanCountdownLabel}>{t("player.home.sec")}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              source={coachPhotoUrl}
              name={coachName || "Coach"}
              size="lg"
              showGlow={false}
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.cleanSessionType}>{sessionType || t("player.home.trainingSession")}</Text>
              <Text style={styles.coachLabel}>{t("player.home.withCoach", { name: coachName || t("common.coach") })}</Text>
              {sessionCourtName ? (
                <Text style={styles.cleanCourtLabel}>{sessionCourtName}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.liveButtonsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.liveButton,
                styles.cleanAttendButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCheckIn}
            >
              <Feather name="check-circle" size={18} color={Backgrounds.root} />
              <Text style={styles.cleanAttendButtonText}>{t("player.home.attend")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.liveButton,
                styles.cleanMutedButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleExtend}
            >
              <Feather name="plus-circle" size={16} color="#B8BCC6" />
              <Text style={styles.cleanMutedButtonText}>{t("player.home.extend")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.liveButton,
                styles.cleanMutedButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowReportModal(true);
              }}
            >
              <Feather name="alert-circle" size={16} color="#B8BCC6" />
              <Text style={styles.cleanMutedButtonText}>{t("player.home.report")}</Text>
            </Pressable>
          </View>

          <View style={styles.cleanTextButtonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.cleanTextButton,
                pressed && { opacity: 0.6 },
              ]}
              onPress={handleCancel}
            >
              <Feather name="x-circle" size={14} color={ProTennisColors.danger} />
              <Text style={[styles.cleanTextButtonLabel, { color: ProTennisColors.danger }]}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.cleanTextButton,
                pressed && { opacity: 0.6 },
              ]}
              onPress={handleLate}
            >
              <Feather name="clock" size={14} color={ProTennisColors.warning} />
              <Text style={[styles.cleanTextButtonLabel, { color: ProTennisColors.warning }]}>{t("player.home.delay")}</Text>
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
            <View style={styles.modalOverlay} pointerEvents="box-none">
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCancelModal(false)} />
              <View style={[styles.modalContent, { zIndex: 1 }]}>
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
      </View>
    );
  }

  if (sessionStatus === "soon" || sessionStatus === "upcoming") {
    const isSoon = sessionStatus === "soon";
    
    return (
      <View style={styles.coachStyleCard}>
        <View style={[styles.coachCardAccentLine, isSoon ? { backgroundColor: ProTennisColors.warning } : undefined]} />
        <View
          style={[styles.coachCardGradient, { backgroundColor: "#0F141B" }]}
        >
          <View style={styles.commandHeader}>
            <View style={styles.commandTitleSection}>
              <View style={[styles.commandIconWrap, isSoon ? { backgroundColor: "rgba(255, 165, 0, 0.12)" } : undefined]}>
                <Feather name="clock" size={14} color={isSoon ? ProTennisColors.warning : GlowColors.primary} />
              </View>
              <Text style={[styles.commandLabel, { color: isSoon ? ProTennisColors.warning : GlowColors.primary }]}>
                {isSoon ? t("player.home.startingSoon") : t("player.home.nextSession")}
              </Text>
            </View>
            {isSoon ? (
              <Animated.View style={[styles.soonPulse, livePulseStyle]} />
            ) : null}
          </View>

          <View style={styles.cleanCountdownRow}>
            <View style={styles.cleanCountdownDigit}>
              <Text style={styles.cleanCountdownValue}>{String(countdown.hours).padStart(2, "0")}</Text>
              <Text style={styles.cleanCountdownLabel}>{t("player.home.hrs")}</Text>
            </View>
            <Text style={styles.cleanCountdownSep}>:</Text>
            <View style={styles.cleanCountdownDigit}>
              <Text style={styles.cleanCountdownValue}>{String(countdown.minutes).padStart(2, "0")}</Text>
              <Text style={styles.cleanCountdownLabel}>{t("player.home.min")}</Text>
            </View>
            <Text style={styles.cleanCountdownSep}>:</Text>
            <View style={styles.cleanCountdownDigit}>
              <Text style={styles.cleanCountdownValue}>{String(countdown.seconds).padStart(2, "0")}</Text>
              <Text style={styles.cleanCountdownLabel}>{t("player.home.sec")}</Text>
            </View>
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              source={coachPhotoUrl}
              name={coachName || t("common.coach")}
              size="lg"
              showGlow={false}
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.cleanSessionType}>{sessionType || t("player.home.trainingSession")}</Text>
              <Text style={styles.coachLabel}>{t("player.home.withCoach", { name: coachName || t("common.coach") })}</Text>
              {sessionCourtName ? (
                <Text style={styles.cleanCourtLabel}>{sessionCourtName}</Text>
              ) : null}
            </View>
          </View>

          {isSoon ? (
            hasCheckedIn ? (
              <View style={styles.checkedInIndicator}>
                <Feather name="check-circle" size={18} color={Colors.success} />
                <Text style={styles.checkedInText}>{t("player.home.checkedIn")}</Text>
              </View>
            ) : (
              <SwipeBlocker>
                <Pressable
                  style={({ pressed }) => [
                    styles.cleanPrimaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleCheckIn}
                  disabled={checkInMutation.isPending}
                >
                  <LinearGradient
                    colors={[GlowColors.primary, GlowColors.soft]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.cleanPrimaryGradient, checkInMutation.isPending ? { opacity: 0.7 } : undefined]}
                  >
                    <Feather name="check-circle" size={18} color={Backgrounds.root} />
                    <Text style={styles.cleanPrimaryButtonText}>{checkInMutation.isPending ? t("player.home.checkingIn") : t("player.home.checkInEarly")}</Text>
                  </LinearGradient>
                </Pressable>
              </SwipeBlocker>
            )
          ) : null}

          <View style={styles.cleanTextButtonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.cleanTextButton,
                pressed && { opacity: 0.6 },
              ]}
              onPress={handleCancel}
            >
              <Feather name="x-circle" size={14} color={ProTennisColors.danger} />
              <Text style={[styles.cleanTextButtonLabel, { color: ProTennisColors.danger }]}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.cleanTextButton,
                pressed && { opacity: 0.6 },
              ]}
              onPress={handleLate}
            >
              <Feather name="clock" size={14} color={ProTennisColors.warning} />
              <Text style={[styles.cleanTextButtonLabel, { color: ProTennisColors.warning }]}>{t("player.home.delay")}</Text>
            </Pressable>
          </View>

          {/* Cancel Session Modal */}
          <Modal
            visible={showCancelModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCancelModal(false)}
          >
            <View style={styles.modalOverlay} pointerEvents="box-none">
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCancelModal(false)} />
              <View style={[styles.modalContent, { zIndex: 1 }]}>
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
      </View>
    );
  }

  return (
    <View style={styles.coachStyleCard}>
      <View style={styles.coachCardAccentLine} />
      <View
        style={[styles.coachCardGradient, { backgroundColor: "#0F141B" }]}
      >
        <View style={styles.commandHeader}>
          <View style={styles.commandTitleSection}>
            <View style={styles.commandIconWrap}>
              <Feather name="calendar" size={14} color={GlowColors.primary} />
            </View>
            <Text style={styles.commandLabel}>{t("player.home.courtTime")}</Text>
          </View>
        </View>

        <View style={styles.commandDisplay}>
          <Text style={styles.commandPrimary}>{t("player.home.noSessionsToday")}</Text>
          <Text style={styles.commandSecondary}>{t("player.home.hitTheCourt")}</Text>
        </View>

        <View style={styles.commandActions}>
          <SwipeBlocker>
            <Pressable
              style={({ pressed }) => [
                styles.cleanPrimaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleBookSession}
            >
              <LinearGradient
                colors={[GlowColors.primary, GlowColors.soft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cleanPrimaryGradient}
              >
                <Feather name="calendar" size={18} color={Backgrounds.root} />
                <Text style={styles.cleanPrimaryButtonText}>{t("player.home.bookLesson")}</Text>
              </LinearGradient>
            </Pressable>
          </SwipeBlocker>

          <SwipeBlocker>
            <Pressable
              style={({ pressed }) => [
                styles.commandOutlineButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleBookCourt}
            >
              <Feather name="grid" size={16} color={GlowColors.primary} />
              <Text style={styles.commandOutlineButtonText}>{t("player.home.bookCourt")}</Text>
            </Pressable>
          </SwipeBlocker>

          <View style={styles.commandLinkRow}>
            <SwipeBlocker>
              <Pressable
                style={({ pressed }) => [
                  styles.commandLink,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={handleFindMatch}
                hitSlop={16}
              >
                <Feather name="users" size={14} color="#B8BCC6" />
                <Text style={styles.commandLinkText}>{t("player.home.findPlayers")}</Text>
              </Pressable>
            </SwipeBlocker>

            <SwipeBlocker>
              <Pressable
                style={({ pressed }) => [
                  styles.commandLink,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={handleJoinOpenGroup}
                hitSlop={16}
              >
                <Feather name="play-circle" size={14} color="#B8BCC6" />
                <Text style={styles.commandLinkText}>{t("player.home.joinOpenGroup")}</Text>
              </Pressable>
            </SwipeBlocker>
          </View>
        </View>
      </View>
    </View>
  );
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
    borderColor: `${GlowColors.primary}50`,
    backgroundColor: "rgba(200, 255, 61, 0.05)",
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
    borderColor: GlowColors.primary,
  },
  secondaryButtonText: {
    color: GlowColors.primary,
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
    color: GlowColors.primary,
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
    color: GlowColors.primary,
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
    backgroundColor: `${GlowColors.primary}15`,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}40`,
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
    color: GlowColors.primary,
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

  cleanCard: {
    ...CardElevation.base,
    ...CardElevation.shadow,
    borderRadius: BorderRadius.lg,
  },
  coachStyleCard: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: "#0F141B",
  },
  coachCardAccentLine: {
    height: 2,
    backgroundColor: GlowColors.primary,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    opacity: 0.2,
  },
  coachCardGradient: {
    padding: Spacing.lg,
  },
  coachIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(200, 255, 61, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  coachStakeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(200, 255, 61, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  coachSecondaryButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
    backgroundColor: "rgba(200, 255, 61, 0.04)",
  },
  commandHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  commandTitleSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  commandIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(200, 255, 61, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  commandLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: GlowColors.primary,
    letterSpacing: 2,
  },
  commandDisplay: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  commandPrimary: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  commandSecondary: {
    fontSize: 14,
    color: "#8A8F9E",
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  commandActions: {
    gap: Spacing.sm,
  },
  commandOutlineButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
    backgroundColor: "rgba(200, 255, 61, 0.04)",
  },
  commandOutlineButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 1,
  },
  commandLinkRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  commandLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commandLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8A8F9E",
  },
  liveAccentBorder: {
    borderLeftWidth: 3,
    borderLeftColor: ProTennisColors.live,
  },
  cleanHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  cleanIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  cleanTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  cleanSubtitle: {
    ...Typography.small,
    color: "#8A8F9E",
    marginTop: 2,
  },
  cleanStakesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  cleanStakeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  cleanStakeText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#8A8F9E",
    letterSpacing: 0.2,
  },
  cleanActionsContainer: {
    gap: Spacing.md,
    width: "100%",
  },
  checkedInIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
  },
  checkedInText: {
    color: Colors.success,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  cleanPrimaryButton: {
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  cleanPrimaryGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  cleanPrimaryButtonText: {
    color: Backgrounds.root,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  cleanSecondaryButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  cleanSecondaryButtonText: {
    color: GlowColors.primary,
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  cleanTextButtonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    marginTop: Spacing.xs,
  },
  cleanTextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  cleanTextButtonLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#B8BCC6",
  },
  cleanLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ProTennisColors.live,
  },
  cleanLiveText: {
    color: ProTennisColors.live,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cleanCountdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginVertical: Spacing.lg,
  },
  cleanCountdownDigit: {
    alignItems: "center",
    minWidth: 50,
  },
  cleanCountdownValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  cleanCountdownLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#8A8F9E",
    letterSpacing: 0.5,
    marginTop: -2,
  },
  cleanCountdownSep: {
    fontSize: 28,
    fontWeight: "300",
    color: "#8A8F9E",
    marginTop: 2,
    marginHorizontal: 2,
  },
  cleanSessionType: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.xs,
  },
  cleanCourtLabel: {
    ...Typography.caption,
    color: "#B8BCC6",
    marginTop: 2,
  },
  cleanAttendButton: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
  },
  cleanAttendButtonText: {
    color: Backgrounds.root,
    fontWeight: "700",
    fontSize: 14,
  },
  cleanMutedButton: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
  },
  cleanMutedButtonText: {
    color: "#B8BCC6",
    fontWeight: "600",
    fontSize: 13,
  },
  cleanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  cleanBadgeText: {
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 0.3,
  },
});
