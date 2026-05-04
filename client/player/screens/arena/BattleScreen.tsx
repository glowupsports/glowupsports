import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

interface BattleState {
  id: string;
  status: string;
  isRanked: boolean;
  battleType: string;
  initiatorId: string;
  opponentId: string;
  winnerId?: string;
  initiatorHp: number;
  opponentHp: number;
  currentRound: number;
  wagerCoins: number;
  initiatorPlayer: { name: string; profilePhotoUrl?: string | null };
  opponentPlayer: { name: string; profilePhotoUrl?: string | null };
  turns: Array<{ turnNumber: number; actorId: string; damage: number; result: string }>;
  isMyTurn: boolean;
  isInitiator: boolean;
  hasSubmittedThisRound: boolean;
  waitingForOpponent: boolean;
  isClutchRound: boolean;
}

interface TurnResult {
  roundNumber: number;
  actorId: string;
  waitingForOpponent: boolean;
  damage: number;
  opponentDamage?: number;
  result: string;
  initiatorHp: number;
  opponentHp: number;
  isClutch: boolean;
  battleComplete: boolean;
  winnerId?: string;
  coinsAwarded?: number;
  mmrDelta?: number;
}

interface AbilityCard {
  id: string;
  name: string;
  type: string;
  rarity: string;
  basePower: number;
  isClutch?: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  common: "#888", uncommon: "#CD7F32", rare: "#4DA3FF", epic: "#C040FB", legendary: "#FFD700",
};

