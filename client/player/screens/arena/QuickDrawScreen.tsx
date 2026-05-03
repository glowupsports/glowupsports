import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  Platform,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface QuickDrawResult {
  result: "win" | "loss" | "draw";
  opponent: {
    name: string;
    mmr: number;
    rarityLabel: string;
  };
  coinsAwarded: number;
  playerPower: number;
  opponentPower: number;
}

interface CardData {
  card: {
    rarityLabel: string;
    rarityMarker: string;
    statPower: number;
    statTechnique: number;
    statMental: number;
    statTactics: number;
    arenaMmr: number;
    arenaWins: number;
    arenaLosses: number;
  } | null;
  player: {
    name: string;
    profilePhotoUrl?: string | null;
  } | null;
}

const RESULT_CONFIG = {
  win:  { label: "Victory",  color: "#C8FF3D", icon: "award"    as const, bg: "rgba(200,255,61,0.08)"   },
  loss: { label: "Defeated", color: "#FF4D4D", icon: "x-circle" as const, bg: "rgba(255,77,77,0.08)"   },
  draw: { label: "Draw",     color: "#FFD700", icon: "minus"    as const, bg: "rgba(255,215,0,0.08)"   },
};

export default function QuickDrawScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [battling, setBattling] = useState(false);
  const [result, setResult] = useState<QuickDrawResult | null>(null);
  const [battleCount, setBattleCount] = useState(0);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const { data: cardData } = useQuery<CardData>({
    queryKey: ["/api/arena/my-card"],
  });

  const handleQuickDraw = useCallback(async () => {
    if (battling) return;
    setBattling(true);
    setResult(null);

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    // Battle animation
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.15, duration: 200, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,   duration: 150, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ]),
      { iterations: 3 },
    ).start();

    try {
      const url = new URL("/api/arena/quick-draw", getApiUrl());
      const response = await apiRequest("POST", url.pathname);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Quick draw failed");

      await new Promise((r) => setTimeout(r, 800)); // dramatic pause

      setResult(data as QuickDrawResult);
      setBattleCount((c) => c + 1);

      if (Platform.OS !== "web") {
        if (data.result === "win") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (data.result === "loss") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/my-card"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/missions"] });
    } catch (err) {
      console.error("[QuickDraw]", err);
    } finally {
      setBattling(false);
    }
  }, [battling, scaleAnim, glowAnim, queryClient]);

  const card = cardData?.card;
  const playerName = cardData?.player?.name ?? "You";

  const resultConfig = result ? RESULT_CONFIG[result.result] : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        alignItems: "center",
      }}
    >
      {/* Header */}
      <Text style={styles.title}>Quick Draw</Text>
      <Text style={styles.subtitle}>Instant card battles — no MMR risk, pure glory</Text>

      {/* My card preview */}
      {card && (
        <Animated.View style={[styles.myCardPreview, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.myCardInner}>
            <Text style={styles.myCardRarity}>{card.rarityMarker} {card.rarityLabel}</Text>
            <Text style={styles.myCardName}>{playerName}</Text>
            <View style={styles.statsRow}>
              <SmallStat label="PWR" value={card.statPower} color="#FF4D4D" />
              <SmallStat label="TEC" value={card.statTechnique} color="#4DA3FF" />
              <SmallStat label="MEN" value={card.statMental} color="#C8FF3D" />
              <SmallStat label="TAC" value={card.statTactics} color="#FFD700" />
            </View>
            <View style={styles.mmrRow}>
              <Feather name="trending-up" size={12} color={Colors.dark.primary} />
              <Text style={styles.mmrText}>{card.arenaMmr} MMR</Text>
              <Text style={styles.recordText}>{card.arenaWins}W / {card.arenaLosses}L</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* vs divider */}
      <View style={styles.vsDivider}>
        <View style={styles.vsDividerLine} />
        <Text style={styles.vsText}>VS</Text>
        <View style={styles.vsDividerLine} />
      </View>

      {/* Opponent preview or result */}
      {result ? (
        <View style={[styles.resultCard, { backgroundColor: resultConfig?.bg, borderColor: resultConfig?.color + "55" }]}>
          <Feather name={resultConfig!.icon} size={32} color={resultConfig!.color} />
          <Text style={[styles.resultLabel, { color: resultConfig!.color }]}>{resultConfig!.label}</Text>
          <Text style={styles.opponentName}>{result.opponent.name}</Text>
          <Text style={styles.opponentRarity}>{result.opponent.rarityLabel}</Text>

          <View style={styles.powerRow}>
            <PowerBar label="Your Power" value={result.playerPower} color={Colors.dark.primary} total={Math.max(result.playerPower, result.opponentPower)} />
            <PowerBar label="Opp. Power" value={result.opponentPower} color="#FF4D4D" total={Math.max(result.playerPower, result.opponentPower)} />
          </View>

          <View style={styles.rewardsRow}>
            {result.coinsAwarded > 0 && (
              <View style={[styles.rewardChip, { borderColor: "rgba(200,255,61,0.33)" }]}>
                <Feather name="zap" size={12} color={Colors.dark.primary} />
                <Text style={[styles.rewardChipText, { color: Colors.dark.primary }]}>+{result.coinsAwarded} coins</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.opponentSlot}>
          {battling ? (
            <>
              <ActivityIndicator color={Colors.dark.primary} size="large" />
              <Text style={styles.battlingText}>Finding opponent...</Text>
            </>
          ) : (
            <>
              <Feather name="user" size={36} color={Colors.dark.disabled} />
              <Text style={styles.opponentSlotText}>
                {battleCount === 0 ? "Tap below to battle" : "Ready for another?"}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Battle button */}
      <Pressable
        style={[styles.battleButton, battling && styles.battleButtonDisabled]}
        onPress={handleQuickDraw}
        disabled={battling}
      >
        <Feather name="zap" size={18} color={battling ? Colors.dark.disabled : "#000"} />
        <Text style={[styles.battleButtonText, battling && { color: Colors.dark.disabled }]}>
          {battling ? "Battling..." : result ? "Draw Again" : "Quick Draw"}
        </Text>
      </Pressable>

      {battleCount > 0 && (
        <Text style={styles.battleCountText}>{battleCount} battle{battleCount !== 1 ? "s" : ""} this session</Text>
      )}

      {/* Info card */}
      <View style={styles.infoCard}>
        <Feather name="info" size={14} color={Colors.dark.textMuted} />
        <Text style={styles.infoText}>
          {"Quick Draw uses your card's stats for auto-battle. No entry cost. Win to earn Glow Coins and conquered cards."}
        </Text>
      </View>
    </ScrollView>
  );
}

function SmallStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.smallStat}>
      <Text style={[styles.smallStatValue, { color }]}>{value}</Text>
      <Text style={styles.smallStatLabel}>{label}</Text>
    </View>
  );
}

function PowerBar({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 50;
  return (
    <View style={styles.powerBar}>
      <View style={styles.powerBarHeader}>
        <Text style={styles.powerBarLabel}>{label}</Text>
        <Text style={[styles.powerBarValue, { color }]}>{value}</Text>
      </View>
      <View style={styles.powerBarBg}>
        <View style={[styles.powerBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  myCardPreview: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  myCardInner: {
    padding: Spacing.lg,
    alignItems: "center",
    gap: 8,
  },
  myCardRarity: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  myCardName: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginTop: 4,
  },
  mmrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  mmrText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  recordText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  vsDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    width: "100%",
  },
  vsDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.borderSubtle,
  },
  vsText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.disabled,
  },
  opponentSlot: {
    width: "100%",
    height: 160,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: Spacing.xl,
    borderStyle: "dashed",
  },
  opponentSlotText: {
    fontSize: 14,
    color: Colors.dark.disabled,
  },
  battlingText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  resultCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  resultLabel: {
    fontSize: 22,
    fontWeight: "800",
  },
  opponentName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  opponentRarity: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  powerRow: {
    width: "100%",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  powerBar: {
    gap: 4,
  },
  powerBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  powerBarLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  powerBarValue: {
    fontSize: 11,
    fontWeight: "700",
  },
  powerBarBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  powerBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  rewardsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  rewardChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rewardChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  battleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: Spacing.md,
    width: "100%",
    justifyContent: "center",
  },
  battleButtonDisabled: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  battleButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000",
  },
  battleCountText: {
    fontSize: 12,
    color: Colors.dark.disabled,
    marginBottom: Spacing.xl,
  },
  infoCard: {
    flexDirection: "row",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 17,
  },
  smallStat: {
    alignItems: "center",
  },
  smallStatValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  smallStatLabel: {
    fontSize: 9,
    color: Colors.dark.textMuted,
  },
});
