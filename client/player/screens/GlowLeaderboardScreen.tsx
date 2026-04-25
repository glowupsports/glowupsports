import React, { useState, useMemo, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Colors, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { getStaticAssetsUrl, apiFetch, buildPhotoUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import { LockedScreen } from "../components/LockedScreen";
import SquadVsSquadWidget from "@/components/SquadVsSquadWidget";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface RankedPlayer {
  rank: number;
  id: string;
  name: string;
  photoUrl: string | null;
  level: number;
  glowScore: number;
  xp: number;
  ballLevel: string | null;
  dssRating: string | null;
  streak: number;
  isCurrentPlayer: boolean;
}

interface LeaderboardData {
  scope: string;
  category: string;
  myRank: number;
  currentPlayer: RankedPlayer | null;
  rankings: RankedPlayer[];
}

type CategoryKey =
  | "xp_weekly"
  | "wins_monthly"
  | "streak_current"
  | "glow_score"
  | "xp"
  | "dss_rating"
  | "ball_level";

// Metrics powered by the canonical /api/leaderboards/:scope/:metric endpoint
// (rolling weekly XP, monthly match wins, current streak).
const ROLLING_METRIC_KEYS = new Set<CategoryKey>([
  "xp_weekly",
  "wins_monthly",
  "streak_current",
]);

const CATEGORIES: { key: CategoryKey; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "xp_weekly", label: "Weekly XP", icon: "trending-up", color: Colors.dark.primary },
  { key: "wins_monthly", label: "Wins (Mo)", icon: "trophy", color: Colors.dark.gold },
  { key: "streak_current", label: "Streak", icon: "flame", color: "#F97316" },
  { key: "glow_score", label: "Glow", icon: "flame", color: Colors.dark.gold },
  { key: "xp", label: "XP", icon: "star", color: Colors.dark.primary },
  { key: "dss_rating", label: "DSS", icon: "analytics", color: "#8B5CF6" },
  { key: "ball_level", label: "Level", icon: "tennisball", color: "#10B981" },
];

function getRankColor(rank: number): string {
  if (rank === 1) return Colors.dark.gold;
  if (rank === 2) return "#C0C0C0";
  if (rank === 3) return "#CD7F32";
  return Colors.dark.textMuted;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

function getRankIcon(rank: number): IoniconName {
  if (rank === 1) return "trophy";
  if (rank === 2) return "medal";
  if (rank === 3) return "ribbon";
  return "star";
}

// Returns the icon/color/suffix to render for the active leaderboard metric.
// `glowScore` is used as the canonical numeric value across both legacy and
// rolling-window metrics — rolling metric data is mapped into glowScore in
// `mappedRolling` below.
function getMetricVisual(metric: CategoryKey): { icon: IoniconName; color: string; suffix?: string } {
  switch (metric) {
    case "xp_weekly":
      return { icon: "trending-up", color: Colors.dark.primary, suffix: " XP" };
    case "wins_monthly":
      return { icon: "trophy", color: Colors.dark.gold, suffix: " W" };
    case "streak_current":
      return { icon: "flame", color: "#F97316", suffix: " wk" };
    case "xp":
      return { icon: "star", color: Colors.dark.primary };
    case "dss_rating":
      return { icon: "analytics", color: "#8B5CF6" };
    case "ball_level":
      return { icon: "tennisball", color: "#10B981" };
    case "glow_score":
    default:
      return { icon: "flame", color: Colors.dark.gold };
  }
}

function TopThreePlayer({ player, position, metric }: { player: RankedPlayer; position: 1 | 2 | 3; metric: CategoryKey }) {
  const navigation = useNavigation<any>();
  const sizes = { 1: { avatar: 80, container: 100 }, 2: { avatar: 64, container: 80 }, 3: { avatar: 64, container: 80 } };
  const size = sizes[position];
  const color = getRankColor(position);
  
  return (
    <Animated.View entering={FadeInDown.delay(position * 100)} style={[styles.topPlayer, position === 1 && styles.topPlayerFirst]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("PlayerPublicProfile", { playerId: player.id });
        }}
        style={styles.topPlayerContent}
      >
        <View style={[styles.topPlayerAvatarContainer, { width: size.container, height: size.container }]}>
          <LinearGradient
            colors={[color + "40", color + "10"]}
            style={[styles.topPlayerAvatarBorder, { width: size.avatar + 8, height: size.avatar + 8 }]}
          >
            {player.photoUrl ? (
              <Image
                source={{ uri: buildPhotoUrl(player.photoUrl)! }}
                style={[styles.topPlayerAvatar, { width: size.avatar, height: size.avatar }]}
              />
            ) : (
              <View style={[styles.topPlayerAvatarPlaceholder, { width: size.avatar, height: size.avatar }]}>
                <Ionicons name="person" size={size.avatar / 2} color={Colors.dark.textMuted} />
              </View>
            )}
          </LinearGradient>
          <View style={[styles.rankBadge, { backgroundColor: color }]}>
            <Ionicons name={getRankIcon(position)} size={12} color={Colors.dark.text} />
          </View>
        </View>
        <ThemedText style={styles.topPlayerName} numberOfLines={1}>{player.name}</ThemedText>
        <View style={styles.topPlayerScore}>
          {(() => {
            const v = getMetricVisual(metric);
            return (
              <>
                <Ionicons name={v.icon} size={14} color={v.color} />
                <ThemedText style={styles.topPlayerScoreText}>
                  {player.glowScore}
                  {v.suffix ?? ""}
                </ThemedText>
              </>
            );
          })()}
        </View>
        {metric !== "xp_weekly" && metric !== "wins_monthly" && metric !== "streak_current" ? (
          <ThemedText style={styles.topPlayerLevel}>Lvl {player.level}</ThemedText>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function RankingRow({ player, index, metric }: { player: RankedPlayer; index: number; metric: CategoryKey }) {
  const navigation = useNavigation<any>();
  
  return (
    <Animated.View entering={FadeIn.delay(index * 50)}>
      <Pressable
        style={[styles.rankRow, player.isCurrentPlayer && styles.rankRowHighlight]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("PlayerPublicProfile", { playerId: player.id });
        }}
      >
        <View style={styles.rankPosition}>
          <ThemedText style={[styles.rankNumber, { color: getRankColor(player.rank) }]}>
            {player.rank}
          </ThemedText>
        </View>
        
        {player.photoUrl ? (
          <Image
            source={{ uri: buildPhotoUrl(player.photoUrl)! }}
            style={styles.rankAvatar}
          />
        ) : (
          <View style={styles.rankAvatarPlaceholder}>
            <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
          </View>
        )}
        
        <View style={styles.rankInfo}>
          <ThemedText style={styles.rankName}>{player.name}</ThemedText>
          <View style={styles.rankMeta}>
            <ThemedText style={styles.rankLevel}>Lvl {player.level}</ThemedText>
            {player.streak > 0 ? (
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={10} color={Colors.dark.primary} />
                <ThemedText style={styles.streakText}>{player.streak}</ThemedText>
              </View>
            ) : null}
          </View>
        </View>
        
        <View style={styles.rankScore}>
          {(() => {
            const v = getMetricVisual(metric);
            return (
              <>
                <Ionicons name={v.icon} size={16} color={v.color} />
                <ThemedText style={styles.rankScoreText}>
                  {player.glowScore}
                  {v.suffix ?? ""}
                </ThemedText>
              </>
            );
          })()}
        </View>
        
        <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

function getCategoryScoreDisplay(player: RankedPlayer, category: CategoryKey) {
  switch (category) {
    case "xp":
      return { value: player.xp?.toLocaleString() || "0", icon: "star", color: Colors.dark.primary };
    case "dss_rating":
      return { value: player.dssRating || "—", icon: "analytics", color: "#8B5CF6" };
    case "ball_level":
      const ballColors: Record<string, string> = { red: "#EF4444", orange: "#F97316", green: "#10B981", yellow: "#EAB308" };
      return { value: player.ballLevel?.charAt(0).toUpperCase() + (player.ballLevel?.slice(1) || "") || "—", icon: "tennisball", color: ballColors[player.ballLevel || ""] || Colors.dark.textMuted };
    case "glow_score":
    default:
      return { value: player.glowScore?.toString() || "0", icon: "flame", color: Colors.dark.gold };
  }
}

export default function GlowLeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [scope, setScope] = useState<"squad" | "academy" | "country" | "world">("academy");
  const [category, setCategory] = useState<CategoryKey>("xp_weekly");

  const isRollingMetric = ROLLING_METRIC_KEYS.has(category);

  const { data, isLoading, refetch, isRefetching, isError } = useQuery<LeaderboardData>({
    queryKey: ["/api/player/leaderboard", scope, category],
    enabled: !isRollingMetric,
    queryFn: () => apiFetch(`/api/player/leaderboard?scope=${scope}&category=${category}`),
  });

  // Canonical rolling-window metric endpoint (xp_weekly | wins_monthly | streak_current).
  const {
    data: rollingData,
    isLoading: rollingLoading,
    refetch: refetchRolling,
    isRefetching: rollingRefetching,
    isError: rollingError,
  } = useQuery<{
    rows: { rank: number; playerId: string; name: string; photoUrl: string | null; value: number }[];
  }>({
    queryKey: ["/api/leaderboards", scope, category],
    enabled: isRollingMetric,
    staleTime: 60_000,
    queryFn: () => apiFetch(`/api/leaderboards/${scope}/${category}?limit=50`),
  });

  const mappedRolling: LeaderboardData | null = useMemo(() => {
    if (!rollingData?.rows) return null;
    const rankings: RankedPlayer[] = rollingData.rows.map((r) => ({
      rank: r.rank,
      id: r.playerId,
      name: r.name,
      photoUrl: r.photoUrl,
      level: 0,
      glowScore: r.value,
      xp: category === "xp_weekly" ? r.value : 0,
      ballLevel: null,
      glowMmr: 0,
      dssRating: null,
      streak: category === "streak_current" ? r.value : 0,
      academyName: null,
      city: null,
      isCurrentPlayer: false,
    }));
    return {
      rankings,
      myRank: 0,
      totalPlayers: rankings.length,
      currentPlayer: null,
    };
  }, [rollingData, category]);

  const effectiveData = isRollingMetric ? mappedRolling : data ?? null;
  const effectiveLoading = isRollingMetric ? rollingLoading : isLoading;
  const effectiveError = isRollingMetric ? rollingError : isError;
  const effectiveRefetching = isRollingMetric ? rollingRefetching : isRefetching;
  const effectiveRefetch = isRollingMetric ? refetchRolling : refetch;

  const topThree = effectiveData?.rankings?.slice(0, 3) ?? [];
  const restOfRankings = effectiveData?.rankings?.slice(3) ?? [];
  const currentCat = CATEGORIES.find(c => c.key === category) || CATEGORIES[0];

  return (
    <LockedScreen featureKey="glow_leaderboard">
      <View style={styles.container}>
        <View style={styles.scopeToggle}>
          {(["squad", "academy", "country", "world"] as const).map((s) => (
            <Pressable
              key={s}
              style={[styles.scopeButton, scope === s && styles.scopeButtonActive]}
              onPress={() => { Haptics.selectionAsync(); setScope(s); }}
            >
              <ThemedText style={[styles.scopeText, scope === s && styles.scopeTextActive]}>
                {s === "squad" ? "Squad" : s === "academy" ? "Academy" : s === "country" ? "Country" : "World"}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        
        <View style={styles.categoryTabs}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              style={[styles.categoryTab, category === cat.key && { backgroundColor: cat.color + "20", borderColor: cat.color }]}
              onPress={() => { Haptics.selectionAsync(); setCategory(cat.key); }}
            >
              <Ionicons name={cat.icon as IoniconName} size={14} color={category === cat.key ? cat.color : Colors.dark.textMuted} />
              <ThemedText style={[styles.categoryLabel, category === cat.key && { color: cat.color }]}>
                {cat.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

      {effectiveLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.gold} />
        </View>
      ) : effectiveError ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.danger} />
          <ThemedText style={styles.emptyText}>Failed to load rankings</ThemedText>
          <Pressable onPress={() => effectiveRefetch()} style={styles.retryButton}>
            <ThemedText style={styles.retryText}>Try Again</ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={restOfRankings}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={effectiveRefetching} onRefresh={effectiveRefetch} tintColor={Colors.dark.gold} />
          }
          ListHeaderComponent={
            <>
              {scope === "squad" ? <SquadVsSquadWidget /> : null}
              {topThree.length > 0 ? (
                <View style={styles.podium}>
                  {topThree[1] ? <TopThreePlayer player={topThree[1]} position={2} metric={category} /> : <View style={styles.topPlayer} />}
                  {topThree[0] ? <TopThreePlayer player={topThree[0]} position={1} metric={category} /> : null}
                  {topThree[2] ? <TopThreePlayer player={topThree[2]} position={3} metric={category} /> : <View style={styles.topPlayer} />}
                </View>
              ) : null}

              {effectiveData?.currentPlayer && effectiveData.myRank > 3 ? (
                <Card style={styles.myRankCard}>
                  <ThemedText style={styles.myRankLabel}>Your Rank</ThemedText>
                  <View style={styles.myRankContent}>
                    <ThemedText style={styles.myRankNumber}>#{effectiveData.myRank}</ThemedText>
                    <View style={styles.myRankScore}>
                      <Ionicons name="flame" size={20} color={Colors.dark.gold} />
                      <ThemedText style={styles.myRankScoreText}>{effectiveData.currentPlayer.glowScore}</ThemedText>
                    </View>
                  </View>
                </Card>
              ) : null}
              
              {restOfRankings.length > 0 ? (
                <ThemedText style={styles.sectionTitle}>Rankings</ThemedText>
              ) : null}
            </>
          }
          renderItem={({ item, index }) => <RankingRow player={item} index={index} metric={category} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl, paddingHorizontal: Spacing.md }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={48} color={Colors.dark.textMuted} />
              <ThemedText style={styles.emptyText}>No rankings available yet</ThemedText>
            </View>
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
  scopeToggle: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    backgroundColor: Colors.dark.cardLight,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  scopeButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: BorderRadius.sm,
  },
  scopeButtonActive: {
    backgroundColor: Colors.dark.gold,
  },
  scopeText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  scopeTextActive: {
    color: Colors.dark.buttonText,
  },
  categoryTabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  categoryTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: "transparent",
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  podium: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  topPlayer: {
    flex: 1,
    alignItems: "center",
  },
  topPlayerFirst: {
    marginBottom: Spacing.lg,
  },
  topPlayerContent: {
    alignItems: "center",
  },
  topPlayerAvatarContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  topPlayerAvatarBorder: {
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  topPlayerAvatar: {
    borderRadius: 40,
  },
  topPlayerAvatarPlaceholder: {
    borderRadius: 40,
    backgroundColor: Colors.dark.cardLight,
    justifyContent: "center",
    alignItems: "center",
  },
  rankBadge: {
    position: "absolute",
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  topPlayerName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    marginTop: Spacing.sm,
    maxWidth: 80,
    textAlign: "center",
  },
  topPlayerScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  topPlayerScoreText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  topPlayerLevel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  myRankCard: {
    marginHorizontal: 0,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.primary + "15",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  myRankLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  myRankContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  myRankNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  myRankScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  myRankScoreText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  rankRowHighlight: {
    backgroundColor: Colors.dark.primary + "15",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  rankPosition: {
    width: 32,
    alignItems: "center",
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: "700",
  },
  rankAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  rankAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.cardLight,
    justifyContent: "center",
    alignItems: "center",
  },
  rankInfo: {
    flex: 1,
  },
  rankName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  rankMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  rankLevel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  streakText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  rankScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rankScoreText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
}));
