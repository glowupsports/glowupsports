import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Backgrounds, Spacing, BorderRadius, ProTennisColors, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl, getAuthHeaders, getEffectivePlayerId } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import * as Haptics from "expo-haptics";

type MatchLiveParams = {
  challengeId: string;
  opponentName: string;
  matchType: string;
  matchFormat: string;
  scheduledDate: string;
  scheduledTime: string;
  courtName?: string;
  challengerId: string;
  opponentId: string;
};

interface SetScore {
  player: number;
  opponent: number;
}

export default function MatchLiveScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ MatchLive: MatchLiveParams }, "MatchLive">>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const playerId = getEffectivePlayerId(user?.playerId);

  const {
    challengeId,
    opponentName,
    matchType,
    matchFormat,
    scheduledDate,
    scheduledTime,
    courtName,
    challengerId,
    opponentId,
  } = route.params;

  const [elapsed, setElapsed] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [sets, setSets] = useState<SetScore[]>([{ player: 0, opponent: 0 }]);
  const [showLateModal, setShowLateModal] = useState(false);

  const pulseValue = useSharedValue(0.4);
  useEffect(() => {
    pulseValue.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.4, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseValue.value,
  }));

  useEffect(() => {
    const startTime = new Date(`${scheduledDate}T${scheduledTime}:00`).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsed({
        hours: Math.floor(diff / 3600),
        minutes: Math.floor((diff % 3600) / 60),
        seconds: diff % 60,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [scheduledDate, scheduledTime]);

  const lateMutation = useMutation({
    mutationFn: async (data: { minutes: number; message: string }) => {
      const res = await fetch(
        new URL(`/api/matches/challenge/${challengeId}/running-late?playerId=${playerId}`, getApiUrl()).toString(),
        {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLateModal(false);
    },
  });

  const updateSetScore = useCallback((setIndex: number, who: "player" | "opponent", delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSets(prev => {
      const updated = [...prev];
      const current = updated[setIndex];
      const newVal = Math.max(0, Math.min(7, current[who] + delta));
      updated[setIndex] = { ...current, [who]: newVal };
      return updated;
    });
  }, []);

  const addSet = useCallback(() => {
    if (sets.length < 5) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSets(prev => [...prev, { player: 0, opponent: 0 }]);
    }
  }, [sets.length]);

  const removeSet = useCallback(() => {
    if (sets.length > 1) {
      setSets(prev => prev.slice(0, -1));
    }
  }, [sets.length]);

  const opponentInitial = opponentName?.charAt(0)?.toUpperCase() || "?";

  const tips = [
    "Stay focused on each point, not the score",
    "Breathe between points to stay calm",
    "Watch the ball all the way to your racket",
    "Move your feet — footwork wins matches",
    "Stick to your game plan",
  ];
  const [currentTip] = useState(() => tips[Math.floor(Math.random() * tips.length)]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255, 68, 68, 0.15)", "rgba(255, 68, 68, 0.02)", Backgrounds.root]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
      />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.liveIndicator}>
          <Animated.View style={[styles.liveDot, pulseStyle]} />
          <Text style={styles.liveText}>MATCH LIVE</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.timerSection}>
          <View style={styles.timerRow}>
            <View style={styles.timerDigit}>
              <Text style={styles.timerValue}>{String(elapsed.hours).padStart(2, "0")}</Text>
              <Text style={styles.timerLabel}>HRS</Text>
            </View>
            <Text style={styles.timerSep}>:</Text>
            <View style={styles.timerDigit}>
              <Text style={styles.timerValue}>{String(elapsed.minutes).padStart(2, "0")}</Text>
              <Text style={styles.timerLabel}>MIN</Text>
            </View>
            <Text style={styles.timerSep}>:</Text>
            <View style={styles.timerDigit}>
              <Text style={styles.timerValue}>{String(elapsed.seconds).padStart(2, "0")}</Text>
              <Text style={styles.timerLabel}>SEC</Text>
            </View>
          </View>
        </View>

        <View style={styles.opponentCard}>
          <View style={styles.opponentAvatar}>
            <Text style={styles.opponentInitial}>{opponentInitial}</Text>
          </View>
          <View style={styles.opponentInfo}>
            <Text style={styles.opponentName}>vs {opponentName}</Text>
            <Text style={styles.matchMeta}>
              {(matchType || "Singles").charAt(0).toUpperCase() + (matchType || "Singles").slice(1)} {" · "} 
              {(matchFormat || "Friendly").charAt(0).toUpperCase() + (matchFormat || "Friendly").slice(1)}
            </Text>
            {courtName ? (
              <View style={styles.courtRow}>
                <Feather name="map-pin" size={12} color={ProTennisColors.textSecondary} />
                <Text style={styles.courtText}>{courtName}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.scoreSection}>
          <View style={styles.scoreTitleRow}>
            <Text style={styles.scoreTitle}>Live Score</Text>
            <View style={styles.setButtons}>
              {sets.length > 1 ? (
                <Pressable onPress={removeSet} style={styles.setActionBtn}>
                  <Feather name="minus" size={14} color={ProTennisColors.textSecondary} />
                </Pressable>
              ) : null}
              {sets.length < 5 ? (
                <Pressable onPress={addSet} style={styles.setActionBtn}>
                  <Feather name="plus" size={14} color="#FF4444" />
                  <Text style={styles.setActionLabel}>Set</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.scoreHeader}>
            <View style={{ flex: 1 }} />
            {sets.map((_, i) => (
              <View key={i} style={styles.setHeaderCell}>
                <Text style={styles.setHeaderText}>S{i + 1}</Text>
              </View>
            ))}
          </View>

          <View style={styles.scoreRow}>
            <Text style={styles.playerLabel}>You</Text>
            {sets.map((s, i) => (
              <View key={i} style={styles.scoreCell}>
                <Pressable
                  onPress={() => updateSetScore(i, "player", -1)}
                  style={styles.scoreMinus}
                >
                  <Feather name="minus" size={12} color={ProTennisColors.textSecondary} />
                </Pressable>
                <Text style={[styles.scoreValue, s.player > s.opponent && styles.scoreWinning]}>
                  {s.player}
                </Text>
                <Pressable
                  onPress={() => updateSetScore(i, "player", 1)}
                  style={styles.scorePlus}
                >
                  <Feather name="plus" size={12} color="#FF4444" />
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.scoreDivider} />

          <View style={styles.scoreRow}>
            <Text style={styles.playerLabel}>{opponentName?.split(" ")[0] || "Opp"}</Text>
            {sets.map((s, i) => (
              <View key={i} style={styles.scoreCell}>
                <Pressable
                  onPress={() => updateSetScore(i, "opponent", -1)}
                  style={styles.scoreMinus}
                >
                  <Feather name="minus" size={12} color={ProTennisColors.textSecondary} />
                </Pressable>
                <Text style={[styles.scoreValue, s.opponent > s.player && styles.scoreWinning]}>
                  {s.opponent}
                </Text>
                <Pressable
                  onPress={() => updateSetScore(i, "opponent", 1)}
                  style={styles.scorePlus}
                >
                  <Feather name="plus" size={12} color="#FF4444" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.tipCard}>
          <Feather name="zap" size={16} color="#FFD700" />
          <Text style={styles.tipText}>{currentTip}</Text>
        </View>

        <View style={styles.actionsSection}>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.lateButton, pressed && { opacity: 0.7 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              lateMutation.mutate({ minutes: 10, message: "Running a bit late!" });
            }}
          >
            <Feather name="clock" size={18} color="#FF9500" />
            <Text style={[styles.actionButtonText, { color: "#FF9500" }]}>Running Late</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.endButton, pressed && { opacity: 0.7 }]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert(
                "End Match",
                "Are you sure you want to end this match?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "End Match",
                    style: "destructive",
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            }}
          >
            <Feather name="x-circle" size={18} color="#FF4444" />
            <Text style={[styles.actionButtonText, { color: "#FF4444" }]}>End Match</Text>
          </Pressable>
        </View>
      </ScrollView>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 68, 68, 0.12)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF4444",
  },
  liveText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF4444",
    letterSpacing: 1.5,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  timerSection: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timerDigit: {
    alignItems: "center",
    minWidth: 72,
  },
  timerValue: {
    fontSize: 56,
    fontWeight: "800",
    color: "#FF4444",
    fontVariant: ["tabular-nums"],
    letterSpacing: -2,
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 68, 68, 0.5)",
    letterSpacing: 2,
    marginTop: -4,
  },
  timerSep: {
    fontSize: 48,
    fontWeight: "300",
    color: "rgba(255, 68, 68, 0.4)",
    marginTop: -8,
  },
  opponentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.1)",
  },
  opponentAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 68, 68, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 68, 68, 0.3)",
  },
  opponentInitial: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FF4444",
  },
  opponentInfo: {
    flex: 1,
    gap: 4,
  },
  opponentName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  matchMeta: {
    fontSize: 13,
    color: ProTennisColors.textSecondary,
    fontWeight: "500",
  },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  courtText: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
  },
  scoreSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 68, 68, 0.1)",
  },
  scoreTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  setButtons: {
    flexDirection: "row",
    gap: 8,
  },
  setActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 68, 68, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  setActionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF4444",
  },
  scoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  setHeaderCell: {
    flex: 1,
    alignItems: "center",
  },
  setHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
    letterSpacing: 0.5,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  playerLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  scoreCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  scoreMinus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  scorePlus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
    minWidth: 24,
    textAlign: "center",
  },
  scoreWinning: {
    color: "#FF4444",
  },
  scoreDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255, 215, 0, 0.06)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.1)",
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255, 215, 0, 0.9)",
    lineHeight: 18,
  },
  actionsSection: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  lateButton: {
    backgroundColor: "rgba(255, 149, 0, 0.08)",
    borderColor: "rgba(255, 149, 0, 0.2)",
  },
  endButton: {
    backgroundColor: "rgba(255, 68, 68, 0.08)",
    borderColor: "rgba(255, 68, 68, 0.2)",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
