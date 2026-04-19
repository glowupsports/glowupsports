import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
} from "react-native";
import { openDirections } from "@/lib/maps";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useWebSocket } from "@/lib/useWebSocket";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, { 
  FadeIn, 
  FadeInDown, 
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { apiRequest, getApiUrl, getStaticAssetsUrl, buildPhotoUrl, getAuthHeaders } from "@/lib/query-client";
import { LockedScreen } from "../components/LockedScreen";
import { useAuth } from "@/coach/context/AuthContext";
import { getSportLabel, getSportIcon, getSportColor } from "@/player/context/SportContext";
import { MatchSummaryCard, COMPETE_ACCENT } from "@/player/components/MatchSummaryCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OpenMatch {
  id: string;
  bookingId: string;
  hostPlayerId: string;
  academyId: string | null;
  matchType: string;
  sport?: string;
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
  host?: {
    id: string;
    name: string;
    photoUrl?: string;
    level?: number;
    ballLevel?: string;
    skillLevel?: number;
    winRate?: number;
  };
  players?: Array<{
    id: string;
    name: string;
    photoUrl?: string;
  }>;
}

type FilterType = "all" | "singles" | "doubles";

function PulsingGlow({ color }: { color: string }) {
  const opacity = useSharedValue(0.4);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    scale.value = withRepeat(
      withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.pulsingGlow, animatedStyle, { backgroundColor: color }]} />
  );
}

function CountdownTimer({ scheduledTime }: { scheduledTime?: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!scheduledTime) {
      setTimeLeft("Soon");
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const target = new Date(scheduledTime);
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft("Starting now");
        setIsUrgent(true);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeLeft(`in ${days}d`);
        setIsUrgent(false);
      } else if (hours > 0) {
        setTimeLeft(`in ${hours}h ${minutes}m`);
        setIsUrgent(hours < 2);
      } else {
        setTimeLeft(`in ${minutes}m`);
        setIsUrgent(true);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [scheduledTime]);

  return (
    <View style={[styles.countdownBadge, isUrgent && styles.countdownUrgent]}>
      {isUrgent && <PulsingGlow color={Colors.dark.error} />}
      <Ionicons name="time" size={12} color={isUrgent ? Colors.dark.error : Colors.dark.primary} />
      <Text style={[styles.countdownText, isUrgent && styles.countdownTextUrgent]}>
        {timeLeft}
      </Text>
    </View>
  );
}

function PlayerSlots({ current, max, players }: { current: number; max: number; players?: Array<{ id: string; name: string; photoUrl?: string }> }) {
  const slots = Array.from({ length: max }, (_, i) => i);
  
  return (
    <View style={styles.playerSlots}>
      {slots.map((index) => {
        const player = players?.[index];
        const isFilled = index < current;
        
        return (
          <View 
            key={index} 
            style={[
              styles.playerSlot,
              isFilled ? styles.playerSlotFilled : styles.playerSlotEmpty
            ]}
          >
            {player?.photoUrl ? (
              <Image source={{ uri: buildPhotoUrl(player.photoUrl)! }} style={styles.playerSlotImage} contentFit="cover" />
            ) : isFilled ? (
              <Ionicons name="person" size={14} color={Colors.dark.primary} />
            ) : (
              <Ionicons name="add" size={14} color={Colors.dark.textMuted} />
            )}
          </View>
        );
      })}
      <Text style={styles.playerSlotsText}>
        {max - current} {max - current === 1 ? "spot" : "spots"} left
      </Text>
    </View>
  );
}

