import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, Alert } from "react-native";
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
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useMutation } from "@tanstack/react-query";
import { GlassCard } from "./GlassCard";
import { GlowAvatar } from "./GlowAvatar";
import { ProTennisColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
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

export function SessionHeroCard({
  onCheckIn,
  onCancel,
  onExtend,
  onBookSession,
  onFindMatch,
}: SessionHeroCardProps) {
  const navigation = useNavigation<any>();
  const { state } = usePlayerState();
  const { sessionStatus, minutesToNextSession, minutesRemaining, coachName, sessionCourtName, sessionType, coachPhotoUrl, sessionId } = state;

  const pulseValue = useSharedValue(0);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedIssueType, setSelectedIssueType] = useState<string | null>(null);
  const [issueDescription, setIssueDescription] = useState("");

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
    if (onCancel) {
      onCancel();
    } else {
      Alert.alert(
        "Cancel Session?",
        "Canceling will cost you 50 XP. Are you sure?",
        [
          { text: "Keep Session", style: "cancel" },
          { 
            text: "Cancel (-50 XP)", 
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert("Session Cancelled", "Your session has been cancelled. -50 XP");
            }
          },
        ]
      );
    }
  };

  if (sessionStatus === "none") {
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
      <GlassCard variant="neon" neonColor={ProTennisColors.electricGreen} animated style={styles.heroCard}>
        <View style={styles.liveContent}>
          <View style={styles.liveHeader}>
            <View style={styles.liveIndicatorRow}>
              <Animated.View style={[styles.liveDot, livePulseStyle]} />
              <Text style={styles.liveText}>LIVE NOW</Text>
            </View>
            <View style={styles.liveTimerContainer}>
              <Text style={styles.liveTimerLabel}>TIME LEFT</Text>
              <Text style={styles.liveTimer}>
                {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
              </Text>
            </View>
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              source={coachPhotoUrl}
              name={coachName || "Coach"}
              size="lg"
              showGlow
              glowColor={ProTennisColors.electricGreen}
              pulsing
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionType}>{sessionType || "Training"}</Text>
              <Text style={styles.coachLabel}>with {coachName || "Your Coach"}</Text>
              {sessionCourtName && (
                <Text style={styles.courtLabel}>{sessionCourtName}</Text>
              )}
            </View>
          </View>

          <View style={styles.liveStakes}>
            <View style={styles.stakeItem}>
              <Feather name="eye" size={14} color={ProTennisColors.neonCyan} />
              <Text style={styles.stakeText}>Coach is tracking your progress</Text>
            </View>
            <View style={styles.stakeItem}>
              <Feather name="zap" size={14} color={ProTennisColors.electricGreen} />
              <Text style={styles.stakeText}>+100 XP for completing session</Text>
            </View>
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

          <View style={styles.liveCancelRow}>
            <Pressable
              style={({ pressed }) => [
                styles.liveCancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCancel}
            >
              <View style={styles.cancelButtonContent}>
                <Feather name="x-circle" size={16} color={ProTennisColors.danger} />
                <Text style={styles.liveCancelText}>CANCEL SESSION</Text>
                <Text style={styles.consequenceHint}>-50 XP</Text>
              </View>
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
        </View>
      </GlassCard>
    );
  }

  if (sessionStatus === "soon" || sessionStatus === "upcoming") {
    const isSoon = sessionStatus === "soon";
    const formattedTime = countdown.hours > 0 
      ? `${countdown.hours}h ${countdown.minutes}m`
      : `${countdown.minutes}m ${countdown.seconds}s`;
    
    return (
      <GlassCard 
        variant={isSoon ? "neon" : "default"} 
        neonColor={isSoon ? ProTennisColors.warning : undefined}
        animated={isSoon}
        style={styles.heroCard}
      >
        <View style={styles.upcomingContent}>
          <View style={styles.upcomingHeader}>
            <View style={styles.nextSessionBadge}>
              <Feather name="clock" size={14} color={isSoon ? ProTennisColors.warning : ProTennisColors.neonCyan} />
              <Text style={[styles.nextSessionText, isSoon && { color: ProTennisColors.warning }]}>
                NEXT SESSION IN {formattedTime.toUpperCase()}
              </Text>
            </View>
            {isSoon && (
              <Animated.View style={[styles.soonPulse, livePulseStyle]} />
            )}
          </View>

          <View style={styles.sessionInfo}>
            <GlowAvatar
              source={coachPhotoUrl}
              name={coachName || "Coach"}
              size="lg"
              showGlow={isSoon}
              glowColor={isSoon ? ProTennisColors.warning : ProTennisColors.electricGreen}
              pulsing={isSoon}
            />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionType}>{sessionType || "Training Session"}</Text>
              <Text style={styles.coachLabel}>with {coachName || "Your Coach"}</Text>
              {sessionCourtName && (
                <Text style={styles.courtInfo}>{sessionCourtName}</Text>
              )}
            </View>
          </View>

          <View style={styles.upcomingStakes}>
            <Text style={styles.stakesTitle}>WHAT'S AT STAKE</Text>
            <View style={styles.stakesGrid}>
              <View style={styles.stakeCard}>
                <Feather name="zap" size={16} color={ProTennisColors.electricGreen} />
                <Text style={styles.stakeCardValue}>+75 XP</Text>
                <Text style={styles.stakeCardLabel}>Attendance</Text>
              </View>
              <View style={styles.stakeCard}>
                <Feather name="trending-up" size={16} color={ProTennisColors.neonCyan} />
                <Text style={styles.stakeCardValue}>Level Up</Text>
                <Text style={styles.stakeCardLabel}>Progress</Text>
              </View>
              <View style={styles.stakeCard}>
                <Feather name="eye" size={16} color={ProTennisColors.warning} />
                <Text style={styles.stakeCardValue}>Focus</Text>
                <Text style={styles.stakeCardLabel}>Coach Watch</Text>
              </View>
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
                onPress={handleCheckIn}
              >
                <Feather name="check-circle" size={18} color={ProTennisColors.midnightBlue} />
                <Text style={styles.checkInButtonText}>CHECK IN EARLY</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCancel}
            >
              <View style={styles.cancelButtonContent}>
                <Feather name="x-circle" size={18} color={ProTennisColors.danger} />
                <Text style={styles.cancelButtonText}>CANCEL</Text>
                <Text style={styles.consequenceHint}>-50 XP</Text>
              </View>
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
    backgroundColor: "rgba(0, 0, 0, 0.8)",
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
});
