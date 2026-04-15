import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn, LinearTransition } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, GlowColors, Backgrounds, TextColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getApiUrl, getAuthHeaders, getEffectivePlayerId } from "@/lib/query-client";
import { useTabNavigation } from "@/components/TabNavigationContext";
import * as Haptics from "expo-haptics";

interface Challenge {
  id: number;
  challengerId: number;
  opponentId: number;
  status: string;
  matchType: string;
  matchFormat: string;
  scheduledDate: string;
  scheduledTime: string;
  courtName?: string;
  message?: string;
  challengerName?: string;
  opponentName?: string;
  challengerPhotoUrl?: string;
  opponentPhotoUrl?: string;
}

function getInitial(name?: string): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

function getCountdown(dateStr: string, timeStr: string) {
  const now = new Date();
  const [hours, minutes] = (timeStr || "00:00").split(":").map(Number);
  const target = new Date(dateStr);
  target.setHours(hours, minutes, 0, 0);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0 };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours: h, minutes: m };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatMatchType(type: string): string {
  if (!type) return "";
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

function formatMatchFormat(format: string): string {
  if (!format) return "";
  return format.charAt(0).toUpperCase() + format.slice(1).toLowerCase();
}

function AvatarCircle({ name, size = 36 }: { name?: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{getInitial(name)}</Text>
    </View>
  );
}

function IncomingChallengeCard({
  challenge,
  playerId,
}: {
  challenge: Challenge;
  playerId: string;
}) {
  const queryClient = useQueryClient();

  const respondMutation = useMutation({
    mutationFn: async (response: "accepted" | "declined") => {
      return apiRequest(
        "POST",
        `/api/matches/challenge/${challenge.id}/respond?playerId=${playerId}`,
        { response }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error?.message || "Failed to respond to challenge");
    },
  });

  const handleAccept = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    respondMutation.mutate("accepted");
  };

  const handleDecline = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    respondMutation.mutate("declined");
  };

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.challengeCard}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Ionicons name="flash" size={16} color={GlowColors.primary} />
        </View>
        <Text style={styles.challengeLabel}>Challenge</Text>
      </View>

      <View style={styles.challengerRow}>
        <AvatarCircle name={challenge.challengerName} />
        <View style={styles.challengerInfo}>
          <Text style={styles.challengeTitle}>
            {challenge.challengerName || "Someone"} challenges you!
          </Text>
          <Text style={styles.matchMeta}>
            {formatMatchType(challenge.matchType)} · {formatMatchFormat(challenge.matchFormat)}
          </Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="calendar-outline" size={13} color={TextColors.muted} />
          <Text style={styles.detailText}>{formatDate(challenge.scheduledDate)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons name="time-outline" size={13} color={TextColors.muted} />
          <Text style={styles.detailText}>{formatTime(challenge.scheduledTime)}</Text>
        </View>
        {challenge.courtName ? (
          <View style={styles.detailItem}>
            <Ionicons name="location-outline" size={13} color={TextColors.muted} />
            <Text style={styles.detailText}>{challenge.courtName}</Text>
          </View>
        ) : null}
      </View>

      {challenge.message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>"{challenge.message}"</Text>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.declineButton, pressed && { opacity: 0.7 }]}
          onPress={handleDecline}
          disabled={respondMutation.isPending}
        >
          <Text style={styles.declineButtonText}>Decline</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.acceptButton, pressed && { opacity: 0.85 }]}
          onPress={handleAccept}
          disabled={respondMutation.isPending}
        >
          <LinearGradient
            colors={[GlowColors.primary, GlowColors.soft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.acceptGradient}
          >
            <Ionicons name="checkmark" size={16} color={Backgrounds.root} />
            <Text style={styles.acceptButtonText}>Accept</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function UpcomingMatchCard({ challenge, playerId }: { challenge: Challenge; playerId: string }) {
  const [countdown, setCountdown] = useState(getCountdown(challenge.scheduledDate, challenge.scheduledTime));

  const isChallenger = String(challenge.challengerId) === String(playerId);
  const opponentName = isChallenger ? challenge.opponentName : challenge.challengerName;

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getCountdown(challenge.scheduledDate, challenge.scheduledTime));
    }, 60000);
    return () => clearInterval(interval);
  }, [challenge.scheduledDate, challenge.scheduledTime]);

  const countdownText =
    countdown.days > 0
      ? `${countdown.days}d ${countdown.hours}h`
      : countdown.hours > 0
        ? `${countdown.hours}h ${countdown.minutes}m`
        : `${countdown.minutes}m`;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.upcomingCard}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: "rgba(77, 163, 255, 0.15)" }]}>
          <Ionicons name="tennisball" size={14} color="#4DA3FF" />
        </View>
        <Text style={styles.challengeLabel}>Upcoming Match</Text>
        <View style={styles.countdownBadge}>
          <Ionicons name="timer-outline" size={12} color={GlowColors.primary} />
          <Text style={styles.countdownText}>{countdownText}</Text>
        </View>
      </View>

      <View style={styles.challengerRow}>
        <AvatarCircle name={opponentName} />
        <View style={styles.challengerInfo}>
          <Text style={styles.challengeTitle}>Match vs {opponentName || "Opponent"}</Text>
          <Text style={styles.matchMeta}>
            {formatMatchType(challenge.matchType)} · {formatMatchFormat(challenge.matchFormat)}
          </Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="calendar-outline" size={13} color={TextColors.muted} />
          <Text style={styles.detailText}>{formatDate(challenge.scheduledDate)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons name="time-outline" size={13} color={TextColors.muted} />
          <Text style={styles.detailText}>{formatTime(challenge.scheduledTime)}</Text>
        </View>
        {challenge.courtName ? (
          <View style={styles.detailItem}>
            <Ionicons name="location-outline" size={13} color={TextColors.muted} />
            <Text style={styles.detailText}>{challenge.courtName}</Text>
          </View>
        ) : null}
      </View>

      <Pressable style={({ pressed }) => [styles.viewDetailsButton, pressed && { opacity: 0.7 }]}>
        <Text style={styles.viewDetailsText}>View Details</Text>
        <Ionicons name="chevron-forward" size={14} color={TextColors.secondary} />
      </Pressable>
    </Animated.View>
  );
}

