import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

type MatchHistoryParams = {
  playerId?: string;
};

interface HistoryMatch {
  id: string;
  sport: string;
  matchFormat: string;
  status: string;
  setScoreSummary?: string;
  winnerId?: string;
  mmrDeltaCreator?: number;
  completedAt: string;
  startedAt: string;
  isCreator: boolean;
  didWin: boolean;
  creator: { id: string; name: string } | null;
  opponents: Array<{ id: string; name: string }>;
}

function MatchCard({ match, myId }: { match: HistoryMatch; myId?: string }) {
  const navigation = useNavigation<any>();
  const opponentName = match.isCreator
    ? match.opponents?.[0]?.name || "Unknown"
    : match.creator?.name || "Unknown";

  const resultColor = match.didWin ? GlowColors.primary : "#FF4444";
  const resultLabel = match.didWin ? "W" : "L";
  const mmrDelta = match.isCreator ? match.mmrDeltaCreator : undefined;
  const dateStr = match.completedAt ? formatDate(match.completedAt) : "Unknown date";

  return (
    <Pressable
      style={({ pressed }) => [styles.matchCard, pressed && { opacity: 0.75 }]}
      onPress={() =>
        navigation.navigate("LiveMatchViewer", { matchId: match.id, playerName: match.creator?.name })
      }
    >
      <View style={[styles.resultBadge, { backgroundColor: resultColor + "20", borderColor: resultColor + "50" }]}>
        <Text style={[styles.resultBadgeText, { color: resultColor }]}>{resultLabel}</Text>
      </View>

      <View style={styles.matchInfo}>
        <Text style={styles.opponent} numberOfLines={1}>
          vs {opponentName}
        </Text>
        <Text style={styles.matchMeta}>
          {match.sport} · {match.matchFormat?.replace(/_/g, " ")} · {dateStr}
        </Text>
        {match.setScoreSummary ? (
          <Text style={styles.scoreText}>{match.setScoreSummary}</Text>
        ) : null}
      </View>

      <View style={styles.mmrContainer}>
        {mmrDelta !== undefined && mmrDelta !== null ? (
          <>
            <Text
              style={[
                styles.mmrDelta,
                { color: mmrDelta >= 0 ? GlowColors.primary : "#FF4444" },
              ]}
            >
              {mmrDelta >= 0 ? "+" : ""}
              {mmrDelta}
            </Text>
            <Text style={styles.mmrLabel}>MMR</Text>
          </>
        ) : (
          <Feather name="chevron-right" size={16} color={Colors.dark.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

export default function MatchHistoryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ MatchHistory: MatchHistoryParams }, "MatchHistory">>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();

  const targetPlayerId = route.params?.playerId || user?.playerId;

  const { data, isLoading, error } = useQuery<{ matches: HistoryMatch[]; total: number }>({
    queryKey: [`/api/live-scoring/player/${targetPlayerId}/history`],
    enabled: !!targetPlayerId,
    staleTime: 30000,
  });

  const matches = data?.matches || [];

  return (
    <View style={[styles.container, { backgroundColor: Backgrounds.root }]}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={36} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>Could not load match history</Text>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.center}>
          <Feather name="activity" size={44} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyText}>Start a live match from the Play tab</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MatchCard match={item} myId={targetPlayerId} />}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.md,
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing["2xl"],
            gap: Spacing.sm,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  resultBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  resultBadgeText: {
    fontSize: 14,
    fontWeight: "800",
  },
  matchInfo: {
    flex: 1,
    gap: 2,
  },
  opponent: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  matchMeta: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  scoreText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  mmrContainer: {
    alignItems: "center",
    minWidth: 40,
  },
  mmrDelta: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  mmrLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
}));
