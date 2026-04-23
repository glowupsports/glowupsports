import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { buildPhotoUrl } from "@/lib/query-client";

type Sport = "tennis" | "padel" | "pickleball";
type Scope = "country" | "global";

const SPORTS: { key: Sport; label: string; icon: string }[] = [
  { key: "tennis", label: "Tennis", icon: "tennisball" },
  { key: "padel", label: "Padel", icon: "ellipse" },
  { key: "pickleball", label: "Pickleball", icon: "disc" },
];

interface RankedPlayer {
  rank: number;
  id: string;
  name: string;
  photoUrl: string | null;
  city: string | null;
  country: string | null;
  ballLevel: string | null;
  glowMmr: number;
  glowRank: number | null;
  isAdult: boolean;
  dssRating: string | null;
  rankDelta: number | null;
  isCurrentPlayer: boolean;
}

interface LeaderboardData {
  sport: Sport;
  scope: Scope;
  country: string | null;
  myRank: number;
  currentPlayer: RankedPlayer | null;
  rankings: RankedPlayer[];
  message?: string;
}

function flagFor(country: string | null | undefined): string {
  if (!country || country.length !== 2) return "🏳️";
  const upper = country.toUpperCase();
  const A = 0x1F1E6;
  return String.fromCodePoint(A + (upper.charCodeAt(0) - 65)) +
         String.fromCodePoint(A + (upper.charCodeAt(1) - 65));
}

function formatRating(p: RankedPlayer): string {
  if (p.isAdult && p.dssRating) return p.dssRating;
  if (p.glowRank != null) return `GR ${p.glowRank}`;
  return p.dssRating ?? `${p.glowMmr}`;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) {
    return (
      <View style={styles.deltaWrap}>
        <Ionicons name="remove" size={10} color={Colors.dark.textMuted} />
      </View>
    );
  }
  if (delta === 0) {
    return (
      <View style={styles.deltaWrap}>
        <Ionicons name="remove" size={10} color={Colors.dark.textMuted} />
        <Text style={[styles.deltaText, { color: Colors.dark.textMuted }]}>0</Text>
      </View>
    );
  }
  const up = delta > 0;
  const color = up ? "#10B981" : "#EF4444";
  return (
    <View style={styles.deltaWrap}>
      <Ionicons name={up ? "arrow-up" : "arrow-down"} size={10} color={color} />
      <Text style={[styles.deltaText, { color }]}>{Math.abs(delta)}</Text>
    </View>
  );
}

