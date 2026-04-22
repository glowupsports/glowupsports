import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, FontSizes, BorderRadius, GlowColors } from "@/constants/theme";
import { Card } from "@/components/Card";
import { CourtBookingPanel } from "@/components/CourtBooking";
import { apiRequest, getApiUrl, getAuthHeaders, getEffectivePlayerId } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface BookingInvite {
  booking_invite_guests: {
    id: string;
    inviteId: string;
    playerId: string;
    status: string;
    shareAmount: string | null;
    respondedAt: string | null;
  };
  booking_invites: {
    id: string;
    bookingId: string;
    hostPlayerId: string;
    splitCost: boolean;
    costPerPerson: string | null;
    currency: string;
    totalInvited: number;
    totalAccepted: number;
  };
}

function InviteCard({
  invite,
  onAccept,
  onDecline,
  isLoading,
}: {
  invite: BookingInvite;
  onAccept: () => void;
  onDecline: () => void;
  isLoading: boolean;
}) {
  const guest = invite.booking_invite_guests;
  const inv = invite.booking_invites;
  const isPending = guest.status === "pending";
  const isAccepted = guest.status === "accepted";
  const isDeclined = guest.status === "declined";

  return (
    <Animated.View entering={FadeInRight.delay(100)}>
      <Card style={styles.inviteCard}>
        <View style={styles.inviteHeader}>
          <View style={styles.iconContainer}>
            <Ionicons name="tennisball" size={24} color={Colors.dark.primary} />
          </View>
          <View style={styles.inviteInfo}>
            <Text style={styles.inviteTitle}>Court Booking Invite</Text>
            <Text style={styles.inviteSubtitle}>
              {inv.totalAccepted}/{inv.totalInvited} players confirmed
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isAccepted && styles.statusAccepted,
              isDeclined && styles.statusDeclined,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isAccepted && styles.statusTextAccepted,
                isDeclined && styles.statusTextDeclined,
              ]}
            >
              {isPending ? "Pending" : isAccepted ? "Accepted" : "Declined"}
            </Text>
          </View>
        </View>

        {inv.splitCost && inv.costPerPerson && (
          <View style={styles.costRow}>
            <Ionicons name="card" size={16} color={Colors.dark.gold} />
            <Text style={styles.costText}>
              Your share: {inv.currency} {inv.costPerPerson}
            </Text>
          </View>
        )}

        {isPending && (
          <View style={styles.actions}>
            <Pressable
              style={styles.declineButton}
              onPress={onDecline}
              disabled={isLoading}
            >
              <Ionicons name="close" size={20} color={Colors.dark.error} />
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>

            <Pressable style={styles.acceptButton} onPress={onAccept} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color={Colors.dark.text} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={Colors.dark.text} />
                  <Text style={styles.acceptText}>Accept</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {isAccepted && (
          <View style={styles.confirmedBanner}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
            <Text style={styles.confirmedText}>You're in! See you on the court.</Text>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

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
  message?: string;
  challengerName?: string;
  opponentName?: string;
  courtBookingStatus?: string | null;
  courtBookingNote?: string | null;
  courtBookingUrl?: string | null;
}

function ChallengeInviteCard({
  challenge,
  playerId,
  onAccept,
  onDecline,
  isLoading,
}: {
  challenge: ChallengeData;
  playerId: string;
  onAccept: () => void;
  onDecline: () => void;
  isLoading: boolean;
}) {
  const isIncoming = String(challenge.opponentId) === String(playerId) && challenge.status === "pending";
  const isAccepted = challenge.status === "accepted";
  const isSentPending = String(challenge.challengerId) === String(playerId) && challenge.status === "pending";
  const isDeclined = challenge.status === "declined";
  const isChallenger = String(challenge.challengerId) === String(playerId);
  const opponentName = isChallenger ? challenge.opponentName : challenge.challengerName;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };
  const formatTime = (timeStr: string) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return (
    <Animated.View entering={FadeInRight.delay(100)}>
      <Card style={styles.inviteCard}>
        <View style={styles.inviteHeader}>
          <View style={[styles.iconContainer, { backgroundColor: isIncoming ? "#FF950020" : isAccepted ? Colors.dark.primary + "20" : Colors.dark.gold + "20" }]}>
            <Feather
              name={isIncoming ? "zap" : isAccepted ? "check-circle" : isSentPending ? "send" : "x-circle"}
              size={22}
              color={isIncoming ? "#FF9500" : isAccepted ? Colors.dark.primary : isDeclined ? Colors.dark.error : Colors.dark.gold}
            />
          </View>
          <View style={styles.inviteInfo}>
            <Text style={styles.inviteTitle}>
              {isIncoming
                ? `${challenge.challengerName || "Someone"} challenges you!`
                : isAccepted
                ? `Match vs ${opponentName || "Opponent"}`
                : isSentPending
                ? `Challenge sent to ${challenge.opponentName || "player"}`
                : `Challenge ${challenge.status}`}
            </Text>
            <Text style={styles.inviteSubtitle}>
              {(challenge.matchType || "Singles").charAt(0).toUpperCase() + (challenge.matchType || "singles").slice(1)} · {(challenge.matchFormat || "Friendly").charAt(0).toUpperCase() + (challenge.matchFormat || "friendly").slice(1)}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isAccepted && styles.statusAccepted,
              isDeclined && styles.statusDeclined,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isAccepted && styles.statusTextAccepted,
                isDeclined && styles.statusTextDeclined,
              ]}
            >
              {isIncoming ? "Action Needed" : isAccepted ? "Confirmed" : isSentPending ? "Waiting" : challenge.status}
            </Text>
          </View>
        </View>

        <View style={styles.challengeDetails}>
          <View style={styles.challengeDetailRow}>
            <Feather name="calendar" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.challengeDetailText}>{formatDate(challenge.scheduledDate)}</Text>
          </View>
          <View style={styles.challengeDetailRow}>
            <Feather name="clock" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.challengeDetailText}>{formatTime(challenge.scheduledTime)}</Text>
          </View>
          {challenge.courtName ? (
            <View style={styles.challengeDetailRow}>
              <Feather name="map-pin" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.challengeDetailText}>{challenge.courtName}</Text>
            </View>
          ) : null}
        </View>

        {challenge.message ? (
          <View style={styles.challengeMessage}>
            <Text style={styles.challengeMessageText}>"{challenge.message}"</Text>
          </View>
        ) : null}

        {challenge.courtBookingStatus && challenge.courtBookingStatus !== "academy_court" ? (
          <View style={{ marginTop: Spacing.sm }}>
            <CourtBookingPanel
              status={challenge.courtBookingStatus}
              note={challenge.courtBookingNote}
              url={challenge.courtBookingUrl}
              compact
            />
          </View>
        ) : null}

        {isIncoming && (
          <View style={styles.actions}>
            <Pressable
              style={styles.declineButton}
              onPress={onDecline}
              disabled={isLoading}
            >
              <Ionicons name="close" size={20} color={Colors.dark.error} />
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>

            <Pressable style={styles.acceptButton} onPress={onAccept} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color={Colors.dark.text} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={Colors.dark.text} />
                  <Text style={styles.acceptText}>Accept</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {isAccepted && (
          <View style={styles.confirmedBanner}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
            <Text style={styles.confirmedText}>Match confirmed! See you on the court.</Text>
          </View>
        )}

        {isSentPending && (
          <View style={styles.confirmedBanner}>
            <Feather name="clock" size={16} color={Colors.dark.gold} />
            <Text style={[styles.confirmedText, { color: Colors.dark.gold }]}>Waiting for response...</Text>
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

export default function BookingInvitesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const playerId = getEffectivePlayerId(user?.playerId);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondingChallengeId, setRespondingChallengeId] = useState<string | null>(null);

  const {
    data: invites,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<BookingInvite[]>({
    queryKey: ["/api/player/booking-invites"],
  });

  const {
    data: challenges = [],
    isLoading: challengesLoading,
    refetch: refetchChallenges,
  } = useQuery<ChallengeData[]>({
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

  const respondMutation = useMutation({
    mutationFn: async ({ inviteId, action }: { inviteId: string; action: "accept" | "decline" }) => {
      setRespondingId(inviteId);
      return apiRequest("POST", `/api/player/booking-invites/${inviteId}/respond`, { action });
    },
    onSuccess: (_, { action }) => {
      Haptics.notificationAsync(
        action === "accept"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
      queryClient.invalidateQueries({ queryKey: ["/api/player/booking-invites"] });
      Alert.alert(
        action === "accept" ? "Accepted!" : "Declined",
        action === "accept"
          ? "You've joined the booking. Have fun!"
          : "You've declined the invite."
      );
    },
    onError: () => {
      Alert.alert("Error", "Could not respond to invite. Please try again.");
    },
    onSettled: () => {
      setRespondingId(null);
    },
  });

  const respondChallengeMutation = useMutation({
    mutationFn: async ({ challengeId, response }: { challengeId: string; response: "accepted" | "declined" }) => {
      setRespondingChallengeId(challengeId);
      return apiRequest(
        "POST",
        `/api/matches/challenge/${challengeId}/respond?playerId=${playerId}`,
        { response }
      );
    },
    onSuccess: (_, { response }) => {
      Haptics.notificationAsync(
        response === "accepted"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/notifications/unread-count"] });
      Alert.alert(
        response === "accepted" ? "Challenge Accepted!" : "Challenge Declined",
        response === "accepted"
          ? "Your match is confirmed! Get ready to play."
          : "You've declined the challenge."
      );
    },
    onError: () => {
      Alert.alert("Error", "Could not respond to challenge. Please try again.");
    },
    onSettled: () => {
      setRespondingChallengeId(null);
    },
  });

  const pendingInvites = invites?.filter((i) => i.booking_invite_guests.status === "pending") || [];
  const pastInvites = invites?.filter((i) => i.booking_invite_guests.status !== "pending") || [];

  const incomingChallenges = challenges.filter(
    (c) => c.status === "pending" && String(c.opponentId) === String(playerId)
  );
  const otherChallenges = challenges.filter(
    (c) => !(c.status === "pending" && String(c.opponentId) === String(playerId))
  );

  type SectionItem = { type: "invite"; data: BookingInvite } | { type: "challenge"; data: ChallengeData };

  const sections = useMemo(() => {
    const result: { title: string; data: SectionItem[] }[] = [];

    if (incomingChallenges.length > 0) {
      result.push({
        title: "Match Challenges",
        data: incomingChallenges.map((c) => ({ type: "challenge" as const, data: c })),
      });
    }

    if (pendingInvites.length > 0) {
      result.push({
        title: "Booking Invites",
        data: pendingInvites.map((i) => ({ type: "invite" as const, data: i })),
      });
    }

    if (otherChallenges.length > 0 || pastInvites.length > 0) {
      const otherItems: SectionItem[] = [
        ...otherChallenges.map((c) => ({ type: "challenge" as const, data: c })),
        ...pastInvites.map((i) => ({ type: "invite" as const, data: i })),
      ];
      if (otherItems.length > 0) {
        result.push({ title: "History", data: otherItems });
      }
    }

    return result;
  }, [incomingChallenges, pendingInvites, otherChallenges, pastInvites]);

  const allLoading = isLoading && challengesLoading;
  const hasNoData = sections.length === 0 && !allLoading;

  const handleRefresh = () => {
    refetch();
    refetchChallenges();
  };

  return (
    <View style={styles.container}>
      {allLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
          <Text style={styles.loadingText}>Loading invites...</Text>
        </View>
      ) : hasNoData ? (
        <View style={styles.empty}>
          <LinearGradient
            colors={["#E040FB20", "#E040FB05"]}
            style={styles.emptyGlowCircle}
          >
            <View style={styles.emptyIconContainer}>
              <Ionicons name="mail-unread" size={48} color="#E040FB" />
              <View style={styles.emptyPulse} />
            </View>
          </LinearGradient>
          <Text style={styles.emptyTitle}>Inbox Clear</Text>
          <Text style={styles.emptyText}>
            When players invite you to matches or court bookings, they'll appear here
          </Text>
          <View style={styles.emptyHint}>
            <Ionicons name="sparkles" size={14} color={Colors.dark.gold} />
            <Text style={styles.emptyHintText}>Tip: Find a Match to play with others!</Text>
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          renderItem={({ item }) => {
            if (item.type === "challenge") {
              return (
                <ChallengeInviteCard
                  challenge={item.data}
                  playerId={String(playerId)}
                  onAccept={() =>
                    respondChallengeMutation.mutate({ challengeId: item.data.id, response: "accepted" })
                  }
                  onDecline={() =>
                    respondChallengeMutation.mutate({ challengeId: item.data.id, response: "declined" })
                  }
                  isLoading={respondingChallengeId === item.data.id}
                />
              );
            }
            return (
              <InviteCard
                invite={item.data}
                onAccept={() =>
                  respondMutation.mutate({
                    inviteId: item.data.booking_invite_guests.inviteId,
                    action: "accept",
                  })
                }
                onDecline={() =>
                  respondMutation.mutate({
                    inviteId: item.data.booking_invite_guests.inviteId,
                    action: "decline",
                  })
                }
                isLoading={respondingId === item.data.booking_invite_guests.inviteId}
              />
            );
          }}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionTitle}>{title}</Text>
          )}
          keyExtractor={(item, index) =>
            item.type === "challenge" ? `challenge-${item.data.id}` : `invite-${item.data.booking_invite_guests.id}`
          }
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.primary}
            />
          }
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  pendingBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  pendingBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerPlaceholder: {
    width: 44,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  emptyGlowCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: "#E040FB40",
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E040FB15",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  emptyPulse: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "#E040FB30",
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  emptyHintText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.gold,
    fontWeight: "500",
  },
  list: {
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  inviteCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteInfo: {
    flex: 1,
  },
  inviteTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  inviteSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusAccepted: {
    backgroundColor: Colors.dark.primary + "20",
  },
  statusDeclined: {
    backgroundColor: Colors.dark.error + "20",
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  statusTextAccepted: {
    color: Colors.dark.primary,
  },
  statusTextDeclined: {
    color: Colors.dark.error,
  },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  costText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  declineButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error + "15",
    borderWidth: 1,
    borderColor: Colors.dark.error + "30",
  },
  declineText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  acceptButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
  },
  acceptText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  confirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  confirmedText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  challengeDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  challengeDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  challengeDetailText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  challengeMessage: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: Spacing.sm,
  },
  challengeMessageText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
}));