export function ChallengeCard() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();

  const { data: challenges = [] } = useQuery<Challenge[]>({
    queryKey: ["/api/matches/challenges", user?.playerId],
    queryFn: async () => {
      if (!user?.playerId) return [];
      const res = await fetch(
        new URL(`/api/matches/challenge?playerId=${user.playerId}`, getApiUrl()).toString(),
        {
          headers: getAuthHeaders(),
          credentials: "include",
        }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.playerId,
  });

  const playerId = getEffectivePlayerId(user?.playerId);

  const incoming = challenges.filter(
    (c) => c.status === "pending" && String(c.opponentId) === String(playerId)
  );

  const upcoming = challenges.filter(
    (c) =>
      c.status === "accepted" &&
      (String(c.challengerId) === String(playerId) || String(c.opponentId) === String(playerId))
  );

  if (incoming.length === 0 && upcoming.length === 0) {
    return (
      <Animated.View entering={FadeIn.duration(300)} layout={LinearTransition.springify()} style={collapsedStyles.pill}>
        <View style={[collapsedStyles.iconWrap, { backgroundColor: "rgba(77, 163, 255, 0.12)" }]}>
          <Ionicons name="tennisball-outline" size={18} color="#4DA3FF" />
        </View>
        <View style={collapsedStyles.textGroup}>
          <Text style={collapsedStyles.label}>Match</Text>
          <Text style={collapsedStyles.hint}>No upcoming matches</Text>
        </View>
        <Pressable
          style={collapsedStyles.ctaButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Players" } });
          }}
        >
          <Text style={collapsedStyles.ctaText}>Find</Text>
          <Ionicons name="chevron-forward" size={14} color={TextColors.muted} />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View layout={LinearTransition.springify()} style={styles.container}>
      {incoming.map((c) => (
        <IncomingChallengeCard key={c.id} challenge={c} playerId={String(playerId)} />
      ))}
      {upcoming.map((c) => (
        <UpcomingMatchCard key={c.id} challenge={c} playerId={String(playerId)} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
  },
  challengeCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  upcomingCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(77, 163, 255, 0.15)",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(200, 255, 61, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  challengeLabel: {
    ...Typography.labelSmall,
    color: TextColors.secondary,
    flex: 1,
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(200, 255, 61, 0.08)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  countdownText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  challengerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatar: {
    backgroundColor: "rgba(200, 255, 61, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: GlowColors.primary,
    fontWeight: "700",
  },
  challengerInfo: {
    flex: 1,
    gap: 2,
  },
  challengeTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: TextColors.primary,
  },
  matchMeta: {
    fontSize: FontSizes.sm,
    color: TextColors.muted,
  },
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: FontSizes.xs,
    color: TextColors.secondary,
  },
  messageBox: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  messageText: {
    fontSize: FontSizes.sm,
    color: TextColors.secondary,
    fontStyle: "italic",
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  declineButton: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  declineButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: TextColors.secondary,
  },
  acceptButton: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  acceptGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  acceptButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Backgrounds.root,
  },
  viewDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
  },
  viewDetailsText: {
    fontSize: FontSizes.sm,
    fontWeight: "500",
    color: TextColors.secondary,
  },
});

const collapsedStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: TextColors.primary,
  },
  hint: {
    fontSize: 11,
    color: TextColors.muted,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
    color: TextColors.secondary,
  },
});
