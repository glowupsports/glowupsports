import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
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
  withSpring,
} from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Backgrounds, Spacing, BorderRadius, Colors } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import * as Haptics from "expo-haptics";

type MatchLiveParams = {
  matchId: string;
  opponentName: string;
  opponentId: string;
  sport: string;
  matchFormat: string;
  scoringMode: string;
  // Legacy params (still accepted)
  challengeId?: string;
  matchType?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  courtName?: string;
  challengerId?: string;
};

interface ScoreState {
  sets: Array<{ creator: number; opponent: number }>;
  currentGame: { creator: number; opponent: number; server?: "creator" | "opponent" };
  setsWon: { creator: number; opponent: number };
  pointHistory: Array<{ point: number; winner: "creator" | "opponent"; timestamp: string }>;
}

interface MatchData {
  id: string;
  creatorId: string;
  opponentIds: string[];
  sport: string;
  matchFormat: string;
  scoringMode: string;
  status: string;
  currentScore: ScoreState;
  winnerId?: string;
  setScoreSummary?: string;
  mmrDeltaCreator?: number;
  previousMmrCreator?: number;
  newMmrCreator?: number;
  previousRankCreator?: number;
  newRankCreator?: number;
  startedAt: string;
}

function formatGameScore(pts: number): string {
  if (pts === 50) return "AD";
  return String(pts);
}

const TIPS = [
  "Stay focused on each point, not the score",
  "Breathe between points to stay calm",
  "Watch the ball all the way to your racket",
  "Move your feet — footwork wins matches",
  "Stick to your game plan",
];

