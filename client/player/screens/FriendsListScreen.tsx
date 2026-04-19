import React, { useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeInRight, SlideInRight } from "react-native-reanimated";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { getStaticAssetsUrl, apiFetch, apiRequest, buildPhotoUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface ConnectionPlayer {
  id: string;
  name: string;
  photoUrl: string | null;
  level: number;
  glowScore: number;
  ballLevel: string | null;
  openToPlay: boolean;
}

interface Connection {
  id: string;
  status: string;
  connectionType: string | null;
  matchesPlayed: number;
  lastPlayedAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  isRequester: boolean;
  player: ConnectionPlayer | null;
}

interface ConnectionsData {
  friends: Connection[];
  pendingReceived: Connection[];
  pendingSent: Connection[];
  totalFriends: number;
  totalPending: number;
}

type TabType = "friends" | "requests";

function getBallColor(ball: string | null): string {
  switch (ball?.toLowerCase()) {
    case "green": return "#2ECC40";
    case "yellow": return "#FFDC00";
    case "orange": return "#FF851B";
    case "red": return "#FF4136";
    default: return Colors.dark.textMuted;
  }
}

function getPhotoUri(photoUrl: string | null): string | null {
  return buildPhotoUrl(photoUrl);
}

function FriendCard({ connection, onPress, onRemove }: { connection: Connection; onPress: () => void; onRemove: () => void }) {
  const player = connection.player;
  if (!player) return null;
  
  const photoUri = getPhotoUri(player.photoUrl);

  return (
    <Animated.View entering={FadeInRight.delay(100)}>
      <Pressable style={styles.friendCard} onPress={onPress}>
        <View style={styles.playerAvatarContainer}>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.playerAvatar}
            />
          ) : (
            <View style={styles.playerAvatarPlaceholder}>
              <Ionicons name="person" size={24} color={Colors.dark.textMuted} />
            </View>
          )}
          {player.openToPlay ? (
            <View style={styles.openToPlayBadge}>
              <Ionicons name="tennisball" size={10} color={Colors.dark.text} />
            </View>
          ) : null}
        </View>
        
        <View style={styles.playerInfo}>
          <ThemedText style={styles.playerName}>{player.name}</ThemedText>
          <View style={styles.playerMeta}>
            <View style={styles.levelBadge}>
              <ThemedText style={styles.levelText}>Lvl {player.level}</ThemedText>
            </View>
            {player.ballLevel ? (
              <View style={[styles.ballBadge, { backgroundColor: getBallColor(player.ballLevel) + "20" }]}>
                <Ionicons name="tennisball" size={12} color={getBallColor(player.ballLevel)} />
              </View>
            ) : null}
            {connection.matchesPlayed > 0 ? (
              <ThemedText style={styles.matchesText}>
                {connection.matchesPlayed} matches
              </ThemedText>
            ) : null}
          </View>
        </View>
        
        <View style={styles.playerScore}>
          <Ionicons name="flame" size={16} color={Colors.dark.gold} />
          <ThemedText style={styles.scoreText}>{player.glowScore}</ThemedText>
        </View>
        
        <Pressable
          style={styles.removeButton}
          onPress={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="person-remove-outline" size={18} color={Colors.dark.error} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

function RequestCard({ 
  connection, 
  onAccept, 
  onDecline, 
  isLoading 
}: { 
  connection: Connection; 
  onAccept: () => void; 
  onDecline: () => void;
  isLoading: boolean;
}) {
  const player = connection.player;
  if (!player) return null;
  
  return (
    <Animated.View entering={SlideInRight.delay(100)}>
      <Card style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={styles.playerAvatarContainer}>
            {player.photoUrl ? (
              <Image
                source={{ uri: getPhotoUri(player.photoUrl) ?? "" }}
                style={styles.playerAvatar}
              />
            ) : (
              <View style={styles.playerAvatarPlaceholder}>
                <Ionicons name="person" size={24} color={Colors.dark.textMuted} />
              </View>
            )}
          </View>
          
          <View style={styles.requestInfo}>
            <ThemedText style={styles.playerName}>{player.name}</ThemedText>
            <View style={styles.playerMeta}>
              <View style={styles.levelBadge}>
                <ThemedText style={styles.levelText}>Lvl {player.level}</ThemedText>
              </View>
              {player.ballLevel ? (
                <View style={[styles.ballBadge, { backgroundColor: getBallColor(player.ballLevel) + "20" }]}>
                  <Ionicons name="tennisball" size={12} color={getBallColor(player.ballLevel)} />
                </View>
              ) : null}
            </View>
          </View>
          
          <View style={styles.scoreContainer}>
            <Ionicons name="flame" size={16} color={Colors.dark.gold} />
            <ThemedText style={styles.scoreText}>{player.glowScore}</ThemedText>
          </View>
        </View>
        
        <View style={styles.requestActions}>
          <Pressable 
            style={[styles.actionButton, styles.declineButton]} 
            onPress={onDecline}
            disabled={isLoading}
          >
            <Ionicons name="close" size={18} color={Colors.dark.error} />
            <ThemedText style={styles.declineText}>Decline</ThemedText>
          </Pressable>
          
          <Pressable 
            style={[styles.actionButton, styles.acceptButton]} 
            onPress={onAccept}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={Colors.dark.buttonText} />
                <ThemedText style={styles.acceptText}>Accept</ThemedText>
              </>
            )}
          </Pressable>
        </View>
      </Card>
    </Animated.View>
  );
}

