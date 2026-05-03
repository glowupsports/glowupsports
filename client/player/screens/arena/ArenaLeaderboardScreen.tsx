import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing } from "@/constants/theme";
import { getApiUrl, buildPhotoUrl } from "@/lib/query-client";

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
  arenaMmr: number;
  arenaWins: number;
  arenaLosses: number;
  rarityLabel: string;
  battleStreak: number;
}

interface SeasonData {
  season: {
    id: string;
    name: string;
    theme: string | null;
    startDate: string;
    endDate: string;
    statMultiplierField: string | null;
  } | null;
  daysRemaining: number;
}

const RARITY_COLORS: Record<string, string> = {
  "Common I": "#888888", "Common II": "#aaaaaa",
  "Uncommon I": "#CD7F32", "Uncommon II": "#D4946A",
  "Rare I": "#4DA3FF", "Rare II": "#7AC0FF",
  "Epic I": "#C040FB", "Epic II": "#D06DFC",
  "Legendary I": "#FFD700", "Legendary II": "#FFE566",
};

function rarityColor(label?: string): string {
  return RARITY_COLORS[label ?? "Common I"] ?? "#888888";
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={{ fontSize: 18 }}>1st</Text>;
  if (rank === 2) return <Text style={{ fontSize: 18 }}>2nd</Text>;
  if (rank === 3) return <Text style={{ fontSize: 18 }}>3rd</Text>;
  return <Text style={rankStyles.number}>{rank}</Text>;
}

const rankStyles = StyleSheet.create({
  number: { fontSize: 14, fontWeight: "700", color: Colors.dark.textMuted, width: 28, textAlign: "center" },
});

function LeaderboardRow({
  entry,
  isMe,
}: {
  entry: LeaderboardEntry;
  isMe?: boolean;
}) {
  const color = rarityColor(entry.rarityLabel);
  const photoUrl = entry.profilePhotoUrl ? buildPhotoUrl(entry.profilePhotoUrl) : null;
  const winRate = entry.arenaWins + entry.arenaLosses > 0
    ? Math.round((entry.arenaWins / (entry.arenaWins + entry.arenaLosses)) * 100)
    : 0;

  return (
    <View style={[rowStyles.row, isMe && rowStyles.rowMe]}>
      <View style={rowStyles.rankCol}>
        <RankMedal rank={entry.rank} />
      </View>

      <View style={rowStyles.avatarCol}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={rowStyles.avatar} />
        ) : (
          <View style={[rowStyles.avatarPlaceholder, { backgroundColor: color + "22" }]}>
            <Feather name="user" size={16} color={color} />
          </View>
        )}
      </View>

      <View style={rowStyles.infoCol}>
        <Text style={rowStyles.playerName} numberOfLines={1}>
          {entry.playerName}
          {isMe ? "  (You)" : ""}
        </Text>
        <View style={rowStyles.infoMeta}>
          <Text style={[rowStyles.rarity, { color }]}>{entry.rarityLabel}</Text>
          {entry.battleStreak >= 3 && (
            <View style={rowStyles.streakBadge}>
              <Feather name="zap" size={9} color="#FF4D4D" />
              <Text style={rowStyles.streakText}>{entry.battleStreak}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={rowStyles.statsCol}>
        <Text style={rowStyles.mmr}>{entry.arenaMmr}</Text>
        <Text style={rowStyles.wr}>{winRate}% WR</Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    gap: Spacing.sm,
    marginBottom: 4,
  },
  rowMe: {
    backgroundColor: "rgba(200,255,61,0.08)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
  },
  rankCol: {
    width: 32,
    alignItems: "center",
  },
  avatarCol: {
    marginRight: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  infoMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rarity: {
    fontSize: 11,
    fontWeight: "500",
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255,77,77,0.12)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  streakText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FF4D4D",
  },
  statsCol: {
    alignItems: "flex-end",
    gap: 1,
  },
  mmr: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  wr: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
});

type ScopeTab = "global" | "academy";