function HpBar({ hp, maxHp = 100, color }: { hp: number; maxHp?: number; color: string }) {
  const pct = Math.max(0, (hp / maxHp) * 100);
  return (
    <View style={hpStyles.container}>
      <View style={[hpStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const hpStyles = StyleSheet.create({
  container: {
    height: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 5,
    overflow: "hidden",
    flex: 1,
  },
  fill: {
    height: "100%",
    borderRadius: 5,
  },
});

function TurnLog({ turns, initiatorId }: { turns: BattleState["turns"]; initiatorId: string }) {
  return (
    <View style={logStyles.container}>
      {[...turns].reverse().map((t, i) => {
        const isPlayer = t.actorId === initiatorId;
        return (
          <View key={i} style={[logStyles.turn, isPlayer && logStyles.turnPlayer]}>
            <Text style={logStyles.turnText}>
              Round {t.turnNumber}: {t.result === "miss" ? "Missed!" : t.result === "critical" ? `CRITICAL +${t.damage}` : `Hit +${t.damage}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const logStyles = StyleSheet.create({
  container: { gap: 4 },
  turn: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  turnPlayer: { alignSelf: "flex-start", backgroundColor: "rgba(200,255,61,0.10)" },
  turnText: { fontSize: 12, color: Colors.dark.textMuted },
});

function AbilityPicker({
  visible,
  cards,
  onSelect,
  onClose,
  clutchOnly,
}: {
  visible: boolean;
  cards: AbilityCard[];
  onSelect: (id: string | null) => void;
  onClose: () => void;
  clutchOnly?: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  // Round 5 (Clutch round): only clutch-tagged cards may be played
  const displayCards = clutchOnly ? cards.filter((c) => c.isClutch) : cards;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" transparent>
      <View style={[abStyles.overlay]}>
        <View style={[abStyles.sheet, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={abStyles.header}>
            <Text style={abStyles.title}>
              {clutchOnly ? "Select Clutch Card (Round 5)" : "Select Ability"}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={Colors.dark.text} />
            </Pressable>
          </View>
          {!clutchOnly && (
            <Pressable style={abStyles.noCard} onPress={() => { onSelect(null); onClose(); }}>
              <Feather name="x-circle" size={18} color={Colors.dark.textMuted} />
              <Text style={abStyles.noCardText}>Attack without ability</Text>
            </Pressable>
          )}
          {clutchOnly && displayCards.length === 0 && (
            <View style={abStyles.noCard}>
              <Feather name="alert-triangle" size={18} color={Colors.dark.textMuted} />
              <Text style={abStyles.noCardText}>No clutch cards — basic attack will be used</Text>
            </View>
          )}
          <ScrollView showsVerticalScrollIndicator={false}>
            {displayCards.map((card) => {
              const color = RARITY_COLORS[card.rarity] ?? "#888";
              return (
                <Pressable key={card.id} style={abStyles.card} onPress={() => { onSelect(card.id); onClose(); }}>
                  <View style={[abStyles.cardIcon, { backgroundColor: color + "22" }]}>
                    <Feather name="zap" size={18} color={color} />
                  </View>
                  <View style={abStyles.cardInfo}>
                    <Text style={abStyles.cardName}>{card.name}</Text>
                    <Text style={[abStyles.cardRarity, { color }]}>{card.rarity} — PWR {card.basePower}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.dark.disabled} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const abStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    maxHeight: "70%",
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  title: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  noCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    marginBottom: 4,
  },
  noCardText: { fontSize: 13, color: Colors.dark.textMuted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    borderRadius: 12,
    marginBottom: 6,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  cardRarity: { fontSize: 11, marginTop: 1 },
});

export default function BattleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const battleId = route.params?.battleId as string | undefined;
  const [showAbilityPicker, setShowAbilityPicker] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [lastTurn, setLastTurn] = useState<TurnResult | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const { data: battle, isLoading, refetch } = useQuery<BattleState>({
    queryKey: ["/api/arena/battles", battleId, "state"],
    queryFn: async () => {
      const url = new URL(`/api/arena/battles/${battleId}/state`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load battle");
      return res.json();
    },
    enabled: !!battleId,
    refetchInterval: 5000,
  });

  const { data: abilityData } = useQuery<{ cards: AbilityCard[] }>({
    queryKey: ["/api/arena/my-abilities"],
    queryFn: async () => {
      const url = new URL("/api/arena/my-abilities", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
  });

  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleAttack = useCallback(async (abilityCardId?: string | null) => {
    if (!battleId || battle?.hasSubmittedThisRound) return;
    setIsAttacking(true);
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const resp = await apiRequest("POST", `/api/arena/battles/${battleId}/turn`, {
        abilityCardId: abilityCardId ?? null,
      });
      const result: TurnResult = await resp.json();
      // Only show last-turn result when round has resolved (both players submitted)
      if (!result.waitingForOpponent) {
        setLastTurn(result);
        triggerShake();
        if (Platform.OS !== "web") Haptics.notificationAsync(
          result.result === "critical" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
        );
      }
      await refetch();

      if (result.battleComplete) {
        queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
        queryClient.invalidateQueries({ queryKey: ["/api/arena/battle-history"] });
      }
    } catch (err: any) {
      Alert.alert("Move failed", err?.message ?? "Try again");
    } finally {
      setIsAttacking(false);
    }
  }, [battleId, battle?.hasSubmittedThisRound, refetch, triggerShake, queryClient]);

  // When no battleId: show the player's active/pending battles so they can pick one.
  const { data: battlesData, isLoading: battlesLoading } = useQuery<{ battles: { id: string; status: string; initiatorId: string; opponentId: string; createdAt: string }[] }>({
    queryKey: ["/api/arena/battles"],
    queryFn: async () => {
      const url = new URL("/api/arena/battles", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) return { battles: [] };
      return res.json();
    },
    enabled: !battleId,
    refetchInterval: 10000,
  });

  if (!battleId) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.dark.backgroundRoot }}
        contentContainerStyle={{ paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl, paddingHorizontal: Spacing.lg }}
      >
        <Text style={[styles.noDataText, { marginBottom: Spacing.lg }]}>Your Active Battles</Text>
        {battlesLoading ? (
          <ActivityIndicator color={Colors.dark.primary} />
        ) : battlesData?.battles?.length ? (
          battlesData.battles.map((b) => (
            <Pressable
              key={b.id}
              style={{ backgroundColor: Colors.dark.backgroundElevated, borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.sm }}
              onPress={() => navigation.navigate("ArenaBattle", { battleId: b.id })}
            >
              <Text style={{ color: Colors.dark.text, fontWeight: "600" }}>
                {b.status === "pending" ? "Pending Challenge" : "Active Battle"}
              </Text>
              <Text style={{ color: Colors.dark.textSubtle, fontSize: 12, marginTop: 2 }}>Tap to enter</Text>
            </Pressable>
          ))
        ) : (
          <View style={styles.centered}>
            <Feather name="shield" size={36} color={Colors.dark.disabled} />
            <Text style={[styles.noDataText, { marginTop: Spacing.md }]}>No active battles</Text>
            <Text style={{ color: Colors.dark.textSubtle, fontSize: 13, textAlign: "center", marginTop: 4 }}>Challenge a rival from the Arena Hub</Text>
          </View>
        )}
        <Pressable style={[styles.backBtn, { marginTop: Spacing.lg }]} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Back to Hub</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.dark.primary} size="large" />
      </View>
    );
  }

  if (!battle) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noDataText}>Battle not found</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const initiatorColor = "#4DA3FF";
  const opponentColor = "#FF4D4D";
  const myName = battle.isInitiator ? battle.initiatorPlayer?.name : battle.opponentPlayer?.name;
  const oppName = battle.isInitiator ? battle.opponentPlayer?.name : battle.initiatorPlayer?.name;
  const myHp = battle.isInitiator ? battle.initiatorHp : battle.opponentHp;
  const oppHp = battle.isInitiator ? battle.opponentHp : battle.initiatorHp;
  const myColor = initiatorColor;
  const oppColor = opponentColor;
  const isClutch = myHp < 20 || oppHp < 20;
  const isComplete = battle.status === "completed";
  const iWon = isComplete && battle.winnerId === (battle.isInitiator ? battle.initiatorId : battle.opponentId);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: Spacing.lg,
          gap: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Battle status */}
        <View style={styles.statusRow}>
          {battle.isRanked && (
            <View style={styles.rankedBadge}>
              <Feather name="award" size={12} color={Colors.dark.primary} />
              <Text style={styles.rankedText}>RANKED</Text>
            </View>
          )}
          {isClutch && !isComplete && (
            <View style={styles.clutchBadge}>
              <Feather name="zap" size={12} color="#FF4D4D" />
              <Text style={styles.clutchText}>CLUTCH MODE</Text>
            </View>
          )}
          <View style={styles.roundBadge}>
            <Text style={styles.roundText}>Round {battle.currentRound}</Text>
          </View>
        </View>

        {/* HP Bars */}
        <View style={styles.hpSection}>
          {/* My HP */}
          <View style={styles.hpRow}>
            <Text style={styles.hpName} numberOfLines={1}>{myName ?? "You"}</Text>
            <HpBar hp={myHp} color={myColor} />
            <Text style={[styles.hpValue, { color: myColor }]}>{myHp}</Text>
          </View>

          <View style={styles.vsRow}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          {/* Opponent HP */}
          <Animated.View style={[styles.hpRow, { transform: [{ translateX: shakeAnim }] }]}>
            <Text style={styles.hpName} numberOfLines={1}>{oppName ?? "Opponent"}</Text>
            <HpBar hp={oppHp} color={oppColor} />
            <Text style={[styles.hpValue, { color: oppColor }]}>{oppHp}</Text>
          </Animated.View>
        </View>

        {/* Wager indicator */}
        {battle.wagerCoins > 0 && (
          <View style={styles.wagerCard}>
            <Feather name="dollar-sign" size={16} color="#FFD700" />
            <Text style={styles.wagerText}>Wager: {battle.wagerCoins} Glow Coins at stake</Text>
          </View>
        )}

        {/* Last turn result */}
        {lastTurn && (
          <View style={[styles.resultCard, lastTurn.result === "critical" && styles.resultCardCritical]}>
            <Text style={styles.resultTitle}>
              {lastTurn.result === "miss" ? "Miss!" : lastTurn.result === "critical" ? "CRITICAL HIT!" : "Hit!"}
            </Text>
            {lastTurn.damage > 0 && (
              <Text style={styles.resultDamage}>-{lastTurn.damage} HP</Text>
            )}
            {lastTurn.battleComplete && (
              <Text style={[styles.resultWinner, { color: iWon ? Colors.dark.primary : "#FF4D4D" }]}>
                {iWon ? "You Win!" : battle.winnerId ? "You Lost" : "Draw!"}
              </Text>
            )}
            {lastTurn.coinsAwarded !== undefined && lastTurn.coinsAwarded > 0 && (
              <Text style={styles.resultCoins}>+{lastTurn.coinsAwarded} Glow Coins</Text>
            )}
            {lastTurn.mmrDelta !== undefined && (
              <Text style={[styles.resultMmr, { color: (lastTurn.mmrDelta ?? 0) >= 0 ? Colors.dark.success : Colors.dark.error }]}>
                {(lastTurn.mmrDelta ?? 0) >= 0 ? "+" : ""}{lastTurn.mmrDelta} MMR
              </Text>
            )}
          </View>
        )}

        {/* Battle complete banner */}
        {isComplete && !lastTurn?.battleComplete && (
          <View style={styles.completeBanner}>
            <Feather name={iWon ? "award" : "x-circle"} size={28} color={iWon ? Colors.dark.primary : "#FF4D4D"} />
            <Text style={[styles.completeBannerText, { color: iWon ? Colors.dark.primary : "#FF4D4D" }]}>
              {iWon ? "Victory!" : battle.winnerId ? "Defeated" : "Draw!"}
            </Text>
          </View>
        )}

        {/* Turn log */}
        {battle.turns.length > 0 && (
          <View style={styles.logSection}>
            <Text style={styles.logTitle}>Battle Log</Text>
            <TurnLog turns={battle.turns} initiatorId={battle.initiatorId} />
          </View>
        )}

        {/* Pending battle — waiting for acceptance */}
        {battle.status === "pending" && (
          <View style={styles.pendingCard}>
            <ActivityIndicator color={Colors.dark.primary} />
            <Text style={styles.pendingText}>Waiting for {oppName ?? "opponent"} to accept...</Text>
          </View>
        )}
      </ScrollView>

      {/* Attack Button */}
      {battle.status === "active" && !isComplete && (
        <View style={[styles.attackBar, { paddingBottom: insets.bottom + Spacing.md }]}>
          {battle.waitingForOpponent ? (
            <View style={styles.submittedRow}>
              <Feather name="check-circle" size={18} color={Colors.dark.primary} />
              <Text style={styles.submittedText}>Move submitted — waiting for opponent</Text>
            </View>
          ) : battle.isMyTurn ? (
            <View style={styles.attackRow}>
              <Pressable
                style={styles.abilityBtn}
                onPress={() => setShowAbilityPicker(true)}
                disabled={isAttacking}
              >
                <Feather name="zap" size={18} color={Colors.dark.primary} />
              </Pressable>
              <Pressable
                style={[styles.attackBtn, isAttacking && { opacity: 0.6 }]}
                onPress={() => handleAttack(null)}
                disabled={isAttacking}
              >
                {isAttacking ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <>
                    <Feather name="crosshair" size={18} color="#000" />
                    <Text style={styles.attackBtnText}>Submit Move</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.waitingRow}>
              <ActivityIndicator color={Colors.dark.primary} size="small" />
              <Text style={styles.waitingText}>Waiting for opponent...</Text>
            </View>
          )}
        </View>
      )}

      {/* Post-battle buttons */}
      {isComplete && (
        <View style={[styles.attackBar, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable style={styles.attackBtn} onPress={() => navigation.goBack()}>
            <Feather name="home" size={16} color="#000" />
            <Text style={styles.attackBtnText}>Back to Arena</Text>
          </Pressable>
        </View>
      )}

      <AbilityPicker
        visible={showAbilityPicker}
        cards={abilityData?.cards ?? []}
        onSelect={(id) => handleAttack(id)}
        onClose={() => setShowAbilityPicker(false)}
        clutchOnly={battle?.isClutchRound ?? false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    gap: Spacing.md,
  },
  noDataText: {
    color: Colors.dark.textMuted,
    fontSize: 15,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 10,
    marginTop: 8,
  },
  backBtnText: {
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  statusRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  rankedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(200,255,61,0.12)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.25)",
  },
  rankedText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
  clutchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,77,77,0.12)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.3)",
  },
  clutchText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FF4D4D",
    letterSpacing: 0.5,
  },
  roundBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roundText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  hpSection: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  hpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  hpName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    width: 80,
  },
  hpValue: {
    fontSize: 14,
    fontWeight: "800",
    width: 32,
    textAlign: "right",
  },
  vsRow: {
    alignItems: "center",
  },
  vsText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.textMuted,
    letterSpacing: 2,
  },
  wagerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,215,0,0.10)",
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.25)",
  },
  wagerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFD700",
  },
  resultCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  resultCardCritical: {
    borderColor: "rgba(255,215,0,0.5)",
    backgroundColor: "rgba(255,215,0,0.05)",
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  resultDamage: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FF4D4D",
  },
  resultWinner: {
    fontSize: 22,
    fontWeight: "800",
  },
  resultCoins: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  resultMmr: {
    fontSize: 14,
    fontWeight: "700",
  },
  completeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  completeBannerText: {
    fontSize: 24,
    fontWeight: "800",
  },
  logSection: {
    gap: Spacing.sm,
  },
  logTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  pendingText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  attackBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.borderSubtle,
  },
  attackRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  abilityBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  attackBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  attackBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000",
  },
  waitingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  waitingText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  submittedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    justifyContent: "center",
    paddingVertical: Spacing.md,
    backgroundColor: "rgba(200,255,61,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
  },
  submittedText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
});