function RankRow({ player, pinned }: { player: RankedPlayer; pinned?: boolean }) {
  const navigation = useNavigation<any>();
  return (
    <Pressable
      style={[styles.row, player.isCurrentPlayer && styles.rowMe, pinned && styles.rowPinned]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("PublicProfile", { playerId: player.id });
      }}
    >
      <Text style={[styles.rank, player.isCurrentPlayer && styles.rankMe]}>#{player.rank}</Text>
      {player.photoUrl ? (
        <Image source={{ uri: buildPhotoUrl(player.photoUrl)! }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Ionicons name="person" size={16} color={Colors.dark.textMuted} />
        </View>
      )}
      <View style={styles.middle}>
        <View style={styles.nameRow}>
          <Text style={styles.flag}>{flagFor(player.country)}</Text>
          <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
        </View>
        {player.city ? (
          <Text style={styles.city} numberOfLines={1}>{player.city}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.rating}>{formatRating(player)}</Text>
        <DeltaBadge delta={player.rankDelta} />
      </View>
    </Pressable>
  );
}

export default function CountryLeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const [sport, setSport] = useState<Sport>("tennis");
  const [scope, setScope] = useState<Scope>("country");

  const { data, isLoading, refetch, isRefetching, isError } = useQuery<LeaderboardData>({
    queryKey: [`/api/player/country-leaderboard?sport=${sport}&scope=${scope}`],
    staleTime: 60_000,
  });

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const showPinned = !!data?.currentPlayer && data.myRank > 0 &&
    !data.rankings.some((r) => r.isCurrentPlayer);

  return (
    <View style={[styles.container, { paddingTop: Spacing.md }]}>
      <View style={styles.scopeToggle}>
        <Pressable
          style={[styles.scopeBtn, scope === "country" && styles.scopeBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setScope("country"); }}
        >
          <Ionicons name="flag-outline" size={14} color={scope === "country" ? Colors.dark.buttonText : Colors.dark.textMuted} />
          <ThemedText style={[styles.scopeText, scope === "country" && styles.scopeTextActive]}>
            {data?.country ? `${flagFor(data.country)} ${data.country.toUpperCase()}` : "Country"}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.scopeBtn, scope === "global" && styles.scopeBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setScope("global"); }}
        >
          <Ionicons name="globe-outline" size={14} color={scope === "global" ? Colors.dark.buttonText : Colors.dark.textMuted} />
          <ThemedText style={[styles.scopeText, scope === "global" && styles.scopeTextActive]}>Worldwide</ThemedText>
        </Pressable>
      </View>

      <View style={styles.sportTabs}>
        {SPORTS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => { Haptics.selectionAsync(); setSport(s.key); }}
            style={[styles.sportTab, sport === s.key && styles.sportTabActive]}
          >
            <Ionicons name={s.icon as any} size={14} color={sport === s.key ? Colors.dark.primary : Colors.dark.textMuted} />
            <ThemedText style={[styles.sportLabel, sport === s.key && styles.sportLabelActive]}>{s.label}</ThemedText>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.dark.gold} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.dark.danger} />
          <ThemedText style={styles.muted}>Failed to load rankings</ThemedText>
          <Pressable onPress={() => refetch()} style={styles.retry}>
            <ThemedText style={styles.retryText}>Try Again</ThemedText>
          </Pressable>
        </View>
      ) : data?.message && (data.rankings?.length ?? 0) === 0 ? (
        <View style={styles.center}>
          <Ionicons name="flag-outline" size={36} color={Colors.dark.textMuted} />
          <ThemedText style={styles.muted}>{data.message}</ThemedText>
        </View>
      ) : (
        <FlatList
          data={data?.rankings ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.gold} />}
          renderItem={({ item }) => <RankRow player={item} />}
          contentContainerStyle={{
            paddingHorizontal: Spacing.md,
            paddingBottom: showPinned ? insets.bottom + 96 : insets.bottom + Spacing.xl,
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="trophy-outline" size={36} color={Colors.dark.textMuted} />
              <ThemedText style={styles.muted}>No rankings yet for this combination</ThemedText>
            </View>
          }
        />
      )}

      {showPinned && data?.currentPlayer ? (
        <View style={[styles.pinnedWrap, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <View style={styles.pinnedLabel}>
            <Ionicons name="person" size={11} color={Colors.dark.primary} />
            <Text style={styles.pinnedLabelText}>Your rank</Text>
          </View>
          <RankRow player={{ ...data.currentPlayer, rank: data.myRank, isCurrentPlayer: true }} pinned />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  scopeToggle: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  scopeBtnActive: { backgroundColor: Colors.dark.gold },
  scopeText: { fontSize: 13, fontWeight: "600", color: Colors.dark.textMuted },
  scopeTextActive: { color: Colors.dark.buttonText },
  sportTabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  sportTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: "transparent",
  },
  sportTabActive: {
    backgroundColor: Colors.dark.primary + "18",
    borderColor: Colors.dark.primary + "55",
  },
  sportLabel: { fontSize: 12, fontWeight: "600", color: Colors.dark.textMuted },
  sportLabelActive: { color: Colors.dark.primary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  rowMe: {
    backgroundColor: Colors.dark.primary + "15",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  rowPinned: {
    marginBottom: 0,
  },
  rank: {
    width: 44,
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  rankMe: { color: Colors.dark.primary },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.backgroundSecondary },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  middle: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  flag: { fontSize: 14 },
  name: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  city: { fontSize: 11, color: Colors.dark.textMuted },
  right: { alignItems: "flex-end", gap: 2 },
  rating: { fontSize: 14, fontWeight: "700", color: Colors.dark.gold },
  deltaWrap: { flexDirection: "row", alignItems: "center", gap: 2 },
  deltaText: { fontSize: 10, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.sm, padding: Spacing.lg },
  muted: { fontSize: 13, color: Colors.dark.textMuted, textAlign: "center" },
  retry: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
  },
  retryText: { fontSize: 14, fontWeight: "600", color: Colors.dark.buttonText },
  pinnedWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.chipBackgroundStrong,
  },
  pinnedLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    paddingLeft: 4,
  },
  pinnedLabelText: { fontSize: 11, fontWeight: "700", color: Colors.dark.primary, letterSpacing: 0.5 },
});