export default function ArenaLeaderboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [scope, setScope] = useState<ScopeTab>("global");

  const { data: seasonData } = useQuery<SeasonData>({
    queryKey: ["/api/arena/season/current"],
    queryFn: async () => {
      const url = new URL("/api/arena/season/current", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return { season: null, daysRemaining: 0 };
      return res.json();
    },
  });

  const { data, isLoading, refetch, isRefetching } = useQuery<{ entries: LeaderboardEntry[]; myEntry: LeaderboardEntry | null }>({
    queryKey: ["/api/arena/leaderboard", scope],
    queryFn: async () => {
      const url = new URL(`/api/arena/leaderboard?scope=${scope}`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return { entries: [], myEntry: null };
      return res.json();
    },
  });

  const entries = data?.entries ?? [];
  const myEntry = data?.myEntry;

  const ScopeButton = useCallback(({ tab, label }: { tab: ScopeTab; label: string }) => (
    <Pressable
      style={[styles.scopeBtn, scope === tab && styles.scopeBtnActive]}
      onPress={() => setScope(tab)}
    >
      <Text style={[styles.scopeBtnText, scope === tab && styles.scopeBtnTextActive]}>{label}</Text>
    </Pressable>
  ), [scope]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.subtitle}>Top Arena Champions</Text>
      </View>

      {/* Season info */}
      {seasonData?.season && (
        <View style={styles.seasonCard}>
          <Feather name="award" size={16} color={Colors.dark.primary} />
          <View style={styles.seasonInfo}>
            <Text style={styles.seasonName}>{seasonData.season.name}</Text>
            {seasonData.season.theme && (
              <Text style={styles.seasonTheme}>{seasonData.season.theme}</Text>
            )}
          </View>
          {seasonData.daysRemaining > 0 && (
            <View style={styles.daysLeft}>
              <Text style={styles.daysLeftNum}>{seasonData.daysRemaining}</Text>
              <Text style={styles.daysLeftLabel}>days left</Text>
            </View>
          )}
          {seasonData.season.statMultiplierField && (
            <View style={styles.multiplierBadge}>
              <Text style={styles.multiplierText}>
                {seasonData.season.statMultiplierField.toUpperCase()} x1.2
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Scope tabs */}
      <View style={styles.scopeRow}>
        <ScopeButton tab="global" label="Global" />
        <ScopeButton tab="academy" label="Academy" />
      </View>

      {/* My entry pinned at top if not in top visible */}
      {myEntry && !entries.some((e) => e.playerId === myEntry.playerId) && (
        <>
          <Text style={styles.myRankLabel}>Your Ranking</Text>
          <LeaderboardRow entry={myEntry} isMe />
          <View style={styles.divider} />
        </>
      )}

      {/* Loading */}
      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      )}

      {/* Top 3 podium */}
      {!isLoading && entries.length > 0 && (
        <>
          <View style={styles.podium}>
            {entries.slice(0, 3).map((e) => {
              const podiumColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
              const color = podiumColors[e.rank - 1] ?? Colors.dark.primary;
              const photoUrl = e.profilePhotoUrl ? buildPhotoUrl(e.profilePhotoUrl) : null;
              return (
                <View key={e.playerId} style={[styles.podiumItem, e.rank === 1 && styles.podiumFirst]}>
                  <View style={[styles.podiumAvatarWrap, { borderColor: color }]}>
                    {photoUrl ? (
                      <Image source={{ uri: photoUrl }} style={styles.podiumAvatar} />
                    ) : (
                      <View style={[styles.podiumAvatarPlaceholder, { backgroundColor: color + "22" }]}>
                        <Feather name="user" size={e.rank === 1 ? 22 : 18} color={color} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.podiumMedal, { color }]}>#{e.rank}</Text>
                  <Text style={styles.podiumName} numberOfLines={1}>{e.playerName}</Text>
                  <Text style={[styles.podiumMmr, { color }]}>{e.arenaMmr} MMR</Text>
                </View>
              );
            })}
          </View>

          {/* Rest of list */}
          {entries.slice(3).map((entry) => (
            <LeaderboardRow
              key={entry.playerId}
              entry={entry}
              isMe={myEntry?.playerId === entry.playerId}
            />
          ))}
        </>
      )}

      {!isLoading && entries.length === 0 && (
        <View style={styles.emptyState}>
          <Feather name="award" size={40} color={Colors.dark.disabled} />
          <Text style={styles.emptyText}>
            {scope === "academy" ? "No academy players in the arena yet." : "No arena players found."}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  seasonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(200,255,61,0.08)",
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
    marginBottom: Spacing.lg,
  },
  seasonInfo: {
    flex: 1,
    gap: 2,
  },
  seasonName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  seasonTheme: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  daysLeft: {
    alignItems: "center",
  },
  daysLeftNum: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  daysLeftLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  multiplierBadge: {
    backgroundColor: "rgba(200,255,61,0.15)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  multiplierText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  scopeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    padding: 3,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  scopeBtnActive: {
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scopeBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  scopeBtnTextActive: {
    color: Colors.dark.text,
  },
  myRankLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.borderSubtle,
    marginVertical: Spacing.md,
  },
  loadingRow: {
    alignItems: "center",
    paddingVertical: 40,
  },
  podium: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  podiumItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  podiumFirst: {
    paddingBottom: 16,
  },
  podiumAvatarWrap: {
    borderWidth: 2,
    borderRadius: 30,
    overflow: "hidden",
  },
  podiumAvatar: {
    width: 52,
    height: 52,
  },
  podiumAvatarPlaceholder: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  podiumMedal: {
    fontSize: 13,
    fontWeight: "800",
  },
  podiumName: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
  },
  podiumMmr: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
});
