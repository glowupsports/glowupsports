import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Alert, ImageBackground, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

const courtBackground = require("@/assets/images/courts/court-night-default.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
  courtImageUrl?: string;
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
      return { text: "Full", color: Colors.dark.error, bgColor: Colors.dark.error + "40" };
    }
    if (spotsLeft === 1) {
      return { text: "1 Almost Full", color: Colors.dark.orange, bgColor: Colors.dark.orange + "40" };
    }
    return { text: `${spotsLeft} Open`, color: Colors.dark.primary, bgColor: Colors.dark.primary + "40" };
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
    const backgroundImage = session.courtImageUrl ? { uri: session.courtImageUrl } : courtBackground;

    return (
      <Pressable 
        key={session.id} 
        style={styles.epicSessionCard}
        onPress={() => navigation.navigate("TrainingDetail", { sessionId: session.id })}
      >
        <ImageBackground 
          source={backgroundImage} 
          style={styles.cardBackground}
          imageStyle={styles.cardBackgroundImage}
        >
          <LinearGradient
            colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.9)"]}
            style={styles.cardOverlay}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleSection}>
                  <Text style={styles.epicSessionTitle}>{session.title || "Training Session"}</Text>
                  <View style={styles.epicLocationRow}>
                    <Ionicons name="location" size={14} color={Colors.dark.primary} />
                    <Text style={styles.epicLocationText}>{session.locationName}</Text>
                  </View>
                  <View style={styles.epicMetaRow}>
                    <Ionicons name="time-outline" size={13} color={Colors.dark.textMuted} />
                    <Text style={styles.epicMetaText}>{formatTime(session.startTime)}</Text>
                    <Text style={styles.epicMetaDot}>·</Text>
                    <Text style={styles.epicMetaText}>{getLevelRangeText(session)}</Text>
                    <Text style={styles.epicMetaDot}>·</Text>
                    <Text style={[styles.epicMetaText, { textTransform: "capitalize" }]}>{session.vibe}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.epicXpBadge}>
                <Ionicons name="flame" size={16} color={Colors.dark.orange} />
                <Text style={styles.epicXpText}>+{session.xpReward} XP</Text>
              </View>

              <View style={styles.epicActionsRow}>
                <View style={styles.epicStatusSection}>
                  <View style={[styles.epicStatusBadge, { backgroundColor: statusBadge.bgColor }]}>
                    <Text style={[styles.epicStatusText, { color: statusBadge.color }]}>{statusBadge.text}</Text>
                  </View>
                  {!isFull ? (
                    <Pressable 
                      style={[styles.epicJoinButton, isJoining && styles.buttonDisabled]}
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
                          <Ionicons name="enter-outline" size={18} color={Colors.dark.backgroundRoot} />
                          <Text style={styles.epicJoinButtonText}>Join Session</Text>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <Pressable 
                      style={[styles.epicWaitlistButton, isJoining && styles.buttonDisabled]}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (!isJoining) handleJoinWaitlist(session.id);
                      }}
                      disabled={isJoining}
                    >
                      {isJoining ? (
                        <ActivityIndicator size="small" color={Colors.dark.text} />
                      ) : (
                        <Text style={styles.epicWaitlistButtonText}>Join Waitlist</Text>
                      )}
                    </Pressable>
                  )}
                </View>

                <View style={styles.epicPlayersSection}>
                  <View style={styles.epicAvatarStack}>
                    {session.players.slice(0, 4).map((player, index) => (
                      <View 
                        key={player.id} 
                        style={[
                          styles.epicAvatarCircle, 
                          { marginLeft: index > 0 ? -20 : 0, zIndex: 4 - index }
                        ]}
                      >
                        {player.avatarUrl ? (
                          <Image source={{ uri: player.avatarUrl }} style={styles.epicAvatarImage} />
                        ) : (
                          <LinearGradient
                            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundTertiary]}
                            style={styles.epicAvatarPlaceholder}
                          >
                            <Text style={styles.epicAvatarInitial}>{player.name.charAt(0).toUpperCase()}</Text>
                          </LinearGradient>
                        )}
                        {player.ballLevel === "glow" ? (
                          <View style={styles.epicGoldRing} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                  <View style={styles.epicPlayerNames}>
                    {session.players.slice(0, 3).map((player, index) => (
                      <Text key={player.id} style={styles.epicPlayerName}>
                        {player.name.split(" ")[0]}{index < Math.min(session.players.length, 3) - 1 ? "  " : ""}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>

              {session.squadName ? (
                <View style={styles.epicSquadRow}>
                  <Ionicons name="radio" size={14} color={Colors.dark.primary} />
                  <Text style={styles.epicSquadName}>{session.squadName}</Text>
                  <View style={styles.epicSquadXpBadge}>
                    <Ionicons name="flame" size={12} color={Colors.dark.orange} />
                    <Text style={styles.epicSquadXp}>+{session.squadXpBonus || 2} Squad XP</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </LinearGradient>
        </ImageBackground>
        <View style={styles.epicCardGlow} />
      </Pressable>
    );
  };

  const renderPlayerCard = (player: NearbyPlayer) => {
    const hasAvatar = player.avatarUrl;
    
    return (
      <Pressable 
        key={player.id} 
        style={styles.epicPlayerCard}
        onPress={() => navigation.navigate("PublicProfile", { playerId: player.id })}
      >
        {hasAvatar ? (
          <ImageBackground 
            source={{ uri: player.avatarUrl }}
            style={styles.epicPlayerCardBg}
            imageStyle={styles.epicPlayerCardBgImage}
          >
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.8)"]}
              style={styles.epicPlayerCardOverlay}
            >
              <View style={styles.epicPlayerCardContent}>
                <View style={styles.epicPlayerLevelBadge}>
                  <Text style={styles.epicPlayerLevelText}>Lv {player.level}</Text>
                </View>
                <Text style={styles.epicPlayerCardName}>{player.name}</Text>
                {player.mutualSessions > 0 ? (
                  <View style={styles.epicMutualBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
                    <Text style={styles.epicMutualText}>{player.mutualSessions} mutual sessions</Text>
                  </View>
                ) : (
                  <Text style={styles.epicVibeText}>{player.preferredTime || player.vibe}</Text>
                )}
                <Pressable 
                  style={player.mutualSessions > 0 ? styles.epicInviteButtonGreen : styles.epicViewButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (player.mutualSessions > 0) {
                      Alert.alert("Coming Soon", "Player invites will be available soon!");
                    } else {
                      navigation.navigate("PublicProfile", { playerId: player.id });
                    }
                  }}
                >
                  {player.mutualSessions > 0 ? (
                    <>
                      <Ionicons name="person-add" size={14} color={Colors.dark.backgroundRoot} />
                      <Text style={styles.epicInviteButtonText}>Invite</Text>
                    </>
                  ) : (
                    <Text style={styles.epicViewButtonText}>View</Text>
                  )}
                </Pressable>
              </View>
            </LinearGradient>
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundTertiary]}
            style={styles.epicPlayerCardBg}
          >
            <View style={styles.epicPlayerCardContent}>
              <View style={styles.epicPlayerAvatarLarge}>
                <Text style={styles.epicPlayerAvatarText}>{player.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.epicPlayerLevelBadge}>
                <Text style={styles.epicPlayerLevelText}>Lv {player.level}</Text>
              </View>
              <Text style={styles.epicPlayerCardName}>{player.name}</Text>
              {player.mutualSessions > 0 ? (
                <View style={styles.epicMutualBadge}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.dark.primary} />
                  <Text style={styles.epicMutualText}>{player.mutualSessions} mutual</Text>
                </View>
              ) : (
                <Text style={styles.epicVibeText}>{player.preferredTime || player.vibe}</Text>
              )}
              <Pressable 
                style={player.mutualSessions > 0 ? styles.epicInviteButtonGreen : styles.epicViewButton}
                onPress={(e) => {
                  e.stopPropagation();
                  if (player.mutualSessions > 0) {
                    Alert.alert("Coming Soon", "Player invites will be available soon!");
                  } else {
                    navigation.navigate("PublicProfile", { playerId: player.id });
                  }
                }}
              >
                {player.mutualSessions > 0 ? (
                  <>
                    <Ionicons name="person-add" size={14} color={Colors.dark.backgroundRoot} />
                    <Text style={styles.epicInviteButtonText}>Invite</Text>
                  </>
                ) : (
                  <Text style={styles.epicViewButtonText}>View</Text>
                )}
              </Pressable>
            </View>
          </LinearGradient>
        )}
        <View style={styles.epicPlayerCardGlow} />
      </Pressable>
    );
  };

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
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.findMatchGradient}
        >
          <Ionicons name="flame" size={22} color={Colors.dark.backgroundRoot} />
          <Text style={styles.findMatchText}>Find a Match</Text>
        </LinearGradient>
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
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="people" size={20} color={Colors.dark.textMuted} />
                <Text style={styles.sectionTitle}>Players nearby</Text>
              </View>
              <Pressable style={styles.viewAllButton}>
                <Text style={styles.viewAllText}>View All</Text>
              </Pressable>
            </View>
            {playersLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : nearbyPlayers && nearbyPlayers.length > 0 ? (
              <View style={styles.playersGrid}>
                {nearbyPlayers.map(renderPlayerCard)}
              </View>
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

const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2;

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
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.dark.primaryGlow + "60",
  },
  findMatchGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
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
    gap: Spacing.lg,
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
  epicSessionCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.md,
    position: "relative",
  },
  cardBackground: {
    width: "100%",
    minHeight: 220,
  },
  cardBackgroundImage: {
    borderRadius: BorderRadius.lg,
  },
  cardOverlay: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  cardContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  cardHeader: {
    marginBottom: Spacing.md,
  },
  cardTitleSection: {
    gap: Spacing.xs,
  },
  epicSessionTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "700",
    marginBottom: 2,
  },
  epicLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  epicLocationText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  epicMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  epicMetaText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  epicMetaDot: {
    color: Colors.dark.textMuted,
    marginHorizontal: 2,
  },
  epicXpBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 133, 27, 0.25)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
  },
  epicXpText: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "700",
  },
  epicActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: Spacing.md,
  },
  epicStatusSection: {
    gap: Spacing.sm,
  },
  epicStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  epicStatusText: {
    ...Typography.body,
    fontWeight: "700",
  },
  epicJoinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primaryGlow,
  },
  epicJoinButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  epicWaitlistButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  epicWaitlistButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  epicPlayersSection: {
    alignItems: "flex-end",
  },
  epicAvatarStack: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  epicAvatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: Colors.dark.backgroundRoot,
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  epicAvatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  epicAvatarPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
  },
  epicAvatarInitial: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  epicGoldRing: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: Colors.dark.gold,
  },
  epicPlayerNames: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  epicPlayerName: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  epicSquadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  epicSquadName: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
    flex: 1,
  },
  epicSquadXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  epicSquadXp: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  epicCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "50",
    pointerEvents: "none",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  viewAllButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  viewAllText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  playersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  epicPlayerCard: {
    width: CARD_WIDTH,
    height: 200,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    position: "relative",
  },
  epicPlayerCardBg: {
    flex: 1,
    justifyContent: "flex-end",
  },
  epicPlayerCardBgImage: {
    borderRadius: BorderRadius.lg,
  },
  epicPlayerCardOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: Spacing.md,
  },
  epicPlayerCardContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: Spacing.md,
  },
  epicPlayerAvatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  epicPlayerAvatarText: {
    fontSize: 32,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  epicPlayerLevelBadge: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  epicPlayerLevelText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
    fontSize: 10,
  },
  epicPlayerCardName: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontWeight: "700",
    marginBottom: 2,
  },
  epicMutualBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: Spacing.sm,
  },
  epicMutualText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 11,
  },
  epicVibeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginBottom: Spacing.sm,
    textTransform: "capitalize",
  },
  epicInviteButtonGreen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  epicInviteButtonText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  epicViewButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  epicViewButtonText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  epicPlayerCardGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
    pointerEvents: "none",
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
