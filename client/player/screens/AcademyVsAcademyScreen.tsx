import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";

interface AcademyRankRow {
  rank: number;
  academyId: string;
  academyName: string;
  city: string | null;
  country: string | null;
  matchesPlayed: number;
  xp: number;
  tournamentsWon: number;
  playerCount?: number;
}

interface RankResponse {
  window: "week" | "month";
  windowStart: string;
  country: string | null;
  includePrivate: boolean;
  academies: AcademyRankRow[];
}

type WindowKind = "week" | "month";

function RankBadge({ rank }: { rank: number }) {
  const color =
    rank === 1
      ? "#FFD700"
      : rank === 2
        ? "#C0C0C0"
        : rank === 3
          ? "#CD7F32"
          : Colors.dark.accentText;
  return (
    <View style={[styles.rankBadge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.rankText, { color }]}>#{rank}</Text>
    </View>
  );
}

function AcademyRow({ row }: { row: AcademyRankRow }) {
  const subtitle = [row.city, row.country].filter(Boolean).join(" · ");
  return (
    <View style={styles.row}>
      <RankBadge rank={row.rank} />
      <View style={styles.rowContent}>
        <Text style={styles.academyName} numberOfLines={1}>
          {row.academyName}
        </Text>
        {subtitle ? (
          <Text style={styles.academySub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.statsCol}>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{row.xp.toLocaleString()}</Text>
          <Text style={styles.statLabel}>XP</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{row.matchesPlayed}</Text>
          <Text style={styles.statLabel}>MATCH</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { color: "#FFD700" }]}>
            {row.tournamentsWon}
          </Text>
          <Text style={styles.statLabel}>WON</Text>
        </View>
      </View>
    </View>
  );
}

export default function AcademyVsAcademyScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [windowKind, setWindowKind] = useState<WindowKind>("month");

  const { data, isLoading, refetch, isRefetching } = useQuery<RankResponse>({
    queryKey: ["/api/leaderboards/academy-vs-academy", windowKind],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const { getAuthToken, getCurrentAcademyId } = await import("@/lib/auth");
      const token = await getAuthToken();
      const academyId = await getCurrentAcademyId();
      const url = new URL(
        `/api/leaderboards/academy-vs-academy?window=${windowKind}`,
        getApiUrl(),
      );
      const res = await fetch(url.toString(), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(academyId ? { "x-academy-id": academyId } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 60_000,
  });

  const rows = data?.academies ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.toggleBar, { paddingTop: headerHeight + Spacing.sm }]}>
        <View style={styles.toggle}>
          {(["week", "month"] as WindowKind[]).map((w) => (
            <Pressable
              key={w}
              onPress={() => setWindowKind(w)}
              style={[
                styles.toggleChip,
                windowKind === w ? styles.toggleChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  windowKind === w ? styles.toggleTextActive : null,
                ]}
              >
                This {w === "week" ? "Week" : "Month"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="trophy-outline"
            size={40}
            color={Colors.dark.accentText}
          />
          <Text style={styles.emptyTitle}>No academies yet</Text>
          <Text style={styles.emptyBody}>
            Academies will appear here once they record activity.
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(it) => it.academyId}
          renderItem={({ item }) => <AcademyRow row={item} />}
          estimatedItemSize={76}
          contentContainerStyle={{
            paddingBottom: insets.bottom + Spacing.xl,
            paddingHorizontal: Spacing.lg,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.dark.tint}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    marginTop: Spacing.sm,
  },
  emptyBody: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.sm,
    textAlign: "center",
    maxWidth: 260,
  },
  toggleBar: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    alignItems: "center",
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.md,
    padding: 3,
    gap: 2,
  },
  toggleChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  toggleChipActive: {
    backgroundColor: Colors.dark.tint,
  },
  toggleText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  toggleTextActive: {
    color: "#000",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rankBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: FontSizes.sm,
    fontWeight: "800",
  },
  rowContent: {
    flex: 1,
  },
  academyName: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  academySub: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  statsCol: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  statBlock: {
    alignItems: "center",
    minWidth: 38,
  },
  statValue: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "800",
  },
  statLabel: {
    color: Colors.dark.accentText,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 2,
  },
});
