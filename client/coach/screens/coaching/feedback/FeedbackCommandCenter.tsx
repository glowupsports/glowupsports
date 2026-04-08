import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { getApiUrl } from "@/lib/query-client";
import QuickFeedbackModal from "@/coach/components/QuickFeedbackModal";

interface Player {
  id: string;
  name: string;
  ballLevel?: string | null;
}

interface SessionPlayerRecord {
  playerId: string;
  player: Player;
}

interface GlowFeedbackRecord {
  playerId: string;
  player_id?: string;
}

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: string | null;
  players?: Player[];
}

interface PlayerRow {
  session: Session;
  player: Player;
  playerIndex: number;
  isRated: boolean;
  dayOffset: number;
  dayLabel: string;
}

interface FeedbackCommandCenterProps {
  tabBarHeight: number;
  onShowSessionList?: () => void;
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  private: "Private",
  semi_private: "Semi",
  group: "Group",
  physical: "Physical",
  activity: "Activity",
  camp: "Camp",
  clinic: "Clinic",
  match: "Match",
  assessment: "Assessment",
};

const SESSION_TYPE_COLORS: Record<string, string> = {
  private: Colors.dark.sessionPrivate,
  semi_private: Colors.dark.sessionSemiPrivate,
  group: Colors.dark.sessionGroup,
  physical: Colors.dark.sessionPhysical,
  activity: Colors.dark.sessionActivity,
};

function getTypeColor(type: string): string {
  return SESSION_TYPE_COLORS[type] || Colors.dark.primary;
}

function formatSessionTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getDayLabel(dayOffset: number, date: Date): string {
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return `Yesterday \u00B7 ${dayName} ${dateStr}`;
  return `${dayOffset} days ago \u00B7 ${dayName} ${dateStr}`;
}

function PlayerRateCard({
  row,
  onRatePress,
  localRated,
}: {
  row: PlayerRow;
  onRatePress: (row: PlayerRow) => void;
  localRated: Set<string>;
}) {
  const isRated = row.isRated || localRated.has(`${row.session.id}:${row.player.id}`);
  const typeColor = getTypeColor(row.session.sessionType);
  const initials = row.player.name?.charAt(0)?.toUpperCase() || "?";

  return (
    <Pressable
      style={[ccStyles.playerCard, isRated && ccStyles.playerCardRated]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onRatePress(row);
      }}
    >
      <View style={[ccStyles.playerAvatar, { backgroundColor: typeColor + "30" }]}>
        <Text style={[ccStyles.playerAvatarText, { color: typeColor }]}>{initials}</Text>
      </View>

      <View style={ccStyles.playerInfo}>
        <Text style={ccStyles.playerName} numberOfLines={1}>{row.player.name}</Text>
        <View style={ccStyles.playerMeta}>
          <View style={[ccStyles.typeBadge, { backgroundColor: typeColor + "20" }]}>
            <Text style={[ccStyles.typeBadgeText, { color: typeColor }]}>
              {SESSION_TYPE_LABELS[row.session.sessionType] || row.session.sessionType}
            </Text>
          </View>
          <Text style={ccStyles.sessionTime}>{formatSessionTime(row.session.startTime)}</Text>
        </View>
      </View>

      {isRated ? (
        <View style={ccStyles.ratedBadge}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
          <Text style={ccStyles.ratedBadgeText}>Rated</Text>
        </View>
      ) : (
        <View style={ccStyles.rateButton}>
          <Text style={ccStyles.rateButtonText}>Rate</Text>
        </View>
      )}
    </Pressable>
  );
}


