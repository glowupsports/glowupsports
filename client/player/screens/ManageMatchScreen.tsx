import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { openDirections } from "@/lib/maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { useWebSocket } from "@/lib/useWebSocket";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, FontSizes } from "@/constants/theme";
import { apiRequest, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { CourtBookingPanel } from "@/components/CourtBooking";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface OpenMatch {
  id: string;
  bookingId: string;
  hostPlayerId: string;
  academyId: string | null;
  matchType: string;
  title: string | null;
  description: string | null;
  requiredLevelMin: number;
  requiredLevelMax: number;
  requiredBallLevel: string | null;
  ballLevel?: string;
  skillLevel?: number;
  maxPlayers: number;
  currentPlayers: number;
  status: string;
  visibility: string;
  costPerPlayer: string | null;
  currency: string;
  xpBonus: number;
  createdAt: string;
  scheduledTime?: string;
  courtName?: string;
  locationName?: string;
  courtBookingStatus?: string | null;
  courtBookingNote?: string | null;
  courtBookingUrl?: string | null;
  host?: {
    id: string;
    name: string;
    photoUrl?: string;
    level?: number;
    ballLevel?: string;
  };
  players?: {
    id: string;
    name: string;
    photoUrl?: string;
  }[];
}

interface Friend {
  id: string;
  name: string;
  profilePhotoUrl?: string;
  level?: number;
  ballLevel?: string;
}

export default function ManageMatchScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { matchId } = route.params || {};
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitingFriendId, setInvitingFriendId] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: match, isLoading, refetch } = useQuery<OpenMatch>({
    queryKey: [`/api/open-matches/${matchId}`],
    enabled: !!matchId,
    // Belt-and-braces fallback in case the WebSocket event is missed
    // (background tab, dropped connection, etc.).
    refetchInterval: matchId ? 15000 : false,
    refetchOnWindowFocus: true,
  });

  // Real-time refresh: when the server emits an open_match.updated event for
  // this match, invalidate the cached query so the UI reflects join/leave/kick
  // immediately without the host having to leave and re-open the screen.
  useWebSocket({
    onOpenMatchUpdate: useCallback((payload: { matchId: string }) => {
      if (payload?.matchId === matchId) {
        queryClient.invalidateQueries({ queryKey: [`/api/open-matches/${matchId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      }
    }, [matchId, queryClient]),
  });

  // Refetch whenever the screen regains focus (e.g. returning from a sub-screen).
  useFocusEffect(
    useCallback(() => {
      if (matchId) refetch();
    }, [matchId, refetch])
  );

  const { data: friendsResponse } = useQuery<Friend[] | { friends?: Friend[]; pendingRequests?: Friend[] } | null>({
    queryKey: ["/api/player/me/friends"],
  });
  const friends: Friend[] = Array.isArray(friendsResponse)
    ? friendsResponse
    : Array.isArray(friendsResponse?.friends)
      ? friendsResponse.friends
      : [];

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/open-matches/${matchId}`);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      Alert.alert("Match Cancelled", "Your open match has been cancelled.", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", error.message || "Failed to cancel match");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (friendId: string) => {
      return apiRequest("POST", `/api/open-matches/${matchId}/invite`, { playerId: friendId });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/open-matches/${matchId}`] });
      setShowInviteModal(false);
      setInvitingFriendId(null);
      Alert.alert("Invite Sent!", "Your friend will be notified about this match.");
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setInvitingFriendId(null);
      Alert.alert("Error", error.message || "Failed to send invite");
    },
  });

  const handleInviteFriend = (friendId: string) => {
    setInvitingFriendId(friendId);
    inviteMutation.mutate(friendId);
  };

  const kickMutation = useMutation({
    mutationFn: async (targetPlayerId: string) => {
      return apiRequest("POST", `/api/open-matches/${matchId}/kick`, { playerId: targetPlayerId });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: [`/api/open-matches/${matchId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      setKickTarget(null);
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setKickTarget(null);
      Alert.alert("Couldn't remove player", error?.message || "Try again in a moment.");
    },
  });

  const isHost = !!match && !!user?.playerId && user.playerId === match.hostPlayerId;

  const getAvailableFriends = () => {
    const playerIds = match?.players?.map(p => p.id) || [];
    return friends.filter(f => !playerIds.includes(f.id) && f.id !== match?.hostPlayerId);
  };

  const handleCancelMatch = () => {
    Alert.alert(
      "Cancel Match",
      "Are you sure you want to cancel this open match? All players will be notified.",
      [
        { text: "Keep Match", style: "cancel" },
        { text: "Cancel Match", style: "destructive", onPress: () => cancelMutation.mutate() }
      ]
    );
  };

  const getBallLevelColor = (level?: string) => {
    const colors: Record<string, string> = {
      blue: "#3B82F6",
      red: "#EF4444",
      orange: "#F97316",
      green: "#22C55E",
      yellow: "#EAB308",
      glow: "#E040FB",
    };
    return colors[level?.toLowerCase() || ""] || Colors.dark.textSecondary;
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "TBD";
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "TBD";
    const date = new Date(dateString);
    return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
        <Text style={styles.loadingText}>Loading match details...</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[styles.container, styles.empty]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.textMuted} />
        <Text style={styles.emptyTitle}>Match Not Found</Text>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isDoubles = match.matchType === "doubles";
  const slotsLeft = match.maxPlayers - match.currentPlayers;

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[isDoubles ? "#9333EA20" : Colors.dark.primary + "20", Colors.dark.backgroundSecondary]}
          style={styles.matchCard}
        >
          <View style={styles.matchHeader}>
            <View style={[styles.typeBadge, { backgroundColor: isDoubles ? "#9333EA" : Colors.dark.primary }]}>
              <Ionicons name={isDoubles ? "people" : "person"} size={14} color="#fff" />
              <Text style={styles.typeBadgeText}>
                {match.matchType.charAt(0).toUpperCase() + match.matchType.slice(1)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: match.status === "open" ? Colors.dark.primary + "30" : Colors.dark.textMuted + "30" }]}>
              <Text style={[styles.statusText, { color: match.status === "open" ? Colors.dark.primary : Colors.dark.textMuted }]}>
                {match.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.matchTitle}>
            {match.title || `Looking for ${match.matchType} partner`}
          </Text>

          {match.description ? (
            <Text style={styles.matchDescription}>{match.description}</Text>
          ) : null}

          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar" size={18} color={Colors.dark.primary} />
              <Text style={styles.detailText}>{formatDate(match.scheduledTime)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="time" size={18} color={Colors.dark.primary} />
              <Text style={styles.detailText}>{formatTime(match.scheduledTime)}</Text>
            </View>
            {(match.courtName || match.locationName) ? (
              <Pressable
                style={styles.detailRow}
                onPress={() => openDirections({ label: match.locationName || match.courtName })}
              >
                <Ionicons name="navigate" size={18} color={Colors.dark.primary} />
                <Text style={[styles.detailText, styles.directionsText]}>
                  {match.courtName || match.locationName}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.detailRow}>
                <Ionicons name="location" size={18} color={Colors.dark.primary} />
                <Text style={styles.detailText}>TBD</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(match.ballLevel || "glow") }]} />
              <Text style={styles.detailText}>
                {(match.ballLevel || "GLOW").toUpperCase()} {match.skillLevel || ""} Level
              </Text>
            </View>
          </View>
        </LinearGradient>

        {match.courtBookingStatus && match.courtBookingStatus !== "academy_court" ? (
          <View style={[styles.section, { paddingBottom: 0 }]}>
            <CourtBookingPanel
              status={match.courtBookingStatus}
              note={match.courtBookingNote}
              url={match.courtBookingUrl}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players ({match.currentPlayers}/{match.maxPlayers})</Text>
          <View style={styles.playersList}>
            {match.players && match.players.length > 0 ? (
              match.players.map((player) => (
                <View key={player.id} style={styles.playerCard}>
                  <View style={styles.playerAvatar}>
                    {player.photoUrl ? (
                      <Image 
                        source={{ uri: buildPhotoUrl(player.photoUrl)! }} 
                        style={styles.playerImage}
                        contentFit="cover"
                      />
                    ) : (
                      <Text style={styles.playerInitial}>{player.name.charAt(0)}</Text>
                    )}
                  </View>
                  <Text style={styles.playerName}>{player.name}</Text>
                  {player.id === match.hostPlayerId ? (
                    <View style={styles.hostBadge}>
                      <Text style={styles.hostBadgeText}>Host</Text>
                    </View>
                  ) : isHost ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setKickTarget({ id: player.id, name: player.name });
                      }}
                      style={styles.removeButton}
                      hitSlop={8}
                      accessibilityLabel={`Remove ${player.name}`}
                    >
                      <Ionicons name="close" size={14} color={Colors.dark.error} />
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            ) : (
              <View style={styles.playerCard}>
                <View style={styles.playerAvatar}>
                  {match.host?.photoUrl ? (
                    <Image 
                      source={{ uri: buildPhotoUrl(match.host.photoUrl)! }} 
                      style={styles.playerImage}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.playerInitial}>{match.host?.name?.charAt(0) || "?"}</Text>
                  )}
                </View>
                <Text style={styles.playerName}>{match.host?.name || "You"}</Text>
                <View style={styles.hostBadge}>
                  <Text style={styles.hostBadgeText}>Host</Text>
                </View>
              </View>
            )}

            {Array.from({ length: slotsLeft }).map((_, i) => (
              <Pressable 
                key={`empty-${i}`} 
                style={[styles.playerCard, styles.emptySlot]}
                onPress={() => setShowInviteModal(true)}
              >
                <View style={[styles.playerAvatar, styles.emptyAvatar]}>
                  <Ionicons name="add" size={20} color={Colors.dark.primary} />
                </View>
                <Text style={styles.emptySlotText}>Invite Friend</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {match.xpBonus > 0 && (
          <View style={styles.xpSection}>
            <Ionicons name="flash" size={24} color={Colors.dark.primary} />
            <Text style={styles.xpText}>+{match.xpBonus} XP Bonus for participants</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable 
          style={styles.cancelButton}
          onPress={handleCancelMatch}
          disabled={cancelMutation.isPending}
        >
          {cancelMutation.isPending ? (
            <ActivityIndicator color={Colors.dark.error} size="small" />
          ) : (
            <>
              <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
              <Text style={styles.cancelButtonText}>Cancel Match</Text>
            </>
          )}
        </Pressable>
      </View>

      <Modal
        visible={showInviteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite a Friend</Text>
              <Pressable onPress={() => setShowInviteModal(false)} style={styles.modalClose}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            {getAvailableFriends().length === 0 ? (
              <View style={styles.noFriendsContainer}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.noFriendsText}>No friends available to invite</Text>
                <Text style={styles.noFriendsSubtext}>Add friends from the Social tab to invite them to matches</Text>
              </View>
            ) : (
              <FlatList
                data={getAvailableFriends()}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Pressable 
                    style={styles.friendItem}
                    onPress={() => handleInviteFriend(item.id)}
                    disabled={inviteMutation.isPending}
                  >
                    <View style={styles.friendAvatar}>
                      {item.profilePhotoUrl ? (
                        <Image 
                          source={{ uri: buildPhotoUrl(item.profilePhotoUrl)! }} 
                          style={styles.friendImage}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={styles.friendInitial}>{item.name.charAt(0)}</Text>
                      )}
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{item.name}</Text>
                      {item.ballLevel && (
                        <Text style={[styles.friendLevel, { color: getBallLevelColor(item.ballLevel) }]}>
                          {item.ballLevel.toUpperCase()} Level
                        </Text>
                      )}
                    </View>
                    {invitingFriendId === item.id ? (
                      <ActivityIndicator color={Colors.dark.primary} size="small" />
                    ) : (
                      <View style={styles.inviteButton}>
                        <Ionicons name="paper-plane" size={16} color={Colors.dark.buttonText} />
                        <Text style={styles.inviteButtonText}>Invite</Text>
                      </View>
                    )}
                  </Pressable>
                )}
                contentContainerStyle={styles.friendsList}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!kickTarget}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!kickMutation.isPending) setKickTarget(null);
        }}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="person-remove" size={28} color={Colors.dark.error} />
            </View>
            <Text style={styles.confirmTitle}>Remove player?</Text>
            <Text style={styles.confirmMessage}>
              {kickTarget
                ? `${kickTarget.name} will be removed from this match and notified. The slot opens up for someone else.`
                : ""}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnSecondary]}
                onPress={() => setKickTarget(null)}
                disabled={kickMutation.isPending}
              >
                <Text style={styles.confirmBtnSecondaryText}>Keep</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                onPress={() => {
                  if (kickTarget) kickMutation.mutate(kickTarget.id);
                }}
                disabled={kickMutation.isPending}
              >
                {kickMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnDangerText}>Remove</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  loading: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.md,
  },
  empty: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "600",
  },
  backButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  backButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  matchCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.lg,
  },
  typeBadgeText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: FontSizes.sm,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  matchTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  matchDescription: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.md,
    marginBottom: Spacing.md,
  },
  detailsSection: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailText: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
  },
  directionsText: {
    color: Colors.dark.primary,
    textDecorationLine: "underline",
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "600",
  },
  playersList: {
    gap: Spacing.sm,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  emptySlot: {
    borderStyle: "dashed",
    borderColor: Colors.dark.textMuted,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "30",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  emptyAvatar: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.textMuted,
    borderStyle: "dashed",
  },
  playerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  playerInitial: {
    color: Colors.dark.primary,
    fontSize: FontSizes.lg,
    fontWeight: "600",
  },
  playerName: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "500",
    flex: 1,
  },
  emptySlotText: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.md,
    fontStyle: "italic",
  },
  hostBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
  },
  hostBadgeText: {
    color: Colors.dark.primary,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  xpSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary + "15",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  xpText: {
    color: Colors.dark.primary,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "10",
  },
  cancelButtonText: {
    color: Colors.dark.error,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
    paddingTop: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.xl,
    fontWeight: "700",
  },
  modalClose: {
    padding: Spacing.xs,
  },
  friendsList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  friendImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  friendInitial: {
    color: Colors.dark.primary,
    fontSize: FontSizes.lg,
    fontWeight: "600",
  },
  friendInfo: {
    flex: 1,
    gap: 2,
  },
  friendName: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  friendLevel: {
    fontSize: FontSizes.sm,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.lg,
  },
  inviteButtonText: {
    color: Colors.dark.buttonText,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  noFriendsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  noFriendsText: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "600",
    textAlign: "center",
  },
  noFriendsSubtext: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "15",
  },
  removeButtonText: {
    color: Colors.dark.error,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    gap: Spacing.sm,
  },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.error + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  confirmTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    textAlign: "center",
  },
  confirmMessage: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  confirmActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
    marginTop: Spacing.xs,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnSecondary: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  confirmBtnSecondaryText: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  confirmBtnDanger: {
    backgroundColor: Colors.dark.error,
  },
  confirmBtnDangerText: {
    color: "#fff",
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
}));
