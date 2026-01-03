import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface SessionPlayer {
  id: string;
  name: string;
  level: number;
  avatarUrl?: string;
  ballLevel?: string;
}

interface PlaySession {
  id: string;
  title: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  locationName: string;
  courtName?: string;
  coachName?: string;
  coachId?: string;
  ballLevel?: string;
  vibe: string;
  minLevel?: number;
  maxLevel?: number;
  xpReward: number;
  maxPlayers: number;
  currentPlayers: number;
  players: SessionPlayer[];
  squadName?: string;
  squadXpBonus?: number;
  waitlistCount: number;
  status: "open" | "almost_full" | "full";
}

interface NearbyPlayer {
  id: string;
  name: string;
  level: number;
  avatarUrl?: string;
  vibe: string;
  mutualSessions: number;
  preferredTime?: string;
}

const TAB_OPTIONS = ["Sessions", "Players"] as const;

export default function PlayScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<typeof TAB_OPTIONS[number]>("Sessions");
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null);

  const { data: sessions, isLoading: sessionsLoading } = useQuery<PlaySession[]>({
    queryKey: ["/api/play/sessions"],
  });

  const { data: nearbyPlayers, isLoading: playersLoading } = useQuery<NearbyPlayer[]>({
    queryKey: ["/api/play/nearby-players"],
  });

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/join`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Joined!", data.message || "You're in the session!");
      queryClient.invalidateQueries({ queryKey: ["/api/play/sessions"] });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ") 
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not join session");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const joinWaitlistMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/waitlist`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string; position?: number }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Waitlist", data.message || `You're #${data.position} on the waitlist!`);
      queryClient.invalidateQueries({ queryKey: ["/api/play/sessions"] });
    },
    onError: (error: Error) => {
      const errorMessage = error.message.includes(": ") 
        ? error.message.split(": ").slice(1).join(": ")
        : error.message;
      Alert.alert("Oops", errorMessage || "Could not join waitlist");
    },
    onSettled: () => {
      setJoiningSessionId(null);
    },
  });

  const handleJoinSession = (sessionId: string) => {
    setJoiningSessionId(sessionId);
    joinSessionMutation.mutate(sessionId);
  };

  const handleJoinWaitlist = (sessionId: string) => {
    setJoiningSessionId(sessionId);
    joinWaitlistMutation.mutate(sessionId);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    
    if (isToday) return `Today ${timeStr}`;
    if (isTomorrow) return `Tomorrow ${timeStr}`;
    return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${timeStr}`;
  };

  const getStatusBadge = (session: PlaySession) => {
    const spotsLeft = session.maxPlayers - session.currentPlayers;
    
    if (spotsLeft === 0) {
      return { text: "Full", color: Colors.dark.error, bgColor: Colors.dark.error + "20" };
    }
    if (spotsLeft === 1) {
      return { text: "1 Almost Full", color: Colors.dark.orange, bgColor: Colors.dark.orange + "20" };
    }
    return { text: `${spotsLeft} Open`, color: Colors.dark.primary, bgColor: Colors.dark.primary + "20" };
  };

  const getLevelRangeText = (session: PlaySession) => {
    if (session.minLevel && session.maxLevel) {
      return `Lv ${session.minLevel}-${session.maxLevel}`;
    }
    if (session.minLevel) return `Lv ${session.minLevel}+`;
    if (session.maxLevel) return `Lv 1-${session.maxLevel}`;
    return "All Levels";
  };

  const renderSessionCard = (session: PlaySession) => {
    const statusBadge = getStatusBadge(session);
    const isFull = session.currentPlayers >= session.maxPlayers;
    const isJoining = joiningSessionId === session.id;

    return (
      <Pressable 
        key={session.id} 
        style={styles.sessionCard}
        onPress={() => navigation.navigate("TrainingDetail", { sessionId: session.id })}
      >
        <LinearGradient
          colors={["rgba(46, 204, 64, 0.08)", "rgba(26, 26, 26, 0.95)"]}
          style={styles.sessionCardGradient}
        >
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionTitle}>{session.title || "Training Session"}</Text>
            <View style={styles.xpBadge}>
              <Ionicons name="flame" size={14} color={Colors.dark.orange} />
              <Text style={styles.xpText}>+{session.xpReward} XP</Text>
            </View>
          </View>

          <View style={styles.sessionMeta}>
            <View style={styles.metaRow}>
              <Ionicons name="location" size={14} color={Colors.dark.primary} />
              <Text style={styles.metaText}>{session.locationName}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.metaText}>{formatTime(session.startTime)}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{getLevelRangeText(session)}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={[styles.metaText, { textTransform: "capitalize" }]}>{session.vibe}</Text>
            </View>
          </View>

          <View style={styles.sessionActions}>
            <View style={styles.statusSection}>
              <View style={[styles.statusBadge, { backgroundColor: statusBadge.bgColor }]}>
                <Text style={[styles.statusText, { color: statusBadge.color }]}>{statusBadge.text}</Text>
              </View>
              {!isFull ? (
                <Pressable 
                  style={[styles.joinButton, isJoining && styles.buttonDisabled]}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (!isJoining) handleJoinSession(session.id);
                  }}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <>
                      <Ionicons name="enter-outline" size={16} color={Colors.dark.backgroundRoot} />
                      <Text style={styles.joinButtonText}>Join Session</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable 
                  style={[styles.waitlistButton, isJoining && styles.buttonDisabled]}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (!isJoining) handleJoinWaitlist(session.id);
                  }}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <Text style={styles.waitlistButtonText}>Join Waitlist</Text>
                  )}
                </Pressable>
              )}
            </View>

            <View style={styles.playersSection}>
              <View style={styles.avatarStack}>
                {session.players.slice(0, 4).map((player, index) => (
                  <View 
                    key={player.id} 
                    style={[styles.avatarCircle, { marginLeft: index > 0 ? -12 : 0, zIndex: 4 - index }]}
                  >
                    <Text style={styles.avatarInitial}>{player.name.charAt(0).toUpperCase()}</Text>
                  </View>
                ))}
                {session.currentPlayers > 4 ? (
                  <View style={[styles.avatarCircle, styles.avatarMore, { marginLeft: -12 }]}>
                    <Text style={styles.avatarMoreText}>+{session.currentPlayers - 4}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.playerNames}>
                {session.players.slice(0, 3).map((player, index) => (
                  <Text key={player.id} style={styles.playerName}>
                    {player.name}{index < Math.min(session.players.length, 3) - 1 ? ", " : ""}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {session.squadName ? (
            <View style={styles.squadRow}>
              <Ionicons name="people" size={14} color={Colors.dark.primary} />
              <Text style={styles.squadName}>{session.squadName}</Text>
              <Ionicons name="flame" size={12} color={Colors.dark.orange} />
              <Text style={styles.squadXp}>+{session.squadXpBonus || 2} Squad XP</Text>
            </View>
          ) : null}
        </LinearGradient>
      </Pressable>
    );
  };

  const renderPlayerCard = (player: NearbyPlayer) => (
    <Pressable 
      key={player.id} 
      style={styles.playerCard}
      onPress={() => navigation.navigate("PublicProfile", { playerId: player.id })}
    >
      <View style={styles.playerAvatarLarge}>
        <Text style={styles.playerAvatarText}>{player.name.charAt(0).toUpperCase()}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{player.level}</Text>
        </View>
      </View>
      <Text style={styles.playerCardName}>{player.name}</Text>
      <Text style={styles.playerCardLevel}>Lv {player.level}</Text>
      {player.mutualSessions > 0 ? (
        <View style={styles.mutualBadge}>
          <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
          <Text style={styles.mutualText}>{player.mutualSessions} mutual</Text>
        </View>
      ) : (
        <Text style={styles.vibeText}>{player.vibe}</Text>
      )}
      <Pressable 
        style={styles.inviteButton}
        onPress={() => Alert.alert("Coming Soon", "Player invites will be available soon!")}
      >
        <Ionicons name="person-add-outline" size={14} color={Colors.dark.primary} />
        <Text style={styles.inviteButtonText}>Invite</Text>
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerLine} />
          <Text style={styles.headerTitle}>Play</Text>
          <View style={styles.headerLine} />
        </View>
        <Pressable 
          style={styles.chatButton}
          onPress={() => navigation.navigate("PlayerMessages")}
        >
          <Ionicons name="chatbubbles" size={24} color={Colors.dark.primary} />
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>1</Text>
          </View>
        </Pressable>
      </View>

      <Pressable 
        style={styles.findMatchButton}
        onPress={() => Alert.alert("Find a Match", "Matchmaking is coming soon! For now, browse available sessions below.")}
      >
        <Ionicons name="flame" size={20} color={Colors.dark.backgroundRoot} />
        <Text style={styles.findMatchText}>Find a Match</Text>
      </Pressable>

      <View style={styles.tabs}>
        {TAB_OPTIONS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "Sessions" ? (
          sessionsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
              <Text style={styles.loadingText}>Finding sessions...</Text>
            </View>
          ) : sessions && sessions.length > 0 ? (
            sessions.map(renderSessionCard)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTitle}>No Sessions Available</Text>
              <Text style={styles.emptySubtitle}>Check back soon for new training sessions</Text>
            </View>
          )
        ) : (
          <>
            <Text style={styles.sectionTitle}>Players nearby</Text>
            {playersLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : nearbyPlayers && nearbyPlayers.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.playersScroll}
                contentContainerStyle={styles.playersScrollContent}
              >
                {nearbyPlayers.map(renderPlayerCard)}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyTitle}>No Players Found</Text>
                <Text style={styles.emptySubtitle}>Players in your academy will appear here</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.primary + "40",
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    textAlign: "center",
  },
  chatButton: {
    position: "relative",
    padding: Spacing.sm,
  },
  chatBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chatBadgeText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontSize: 10,
    fontWeight: "700",
  },
  findMatchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.dark.primaryGlow,
  },
  findMatchText: {
    ...Typography.h4,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.dark.primary,
  },
  tabText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  sessionCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    marginBottom: Spacing.sm,
  },
  sessionCardGradient: {
    padding: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  sessionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    flex: 1,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  xpText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  sessionMeta: {
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  metaText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  metaDot: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginHorizontal: 4,
  },
  sessionActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statusSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  joinButtonText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "600",
  },
  waitlistButton: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  waitlistButtonText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  playersSection: {
    alignItems: "flex-end",
  },
  avatarStack: {
    flexDirection: "row",
    marginBottom: 4,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  avatarMore: {
    backgroundColor: Colors.dark.primary + "30",
  },
  avatarMoreText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 10,
    fontWeight: "600",
  },
  playerNames: {
    flexDirection: "row",
  },
  playerName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  squadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  squadName: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
    flex: 1,
  },
  squadXp: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontSize: 10,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  playersScroll: {
    marginHorizontal: -Spacing.lg,
  },
  playersScrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  playerCard: {
    width: 120,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  playerAvatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
    position: "relative",
  },
  playerAvatarText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  levelBadgeText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontSize: 10,
    fontWeight: "700",
  },
  playerCardName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  playerCardLevel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  mutualBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: Spacing.sm,
  },
  mutualText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 10,
  },
  vibeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
    marginBottom: Spacing.sm,
    textTransform: "capitalize",
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  inviteButtonText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 11,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyTitle: {
    ...Typography.h4,
    color: Colors.dark.textMuted,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
});
