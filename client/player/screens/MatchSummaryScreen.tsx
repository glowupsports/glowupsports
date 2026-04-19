import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Platform,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Backgrounds, Spacing, BorderRadius, Colors, Typography, GlowColors } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type MatchSummaryParams = {
  matchId: string;
  opponentName: string;
  opponentId: string;
  winnerId?: string;
  setScoreSummary?: string;
  mmrDeltaCreator?: number;
  previousMmrCreator?: number;
  newMmrCreator?: number;
  previousRankCreator?: number;
  newRankCreator?: number;
  creatorId: string;
};

const RANK_NAMES: Record<number, string> = {
  1: "Glow 1",
  2: "Glow 2",
  3: "Glow 3",
  4: "Glow 4",
  5: "Glow 5",
  6: "Glow 6",
  7: "Glow 7",
  8: "Glow 8",
};

function getRankName(rank?: number): string {
  if (!rank) return "Unranked";
  return RANK_NAMES[rank] || `Glow ${rank}`;
}

export default function MatchSummaryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ MatchSummary: MatchSummaryParams }, "MatchSummary">>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const {
    matchId,
    opponentName,
    opponentId,
    winnerId,
    setScoreSummary,
    mmrDeltaCreator,
    previousMmrCreator,
    newMmrCreator,
    previousRankCreator,
    newRankCreator,
    creatorId,
  } = route.params;

  const myPlayerId = user?.playerId;
  const iAmCreator = myPlayerId === creatorId;
  const didWin = iAmCreator ? winnerId === creatorId : winnerId === myPlayerId;
  const wasUndecided = !winnerId;

  const mmrDelta = iAmCreator ? mmrDeltaCreator : undefined;
  const prevMmr = iAmCreator ? previousMmrCreator : undefined;
  const newMmr = iAmCreator ? newMmrCreator : undefined;
  const prevRank = iAmCreator ? previousRankCreator : undefined;
  const newRank = iAmCreator ? newRankCreator : undefined;
  const rankChanged = prevRank !== undefined && newRank !== undefined && prevRank !== newRank;

  const handleShare = async () => {
    try {
      const result = wasUndecided
        ? `I just played a match against ${opponentName} on Glow!`
        : didWin
        ? `I beat ${opponentName} ${setScoreSummary ? `${setScoreSummary} ` : ""}on Glow!${mmrDelta ? ` +${mmrDelta} MMR` : ""}`
        : `Good match vs ${opponentName}${setScoreSummary ? ` (${setScoreSummary})` : ""} on Glow!`;

      await Share.share({ message: result });
    } catch (_e) {}
  };

  const accentColor = wasUndecided ? "#888" : didWin ? GlowColors.primary : "#FF4444";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[
          wasUndecided
            ? "rgba(100,100,100,0.15)"
            : didWin
            ? "rgba(204,255,0,0.10)"
            : "rgba(255,68,68,0.10)",
          "rgba(0,0,0,0)",
          Backgrounds.root,
        ]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing["2xl"] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Result hero */}
        <View style={styles.hero}>
          <View style={[styles.resultIcon, { borderColor: accentColor + "60", backgroundColor: accentColor + "14" }]}>
            <Feather
              name={wasUndecided ? "minus-circle" : didWin ? "award" : "refresh-cw"}
              size={40}
              color={accentColor}
            />
          </View>
          <Text style={[styles.resultLabel, { color: accentColor }]}>
            {wasUndecided ? "MATCH ENDED" : didWin ? "MATCH WON" : "MATCH LOST"}
          </Text>
          <Text style={styles.opponentText}>vs {opponentName}</Text>
          {setScoreSummary ? (
            <Text style={styles.scoreText}>{setScoreSummary}</Text>
          ) : null}
        </View>

        {/* MMR Card */}
        {mmrDelta !== undefined && mmrDelta !== null ? (
          <View style={styles.mmrCard}>
            <Text style={styles.mmrTitle}>Glow Rank Update</Text>
            <View style={styles.mmrRow}>
              <View style={styles.mmrItem}>
                <Text style={styles.mmrItemLabel}>Previous MMR</Text>
                <Text style={styles.mmrItemValue}>{prevMmr ?? "—"}</Text>
              </View>
              <View style={styles.mmrArrow}>
                <Feather
                  name={mmrDelta >= 0 ? "arrow-up" : "arrow-down"}
                  size={20}
                  color={mmrDelta >= 0 ? GlowColors.primary : "#FF4444"}
                />
              </View>
              <View style={styles.mmrItem}>
                <Text style={styles.mmrItemLabel}>New MMR</Text>
                <Text style={styles.mmrItemValue}>{newMmr ?? "—"}</Text>
              </View>
            </View>
            <View style={[styles.mmrDeltaBadge, { backgroundColor: mmrDelta >= 0 ? "rgba(204,255,0,0.12)" : "rgba(255,68,68,0.12)" }]}>
              <Text style={[styles.mmrDeltaText, { color: mmrDelta >= 0 ? GlowColors.primary : "#FF4444" }]}>
                {mmrDelta >= 0 ? "+" : ""}{mmrDelta} MMR
              </Text>
            </View>
            {rankChanged ? (
              <View style={styles.rankChange}>
                <Feather
                  name={newRank! < prevRank! ? "trending-up" : "trending-down"}
                  size={16}
                  color={newRank! < prevRank! ? GlowColors.primary : "#FF4444"}
                />
                <Text style={[styles.rankChangeText, { color: newRank! < prevRank! ? GlowColors.primary : "#FF4444" }]}>
                  {newRank! < prevRank! ? "Promoted to" : "Demoted to"} {getRankName(newRank)}
                </Text>
              </View>
            ) : newRank ? (
              <Text style={styles.rankStableText}>Rank: {getRankName(newRank)}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Actions */}
        <Pressable
          style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.8 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleShare();
          }}
        >
          <Feather name="share-2" size={18} color={Colors.dark.buttonText} />
          <Text style={styles.shareBtnText}>Share Result</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.historyBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("MatchHistory");
          }}
        >
          <Feather name="list" size={17} color={Colors.dark.textSecondary} />
          <Text style={styles.historyBtnText}>View Match History</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.reset({ index: 0, routes: [{ name: "PlayerTabs" }] });
          }}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing["2xl"],
    gap: Spacing.lg,
    alignItems: "stretch",
  },
  hero: {
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  resultIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  resultLabel: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 3,
  },
  opponentText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  scoreText: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  mmrCard: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    gap: Spacing.md,
    alignItems: "center",
  },
  mmrTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  mmrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  mmrItem: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  mmrItemLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  mmrItemValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    fontVariant: ["tabular-nums"],
  },
  mmrArrow: {
    width: 40,
    alignItems: "center",
  },
  mmrDeltaBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  mmrDeltaText: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  rankChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  rankChangeText: {
    fontSize: 14,
    fontWeight: "700",
  },
  rankStableText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  historyBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  doneBtn: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
}));