export default function FriendsListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<PlayerStackParamList, "FriendsList">>();
  const queryClient = useQueryClient();
  const routeInitialTab = route.params?.initialTab;
  const initialTab: TabType = routeInitialTab === "requests" ? "requests" : "friends";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    if (routeInitialTab === "friends" || routeInitialTab === "requests") {
      setActiveTab(routeInitialTab);
    }
  }, [routeInitialTab]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  
  const { data, isLoading, refetch, isRefetching, isError } = useQuery<ConnectionsData>({
    queryKey: ["/api/player/connections"],
  });
  
  const invalidateConnectionCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/player/connections"] });
    // Invalidate every per-profile status query so any open profile screen reflects new state.
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey?.[0];
        return typeof key === "string" && key.startsWith("/api/player/connections/status/");
      },
    });
  };

  const respondMutation = useMutation({
    mutationFn: async ({ connectionId, action }: { connectionId: string; action: "accept" | "decline" }) => {
      return apiRequest("POST", `/api/player/connections/${connectionId}/respond`, { action });
    },
    onMutate: ({ connectionId }) => {
      setRespondingTo(connectionId);
    },
    onSuccess: () => {
      invalidateConnectionCaches();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const raw = err?.message || "";
      const match = raw.match(/^\d+:\s*(.*)$/s);
      let message = raw;
      if (match) {
        const body = match[1].trim();
        try {
          const parsed = JSON.parse(body);
          message = parsed?.error || parsed?.message || body;
        } catch {
          message = body;
        }
      }
      // Re-sync from server in case the request actually changed state.
      invalidateConnectionCaches();
      Alert.alert("Couldn't respond to request", message || "Please try again.");
    },
    onSettled: () => {
      setRespondingTo(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      return apiRequest("DELETE", `/api/player/connections/${connectionId}`);
    },
    onSuccess: () => {
      invalidateConnectionCaches();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      invalidateConnectionCaches();
      Alert.alert("Error", "Failed to remove friend. Please try again.");
    },
  });

  const handleRemoveFriend = (connection: Connection) => {
    const name = connection.player?.name || "this player";
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${name} from your friends?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            removeMutation.mutate(connection.id);
          },
        },
      ]
    );
  };
  
  const handleAccept = (connectionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    respondMutation.mutate({ connectionId, action: "accept" });
  };
  
  const handleDecline = (connectionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    respondMutation.mutate({ connectionId, action: "decline" });
  };
  
  const navigateToProfile = (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerPublicProfile", { playerId });
  };
  
  const friends = data?.friends || [];
  const pendingReceived = data?.pendingReceived || [];
  const pendingSent = data?.pendingSent || [];
  const pendingCount = pendingReceived.length;
  
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, "#0a1a2e", Colors.dark.backgroundRoot]}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Friends</ThemedText>
        <Pressable
          style={styles.findButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("PlayerFinder");
          }}
        >
          <Ionicons name="person-add-outline" size={22} color={Colors.dark.primary} />
        </Pressable>
      </View>
      
      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tab, activeTab === "friends" && styles.tabActive]}
          onPress={() => setActiveTab("friends")}
        >
          <Ionicons 
            name="people" 
            size={18} 
            color={activeTab === "friends" ? Colors.dark.primary : Colors.dark.textMuted} 
          />
          <ThemedText style={[styles.tabText, activeTab === "friends" && styles.tabTextActive]}>
            Friends ({friends.length})
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "requests" && styles.tabActive]}
          onPress={() => setActiveTab("requests")}
        >
          <Ionicons 
            name="mail" 
            size={18} 
            color={activeTab === "requests" ? Colors.dark.primary : Colors.dark.textMuted} 
          />
          <ThemedText style={[styles.tabText, activeTab === "requests" && styles.tabTextActive]}>
            Requests
          </ThemedText>
          {pendingCount > 0 ? (
            <View style={styles.badgeCount}>
              <ThemedText style={styles.badgeText}>{pendingCount}</ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : isError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
          <ThemedText style={styles.emptyTitle}>Failed to load friends</ThemedText>
          <Pressable onPress={() => refetch()} style={styles.retryButton}>
            <ThemedText style={styles.retryText}>Try Again</ThemedText>
          </Pressable>
        </View>
      ) : activeTab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FriendCard 
              connection={item} 
              onPress={() => item.player && navigateToProfile(item.player.id)}
              onRemove={() => handleRemoveFriend(item)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <EmptyStateCard
                icon="people"
                title="No friends yet"
                description="Find and connect with other players at your academy"
                ctaText="Find Players"
                onPress={() => navigation.navigate("PlayerFinder")}
              />
            </View>
          }
        />
      ) : (
        <FlatList
          data={pendingReceived}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RequestCard
              connection={item}
              onAccept={() => handleAccept(item.id)}
              onDecline={() => handleDecline(item.id)}
              isLoading={respondingTo === item.id}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListHeaderComponent={
            pendingSent.length > 0 ? (
              <View style={styles.sentSection}>
                <ThemedText style={styles.sectionTitle}>Sent Requests ({pendingSent.length})</ThemedText>
                {pendingSent.map((conn: Connection) => (
                  <View key={conn.id} style={styles.sentRequest}>
                    <View style={styles.sentAvatar}>
                      {conn.player?.photoUrl ? (
                        <Image
                          source={{ uri: getPhotoUri(conn.player.photoUrl) ?? "" }}
                          style={styles.smallAvatar}
                        />
                      ) : (
                        <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
                      )}
                    </View>
                    <ThemedText style={styles.sentName}>{conn.player?.name}</ThemedText>
                    <View style={styles.pendingBadge}>
                      <ThemedText style={styles.pendingText}>Pending</ThemedText>
                    </View>
                  </View>
                ))}
                {pendingReceived.length > 0 ? (
                  <ThemedText style={styles.sectionTitle}>Received Requests</ThemedText>
                ) : null}
              </View>
            ) : null
          }
          ListEmptyComponent={
            pendingSent.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="mail-outline" size={48} color={Colors.dark.textMuted} />
                <ThemedText style={styles.emptyTitle}>No pending requests</ThemedText>
                <ThemedText style={styles.emptySubtitle}>
                  When players want to connect with you, their requests will appear here
                </ThemedText>
              </View>
            ) : null
          }
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  findButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.text,
  },
  badgeCount: {
    backgroundColor: Colors.dark.error,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  playerAvatarContainer: {
    position: "relative",
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  playerAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  openToPlayBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  levelBadge: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  ballBadge: {
    padding: 4,
    borderRadius: 8,
  },
  matchesText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  playerScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  removeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: Colors.dark.error + "15",
  },
  requestCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  requestInfo: {
    flex: 1,
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  requestActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.chipBackground,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  declineButton: {
    backgroundColor: Colors.dark.error + "20",
  },
  acceptButton: {
    backgroundColor: Colors.dark.primary,
  },
  declineText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.error,
  },
  acceptText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  sentSection: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  sentRequest: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  sentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  smallAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  sentName: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
  },
  pendingBadge: {
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pendingText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  findPlayersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  findPlayersText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
}));