export function FeedbackCommandCenter({ tabBarHeight, onShowSessionList }: FeedbackCommandCenterProps) {
  const { coach } = useCoach();
  const queryClient = useQueryClient();

  const [quickFeedbackSession, setQuickFeedbackSession] = useState<Session | null>(null);
  const [quickFeedbackPlayerIndex, setQuickFeedbackPlayerIndex] = useState(0);
  const [localRated, setLocalRated] = useState<Set<string>>(new Set());

  const now = new Date();
  const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split("T")[0];
  const prevWeekDate = new Date(now);
  prevWeekDate.setDate(prevWeekDate.getDate() - 7);
  const prevWeekStr = new Date(prevWeekDate.getFullYear(), prevWeekDate.getMonth(), prevWeekDate.getDate()).toISOString().split("T")[0];

  const { data: calendarData, isLoading: calendarLoading } = useQuery<{ ownSessions: Session[] }>({
    queryKey: [`/api/coach/calendar?date=${todayStr}&view=week`],
    enabled: !!coach?.id,
  });

  const { data: prevCalendarData, isLoading: prevCalendarLoading } = useQuery<{ ownSessions: Session[] }>({
    queryKey: [`/api/coach/calendar?date=${prevWeekStr}&view=week`],
    enabled: !!coach?.id,
  });

  const isLoading = calendarLoading || prevCalendarLoading;

  const recentSessions = useMemo(() => {
    const allSessions = [
      ...(calendarData?.ownSessions || []),
      ...(prevCalendarData?.ownSessions || []),
    ];
    if (allSessions.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    cutoff.setHours(0, 0, 0, 0);

    const seen = new Set<string>();
    return allSessions
      .filter((s) => {
        if (s.status === "cancelled") return false;
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        const end = new Date(s.endTime);
        return end < now && end >= cutoff;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [calendarData?.ownSessions, prevCalendarData?.ownSessions]);

  const sessionsWithPlayers = useQuery<{ sessionId: string; players: Player[] }[]>({
    queryKey: ["/api/coach/command-center/sessions-players", recentSessions.map(s => s.id).join(",")],
    queryFn: async () => {
      if (recentSessions.length === 0) return [];
      const results = await Promise.all(
        recentSessions.map(async (session) => {
          try {
            const url = new URL(`/api/coach/sessions/${session.id}/players`, getApiUrl());
            const res = await fetch(url.toString(), { credentials: "include" });
            if (!res.ok) return { sessionId: session.id, players: session.players || [] };
            const rawData: unknown = await res.json();
            const data = Array.isArray(rawData) ? rawData as SessionPlayerRecord[] : [];
            const players: Player[] = data
              .map((sp) => sp.player || null)
              .filter((p): p is Player => p !== null && typeof p.id === "string");
            return { sessionId: session.id, players };
          } catch {
            return { sessionId: session.id, players: session.players || [] };
          }
        })
      );
      return results;
    },
    enabled: recentSessions.length > 0,
  });

  const sessionFeedbacks = useQuery<{ sessionId: string; ratedPlayerIds: Set<string> }[]>({
    queryKey: ["/api/coach/command-center/session-feedbacks", recentSessions.map(s => s.id).join(",")],
    queryFn: async () => {
      if (recentSessions.length === 0) return [];
      const results = await Promise.all(
        recentSessions.map(async (session) => {
          try {
            const url = new URL(`/api/glow/sessions/${session.id}/feedback`, getApiUrl());
            const res = await fetch(url.toString(), { credentials: "include" });
            if (!res.ok) return { sessionId: session.id, ratedPlayerIds: new Set<string>() };
            const rawData: unknown = await res.json();
            const data = Array.isArray(rawData) ? rawData as GlowFeedbackRecord[] : [];
            const ratedPlayerIds = new Set<string>(
              data
                .map((fb) => fb.playerId || fb.player_id)
                .filter((id): id is string => typeof id === "string")
            );
            return { sessionId: session.id, ratedPlayerIds };
          } catch {
            return { sessionId: session.id, ratedPlayerIds: new Set<string>() };
          }
        })
      );
      return results;
    },
    enabled: recentSessions.length > 0,
  });

  const playerRows = useMemo(() => {
    if (!sessionsWithPlayers.data || !sessionFeedbacks.data) return [];

    const playersMap = new Map<string, Player[]>();
    sessionsWithPlayers.data.forEach((s) => playersMap.set(s.sessionId, s.players));

    const feedbackMap = new Map<string, Set<string>>();
    sessionFeedbacks.data.forEach((s) => feedbackMap.set(s.sessionId, s.ratedPlayerIds));

    const rows: PlayerRow[] = [];
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const session of recentSessions) {
      const sessionDate = new Date(session.startTime);
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
      const diffMs = today.getTime() - sessionDay.getTime();
      const dayOffset = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const players = playersMap.get(session.id) || session.players || [];
      const ratedIds = feedbackMap.get(session.id) || new Set<string>();

      players.forEach((player, idx) => {
        rows.push({
          session,
          player,
          playerIndex: idx,
          isRated: ratedIds.has(player.id) || session.status === "completed",
          dayOffset,
          dayLabel: getDayLabel(dayOffset, sessionDay),
        });
      });
    }

    return rows;
  }, [sessionsWithPlayers.data, sessionFeedbacks.data, recentSessions]);

  const todayRows = useMemo(
    () => playerRows.filter((r) => r.dayOffset === 0),
    [playerRows]
  );
  const backlogRows = useMemo(
    () => playerRows.filter((r) => r.dayOffset > 0),
    [playerRows]
  );

  const unratedTodayCount = todayRows.filter(
    (r) => !r.isRated && !localRated.has(`${r.session.id}:${r.player.id}`)
  ).length;

  const backlogByDay = useMemo(() => {
    const groups: Record<number, PlayerRow[]> = {};
    for (const row of backlogRows) {
      if (!groups[row.dayOffset]) groups[row.dayOffset] = [];
      groups[row.dayOffset].push(row);
    }
    return groups;
  }, [backlogRows]);

  const allRated = useMemo(() => {
    return (
      playerRows.length > 0 &&
      playerRows.every((r) => r.isRated || localRated.has(`${r.session.id}:${r.player.id}`))
    );
  }, [playerRows, localRated]);

  const handleRatePress = useCallback((row: PlayerRow) => {
    const playersForSession = sessionsWithPlayers.data?.find((s) => s.sessionId === row.session.id)?.players || row.session.players || [];
    const sessionWithPlayers: Session = {
      ...row.session,
      players: playersForSession,
    };
    setQuickFeedbackSession(sessionWithPlayers);
    setQuickFeedbackPlayerIndex(row.playerIndex);
  }, [sessionsWithPlayers.data]);

  const handleFeedbackComplete = useCallback(() => {
    const session = quickFeedbackSession;
    const playerIndex = quickFeedbackPlayerIndex;
    setQuickFeedbackSession(null);
    if (session) {
      const sessionPlayers = session.players || [];
      const ratedPlayer = sessionPlayers[playerIndex];
      if (ratedPlayer) {
        setLocalRated((prev) => {
          const next = new Set(prev);
          next.add(`${session.id}:${ratedPlayer.id}`);
          return next;
        });
      }
    }
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] as string).includes("/api/coach/command-center"),
    });
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        (q.queryKey[0] as string).startsWith("/api/coach/calendar"),
      refetchType: "all",
    });
  }, [quickFeedbackSession, quickFeedbackPlayerIndex, queryClient]);

  const isDataLoading =
    isLoading ||
    (recentSessions.length > 0 &&
      (sessionsWithPlayers.isLoading || sessionFeedbacks.isLoading));

  if (isDataLoading) {
    return (
      <View style={ccStyles.center}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (playerRows.length === 0) {
    return (
      <View style={ccStyles.center}>
        <Ionicons name="checkmark-done-circle" size={56} color={Colors.dark.primary} />
        <Text style={ccStyles.allCaughtUpTitle}>All caught up!</Text>
        <Text style={ccStyles.allCaughtUpSub}>
          No sessions from the past 3 days need feedback.
        </Text>
      </View>
    );
  }

  const renderRows = (rows: PlayerRow[]) => {
    const uniqueSessions = Array.from(new Set(rows.map((r) => r.session.id)));
    return uniqueSessions.map((sessionId) => {
      const sessionRows = rows.filter((r) => r.session.id === sessionId);
      return (
        <View key={sessionId}>
          {sessionRows.map((row) => (
            <PlayerRateCard
              key={`${row.session.id}:${row.player.id}`}
              row={row}
              onRatePress={handleRatePress}
              localRated={localRated}
            />
          ))}
        </View>
      );
    });
  };

  return (
    <>
      <ScrollView
        style={ccStyles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {allRated ? (
          <View style={ccStyles.allRatedBanner}>
            <Ionicons name="checkmark-done-circle" size={18} color={Colors.dark.primary} />
            <Text style={ccStyles.allRatedBannerText}>All rated — tap any player to re-rate</Text>
          </View>
        ) : null}
        {todayRows.length > 0 ? (
          <View style={ccStyles.section}>
            <View style={ccStyles.sectionHeader}>
              <Text style={ccStyles.sectionTitle}>Today</Text>
              {unratedTodayCount > 0 ? (
                <View style={ccStyles.pendingBadge}>
                  <Text style={ccStyles.pendingBadgeText}>{unratedTodayCount} to rate</Text>
                </View>
              ) : (
                <View style={ccStyles.doneSectionBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
                  <Text style={ccStyles.doneSectionText}>Done</Text>
                </View>
              )}
            </View>
            {renderRows(todayRows)}
          </View>
        ) : null}

        {Object.keys(backlogByDay).length > 0 ? (
          <View style={ccStyles.section}>
            <Text style={ccStyles.sectionTitle}>Past 3 Days</Text>
            {Object.keys(backlogByDay)
              .map(Number)
              .sort((a, b) => a - b)
              .map((dayOffset) => {
                const dayRowList = backlogByDay[dayOffset];
                const dayLabel = dayRowList[0]?.dayLabel || "";
                const unratedCount = dayRowList.filter(
                  (r) => !r.isRated && !localRated.has(`${r.session.id}:${r.player.id}`)
                ).length;

                return (
                  <View key={dayOffset} style={ccStyles.dayGroup}>
                    <View style={ccStyles.dayGroupHeader}>
                      <Text style={ccStyles.dayGroupLabel}>{dayLabel}</Text>
                      {unratedCount > 0 ? (
                        <View style={ccStyles.pendingBadge}>
                          <Text style={ccStyles.pendingBadgeText}>{unratedCount} to rate</Text>
                        </View>
                      ) : null}
                    </View>
                    {renderRows(dayRowList)}
                  </View>
                );
              })}
          </View>
        ) : null}
        {onShowSessionList ? (
          <View style={ccStyles.sessionListLink}>
            <Pressable
              style={ccStyles.sessionListButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onShowSessionList();
              }}
            >
              <Ionicons name="list-outline" size={16} color={Colors.dark.tabIconDefault} />
              <Text style={ccStyles.sessionListText}>View session history & deep assessments</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.dark.tabIconDefault} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <QuickFeedbackModal
        visible={!!quickFeedbackSession}
        session={quickFeedbackSession}
        initialPlayerIndex={quickFeedbackPlayerIndex}
        singlePlayerMode={true}
        onClose={() => setQuickFeedbackSession(null)}
        onComplete={handleFeedbackComplete}
      />
    </>
  );
}

const ccStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  allCaughtUpTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  allCaughtUpSub: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  allRatedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.primary + "18",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  allRatedBannerText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
    flex: 1,
  },
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.sectionTitle.fontSize,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  pendingBadge: {
    backgroundColor: Colors.dark.gold + "20",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "60",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.gold,
  },
  doneSectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  doneSectionText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  dayGroup: {
    marginBottom: Spacing.md,
  },
  dayGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  dayGroupLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  playerCardRated: {
    opacity: 0.6,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playerAvatarText: {
    fontSize: 16,
    fontWeight: "700",
  },
  playerInfo: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sessionTime: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  rateButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  rateButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  ratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  sessionListLink: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  sessionListButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  sessionListText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.tabIconDefault,
  },
});
