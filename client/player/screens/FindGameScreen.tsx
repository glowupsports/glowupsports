import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
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
import { useSport } from "@/player/context/SportContext";

const SPORTS = [
  { key: "all", label: "All", icon: "apps-outline" },
  { key: "tennis", label: "Tennis", icon: "tennisball-outline" },
  { key: "padel", label: "Padel", icon: "golf-outline" },
  { key: "squash", label: "Squash", icon: "football-outline" },
  { key: "pickleball", label: "Pickle", icon: "baseball-outline" },
  { key: "badminton", label: "Badmint.", icon: "barbell-outline" },
] as const;

type SportKey = "all" | "tennis" | "padel" | "squash" | "pickleball" | "badminton";

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
  creatorLevel?: number;
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
  isParticipant: boolean;
  isCreator: boolean;
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

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  if (days === 0) return `Today at ${timeStr}`;
  if (days === 1) return `Tomorrow at ${timeStr}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${timeStr}`;
}

export default function FindGameScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const playerId = user?.playerId;
  const headerHeight = useHeaderHeight();
  const { activeSport, activeSports, isMultiSport } = useSport();

  const [selectedSport, setSelectedSport] = useState<SportKey>(() => activeSport as SportKey);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const queryKey = selectedSport === "all"
    ? `/api/play-partner/requests?playerId=${playerId}`
    : `/api/play-partner/requests?playerId=${playerId}&sport=${selectedSport}`;

  const { data: requests, isLoading, isFetching, refetch } = useQuery<GameRequest[]>({
    queryKey: [queryKey],
    enabled: !!playerId,
  });

  const joinMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/play-partner/requests/${requestId}/join?playerId=${playerId}`);
      return res.json();
    },
    onSuccess: (data: { isFull?: boolean }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.isFull) {
        Alert.alert("Game is Full!", "You joined and the game is now full. Get ready to play!");
      } else {
        Alert.alert("Joined!", "You've joined the game. The organizer has been notified.");
      }
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/play-partner") });
    },
    onError: (err: Error) => {
      const msg = err.message.includes(": ") ? err.message.split(": ").slice(1).join(": ") : err.message;
      Alert.alert("Cannot Join", msg);
    },
    onSettled: () => setJoiningId(null),
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
      const msg = err.message.includes(": ") ? err.message.split(": ").slice(1).join(": ") : err.message;
      Alert.alert("Error", msg);
    },
    onSettled: () => setJoiningId(null),
  });

  const handleJoin = (requestId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningId(requestId);
    joinMutation.mutate(requestId);
  };

  const handleLeave = (requestId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Leave Game", "Are you sure you want to leave this game?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave", style: "destructive", onPress: () => {
          setJoiningId(requestId);
          leaveMutation.mutate(requestId);
        }
      },
    ]);
  };

  const renderItem = useCallback(({ item }: { item: GameRequest }) => {
    const sportColor = getSportColor(item.sport);
    const spotsLeft = item.spotsTotal - item.spotsFilled;
    const isFull = spotsLeft <= 0;
    const isJoining = joiningId === item.id;

    return (
      <View style={[styles.card, { borderColor: sportColor + "40" }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.sportBadge, { backgroundColor: sportColor + "20" }]}>
            <Ionicons name={getSportIcon(item.sport) as any} size={16} color={sportColor} />
            <Text style={[styles.sportText, { color: sportColor }]}>{item.sport.charAt(0).toUpperCase() + item.sport.slice(1)}</Text>
          </View>
          <View style={[styles.spotsBadge, { backgroundColor: isFull ? Colors.dark.error + "20" : Colors.dark.primary + "20" }]}>
            <Ionicons name="people-outline" size={13} color={isFull ? Colors.dark.error : Colors.dark.primary} />
            <Text style={[styles.spotsText, { color: isFull ? Colors.dark.error : Colors.dark.primary }]}>
              {isFull ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>{formatDateTime(item.scheduledAt)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.infoText} numberOfLines={1}>{item.location}</Text>
          </View>
          {(item.levelMin || item.levelMax) ? (
            <View style={styles.infoRow}>
              <Ionicons name="stats-chart-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.infoText}>
                Level {item.levelMin || 1}-{item.levelMax || 10}
              </Text>
            </View>
          ) : null}
          {item.notes ? (
            <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.creatorRow}>
            <View style={styles.creatorAvatar}>
              {item.creatorPhoto ? (
                <Image
                  source={{ uri: buildPhotoUrl(item.creatorPhoto)! }}
                  style={styles.avatarImg}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
              )}
            </View>
            <Text style={styles.creatorName}>{item.creatorName}</Text>
            {item.isCreator ? (
              <View style={styles.youBadge}><Text style={styles.youText}>You</Text></View>
            ) : null}
          </View>

          {item.participants.length > 0 ? (
            <View style={styles.participantsRow}>
              {item.participants.slice(0, 4).map((p, i) => (
                <View key={p.id} style={[styles.participantAvatar, { marginLeft: i > 0 ? -10 : 0 }]}>
                  {p.photoUrl ? (
                    <Image
                      source={{ uri: buildPhotoUrl(p.photoUrl)! }}
                      style={styles.avatarImgSm}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons name="person" size={12} color={Colors.dark.textMuted} />
                  )}
                </View>
              ))}
              {item.participants.length > 4 ? (
                <Text style={styles.moreParticipants}>+{item.participants.length - 4}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {item.isCreator ? (
          <View style={styles.ownerBanner}>
            <Ionicons name="star" size={13} color={Colors.dark.gold} />
            <Text style={styles.ownerBannerText}>Your game request</Text>
          </View>
        ) : item.isParticipant ? (
          <Pressable
            style={[styles.leaveBtn, isJoining && styles.btnDisabled]}
            onPress={() => !isJoining && handleLeave(item.id)}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <>
                <Ionicons name="exit-outline" size={15} color={Colors.dark.error} />
                <Text style={styles.leaveBtnText}>Leave</Text>
              </>
            )}
          </Pressable>
        ) : !isFull ? (
          <Pressable
            style={[styles.joinBtn, isJoining && styles.btnDisabled]}
            onPress={() => !isJoining && handleJoin(item.id)}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <>
                <Ionicons name="enter-outline" size={15} color={Colors.dark.backgroundRoot} />
                <Text style={styles.joinBtnText}>Join Game</Text>
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.fullBadge}>
            <Text style={styles.fullText}>Game Full</Text>
          </View>
        )}
      </View>
    );
  }, [joiningId, playerId]);

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      {isMultiSport ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sportFilter}
          contentContainerStyle={styles.sportFilterContent}
        >
          {SPORTS.filter(s => s.key === "all" || (activeSports as readonly string[]).includes(s.key)).map(s => (
            <Pressable
              key={s.key}
              style={[styles.sportChip, selectedSport === s.key && styles.sportChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedSport(s.key);
              }}
            >
              <Ionicons
                name={s.icon as keyof typeof Ionicons.glyphMap}
                size={15}
                color={selectedSport === s.key ? Colors.dark.backgroundRoot : Colors.dark.textMuted}
              />
              <Text style={[styles.sportChipText, selectedSport === s.key && styles.sportChipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : !requests || requests.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No games nearby</Text>
          <Text style={styles.emptySubtitle}>Post a request and find partners near you</Text>
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
              <Ionicons name="add" size={18} color={Colors.dark.backgroundRoot} />
              <Text style={styles.postBtnText}>Post a Game</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={requests}
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
  sportFilter: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sportFilterContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  sportChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sportChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  sportChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  sportChipTextActive: {
    color: Colors.dark.backgroundRoot,
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
    color: Colors.dark.backgroundRoot,
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
  cardHeader: {
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
  spotsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  spotsText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardBody: {
    gap: 6,
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
  notes: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  creatorAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  avatarImgSm: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  creatorName: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  youBadge: {
    backgroundColor: Colors.dark.primary + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  youText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  participantsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  participantAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.surface,
  },
  moreParticipants: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginLeft: 4,
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    marginTop: 4,
  },
  joinBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.backgroundRoot,
  },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.dark.error + "20",
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
    marginTop: 4,
  },
  leaveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.error,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  fullBadge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.error + "20",
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    marginTop: 4,
  },
  fullText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  ownerBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "30",
  },
  ownerBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
});
