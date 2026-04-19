import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { Backgrounds, Spacing, BorderRadius, Colors, GlowColors } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type LiveMatchViewerParams = {
  matchId: string;
  playerName?: string;
};

interface ScoreState {
  sets: Array<{ creator: number; opponent: number }>;
  currentGame: { creator: number; opponent: number; server?: "creator" | "opponent" };
  setsWon: { creator: number; opponent: number };
  pointHistory: Array<{ point: number; winner: "creator" | "opponent"; timestamp: string }>;
}

interface MatchViewData {
  match: {
    id: string;
    status: string;
    sport: string;
    matchFormat: string;
    currentScore: ScoreState;
    setScoreSummary?: string;
    winnerId?: string;
    startedAt: string;
  };
  creator: { id: string; name: string } | null;
  opponents: Array<{ id: string; name: string }>;
  formattedScore: {
    sets: Array<{ creator: number; opponent: number }>;
    setsWon: { creator: number; opponent: number };
    currentGame: { creator: string; opponent: string };
  };
}

export default function LiveMatchViewerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ LiveMatchViewer: LiveMatchViewerParams }, "LiveMatchViewer">>();
  const insets = useSafeAreaInsets();
  const { matchId, playerName } = route.params;

  const [data, setData] = useState<MatchViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const startTimeRef = React.useRef<number>(Date.now());

  const pulseValue = useSharedValue(0.4);
  useEffect(() => {
    pulseValue.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0.4, { duration: 900 }),
      ),
      -1,
      true,
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseValue.value }));

  const fetchData = useCallback(async () => {
    try {
      const url = new URL(`/api/live-scoring/matches/${matchId}`, getApiUrl()).toString();
      const res = await fetch(url, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      if (json.match?.startedAt) {
        startTimeRef.current = new Date(json.match.startedAt).getTime();
      }
    } catch (_e) {
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll every 4s for live score
  useEffect(() => {
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
      setElapsed({
        hours: Math.floor(diff / 3600),
        minutes: Math.floor((diff % 3600) / 60),
        seconds: diff % 60,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLive = data?.match?.status === "live";
  const isComplete = data?.match?.status === "completed";

  const formattedScore = data?.formattedScore;
  const creatorName = data?.creator?.name || playerName || "Player";
  const opponentName = data?.opponents?.[0]?.name || "Opponent";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(0,100,255,0.08)", "rgba(0,0,0,0)", Backgrounds.root]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.statusPill}>
          {isLive ? (
            <>
              <Animated.View style={[styles.liveDot, pulseStyle]} />
              <Text style={styles.liveText}>LIVE</Text>
            </>
          ) : (
            <Text style={[styles.liveText, { color: Colors.dark.textMuted }]}>
              {isComplete ? "COMPLETED" : "OFFLINE"}
            </Text>
          )}
        </View>
        {isLive ? (
          <View style={styles.timerCompact}>
            <Text style={styles.timerText}>
              {String(elapsed.hours).padStart(2, "0")}:
              {String(elapsed.minutes).padStart(2, "0")}:
              {String(elapsed.seconds).padStart(2, "0")}
            </Text>
          </View>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
          <Text style={styles.loadingText}>Loading match...</Text>
        </View>
      ) : !data ? (
        <View style={styles.loadingContainer}>
          <Feather name="alert-circle" size={40} color={Colors.dark.textMuted} />
          <Text style={styles.loadingText}>Match not found</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing["2xl"] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Match info */}
          <View style={styles.matchInfo}>
            <Text style={styles.matchSport}>
              {data.match.sport?.charAt(0).toUpperCase() + data.match.sport?.slice(1)} — {
                data.match.matchFormat?.replace(/_/g, " ")
              }
            </Text>
          </View>

          {/* Scoreboard */}
          <View style={styles.scoreboard}>
            <View style={styles.scoreboardHeader}>
              <View style={{ flex: 1 }} />
              {(formattedScore?.sets || []).map((_, i) => (
                <Text key={i} style={styles.setLabel}>S{i + 1}</Text>
              ))}
              {isLive ? (
                <Text style={[styles.setLabel, styles.gameLabelActive]}>Game</Text>
              ) : null}
            </View>

            <View style={styles.scoreRow}>
              <Text style={styles.playerName} numberOfLines={1}>{creatorName}</Text>
              {(formattedScore?.sets || []).map((s, i) => (
                <Text
                  key={i}
                  style={[styles.setScore, s.creator > s.opponent && styles.setScoreWinning]}
                >
                  {s.creator}
                </Text>
              ))}
              {isLive ? (
                <Text style={[styles.gameScore, styles.gameScoreCreator]}>
                  {formattedScore?.currentGame?.creator ?? "0"}
                </Text>
              ) : null}
            </View>

            <View style={styles.scoreDivider} />

            <View style={styles.scoreRow}>
              <Text style={styles.playerName} numberOfLines={1}>{opponentName}</Text>
              {(formattedScore?.sets || []).map((s, i) => (
                <Text
                  key={i}
                  style={[styles.setScore, s.opponent > s.creator && styles.setScoreWinning]}
                >
                  {s.opponent}
                </Text>
              ))}
              {isLive ? (
                <Text style={styles.gameScore}>
                  {formattedScore?.currentGame?.opponent ?? "0"}
                </Text>
              ) : null}
            </View>

            {isLive ? (
              <View style={styles.setsWonRow}>
                <Text style={styles.setsWonText}>
                  Sets: {creatorName.split(" ")[0]} {formattedScore?.setsWon?.creator ?? 0} — {formattedScore?.setsWon?.opponent ?? 0} {opponentName.split(" ")[0]}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Completed result */}
          {isComplete && data.match.winnerId ? (
            <View style={styles.resultCard}>
              <Feather name="award" size={28} color={GlowColors.primary} />
              <Text style={styles.resultWinner}>
                {data.match.winnerId === data.creator?.id ? creatorName : opponentName} wins!
              </Text>
              {data.match.setScoreSummary ? (
                <Text style={styles.resultScore}>{data.match.setScoreSummary}</Text>
              ) : null}
            </View>
          ) : null}

          {/* Polling note */}
          {isLive ? (
            <View style={styles.pollingNote}>
              <Feather name="refresh-cw" size={13} color={Colors.dark.textMuted} />
              <Text style={styles.pollingText}>Score updates every few seconds</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,68,68,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF4444",
  },
  liveText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FF4444",
    letterSpacing: 2,
  },
  timerCompact: {
    width: 60,
    alignItems: "flex-end",
  },
  timerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.45)",
    fontVariant: ["tabular-nums"],
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },
  matchInfo: {
    alignItems: "center",
  },
  matchSport: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "capitalize",
  },
  scoreboard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(0,100,255,0.15)",
  },
  scoreboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  setLabel: {
    width: 40,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.3)",
  },
  gameLabelActive: {
    width: 52,
    color: "#FF4444",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  setScore: {
    width: 40,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "rgba(255,255,255,0.4)",
    fontVariant: ["tabular-nums"],
  },
  setScoreWinning: {
    color: "#fff",
  },
  gameScore: {
    width: 52,
    textAlign: "center",
    fontSize: 26,
    fontWeight: "800",
    color: "rgba(255,68,68,0.5)",
    fontVariant: ["tabular-nums"],
  },
  gameScoreCreator: {
    color: "#FF4444",
  },
  scoreDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 4,
  },
  setsWonRow: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  setsWonText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "600",
  },
  resultCard: {
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(204,255,0,0.06)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(204,255,0,0.15)",
  },
  resultWinner: {
    fontSize: 22,
    fontWeight: "800",
    color: GlowColors.primary,
  },
  resultScore: {
    fontSize: 18,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
  },
  pollingNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  pollingText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
}));
