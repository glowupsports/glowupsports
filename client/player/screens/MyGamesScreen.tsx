import React, { useCallback } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { Image } from "expo-image";

interface Participant {
  id: string;
  playerId: string;
  name: string;
  photoUrl?: string;
  ballLevel?: string;
  joinedAt: string;
}

interface GameRequest {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorPhoto?: string;
  creatorBallLevel?: string;
  sport: string;
  scheduledAt: string;
  expiresAt: string;
  location: string;
  spotsTotal: number;
  spotsFilled: number;
  levelMin?: number;
  levelMax?: number;
  notes?: string;
  status: string;
  participants: Participant[];
  isCreator: boolean;
}

function getSportColor(sport: string): string {
  switch (sport) {
    case "tennis": return "#CCFF00";
    case "padel": return "#00E5FF";
    case "squash": return "#FF6B35";
    case "pickleball": return "#A855F7";
    case "badminton": return "#F59E0B";
    default: return Colors.dark.primary;
  }
}

function getSportIcon(sport: string): any {
  switch (sport) {
    case "tennis": return "tennisball";
    case "padel": return "golf";
    case "squash": return "football";
    case "pickleball": return "baseball";
    case "badminton": return "barbell";
    default: return "apps";
  }
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (days === 0) return `Today at ${timeStr}`;
  if (days === 1) return `Tomorrow at ${timeStr}`;
  if (days < 0) return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${timeStr} (past)`;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${timeStr}`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "open": return Colors.dark.primary;
    case "full": return Colors.dark.primary;
    case "expired": return Colors.dark.textMuted;
    case "cancelled": return Colors.dark.error;
    default: return Colors.dark.textMuted;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "open": return "Open";
    case "full": return "Full";
    case "expired": return "Expired";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

export default function MyGamesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const playerId = user?.playerId;
  const headerHeight = useHeaderHeight();

  const { data: games, isLoading, isFetching, refetch } = useQuery<GameRequest[]>({
    queryKey: [`/api/play-partner/my-games?playerId=${playerId}`],
    enabled: !!playerId,
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("DELETE", `/api/play-partner/requests/${requestId}?playerId=${playerId}`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/play-partner") });
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/play-partner/requests/${requestId}/leave?playerId=${playerId}`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/play-partner") });
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleCancel = (requestId: string) => {
    Alert.alert("Cancel Game", "Are you sure you want to cancel this game request? All participants will be notified.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel Game", style: "destructive", onPress: () => cancelMutation.mutate(requestId) },
    ]);
  };

  const handleLeave = (requestId: string) => {
    Alert.alert("Leave Game", "Are you sure you want to leave this game?", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => leaveMutation.mutate(requestId) },
    ]);
  };

  const renderItem = useCallback(({ item }: { item: GameRequest }) => {
    const sportColor = getSportColor(item.sport);
    const statusColor = getStatusColor(item.status);
    const isActive = item.status === "open" || item.status === "full";

    return (
      <View style={[styles.card, !isActive && styles.cardInactive, { borderColor: sportColor + "30" }]}>
        <View style={styles.cardTop}>
          <View style={[styles.sportBadge, { backgroundColor: sportColor + "20" }]}>
            <Ionicons name={getSportIcon(item.sport)} size={14} color={sportColor} />
            <Text style={[styles.sportText, { color: sportColor }]}>
              {item.sport.charAt(0).toUpperCase() + item.sport.slice(1)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>{formatDateTime(item.scheduledAt)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.infoText} numberOfLines={1}>{item.location}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="people-outline" size={14} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>
            {item.spotsFilled}/{item.spotsTotal} players
          </Text>
          {item.isCreator ? (
            <View style={styles.organiserBadge}>
              <Ionicons name="star" size={11} color={Colors.dark.gold} />
              <Text style={styles.organiserText}>Organiser</Text>
            </View>
          ) : null}
        </View>

        {item.participants.length > 0 ? (
          <View style={styles.participantsSection}>
            <Text style={styles.participantsLabel}>Participants</Text>
            <View style={styles.avatarRow}>
              {[{ playerId: item.creatorId, name: item.creatorName, photoUrl: item.creatorPhoto }, ...item.participants].slice(0, 6).map((p, i) => (
                <View key={`${p.playerId}-${i}`} style={[styles.avatar, { marginLeft: i > 0 ? -10 : 0 }]}>
                  {p.photoUrl ? (
                    <Image
                      source={{ uri: buildPhotoUrl(p.photoUrl)! }}
                      style={styles.avatarImg}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons name="person" size={14} color={Colors.dark.textMuted} />
                  )}
                </View>
              ))}
              {item.participants.length + 1 > 6 ? (
                <Text style={styles.moreText}>+{item.participants.length + 1 - 6}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {item.notes ? (
          <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
        ) : null}

        {isActive ? (
          item.isCreator ? (
            <Pressable
              style={styles.cancelBtn}
              onPress={() => handleCancel(item.id)}
            >
              <Ionicons name="close-circle-outline" size={15} color={Colors.dark.error} />
              <Text style={styles.cancelBtnText}>Cancel Game</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.leaveBtn}
              onPress={() => handleLeave(item.id)}
            >
              <Ionicons name="exit-outline" size={15} color={Colors.dark.textMuted} />
              <Text style={styles.leaveBtnText}>Leave</Text>
            </Pressable>
          )
        ) : null}
      </View>
    );
  }, [playerId]);

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : !games || games.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No games yet</Text>
          <Text style={styles.emptySubtitle}>Post or join a game to see it here</Text>
          <Pressable
            style={styles.postBtn}
            onPress={() => navigation.navigate("CreateGameRequest")}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.postBtnGradient}
            >
              <Ionicons name="add" size={18} color={Colors.dark.buttonText} />
              <Text style={styles.postBtnText}>Post a Game</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={Colors.dark.primary}
            />
          }
          showsVerticalScrollIndicator={false}
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  postBtn: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  postBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
  },
  postBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  list: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardInactive: {
    opacity: 0.65,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sportBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  sportText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: Colors.dark.text,
    flex: 1,
  },
  organiserBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  organiserText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  participantsSection: {
    gap: 5,
  },
  participantsLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Colors.dark.surface,
  },
  avatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  moreText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginLeft: 6,
  },
  notes: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.dark.error + "15",
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.error + "30",
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginTop: 4,
  },
  leaveBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
});
