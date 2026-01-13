import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, FontSizes, BorderRadius } from "@/constants/theme";
import { Card } from "@/components/Card";
import { apiRequest, getApiUrl } from "@/lib/query-client";

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

export default function BookingInvitesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const {
    data: invites,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<BookingInvite[]>({
    queryKey: ["/api/player/booking-invites"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ inviteId, action }: { inviteId: string; action: "accept" | "decline" }) => {
      setRespondingId(inviteId);
      return apiRequest(`${getApiUrl()}/api/player/booking-invites/${inviteId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
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

  const pendingInvites = invites?.filter((i) => i.booking_invite_guests.status === "pending") || [];
  const pastInvites = invites?.filter((i) => i.booking_invite_guests.status !== "pending") || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Booking Invites</Text>
          {pendingInvites.length > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingInvites.length} pending</Text>
            </View>
          )}
        </View>
        <View style={styles.headerPlaceholder} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
          <Text style={styles.loadingText}>Loading invites...</Text>
        </View>
      ) : !invites || invites.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="mail-open-outline" size={64} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No invites yet</Text>
          <Text style={styles.emptyText}>
            When friends invite you to play, you'll see their invites here
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...pendingInvites, ...pastInvites]}
          renderItem={({ item }) => (
            <InviteCard
              invite={item}
              onAccept={() =>
                respondMutation.mutate({
                  inviteId: item.booking_invite_guests.inviteId,
                  action: "accept",
                })
              }
              onDecline={() =>
                respondMutation.mutate({
                  inviteId: item.booking_invite_guests.inviteId,
                  action: "decline",
                })
              }
              isLoading={respondingId === item.booking_invite_guests.inviteId}
            />
          )}
          keyExtractor={(item) => item.booking_invite_guests.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.dark.primary}
            />
          }
          ListHeaderComponent={
            pendingInvites.length > 0 ? (
              <Text style={styles.sectionTitle}>Pending Invites</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