export default function MatchLiveScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ MatchLive: MatchLiveParams }, "MatchLive">>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const {
    matchId,
    opponentName,
    opponentId,
    sport,
    matchFormat = "best_of_3",
    scoringMode = "standard",
  } = route.params;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [elapsed, setElapsed] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [currentTip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [scoringPending, setScoringPending] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  const pulseValue = useSharedValue(0.4);
  const pointFeedbackScale = useSharedValue(1);

  useEffect(() => {
    pulseValue.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.4, { duration: 800 }),
      ),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseValue.value }));
  const feedbackStyle = useAnimatedStyle(() => ({ transform: [{ scale: pointFeedbackScale.value }] }));

  // Load match data
  const fetchMatch = useCallback(async () => {
    if (!matchId) return;
    try {
      const url = new URL(`/api/live-scoring/matches/${matchId}`, getApiUrl()).toString();
      const res = await fetch(url, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.match) {
        setMatch(data.match);
        if (data.match.startedAt) {
          startTimeRef.current = new Date(data.match.startedAt).getTime();
        }
      }
    } catch (_e) {}
  }, [matchId]);

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  // Poll every 5s to stay in sync (edge cases, multiple devices)
  useEffect(() => {
    const interval = setInterval(fetchMatch, 5000);
    return () => clearInterval(interval);
  }, [fetchMatch]);

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

  const undoPoint = useMutation({
    mutationFn: async () => {
      const url = new URL(`/api/live-scoring/matches/${matchId}/undo`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to undo");
      }
      return res.json() as Promise<{ match: MatchData }>;
    },
    onSuccess: (data) => {
      setMatch(data.match);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onError: (err: any) => {
      Alert.alert("Cannot Undo", err.message || "No points to undo.");
    },
  });

  const recordPoint = useMutation({
    mutationFn: async (winner: "creator" | "opponent") => {
      const url = new URL(`/api/live-scoring/matches/${matchId}/point`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ winner }),
      });
      if (!res.ok) throw new Error("Failed to record point");
      return res.json() as Promise<{
        match: MatchData;
        matchComplete: boolean;
        winner?: "creator" | "opponent";
      }>;
    },
    onSuccess: (data) => {
      setMatch(data.match);
      if (data.matchComplete) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.replace("MatchSummary", {
          matchId,
          opponentName,
          opponentId,
          winnerId: data.match.winnerId,
          setScoreSummary: data.match.setScoreSummary,
          mmrDeltaCreator: data.match.mmrDeltaCreator,
          previousMmrCreator: data.match.previousMmrCreator,
          newMmrCreator: data.match.newMmrCreator,
          previousRankCreator: data.match.previousRankCreator,
          newRankCreator: data.match.newRankCreator,
          creatorId: data.match.creatorId,
        });
      }
      setScoringPending(false);
    },
    onError: () => {
      setScoringPending(false);
      Alert.alert("Error", "Could not record point. Please try again.");
    },
  });

  const handlePoint = useCallback(
    (winner: "creator" | "opponent") => {
      if (scoringPending) return;
      setScoringPending(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      pointFeedbackScale.value = withSpring(1.08, {}, () => {
        pointFeedbackScale.value = withSpring(1);
      });
      recordPoint.mutate(winner);
    },
    [scoringPending, recordPoint, pointFeedbackScale],
  );

  const handleEndMatch = () => {
    Alert.alert(
      "End Match",
      "How would you like to end this match?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete & Save",
          onPress: () => {
            const score = match?.currentScore;
            if (!score) return;
            const setsWon = score.setsWon;
            const winnerId =
              setsWon.creator > setsWon.opponent
                ? match?.creatorId
                : setsWon.opponent > setsWon.creator
                ? opponentId
                : undefined;

            completeMatch.mutate({ winnerId });
          },
        },
        {
          text: "Abandon (No Rank Impact)",
          style: "destructive",
          onPress: () => abandonMatch.mutate(),
        },
      ],
    );
  };

  const completeMatch = useMutation({
    mutationFn: async ({ winnerId }: { winnerId?: string }) => {
      const url = new URL(`/api/live-scoring/matches/${matchId}/complete`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ winnerId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace("MatchSummary", {
        matchId,
        opponentName,
        opponentId,
        winnerId: data.match?.winnerId,
        setScoreSummary: data.match?.setScoreSummary,
        mmrDeltaCreator: data.match?.mmrDeltaCreator,
        previousMmrCreator: data.match?.previousMmrCreator,
        newMmrCreator: data.match?.newMmrCreator,
        previousRankCreator: data.match?.previousRankCreator,
        newRankCreator: data.match?.newRankCreator,
        creatorId: data.match?.creatorId,
      });
    },
    onError: () => Alert.alert("Error", "Could not complete match."),
  });

  const abandonMatch = useMutation({
    mutationFn: async () => {
      const url = new URL(`/api/live-scoring/matches/${matchId}/abandon`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.goBack();
    },
    onError: () => Alert.alert("Error", "Could not abandon match."),
  });

  const score = match?.currentScore;
  const sets = score?.sets || [{ creator: 0, opponent: 0 }];
  const setsWon = score?.setsWon || { creator: 0, opponent: 0 };
  const currentGame = score?.currentGame || { creator: 0, opponent: 0 };
  const opponentInitial = opponentName?.charAt(0)?.toUpperCase() || "?";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,68,68,0.13)", "rgba(255,68,68,0.02)", Backgrounds.root]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
      />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.liveIndicator}>
          <Animated.View style={[styles.liveDot, pulseStyle]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.timerCompact}>
          <Text style={styles.timerCompactText}>
            {String(elapsed.hours).padStart(2, "0")}:
            {String(elapsed.minutes).padStart(2, "0")}:
            {String(elapsed.seconds).padStart(2, "0")}
          </Text>
        </View>
      </View>

      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        <View style={styles.scoreboardHeader}>
          <View style={{ flex: 1 }} />
          {sets.map((_, i) => (
            <Text key={i} style={styles.setLabel}>
              S{i + 1}
            </Text>
          ))}
          <Text style={[styles.setLabel, styles.gameLabel]}>Game</Text>
        </View>

        {/* Creator row */}
        <View style={styles.scoreRow}>
          <Text style={styles.playerName} numberOfLines={1}>
            You
          </Text>
          {sets.map((s, i) => (
            <Text
              key={i}
              style={[
                styles.setScore,
                s.creator > s.opponent && styles.setScoreWinning,
              ]}
            >
              {s.creator}
            </Text>
          ))}
          <Text style={[styles.gameScore, styles.gameScoreCreator]}>
            {formatGameScore(currentGame.creator)}
          </Text>
        </View>

        <View style={styles.scoreDivider} />

        {/* Opponent row */}
        <View style={styles.scoreRow}>
          <Text style={styles.playerName} numberOfLines={1}>
            {opponentName?.split(" ")[0] || "Opp"}
          </Text>
          {sets.map((s, i) => (
            <Text
              key={i}
              style={[
                styles.setScore,
                s.opponent > s.creator && styles.setScoreWinning,
              ]}
            >
              {s.opponent}
            </Text>
          ))}
          <Text style={[styles.gameScore]}>
            {formatGameScore(currentGame.opponent)}
          </Text>
        </View>

        {/* Sets won indicator */}
        <View style={styles.setsWonRow}>
          <Text style={styles.setsWonLabel}>Sets won:</Text>
          <Text style={styles.setsWonValue}>
            You {setsWon.creator} — {setsWon.opponent} {opponentName?.split(" ")[0]}
          </Text>
        </View>
      </View>

      {/* Point Buttons */}
      <Animated.View style={[styles.pointButtons, feedbackStyle]}>
        <Text style={styles.pointLabel}>Who won this point?</Text>
        <View style={styles.pointButtonRow}>
          <Pressable
            style={({ pressed }) => [
              styles.pointButton,
              styles.pointButtonCreator,
              pressed && { opacity: 0.75 },
              scoringPending && { opacity: 0.5 },
            ]}
            onPress={() => handlePoint("creator")}
            disabled={scoringPending}
          >
            {scoringPending ? (
              <ActivityIndicator color={Colors.dark.buttonText} size="small" />
            ) : (
              <>
                <Feather name="chevron-up" size={28} color={Colors.dark.buttonText} />
                <Text style={styles.pointButtonText}>You</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.pointButton,
              styles.pointButtonOpponent,
              pressed && { opacity: 0.75 },
              scoringPending && { opacity: 0.5 },
            ]}
            onPress={() => handlePoint("opponent")}
            disabled={scoringPending}
          >
            <>
              <View style={styles.opponentAvatar}>
                <Text style={styles.opponentInitial}>{opponentInitial}</Text>
              </View>
              <Text style={styles.pointButtonTextOpponent}>
                {opponentName?.split(" ")[0] || "Opp"}
              </Text>
            </>
          </Pressable>
        </View>
      </Animated.View>

      {/* Tip */}
      <View style={styles.tipCard}>
        <Feather name="zap" size={14} color="#FFD700" />
        <Text style={styles.tipText}>{currentTip}</Text>
      </View>

      {/* Actions */}
      <View style={[styles.actionsRow, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && { opacity: 0.7 },
            undoPoint.isPending && { opacity: 0.4 },
          ]}
          onPress={() => {
            if (undoPoint.isPending) return;
            Alert.alert(
              "Undo Last Point?",
              "This will remove the last recorded point.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Undo", onPress: () => undoPoint.mutate() },
              ],
            );
          }}
          disabled={undoPoint.isPending || !match?.currentScore?.pointHistory?.length}
        >
          <Feather
            name="corner-left-up"
            size={18}
            color={match?.currentScore?.pointHistory?.length ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"}
          />
          <Text style={[styles.actionBtnText, {
            color: match?.currentScore?.pointHistory?.length ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)",
          }]}>
            Undo
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
          onPress={handleEndMatch}
        >
          <Feather name="stop-circle" size={18} color="#FF4444" />
          <Text style={[styles.actionBtnText, { color: "#FF4444" }]}>End Match</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,68,68,0.12)",
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
    alignItems: "flex-end",
  },
  timerCompactText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    fontVariant: ["tabular-nums"],
  },
  // Scoreboard
  scoreboard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.15)",
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
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 0.5,
  },
  gameLabel: {
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
    fontSize: 20,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
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
    color: "rgba(255,68,68,0.6)",
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
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  setsWonLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontWeight: "500",
  },
  setsWonValue: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
  },
  // Point buttons
  pointButtons: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  pointLabel: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pointButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  pointButton: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    minHeight: 100,
  },
  pointButtonCreator: {
    backgroundColor: "#CCFF00",
  },
  pointButtonOpponent: {
    backgroundColor: "rgba(255,68,68,0.12)",
    borderWidth: 2,
    borderColor: "rgba(255,68,68,0.3)",
  },
  pointButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.buttonText,
  },
  pointButtonTextOpponent: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FF4444",
  },
  opponentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,68,68,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  opponentInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FF4444",
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: "rgba(255,215,0,0.05)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.1)",
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: "rgba(255,215,0,0.85)",
    lineHeight: 17,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    marginTop: "auto",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,68,68,0.2)",
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