function PremiumMatchCard({ 
  match, 
  onJoin, 
  isJoining,
  index,
  isHost,
  onManage,
}: { 
  match: OpenMatch; 
  onJoin: () => void; 
  isJoining: boolean;
  index: number;
  isHost?: boolean;
  onManage?: () => void;
}) {
  const slotsLeft = match.maxPlayers - match.currentPlayers;
  const isFull = slotsLeft === 0;
  const isDoubles = match.matchType === "doubles";
  const isMixed = match.matchType === "mixed";

  const getMatchGradient = (): readonly [string, string, ...string[]] => {
    if (isDoubles) return ["#9333EA", "#7C3AED", "#6366F1"] as const;
    if (isMixed) return ["#EC4899", "#F472B6", "#FB7185"] as const;
    return [Colors.dark.primary, "#22D3EE", "#06B6D4"] as const;
  };

  const getMatchGlowColor = () => {
    if (isDoubles) return "#9333EA";
    if (isMixed) return "#EC4899";
    return Colors.dark.primary;
  };

  const getBallLevelColor = (level?: string) => {
    const colors: Record<string, string> = {
      blue: "#3B82F6", red: "#EF4444", orange: "#F97316",
      green: "#22C55E", yellow: "#EAB308", glow: "#E040FB",
    };
    return colors[level?.toLowerCase() || ""] || Colors.dark.textSecondary;
  };

  const getSkillSublevelLabel = (level?: number) => {
    if (!level) return "";
    if (level <= 2) return "PRO";
    if (level <= 4) return "ADV";
    if (level <= 6) return "INT";
    return "BEG";
  };

  return (
    <Animated.View 
      entering={FadeInDown.delay(index * 100).springify()}
      style={styles.premiumCardWrapper}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)"]}
        style={styles.premiumCard}
      >
        <View style={[styles.cardGlowBorder, { borderColor: getMatchGlowColor() + "60" }]} />
        
        <View style={styles.cardHeader}>
          <LinearGradient
            colors={getMatchGradient()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.matchTypePill}
          >
            <Ionicons 
              name={isDoubles ? "people" : isMixed ? "people-circle" : "person"} 
              size={14} 
              color="#fff" 
            />
            <Text style={styles.matchTypePillText}>
              {match.matchType.charAt(0).toUpperCase() + match.matchType.slice(1)}
            </Text>
          </LinearGradient>

          {(() => {
            const sport = match.sport || "tennis";
            return (
              <View style={[styles.sportPill, { borderColor: getSportColor(sport) + "60", backgroundColor: getSportColor(sport) + "15" }]}>
                <Ionicons name={getSportIcon(sport) as keyof typeof Ionicons.glyphMap} size={12} color={getSportColor(sport)} />
                <Text style={[styles.sportPillText, { color: getSportColor(sport) }]}>{getSportLabel(sport)}</Text>
              </View>
            );
          })()}

          <CountdownTimer scheduledTime={match.scheduledTime} />
        </View>

        <View style={styles.hostSection}>
          <View style={styles.hostAvatar}>
            {match.host?.photoUrl ? (
              <Image source={{ uri: buildPhotoUrl(match.host.photoUrl)! }} style={styles.hostAvatarImage} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={[getMatchGlowColor() + "40", getMatchGlowColor() + "20"]}
                style={styles.hostAvatarPlaceholder}
              >
                <Text style={[styles.hostAvatarLetter, { color: getMatchGlowColor() }]}>
                  {match.host?.name?.charAt(0).toUpperCase() || "?"}
                </Text>
              </LinearGradient>
            )}
            <View style={[styles.hostLevelRing, { borderColor: getBallLevelColor(match.host?.ballLevel) }]} />
          </View>
          
          <View style={styles.hostInfo}>
            <Text style={styles.hostName}>{match.host?.name || "Anonymous Host"}</Text>
            <View style={styles.hostMeta}>
              <View style={[styles.hostLevelBadge, { backgroundColor: getBallLevelColor(match.host?.ballLevel || match.ballLevel || "glow") + "20", borderColor: getBallLevelColor(match.host?.ballLevel || match.ballLevel || "glow") }]}>
                <View style={[styles.ballLevelDot, { backgroundColor: getBallLevelColor(match.host?.ballLevel || match.ballLevel || "glow") }]} />
                <Text style={[styles.hostLevelText, { color: getBallLevelColor(match.host?.ballLevel || match.ballLevel || "glow") }]}>
                  {(match.host?.ballLevel || match.ballLevel || "GLOW").toUpperCase()} {match.skillLevel || match.host?.skillLevel || ""} {getSkillSublevelLabel(match.skillLevel || match.host?.skillLevel)}
                </Text>
              </View>
              {match.host?.winRate ? (
                <Text style={styles.hostWinRate}>{match.host.winRate}% WR</Text>
              ) : null}
            </View>
          </View>

          {match.xpBonus > 0 ? (
            <View style={styles.xpBadgeLarge}>
              <Ionicons name="flash" size={16} color={Colors.dark.primary} />
              <Text style={styles.xpBadgeText}>+{match.xpBonus}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.matchTitle} numberOfLines={2}>
          {match.title || `Looking for ${match.matchType} partner`}
        </Text>

        {match.description ? (
          <Text style={styles.matchDescription} numberOfLines={2}>
            {match.description}
          </Text>
        ) : null}

        <View style={styles.matchDetails}>
          {match.locationName || match.courtName ? (
            <Pressable
              style={styles.detailItem}
              onPress={() => openDirections({ label: match.locationName || match.courtName })}
            >
              <Ionicons name="navigate" size={14} color={Colors.dark.primary} />
              <Text style={[styles.detailText, { color: Colors.dark.primary, textDecorationLine: "underline" }]} numberOfLines={1}>
                {match.courtName || match.locationName}
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.ballLevelBadge, { backgroundColor: getBallLevelColor(match.ballLevel || "glow") + "30" }]}>
            <View style={[styles.ballDot, { backgroundColor: getBallLevelColor(match.ballLevel || "glow") }]} />
            <Text style={[styles.ballLevelText, { color: getBallLevelColor(match.ballLevel || "glow") }]}>
              {(match.ballLevel || "GLOW").toUpperCase()} {match.skillLevel || ""} {getSkillSublevelLabel(match.skillLevel)}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardFooter}>
          <PlayerSlots 
            current={match.currentPlayers} 
            max={match.maxPlayers}
            players={match.players}
          />

          <View style={styles.joinSection}>
            {match.costPerPlayer && parseFloat(match.costPerPlayer) > 0 ? (
              <View style={styles.costBadge}>
                <Text style={styles.costText}>{match.currency} {match.costPerPlayer}</Text>
              </View>
            ) : (
              <View style={styles.freeBadgeLarge}>
                <Text style={styles.freeBadgeText}>FREE</Text>
              </View>
            )}

            <Pressable 
              style={[
                styles.joinButtonLarge,
                isFull && !isHost && styles.joinButtonDisabled,
                isJoining && styles.joinButtonLoading,
                isHost && { borderWidth: 2, borderColor: Colors.dark.primary },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                if (isHost && onManage) {
                  onManage();
                } else {
                  onJoin();
                }
              }}
              disabled={(!isHost && isFull) || isJoining}
            >
              <LinearGradient
                colors={isHost ? ["#00E5FF", "#06B6D4"] : (isFull ? ["#4B5563", "#374151"] : [Colors.dark.primary, "#9AE66E"])}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.joinButtonGradient}
              >
                {isJoining ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Ionicons 
                      name={isHost ? "settings-outline" : (isFull ? "close-circle" : "flash")} 
                      size={20} 
                      color={isHost ? Colors.dark.buttonText : (isFull ? Colors.dark.textMuted : Colors.dark.buttonText)} 
                    />
                    <Text style={[styles.joinButtonText, isFull && !isHost && styles.joinButtonTextDisabled]}>
                      {isHost ? "Manage" : (isFull ? "Full" : "Join Match")}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function EmptyState({ onCreateMatch }: { onCreateMatch: () => void }) {
  const bounceY = useSharedValue(0);

  useEffect(() => {
    bounceY.value = withRepeat(
      withTiming(-10, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  return (
    <Animated.View entering={FadeIn.delay(200)} style={styles.emptyState}>
      <Animated.View style={animatedStyle}>
        <LinearGradient
          colors={[Colors.dark.primary + "30", Colors.dark.primary + "20"]}
          style={styles.emptyIcon}
        >
          <Ionicons name="tennisball" size={48} color={Colors.dark.primary} />
        </LinearGradient>
      </Animated.View>
      
      <Text style={styles.emptyTitle}>No Open Matches</Text>
      <Text style={styles.emptySubtitle}>
        Be the first to create an open match and find your perfect partner
      </Text>

      <Pressable 
        style={styles.createMatchButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onCreateMatch();
        }}
      >
        <LinearGradient
          colors={[Colors.dark.primary, "#9AE66E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.createMatchGradient}
        >
          <Ionicons name="add-circle" size={22} color={Colors.dark.buttonText} />
          <Text style={styles.createMatchText}>Create Open Match</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function OpenMatchFeedScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);

  const { data: matches, isLoading, refetch, isRefetching } = useQuery<OpenMatch[]>({
    queryKey: ["/api/open-matches", { includeAllLevels: true, includeMine: true }],
    queryFn: async () => {
      const url = new URL("/api/open-matches?includeAllLevels=true&includeMine=true", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load open matches");
      return res.json();
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  // Real-time refresh when any open match the player can see changes (join,
  // leave, kick, invite). The server emits one event per affected participant;
  // we just invalidate the list so cards re-render with fresh slot counts.
  useWebSocket({
    onOpenMatchUpdate: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches", { includeMine: true }] });
    }, [queryClient]),
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const joinMutation = useMutation({
    mutationFn: async (matchId: string) => {
      setJoiningMatchId(matchId);
      const response = await apiRequest("POST", `/api/open-matches/${matchId}/join`);
      return response;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches", { includeMine: true }] });
      Alert.alert(
        "You're In!", 
        "Successfully joined the match. Get ready to play!",
        [{ text: "Let's Go!", style: "default" }]
      );
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't Join", error.message || "Something went wrong. Try again.");
    },
    onSettled: () => {
      setJoiningMatchId(null);
    },
  });

  const filteredMatches = useMemo(() => {
    if (!matches) return [];
    if (activeFilter === "all") return matches;
    return matches.filter((m) => m.matchType === activeFilter);
  }, [matches, activeFilter]);

  const handleCreateMatch = () => {
    navigation.navigate("CreateMatch");
  };

  const renderMatch = ({ item, index }: { item: OpenMatch; index: number }) => {
    const isHost = user?.playerId === item.hostPlayerId;
    return (
      <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
        <MatchSummaryCard
          matchId={item.id}
          matchType={item.matchType}
          sport={item.sport}
          scheduledTime={item.scheduledTime}
          courtName={item.courtName}
          locationName={item.locationName}
          host={item.host}
          ballLevel={item.ballLevel || item.requiredBallLevel || undefined}
          skillLevel={item.skillLevel}
          currentPlayers={item.currentPlayers}
          maxPlayers={item.maxPlayers}
          costPerPlayer={item.costPerPlayer}
          currency={item.currency}
          xpBonus={item.xpBonus}
          isHost={isHost}
          joining={joiningMatchId === item.id}
          onJoin={() => joinMutation.mutate(item.id)}
          onManage={() => navigation.navigate("ManageMatch", { matchId: item.id })}
          onPress={() => {
            if (isHost) {
              navigation.navigate("ManageMatch", { matchId: item.id });
            }
          }}
          accent={COMPETE_ACCENT}
        />
      </Animated.View>
    );
  };
  return (
    <LockedScreen featureKey="match_preparation">
      <View style={styles.container}>
        <Animated.View entering={FadeInUp} style={styles.filterSection}>
          <View style={styles.filterRow}>
            {(["all", "singles", "doubles"] as FilterType[]).map((filter, idx) => {
              const isActive = activeFilter === filter;
              const getFilterColor = () => {
                if (filter === "doubles") return "#9333EA";
                if (filter === "singles") return Colors.dark.primary;
                return Colors.dark.primary;
              };
              
              return (
                <Pressable
                  key={filter}
                  style={[styles.filterPill, isActive && { borderColor: getFilterColor() }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveFilter(filter);
                  }}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={[getFilterColor() + "30", getFilterColor() + "10"]}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <Ionicons 
                    name={filter === "doubles" ? "people" : filter === "singles" ? "person" : "apps"} 
                    size={14} 
                    color={isActive ? getFilterColor() : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.filterPillText, isActive && { color: getFilterColor() }]}>
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.matchCount}>
            <Text style={styles.matchCountText}>
              {filteredMatches.length} {filteredMatches.length === 1 ? "match" : "matches"} available
            </Text>
          </View>
        </Animated.View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={Colors.dark.primary} size="large" />
            <Text style={styles.loadingText}>Finding matches near you...</Text>
          </View>
        ) : filteredMatches.length === 0 ? (
          <EmptyState onCreateMatch={handleCreateMatch} />
        ) : (
          <FlatList
            data={filteredMatches}
            renderItem={renderMatch}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={Colors.dark.primary}
              />
            }
          />
        )}
      </View>
    </LockedScreen>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  filterSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  filterPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
  },
  filterPillText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  matchCount: {
    marginTop: Spacing.sm,
    alignItems: "center",
  },
  matchCountText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  list: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.lg,
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
  premiumCardWrapper: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  premiumCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    position: "relative",
  },
  cardGlowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    pointerEvents: "none",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  matchTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  matchTypePillText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: "#fff",
  },
  sportPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  sportPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary + "20",
    position: "relative",
    overflow: "hidden",
  },
  countdownUrgent: {
    backgroundColor: Colors.dark.error,
  },
  countdownText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  countdownTextUrgent: {
    color: "#1A1A1A",
  },
  pulsingGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  hostSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  hostAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    position: "relative",
  },
  hostAvatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  hostAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  hostAvatarLetter: {
    fontSize: 22,
    fontWeight: "700",
  },
  hostLevelRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 28,
    borderWidth: 2,
  },
  hostInfo: {
    flex: 1,
  },
  hostName: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  hostMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  hostLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold + "20",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: "transparent",
  },
  ballLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hostLevelText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  hostWinRate: {
    fontSize: 10,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  xpBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  xpBadgeText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  matchTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  matchDescription: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  matchDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  detailText: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  ballLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  ballDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ballLevelText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playerSlots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playerSlot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  playerSlotFilled: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
    borderStyle: "solid",
  },
  playerSlotEmpty: {
    backgroundColor: "transparent",
    borderColor: Colors.dark.textMuted + "40",
    borderStyle: "dashed",
  },
  playerSlotImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  playerSlotsText: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
    color: Colors.dark.textMuted,
    marginLeft: 4,
  },
  joinSection: {
    alignItems: "flex-end",
    gap: 6,
  },
  costBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.xs,
  },
  costText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  freeBadgeLarge: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.xs,
  },
  freeBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  joinButtonLarge: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  joinButtonDisabled: {
    opacity: 0.7,
  },
  joinButtonLoading: {
    opacity: 0.8,
  },
  joinButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
  },
  joinButtonText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  joinButtonTextDisabled: {
    color: Colors.dark.textMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  createMatchButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  createMatchGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  createMatchText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
}));
