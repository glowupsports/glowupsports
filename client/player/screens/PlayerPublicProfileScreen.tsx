import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Switch,
  RefreshControl,
  Modal,
  Platform,
  Image as RNImage,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import Animated, { FadeIn, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, getPlayerLevelColor, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { apiRequest, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";

interface PublicProfile {
  id: string;
  name: string;
  photoUrl: string | null;
  level: number;
  levelTitle: string;
  ballLevel: string;
  glowScore: number;
  totalXp: number;
  xpToNextLevel: number;
  xpProgress: number;
  streak: number;
  openToPlay: boolean;
  weeklyRanking: number;
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    sessionsAttended: number;
    connectionsCount: number;
  };
  dna: {
    dominantHand: string;
    backhandType: string;
    preferredPlayType: string;
    matchPreference: string;
    experienceLevel: string | null;
    motivationType: string | null;
    focusGoals: string[];
  };
  pillars: {
    id: string;
    name: string;
    displayName: string;
    icon: string | null;
    color: string | null;
    level: number;
    progress: number;
    trend: string;
  }[];
  recentMatches: {
    id: string;
    opponentId: string | null;
    opponentName: string;
    opponentPhotoUrl: string | null;
    opponentLevel: number;
    matchType: string;
    result: string | null;
    score: string | null;
    date: string | null;
  }[];
  upcomingMatches: {
    id: string;
    opponentName: string;
    opponentLevel: number;
    matchType: string;
    date: string | null;
    locationCity: string | null;
  }[];
  connections: {
    total: number;
    previews: {
      id: string;
      name: string;
      photoUrl: string | null;
      level: number;
    }[];
  };
  availability: {
    typicalPlayTimes: string[];
    preferredCities: string[];
  } | null;
  isOwnProfile: boolean;
  bio: string | null;
}

const PILLAR_ICONS: Record<string, string> = {
  technical: "tennisball",
  mental: "bulb",
  physical: "fitness",
  social: "people",
  tactical: "compass",
};

const PILLAR_COLORS: Record<string, string> = {
  technical: "#2ECC40",
  mental: "#00D4FF",
  physical: "#FFD700",
  social: "#FF6B6B",
  tactical: "#9B59B6",
};

const PILLAR_DESCRIPTIONS: Record<string, { meaning: string; howToLevel: string }> = {
  technical: {
    meaning: "Your stroke mechanics, shot variety, and ball control mastery",
    howToLevel: "Attend training sessions, practice drills, complete technique feedback",
  },
  mental: {
    meaning: "Focus, pressure handling, match strategy and mental resilience",
    howToLevel: "Complete mental challenges, maintain streaks, stay consistent",
  },
  physical: {
    meaning: "Endurance, speed, agility and on-court fitness level",
    howToLevel: "Attend fitness sessions, complete physical challenges, track activity",
  },
  social: {
    meaning: "Connections, sportsmanship, and community engagement",
    howToLevel: "Play matches with others, connect with players, join group sessions",
  },
  tactical: {
    meaning: "Game awareness, shot selection, and court positioning",
    howToLevel: "Complete tactical drills, analyze match patterns, attend tactical training",
  },
};

const getPlayerStatusBadge = (stats: { matchesPlayed: number; wins: number; sessionsAttended: number }): { label: string; color: string; borderColor: string } => {
  const totalActivity = stats.matchesPlayed + stats.sessionsAttended;
  const winRate = stats.matchesPlayed > 0 ? stats.wins / stats.matchesPlayed : 0;
  
  if (totalActivity >= 20 && winRate >= 0.6) {
    return { label: "Competitive", color: Colors.dark.gold, borderColor: Colors.dark.gold };
  } else if (totalActivity >= 10) {
    return { label: "Active", color: Colors.dark.primary, borderColor: Colors.dark.primary };
  } else if (totalActivity >= 3) {
    return { label: "Rising", color: Colors.dark.primary, borderColor: Colors.dark.primary };
  }
  return { label: "New Player", color: Colors.dark.text, borderColor: Colors.dark.backgroundTertiary };
};

export default function PlayerPublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const playerId = route.params?.playerId || user?.playerId;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPillar, setSelectedPillar] = useState<PublicProfile["pillars"][0] | null>(null);

  const glowPulse = useSharedValue(0.5);
  
  React.useEffect(() => {
    glowPulse.value = withRepeat(
      withTiming(1, { duration: 2000 }),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + glowPulse.value * 0.4,
  }));

  const { data: profile, isLoading, error, refetch } = useQuery<PublicProfile>({
    queryKey: ["/api/player/public-profile", playerId],
    enabled: !!playerId,
  });

  const toggleOpenToPlayMutation = useMutation({
    mutationFn: async (openToPlay: boolean) => {
      return apiRequest("PATCH", "/api/player/me/open-to-play", { openToPlay });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/public-profile", playerId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Connection status for this player
  const { data: connectionStatus, isLoading: connectionStatusLoading } = useQuery<{ status: string; connectionId: string | null; isRequester: boolean; reason?: string }>({
    queryKey: [`/api/player/connections/status/${playerId}`],
    enabled: !!playerId && !profile?.isOwnProfile,
  });

  // Live match polling for this player (followers/coaches can see if someone they follow is playing live)
  const { data: publicActiveLiveMatch } = useQuery<{ matches?: Array<{ id: string; sport: string; status: string; creatorId: string; opponentIds: string[] }> }>({
    queryKey: [`/api/live-scoring/player/${playerId}/active`],
    enabled: !!playerId,
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const sendFriendRequestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/player/connections/request", { targetPlayerId: playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/player/connections/status/${playerId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/connections"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // apiRequest throws errors of the form "<status>: <body>". Try to extract a clean message.
      const raw = err?.message || "";
      let message = raw;
      const match = raw.match(/^\d+:\s*(.*)$/s);
      if (match) {
        const body = match[1].trim();
        try {
          const parsed = JSON.parse(body);
          message = parsed?.error || parsed?.message || body;
        } catch {
          message = body;
        }
      }
      // Always force the status query to re-sync with server truth so the UI never lies.
      queryClient.invalidateQueries({ queryKey: [`/api/player/connections/status/${playerId}`] });
      Alert.alert("Couldn't send friend request", message || "Please try again in a moment.");
    },
  });

  const handleAddFriend = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sendFriendRequestMutation.mutate();
  };

  // Match FriendsListScreen: invalidate the connections list AND every
  // per-profile status query, so any other open profile reflects the new
  // state without going stale.
  const invalidateAllConnectionStatusCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/player/connections"] });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey?.[0];
        return typeof key === "string" && key.startsWith("/api/player/connections/status/");
      },
    });
  };

  // Accept / decline an incoming friend request directly from the profile,
  // so players don't have to detour through the Friends list (Task #724).
  const respondToRequestMutation = useMutation({
    mutationFn: async ({ connectionId, action }: { connectionId: string; action: "accept" | "decline" }) => {
      return apiRequest("POST", `/api/player/connections/${connectionId}/respond`, { action });
    },
    onSuccess: () => {
      invalidateAllConnectionStatusCaches();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const raw = err?.message || "";
      let message = raw;
      const match = raw.match(/^\d+:\s*(.*)$/s);
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
      invalidateAllConnectionStatusCaches();
      Alert.alert("Couldn't respond to request", message || "Please try again.");
    },
  });

  const handleAcceptRequest = () => {
    if (!connectionStatus?.connectionId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    respondToRequestMutation.mutate({ connectionId: connectionStatus.connectionId, action: "accept" });
  };

  const handleDeclineRequest = () => {
    if (!connectionStatus?.connectionId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    respondToRequestMutation.mutate({ connectionId: connectionStatus.connectionId, action: "decline" });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleFindMatch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("PlayerFinder");
  };

  const handleChallengePlayer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!profile?.isOwnProfile && playerId) {
      navigation.navigate("ChallengePlayer", { playerId });
    }
  };

  const getBallLevelLabel = (level: string) => {
    const labels: Record<string, string> = {
      red: "Red Ball",
      orange: "Orange Ball",
      green: "Green Ball",
      yellow: "Yellow Ball",
      glow: "Glow Ball",
    };
    return labels[level] || "Green Ball";
  };

  const getHandLabel = (hand: string) => {
    if (hand === "left") return "Left-handed";
    if (hand === "right") return "Right-handed";
    return "Both hands";
  };

  const getBackhandLabel = (type: string) => {
    return type === "single" ? "1H Backhand" : "2H Backhand";
  };

  const getPlayStyleLabel = (type: string) => {
    const labels: Record<string, string> = {
      singles: "Singles",
      doubles: "Doubles",
      both: "Singles & Doubles",
    };
    return labels[type] || "All-round";
  };

  const getMatchPrefLabel = (pref: string) => {
    const labels: Record<string, string> = {
      casual: "Casual",
      training: "Training",
      competitive: "Competitive",
    };
    return labels[pref] || "Casual";
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="person-circle-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={styles.errorText}>Player not found</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const levelColor = getPlayerLevelColor(profile.ballLevel);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.primary} />
        }
      >
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LAYER 1: HERO HEADER */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.heroSection}>
          <LinearGradient
            colors={["rgba(46,204,64,0.15)", "transparent"]}
            style={styles.heroGradient}
          />
          
          {/* Avatar with Glow Ring */}
          <View style={styles.avatarContainer}>
            <Animated.View style={[styles.avatarGlow, glowStyle, { backgroundColor: levelColor }]} />
            <View style={[styles.avatarBorder, { borderColor: levelColor }]}>
              {profile.photoUrl ? (
                Platform.OS === 'web' ? (
                  <RNImage
                    source={{ uri: buildPhotoUrl(profile.photoUrl)! }}
                    style={styles.avatarPhoto}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={{ uri: buildPhotoUrl(profile.photoUrl)! }}
                    style={styles.avatarPhoto}
                    contentFit="cover"
                  />
                )
              ) : (
                <View style={styles.avatarImage}>
                  <Text style={styles.avatarInitial}>
                    {profile.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            
            {/* Open to Play Badge */}
            {profile.openToPlay && (
              <View style={styles.openToPlayBadge}>
                <Ionicons name="flame" size={12} color={Colors.dark.text} />
              </View>
            )}
          </View>

          {/* Name & Title */}
          <Text style={styles.playerName}>{profile.name}</Text>
          <Text style={styles.playerSubtitle}>
            {profile.levelTitle} · {getBallLevelLabel(profile.ballLevel)}
          </Text>
          
          {/* Status Badge */}
          {(() => {
            const statusBadge = getPlayerStatusBadge(profile.stats);
            return (
              <View style={[styles.statusBadge, { borderColor: statusBadge.borderColor, backgroundColor: statusBadge.borderColor + "20" }]}>
                <Ionicons 
                  name={statusBadge.label === "Competitive" ? "trophy" : statusBadge.label === "Active" ? "pulse" : statusBadge.label === "Rising" ? "trending-up" : "star-outline"} 
                  size={12} 
                  color={statusBadge.color} 
                />
                <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
              </View>
            );
          })()}

          {/* Live Match Banner — visible to followers & coaches when this player is playing live */}
          {publicActiveLiveMatch?.matches && publicActiveLiveMatch.matches.length > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.liveBanner, pressed && { opacity: 0.8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate("LiveMatchViewer" as any, {
                  matchId: publicActiveLiveMatch.matches![0].id,
                  playerName: profile?.name,
                });
              }}
            >
              <View style={styles.liveDot} />
              <Text style={styles.liveBannerText}>Live Now — Watch Match</Text>
              <Ionicons name="chevron-forward" size={16} color="#FF4444" />
            </Pressable>
          ) : null}

          {/* Level & Glow Score Chips */}
          <View style={styles.chipRow}>
            <View style={[styles.chip, styles.levelChip]}>
              <Ionicons name="shield" size={14} color={Colors.dark.primary} />
              <Text style={styles.chipText}>LV {profile.level}</Text>
            </View>
            <View style={[styles.chip, styles.glowChip]}>
              <Ionicons name="flash" size={14} color={Colors.dark.primary} />
              <Text style={[styles.chipText, { color: Colors.dark.primary }]}>{profile.glowScore}</Text>
            </View>
          </View>

          {/* XP Progress Bar */}
          <View style={styles.xpBarContainer}>
            <View style={styles.xpBarBg}>
              <LinearGradient
                colors={[GlowColors.primary, GlowColors.dark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.xpBarFill, { width: `${profile.xpProgress * 100}%` }]}
              />
            </View>
            <Text style={styles.xpText}>
              {Math.round(profile.xpProgress * 100)}% to LV {profile.level + 1}
            </Text>
          </View>

          {/* Quick Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="tennisball" size={16} color={Colors.dark.primary} />
              <Text style={styles.statValue}>{profile.stats.matchesPlayed}</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
            {profile.streak > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="flame" size={16} color={Colors.dark.orange} />
                <Text style={styles.statValue}>{profile.streak}</Text>
                <Text style={styles.statLabel}>Streak</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Ionicons name="flash" size={16} color={Colors.dark.primary} />
              <Text style={styles.statValue}>{profile.stats.sessionsAttended}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="people" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.statValue}>{profile.connections.total}</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </View>
          </View>

          {/* Weekly Ranking */}
          {profile.weeklyRanking > 0 && (
            <Pressable style={styles.rankingRow}>
              <Ionicons name="flame" size={14} color={Colors.dark.orange} />
              <Text style={styles.rankingText}>#{profile.weeklyRanking} This Week</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
            </Pressable>
          )}

          {/* Hero Action Buttons */}
          <View style={styles.heroActions}>
            {profile.isOwnProfile ? (
              <Pressable style={styles.findMatchBtn} onPress={handleFindMatch} testID="button-find-match">
                <Ionicons name="tennisball" size={18} color={Colors.dark.buttonText} />
                <Text style={styles.findMatchBtnText}>Find Match</Text>
              </Pressable>
            ) : (
              <>
                {connectionStatusLoading ? (
                  <View style={styles.connectionLoadingBtn}>
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                  </View>
                ) : connectionStatus?.status === "unavailable" ? (
                  <Pressable
                    style={[styles.addFriendBtn, { opacity: 0.55 }]}
                    onPress={() =>
                      Alert.alert(
                        "Player profile required",
                        "Switch to a player account to send friend requests."
                      )
                    }
                    testID="button-add-friend-disabled"
                  >
                    <Ionicons name="person-add" size={18} color={Colors.dark.text} />
                    <Text style={styles.addFriendBtnText}>Add Friend</Text>
                  </Pressable>
                ) : connectionStatus?.status === "none" || !connectionStatus ? (
                  <Pressable 
                    style={styles.addFriendBtn} 
                    onPress={handleAddFriend}
                    disabled={sendFriendRequestMutation.isPending}
                    testID="button-add-friend"
                  >
                    {sendFriendRequestMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.text} />
                    ) : (
                      <>
                        <Ionicons name="person-add" size={18} color={Colors.dark.text} />
                        <Text style={styles.addFriendBtnText}>Add Friend</Text>
                      </>
                    )}
                  </Pressable>
                ) : connectionStatus?.status === "pending" ? (
                  connectionStatus.isRequester ? (
                    <View style={styles.pendingBtn} testID="status-pending-friend">
                      <Ionicons name="time" size={18} color={Colors.dark.gold} />
                      <Text style={styles.pendingBtnText}>Request Sent</Text>
                    </View>
                  ) : (
                    <View style={styles.respondActions} testID="status-pending-friend">
                      <Pressable
                        style={[styles.acceptBtn, respondToRequestMutation.isPending && { opacity: 0.6 }]}
                        onPress={handleAcceptRequest}
                        disabled={respondToRequestMutation.isPending}
                        testID="button-accept-request"
                      >
                        {respondToRequestMutation.isPending && respondToRequestMutation.variables?.action === "accept" ? (
                          <ActivityIndicator size="small" color={Colors.dark.text} />
                        ) : (
                          <>
                            <Ionicons name="checkmark" size={18} color={Colors.dark.text} />
                            <Text style={styles.acceptBtnText}>Accept</Text>
                          </>
                        )}
                      </Pressable>
                      <Pressable
                        style={[styles.declineBtn, respondToRequestMutation.isPending && { opacity: 0.6 }]}
                        onPress={handleDeclineRequest}
                        disabled={respondToRequestMutation.isPending}
                        testID="button-decline-request"
                      >
                        {respondToRequestMutation.isPending && respondToRequestMutation.variables?.action === "decline" ? (
                          <ActivityIndicator size="small" color={Colors.dark.textMuted} />
                        ) : (
                          <Text style={styles.declineBtnText}>Decline</Text>
                        )}
                      </Pressable>
                    </View>
                  )
                ) : connectionStatus?.status === "accepted" ? (
                  <View style={styles.friendsBtn} testID="status-friends">
                    <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
                    <Text style={styles.friendsBtnText}>Friends</Text>
                  </View>
                ) : null}
                <Pressable style={styles.challengeBtn} onPress={handleChallengePlayer} testID="button-challenge-player">
                  <Ionicons name="flash" size={18} color={Colors.dark.primary} />
                  <Text style={styles.challengeBtnText}>Challenge</Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Open to Play Toggle (own profile only) */}
          {profile.isOwnProfile && (
            <View style={styles.openToPlayToggle}>
              <View style={styles.toggleLeft}>
                <Ionicons name="flame" size={18} color={profile.openToPlay ? Colors.dark.orange : Colors.dark.textMuted} />
                <Text style={styles.toggleLabel}>Open to Play</Text>
              </View>
              <Switch
                value={profile.openToPlay}
                onValueChange={(val) => toggleOpenToPlayMutation.mutate(val)}
                trackColor={{ false: Colors.dark.backgroundTertiary, true: Colors.dark.primary }}
                thumbColor={Colors.dark.text}
              />
            </View>
          )}
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LAYER 2: PLAYER DNA */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>PLAYER DNA</Text>
          </View>
          
          <View style={styles.dnaGrid}>
            <View style={styles.dnaItem}>
              <Ionicons name="hand-left" size={20} color={Colors.dark.primary} />
              <Text style={styles.dnaLabel}>{getHandLabel(profile.dna.dominantHand)}</Text>
            </View>
            <View style={styles.dnaItem}>
              <Ionicons name="tennisball" size={20} color={Colors.dark.primary} />
              <Text style={styles.dnaLabel}>{getBackhandLabel(profile.dna.backhandType)}</Text>
            </View>
            <View style={styles.dnaItem}>
              <Ionicons name="people" size={20} color={Colors.dark.orange} />
              <Text style={styles.dnaLabel}>{getPlayStyleLabel(profile.dna.preferredPlayType)}</Text>
            </View>
            <View style={styles.dnaItem}>
              <Ionicons name="trophy" size={20} color={Colors.dark.gold} />
              <Text style={styles.dnaLabel}>{getMatchPrefLabel(profile.dna.matchPreference)}</Text>
            </View>
          </View>

          {profile.dna.focusGoals && profile.dna.focusGoals.length > 0 && (
            <View style={styles.goalsRow}>
              <Text style={styles.goalsLabel}>Goals:</Text>
              {profile.dna.focusGoals.slice(0, 3).map((goal, i) => (
                <View key={i} style={styles.goalChip}>
                  <Text style={styles.goalChipText}>{goal}</Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LAYER 3: 5-PILLAR PROGRESS */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>5 PILLARS PROGRESS</Text>
          </View>
          
          <View style={styles.pillarsGrid}>
            {profile.pillars.map((pillar) => (
              <Pressable 
                key={pillar.id} 
                style={styles.pillarItem}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPillar(pillar);
                }}
              >
                <View style={[styles.pillarCircle, { borderColor: PILLAR_COLORS[pillar.name] || Colors.dark.primary }]}>
                  <Ionicons 
                    name={(PILLAR_ICONS[pillar.name] || "ellipse") as any} 
                    size={24} 
                    color={PILLAR_COLORS[pillar.name] || Colors.dark.primary} 
                  />
                </View>
                <Text style={styles.pillarName}>{pillar.displayName}</Text>
                <Text style={[styles.pillarLevel, { color: PILLAR_COLORS[pillar.name] || Colors.dark.primary }]}>
                  LVL {pillar.level}
                </Text>
                <View style={styles.pillarProgress}>
                  <View 
                    style={[
                      styles.pillarProgressFill, 
                      { width: `${pillar.progress}%`, backgroundColor: PILLAR_COLORS[pillar.name] || Colors.dark.primary }
                    ]} 
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LAYER 3.5: ACTIVITY FEED */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
          </View>
          
          {(profile.recentMatches.length > 0 || profile.stats.sessionsAttended > 0) ? (
            <View style={styles.activityFeed}>
              {profile.recentMatches.slice(0, 2).map((match) => (
                <View key={match.id} style={styles.activityItem}>
                  <View style={[styles.activityIcon, { backgroundColor: "rgba(255,107,107,0.2)" }]}>
                    <Ionicons name="tennisball" size={16} color={Colors.dark.orange} />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>
                      Played a match vs <Text style={styles.activityHighlight}>{match.opponentName}</Text>
                    </Text>
                    <Text style={styles.activityXp}>+12 Social XP</Text>
                  </View>
                </View>
              ))}
              {profile.stats.sessionsAttended > 0 && (
                <View style={styles.activityItem}>
                  <View style={[styles.activityIcon, { backgroundColor: "rgba(255,215,0,0.2)" }]}>
                    <Ionicons name="fitness" size={16} color={Colors.dark.gold} />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>Completed training session</Text>
                    <Text style={styles.activityXp}>+8 Physical XP</Text>
                  </View>
                </View>
              )}
              {profile.connections.total > 0 && (
                <View style={styles.activityItem}>
                  <View style={[styles.activityIcon, { backgroundColor: "rgba(0,212,255,0.2)" }]}>
                    <Ionicons name="people" size={16} color={Colors.dark.primary} />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>
                      Connected with <Text style={styles.activityHighlight}>{profile.connections.previews[0]?.name || "a player"}</Text>
                    </Text>
                    <Text style={styles.activityXp}>+5 Social XP</Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyActivityCard}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="sparkles" size={40} color={Colors.dark.primary} />
              </View>
              <Text style={styles.emptyActivityTitle}>Start Your Journey</Text>
              <Text style={styles.emptyActivitySubtitle}>Play matches, attend training, and connect with players to build your activity feed</Text>
            </View>
          )}
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LAYER 4: MATCHES */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>MATCHES</Text>
            {profile.streak > 0 && (
              <View style={styles.winStreakBadge}>
                <Ionicons name="flame" size={12} color={Colors.dark.orange} />
                <Text style={styles.winStreakText}>WIN STREAK {profile.streak} DAYS</Text>
              </View>
            )}
          </View>

          {profile.upcomingMatches.length > 0 && (
            <View style={styles.matchCard}>
              <Text style={styles.matchCardTitle}>UPCOMING MATCH</Text>
              {profile.upcomingMatches.slice(0, 1).map((match) => (
                <View key={match.id} style={styles.matchRow}>
                  <View style={styles.matchOpponent}>
                    <View style={styles.matchAvatar}>
                      <Text style={styles.matchAvatarText}>
                        {match.opponentName.charAt(0)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.matchName}>{match.opponentName}</Text>
                      <Text style={styles.matchLevel}>LVL {match.opponentLevel}</Text>
                    </View>
                  </View>
                  {match.locationCity && (
                    <Text style={styles.matchLocation}>{match.locationCity}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {profile.recentMatches.length > 0 ? (
            <View style={styles.matchCard}>
              {profile.recentMatches.map((match, index) => (
                <View key={match.id} style={[styles.matchRow, index > 0 && styles.matchRowBorder]}>
                  <View style={styles.matchOpponent}>
                    <View style={styles.matchAvatar}>
                      <Text style={styles.matchAvatarText}>
                        {match.opponentName.charAt(0)}
                      </Text>
                      <View style={styles.matchLevelBadge}>
                        <Text style={styles.matchLevelBadgeText}>{match.opponentLevel}</Text>
                      </View>
                    </View>
                    <View>
                      <Text style={styles.matchName}>{match.opponentName}</Text>
                      <Text style={styles.matchLevel}>
                        LVL {match.opponentLevel}
                      </Text>
                    </View>
                  </View>
                  {match.score && (
                    <Text style={[
                      styles.matchScore,
                      match.result === "played" ? styles.matchWin : styles.matchLoss
                    ]}>
                      {match.score}
                    </Text>
                  )}
                </View>
              ))}
              <Pressable style={styles.viewAllBtn}>
                <Text style={styles.viewAllBtnText}>View Match History</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyMatchCard}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="trophy" size={40} color={Colors.dark.gold} />
              </View>
              <Text style={styles.emptyMatchTitle}>First Match Unlocks Social XP</Text>
              <Text style={styles.emptyMatchSubtitle}>Play your first match to appear in Glow Rank</Text>
              <Pressable 
                style={styles.findMatchCta}
                onPress={() => navigation.navigate("FindMatch" as never)}
              >
                <Ionicons name="tennisball" size={18} color={Colors.dark.buttonText} />
                <Text style={styles.findMatchCtaText}>Find a Match</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LAYER 5: CONNECTIONS */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>CONNECTIONS</Text>
          </View>
          
          {profile.connections.total > 0 ? (
            <View style={styles.connectionsCard}>
              <Text style={styles.connectionsSubtitle}>
                You've played matches with {profile.connections.total} players
              </Text>
              
              <View style={styles.connectionAvatars}>
                {profile.connections.previews.slice(0, 5).map((conn, i) => (
                  <View 
                    key={conn.id} 
                    style={[styles.connectionAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i }]}
                  >
                    <Text style={styles.connectionInitial}>{conn.name.charAt(0)}</Text>
                  </View>
                ))}
                {profile.connections.total > 5 && (
                  <View style={[styles.connectionAvatar, styles.connectionMore]}>
                    <Text style={styles.connectionMoreText}>+{profile.connections.total - 5}</Text>
                  </View>
                )}
              </View>
              
              <Pressable style={styles.viewAllBtn}>
                <Text style={styles.viewAllBtnText}>View All Connections</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyConnectionsCard}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="people" size={40} color={Colors.dark.primary} />
              </View>
              <Text style={styles.emptyConnectionsTitle}>Connections Unlock After First Match</Text>
              <Text style={styles.emptyConnectionsSubtitle}>Play matches to build your tennis network</Text>
              <Pressable 
                style={[styles.findMatchCta, { backgroundColor: Colors.dark.primary }]}
                onPress={() => navigation.navigate("FindMatch" as never)}
              >
                <Ionicons name="people-outline" size={18} color={Colors.dark.buttonText} />
                <Text style={styles.findMatchCtaText}>Find Players</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>

        {/* Bio Section (if available) */}
        {profile.bio && (
          <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ABOUT</Text>
            </View>
            <View style={styles.bioCard}>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>
      
      {/* Pillar Detail Modal */}
      <Modal
        visible={selectedPillar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPillar(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedPillar(null)} />
          <View style={styles.modalContent}>
            {selectedPillar && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalPillarIcon, { backgroundColor: (PILLAR_COLORS[selectedPillar.name] || Colors.dark.primary) + "20", borderColor: PILLAR_COLORS[selectedPillar.name] || Colors.dark.primary }]}>
                    <Ionicons 
                      name={(PILLAR_ICONS[selectedPillar.name] || "ellipse") as any} 
                      size={32} 
                      color={PILLAR_COLORS[selectedPillar.name] || Colors.dark.primary} 
                    />
                  </View>
                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalTitle}>{selectedPillar.displayName}</Text>
                    <Text style={[styles.modalLevel, { color: PILLAR_COLORS[selectedPillar.name] }]}>
                      Level {selectedPillar.level}
                    </Text>
                  </View>
                  <Pressable style={styles.modalClose} onPress={() => setSelectedPillar(null)}>
                    <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
                
                <View style={styles.modalProgressBar}>
                  <View 
                    style={[
                      styles.modalProgressFill, 
                      { width: `${selectedPillar.progress}%`, backgroundColor: PILLAR_COLORS[selectedPillar.name] }
                    ]} 
                  />
                </View>
                <Text style={styles.modalProgressText}>{selectedPillar.progress}% to next level</Text>
                
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>What it means</Text>
                  <Text style={styles.modalSectionText}>
                    {PILLAR_DESCRIPTIONS[selectedPillar.name]?.meaning || "Your progress in this skill area"}
                  </Text>
                </View>
                
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>How to level up</Text>
                  <Text style={styles.modalSectionText}>
                    {PILLAR_DESCRIPTIONS[selectedPillar.name]?.howToLevel || "Complete activities and training"}
                  </Text>
                </View>
                
                <View style={[styles.modalTrend, { borderColor: selectedPillar.trend === "up" ? Colors.dark.primary : Colors.dark.textMuted }]}>
                  <Ionicons 
                    name={selectedPillar.trend === "up" ? "trending-up" : "trending-down"} 
                    size={20} 
                    color={selectedPillar.trend === "up" ? Colors.dark.primary : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.modalTrendText, { color: selectedPillar.trend === "up" ? Colors.dark.primary : Colors.dark.textMuted }]}>
                    {selectedPillar.trend === "up" ? "Improving" : "Needs attention"}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
  errorText: {
    marginTop: Spacing.md,
    color: Colors.dark.textMuted,
    fontSize: 16,
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  
  heroSection: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    position: "relative",
  },
  heroGradient: {
    position: "absolute",
    top: 0,
    left: -Spacing.lg,
    right: -Spacing.lg,
    height: 200,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.lg,
  },
  avatarGlow: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    top: -5,
    left: -5,
    opacity: 0.3,
  },
  avatarBorder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPhoto: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  openToPlayBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.orange,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  playerName: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  playerSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  liveBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,68,68,0.08)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.25)",
    marginBottom: Spacing.md,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF4444",
  },
  liveBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF4444",
    flex: 1,
  },
  chipRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  levelChip: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  glowChip: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  xpBarContainer: {
    width: "80%",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  xpBarBg: {
    width: "100%",
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  xpText: {
    marginTop: Spacing.xs,
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    marginBottom: Spacing.md,
  },
  statItem: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  rankingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  rankingText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  heroActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  findMatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  findMatchBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  challengeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "transparent",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  challengeBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  connectionLoadingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    minWidth: 120,
  },
  addFriendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    minWidth: 120,
    justifyContent: "center",
  },
  addFriendBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  pendingBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.gold,
  },
  pendingBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  respondActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    minWidth: 110,
    justifyContent: "center",
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  declineBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: "transparent",
    minWidth: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  friendsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  friendsBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  openToPlayToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  toggleLabel: {
    fontSize: 15,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
  },
  
  dnaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  dnaItem: {
    width: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dnaLabel: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  goalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  goalsLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  goalChip: {
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  goalChipText: {
    fontSize: 12,
    color: Colors.dark.text,
  },
  
  pillarsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  pillarItem: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  pillarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  pillarName: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  pillarLevel: {
    fontSize: 12,
    fontWeight: "700",
  },
  
  winStreakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,133,27,0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  winStreakText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.orange,
  },
  matchCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  matchCardTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  matchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  matchRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  matchOpponent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  matchAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  matchAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  matchLevelBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: Colors.dark.primary,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  matchLevelBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  matchName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  matchLevel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  matchLocation: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  matchScore: {
    fontSize: 18,
    fontWeight: "700",
  },
  matchWin: {
    color: Colors.dark.primary,
  },
  matchLoss: {
    color: Colors.dark.error,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  viewAllBtnText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  emptyCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  
  connectionsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  connectionsSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  connectionAvatars: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  connectionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  connectionInitial: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  connectionMore: {
    backgroundColor: Colors.dark.primary,
    marginLeft: -10,
  },
  connectionMoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  noConnectionsText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  
  bioCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  bioText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  
  emptyMatchCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  emptyMatchTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptyMatchSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  findMatchCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  findMatchCtaText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  
  emptyConnectionsCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyConnectionsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptyConnectionsSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  
  pillarProgress: {
    width: "100%",
    height: 4,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 2,
    marginTop: Spacing.xs,
    overflow: "hidden",
  },
  pillarProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  
  activityFeed: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  activityHighlight: {
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  activityXp: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "600",
    marginTop: 2,
  },
  emptyActivityCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyActivityTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptyActivitySubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalPillarIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  modalHeaderText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalLevel: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  modalClose: {
    padding: Spacing.sm,
  },
  modalProgressBar: {
    width: "100%",
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  modalProgressFill: {
    height: "100%",
    borderRadius: 4,
  },
  modalProgressText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  modalSection: {
    marginBottom: Spacing.lg,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  modalSectionText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  modalTrend: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  modalTrendText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
