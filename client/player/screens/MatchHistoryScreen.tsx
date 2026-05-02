// Task #1583 — Unified match history: live-scoring matches + player-logged results.
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";
import LogMatchModal from "@/player/components/LogMatchModal";

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

// ---------- Live scoring match (existing) ----------
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
  opponents: { id: string; name: string }[];
}

// ---------- Player-logged result (new) ----------
interface MatchResult {
  id: string;
  playerId: string;
  playerName: string;
  opponentId: string | null;
  opponentName: string;
  playedAt: string;
  scoreDisplay: string;
  scoreJson: { p: number; o: number }[];
  loggedPlayerWon: boolean;
  didWin: boolean;
  status: "pending" | "confirmed" | "auto_confirmed" | "rejected";
  confirmedAt: string | null;
  createdAt: string;
  isOwner: boolean;
}

// ---------- Live match card ----------
function LiveMatchCard({ match }: { match: HistoryMatch }) {
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
        <Text style={styles.opponentText} numberOfLines={1}>vs {opponentName}</Text>
        <Text style={styles.matchMeta}>{match.sport} · {match.matchFormat?.replace(/_/g, " ")} · {dateStr}</Text>
        {match.setScoreSummary ? <Text style={styles.scoreText}>{match.setScoreSummary}</Text> : null}
      </View>
      <View style={styles.trailCol}>
        {mmrDelta !== undefined && mmrDelta !== null ? (
          <>
            <Text style={[styles.mmrDelta, { color: mmrDelta >= 0 ? GlowColors.primary : "#FF4444" }]}>
              {mmrDelta >= 0 ? "+" : ""}{mmrDelta}
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

// ---------- Player-logged result card ----------
function LoggedResultCard({
  result,
  myId,
  onConfirm,
  onReject,
  isActioning,
}: {
  result: MatchResult;
  myId?: string;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  isActioning: boolean;
}) {
  const resultColor = result.didWin ? GlowColors.primary : "#FF4444";
  const resultLabel = result.didWin ? "W" : "L";
  const dateStr = formatDate(result.playedAt);
  const isPendingForMe = result.status === "pending" && !result.isOwner && result.opponentId === myId;

  let statusLabel = "";
  let statusColor = Colors.dark.textMuted;
  if (result.status === "pending") {
    statusLabel = "Awaiting confirmation";
    statusColor = "#facc15";
  } else if (result.status === "confirmed") {
    statusLabel = "Confirmed";
    statusColor = GlowColors.primary;
  } else if (result.status === "auto_confirmed") {
    statusLabel = "Auto-confirmed";
    statusColor = Colors.dark.textMuted;
  } else if (result.status === "rejected") {
    statusLabel = "Disputed";
    statusColor = "#ef4444";
  }

  return (
    <View style={styles.matchCard}>
      <View style={[styles.resultBadge, { backgroundColor: resultColor + "20", borderColor: resultColor + "50" }]}>
        <Text style={[styles.resultBadgeText, { color: resultColor }]}>{resultLabel}</Text>
      </View>
      <View style={styles.matchInfo}>
        <Text style={styles.opponentText} numberOfLines={1}>
          vs {result.opponentName}
        </Text>
        <Text style={styles.matchMeta}>{dateStr}</Text>
        {result.scoreDisplay ? <Text style={styles.scoreText}>{result.scoreDisplay}</Text> : null}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {isPendingForMe ? (
          <View style={styles.confirmRow}>
            <Pressable
              style={[styles.confirmBtn, styles.confirmBtnAccept, isActioning && { opacity: 0.5 }]}
              onPress={() => onConfirm(result.id)}
              disabled={isActioning}
            >
              {isActioning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, styles.confirmBtnReject, isActioning && { opacity: 0.5 }]}
              onPress={() => onReject(result.id)}
              disabled={isActioning}
            >
              <Text style={styles.confirmBtnTextReject}>Dispute</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------- Section header ----------
function SectionHeader({ title, icon, count }: { title: string; icon: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Feather name={icon as any} size={14} color={Colors.dark.primary} />
      <Text style={styles.sectionHeaderText}>{title}</Text>
      {count !== undefined ? (
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------- Stats bar ----------
function StatsBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return null;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;
  return (
    <View style={styles.statsBar}>
      <View style={styles.statItem}>
        <Text style={styles.statNumber}>{wins}</Text>
        <Text style={styles.statLabel}>Wins</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statNumber}>{losses}</Text>
        <Text style={styles.statLabel}>Losses</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={[styles.statNumber, { color: winPct >= 50 ? GlowColors.primary : Colors.dark.textMuted }]}>
          {winPct}%
        </Text>
        <Text style={styles.statLabel}>Win Rate</Text>
      </View>
    </View>
  );
}

// ---------- Main screen ----------
export default function MatchHistoryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ MatchHistory: MatchHistoryParams }, "MatchHistory">>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showLogModal, setShowLogModal] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const targetPlayerId = route.params?.playerId || user?.playerId;
  const isOwnProfile = !route.params?.playerId || route.params.playerId === user?.playerId;

  // Live scoring matches
  const liveQuery = useQuery<{ matches: HistoryMatch[]; total: number }>({
    queryKey: [`/api/live-scoring/player/${targetPlayerId}/history`],
    enabled: !!targetPlayerId,
    staleTime: 30000,
  });

  // Player-logged results
  const resultsKey = isOwnProfile
    ? "/api/player/me/match-results"
    : `/api/player/players/${targetPlayerId}/match-results`;

  const resultsQuery = useQuery<{ results: MatchResult[]; total?: number; stats?: { wins: number; losses: number; total: number } }>({
    queryKey: [resultsKey],
    enabled: !!targetPlayerId,
    staleTime: 30000,
  });

  // Confirmation mutation
  const confirmMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "confirm" | "reject" }) => {
      const res = await apiRequest("POST", `/api/player/match-results/${id}/${action}`, {});
      if (!res.ok) throw new Error("Action failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/match-results"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActioningId(null);
    },
    onError: () => {
      setActioningId(null);
      Alert.alert("Error", "Could not update the match result. Please try again.");
    },
  });

  const handleConfirm = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActioningId(id);
    confirmMutation.mutate({ id, action: "confirm" });
  };

  const handleReject = (id: string) => {
    Alert.alert("Dispute Match", "Are you sure you want to dispute this result?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Dispute",
        style: "destructive",
        onPress: () => {
          setActioningId(id);
          confirmMutation.mutate({ id, action: "reject" });
        },
      },
    ]);
  };

  const liveMatches = liveQuery.data?.matches ?? [];
  const loggedResults = resultsQuery.data?.results ?? [];
  const stats = resultsQuery.data?.stats;

  // Build section list data
  type SectionData =
    | { type: "stats"; wins: number; losses: number }
    | { type: "live"; match: HistoryMatch }
    | { type: "logged"; result: MatchResult };

  const sections: { title: string; icon: string; data: SectionData[] }[] = [];

  if (stats && (stats.wins + stats.losses > 0)) {
    sections.push({
      title: "__stats__",
      icon: "bar-chart-2",
      data: [{ type: "stats", wins: stats.wins, losses: stats.losses }],
    });
  }

  if (loggedResults.length > 0) {
    sections.push({
      title: "Logged Results",
      icon: "clipboard",
      data: loggedResults.map((r) => ({ type: "logged" as const, result: r })),
    });
  }

  if (liveMatches.length > 0) {
    sections.push({
      title: "Live Scored",
      icon: "zap",
      data: liveMatches.map((m) => ({ type: "live" as const, match: m })),
    });
  }

  const isLoading = liveQuery.isLoading || resultsQuery.isLoading;
  const isEmpty = !isLoading && liveMatches.length === 0 && loggedResults.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: Backgrounds.root }]}>
      {isLoading ? (
        <View style={styles.center}>
          <TennisBallSpinner color={Colors.dark.primary} size="large" />
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Feather name="activity" size={44} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyText}>
            {isOwnProfile
              ? "Log your first match result or start a live match from the Play tab."
              : "This player hasn't logged any matches yet."}
          </Text>
          {isOwnProfile ? (
            <Pressable
              style={styles.emptyLogBtn}
              onPress={() => setShowLogModal(true)}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.emptyLogBtnText}>Log Match</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => {
            if (item.type === "live") return `live-${item.match.id}`;
            if (item.type === "logged") return `logged-${item.result.id}`;
            return `stats-${i}`;
          }}
          renderSectionHeader={({ section }) => {
            if (section.title === "__stats__") return null;
            return (
              <SectionHeader
                title={section.title}
                icon={section.icon}
                count={section.data.length}
              />
            );
          }}
          renderItem={({ item }) => {
            if (item.type === "stats") {
              return <StatsBar wins={item.wins} losses={item.losses} />;
            }
            if (item.type === "live") {
              return <LiveMatchCard match={item.match} />;
            }
            return (
              <LoggedResultCard
                result={item.result}
                myId={user?.playerId ?? undefined}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isActioning={actioningId === item.result.id && confirmMutation.isPending}
              />
            );
          }}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.md,
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + 80 + Spacing.xl,
            gap: Spacing.xs,
          }}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Log Match FAB — only shown on own profile */}
      {isOwnProfile ? (
        <View style={[styles.fab, { bottom: insets.bottom + Spacing.xl }]}>
          <Pressable
            style={({ pressed }) => [styles.fabBtn, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowLogModal(true);
            }}
          >
            <Feather name="plus" size={20} color="#fff" />
            <Text style={styles.fabText}>Log Match</Text>
          </Pressable>
        </View>
      ) : null}

      <LogMatchModal
        visible={showLogModal}
        onClose={() => setShowLogModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/player/me/match-results"] });
        }}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() =>
  StyleSheet.create({
    container: { flex: 1 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.md,
      paddingHorizontal: Spacing.xl,
    },
    emptyTitle: { ...Typography.h3, color: Colors.dark.text, textAlign: "center" },
    emptyText: { ...Typography.body, color: Colors.dark.textMuted, textAlign: "center" },
    emptyLogBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: Colors.dark.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: 12,
      paddingHorizontal: Spacing.xl,
      marginTop: Spacing.sm,
    },
    emptyLogBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: Spacing.md,
      marginBottom: Spacing.sm,
    },
    sectionHeaderText: {
      fontSize: 12,
      fontWeight: "700",
      color: Colors.dark.textMuted,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      flex: 1,
    },
    sectionBadge: {
      backgroundColor: Colors.dark.primary + "22",
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    sectionBadgeText: { fontSize: 11, fontWeight: "700", color: Colors.dark.primary },

    statsBar: {
      flexDirection: "row",
      backgroundColor: Colors.dark.chipBackground,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.07)",
    },
    statItem: { flex: 1, alignItems: "center", gap: 2 },
    statNumber: { fontSize: 22, fontWeight: "800", color: Colors.dark.text },
    statLabel: { fontSize: 11, fontWeight: "600", color: Colors.dark.textMuted, letterSpacing: 0.4 },
    statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 4 },

    matchCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      backgroundColor: Colors.dark.chipBackground,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.07)",
      marginBottom: Spacing.xs,
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
    resultBadgeText: { fontSize: 14, fontWeight: "800" },
    matchInfo: { flex: 1, gap: 2 },
    opponentText: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
    matchMeta: {
      fontSize: 12,
      color: Colors.dark.textMuted,
      fontWeight: "500",
      textTransform: "capitalize",
    },
    scoreText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "600", marginTop: 2 },
    trailCol: { alignItems: "center", minWidth: 40 },
    mmrDelta: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
    mmrLabel: { fontSize: 10, color: Colors.dark.textMuted, fontWeight: "600", letterSpacing: 0.5 },

    statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusLabel: { fontSize: 11, fontWeight: "600" },

    confirmRow: { flexDirection: "row", gap: Spacing.sm, marginTop: 6 },
    confirmBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: BorderRadius.md,
      alignItems: "center",
      minWidth: 72,
    },
    confirmBtnAccept: { backgroundColor: GlowColors.primary },
    confirmBtnReject: { backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" },
    confirmBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    confirmBtnTextReject: { fontSize: 12, fontWeight: "700", color: "#ef4444" },

    fab: {
      position: "absolute",
      right: Spacing.lg,
    },
    fabBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: Colors.dark.primary,
      borderRadius: 24,
      paddingVertical: 13,
      paddingHorizontal: Spacing.lg,
      shadowColor: Colors.dark.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 8,
    },
    fabText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  }),
);
