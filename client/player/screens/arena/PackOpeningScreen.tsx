import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Pack {
  id: string;
  name: string;
  description: string;
  price: number;
  cardCount: number;
  oddsCommon: number;
  oddsUncommon: number;
  oddsRare: number;
  oddsEpic: number;
  oddsLegendary: number;
}

interface PacksData {
  packs: Pack[];
  glowCoins: number;
  pityProgress: number;
}

interface RevealedCard {
  type: "player" | "coach" | "ability";
  card: Record<string, unknown>;
  isFirstEdition: boolean;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

const RARITY_COLORS: Record<string, string> = {
  common: "#888888",
  uncommon: "#CD7F32",
  rare: "#4DA3FF",
  epic: "#C040FB",
  legendary: "#FFD700",
};

const RARITY_GLOW: Record<string, string> = {
  common: "rgba(136,136,136,0.3)",
  uncommon: "rgba(205,127,50,0.4)",
  rare: "rgba(77,163,255,0.4)",
  epic: "rgba(192,64,251,0.5)",
  legendary: "rgba(255,215,0,0.6)",
};

function PackCard({ pack, coins, onOpen }: { pack: Pack; coins: number; onOpen: (id: string) => void }) {
  const canAfford = coins >= pack.price;

  const rarityColor = pack.price >= 500 ? RARITY_COLORS.legendary
    : pack.price >= 150 ? RARITY_COLORS.epic
    : pack.price >= 75 ? RARITY_COLORS.rare
    : RARITY_COLORS.uncommon;

  return (
    <View style={[styles.packCard, { borderColor: rarityColor + "66" }]}>
      <View style={[styles.packIconWrap, { backgroundColor: rarityColor + "22" }]}>
        <Feather name="package" size={32} color={rarityColor} />
      </View>
      <View style={styles.packInfo}>
        <Text style={styles.packName}>{pack.name}</Text>
        <Text style={styles.packDesc}>{pack.description}</Text>
        <View style={styles.packOddsRow}>
          <OddsChip label="C" color={RARITY_COLORS.common} pct={pack.oddsCommon} />
          <OddsChip label="U" color={RARITY_COLORS.uncommon} pct={pack.oddsUncommon} />
          <OddsChip label="R" color={RARITY_COLORS.rare} pct={pack.oddsRare} />
          <OddsChip label="E" color={RARITY_COLORS.epic} pct={pack.oddsEpic} />
          <OddsChip label="L" color={RARITY_COLORS.legendary} pct={pack.oddsLegendary} />
        </View>
      </View>
      <Pressable
        style={[styles.openButton, !canAfford && styles.openButtonDisabled]}
        onPress={() => canAfford && onOpen(pack.id)}
      >
        <Feather name="zap" size={13} color={canAfford ? "#000" : Colors.dark.disabled} />
        <Text style={[styles.openButtonText, !canAfford && { color: Colors.dark.disabled }]}>
          {pack.price}
        </Text>
      </Pressable>
    </View>
  );
}

function OddsChip({ label, color, pct }: { label: string; color: string; pct: number }) {
  if (pct === 0) return null;
  return (
    <View style={[styles.oddsChip, { borderColor: color + "55" }]}>
      <Text style={[styles.oddsLabel, { color }]}>{label}</Text>
      <Text style={styles.oddsPct}>{pct}%</Text>
    </View>
  );
}

function RevealCard({ card: revCard, index, total }: { card: RevealedCard; index: number; total: number }) {
  const color = RARITY_COLORS[revCard.rarity] ?? RARITY_COLORS.common;
  const glow = RARITY_GLOW[revCard.rarity] ?? RARITY_GLOW.common;
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const handleFlip = useCallback(() => {
    if (flipped) return;
    Animated.timing(flipAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setFlipped(true));
    if (Platform.OS !== "web") {
      Haptics.impactAsync(
        revCard.rarity === "legendary" ? Haptics.ImpactFeedbackStyle.Heavy
          : revCard.rarity === "epic" ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light,
      );
    }
  }, [flipped, flipAnim, revCard.rarity]);

  const rotateY = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["0deg", "90deg", "0deg"],
  });

  const scale = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1],
  });

  const cardName = revCard.card?.playerName ?? revCard.card?.coachName ?? revCard.card?.name ?? "Unknown";

  return (
    <Pressable onPress={handleFlip}>
      <Animated.View style={[
        styles.revealCard,
        { borderColor: color, shadowColor: glow, transform: [{ rotateY }, { scale }] },
      ]}>
        {!flipped ? (
          <View style={[styles.revealCardBack, { backgroundColor: color + "22" }]}>
            <Feather name="package" size={40} color={color} />
            <Text style={[styles.tapText, { color }]}>Tap to reveal</Text>
            <Text style={styles.cardCounter}>{index + 1} / {total}</Text>
          </View>
        ) : (
          <View style={styles.revealCardFront}>
            <View style={[styles.rarityBadge, { backgroundColor: color + "33", borderColor: color }]}>
              <Text style={[styles.rarityBadgeText, { color }]}>
                {revCard.rarity.toUpperCase()}
              </Text>
              {revCard.isFirstEdition && (
                <Text style={styles.feStamp}>1st Ed.</Text>
              )}
            </View>
            <View style={[styles.cardTypeIcon, { backgroundColor: color + "22" }]}>
              <Feather
                name={revCard.type === "player" ? "user" : revCard.type === "coach" ? "briefcase" : "zap"}
                size={28}
                color={color}
              />
            </View>
            <Text style={styles.revealCardName} numberOfLines={2}>{String(cardName ?? "")}</Text>
            <Text style={styles.revealCardType}>{revCard.type} card</Text>
            {revCard.card?.statPower != null ? (
              <View style={styles.miniStatsRow}>
                <MiniStat label="PWR" value={Number(revCard.card.statPower)} color="#FF4D4D" />
                <MiniStat label="TEC" value={Number(revCard.card.statTechnique)} color="#4DA3FF" />
                <MiniStat label="MEN" value={Number(revCard.card.statMental)} color="#C8FF3D" />
                <MiniStat label="TAC" value={Number(revCard.card.statTactics)} color="#FFD700" />
              </View>
            ) : null}
            {revCard.card?.basePower != null ? (
              <View style={styles.abilityPower}>
                <Feather name="zap" size={12} color={color} />
                <Text style={[styles.abilityPowerText, { color }]}>{Number(revCard.card.basePower)} Power</Text>
              </View>
            ) : null}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

export default function PackOpeningScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [revealedCards, setRevealedCards] = useState<RevealedCard[] | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [remainingCoins, setRemainingCoins] = useState<number | null>(null);

  const { data, isLoading } = useQuery<PacksData>({
    queryKey: ["/api/arena/packs/available"],
  });

  const handleOpenPack = useCallback(async (packId: string) => {
    if (opening) return;
    setOpening(true);

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const url = new URL("/api/arena/packs/open", getApiUrl());
      const response = await apiRequest("POST", url.pathname, { packId });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error ?? "Failed to open pack");

      setRevealedCards(result.cards);
      setRemainingCoins(result.remainingCoins);
      setShowReveal(true);

      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/packs/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/collection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/missions"] });
    } catch (err) {
      console.error("[PackOpening]", err);
    } finally {
      setOpening(false);
    }
  }, [opening, queryClient]);

  const handleDoneReveal = useCallback(() => {
    setShowReveal(false);
    setRevealedCards(null);
  }, []);

  const coins = remainingCoins ?? data?.glowCoins ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.coinsRow}>
            <Feather name="zap" size={16} color={Colors.dark.primary} />
            <Text style={styles.coinsText}>{coins} Glow Coins</Text>
          </View>
          {data?.pityProgress != null && data.pityProgress > 0 && (
            <View style={styles.pityRow}>
              <Text style={styles.pityText}>
                Legendary pity: {data.pityProgress}/10
              </Text>
              <View style={styles.pityBar}>
                <View style={[styles.pityFill, { width: `${(data.pityProgress / 10) * 100}%` }]} />
              </View>
            </View>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 60 }} />
        ) : (
          <View style={styles.packList}>
            {(data?.packs ?? []).map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                coins={coins}
                onOpen={handleOpenPack}
              />
            ))}
          </View>
        )}

        {opening && (
          <View style={styles.openingOverlay}>
            <ActivityIndicator color={Colors.dark.primary} size="large" />
            <Text style={styles.openingText}>Opening pack...</Text>
          </View>
        )}
      </ScrollView>

      {/* Reveal Modal */}
      <Modal visible={showReveal} animationType="fade" presentationStyle="fullScreen">
        <View style={[styles.revealModal, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + Spacing.xl }]}>
          <Text style={styles.revealTitle}>Pack Opened!</Text>
          <Text style={styles.revealSubtitle}>Tap each card to reveal</Text>

          <ScrollView
            contentContainerStyle={styles.revealGrid}
            showsVerticalScrollIndicator={false}
          >
            {(revealedCards ?? []).map((card, i) => (
              <RevealCard key={i} card={card} index={i} total={revealedCards?.length ?? 0} />
            ))}
          </ScrollView>

          <Pressable style={styles.doneButton} onPress={handleDoneReveal}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  coinsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "rgba(200,255,61,0.10)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
  },
  coinsText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  pityRow: {
    gap: 6,
  },
  pityText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  pityBar: {
    height: 4,
    backgroundColor: "rgba(255,215,0,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  pityFill: {
    height: "100%",
    backgroundColor: "#FFD700",
    borderRadius: 2,
  },
  packList: {
    gap: Spacing.md,
  },
  packCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  packIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  packInfo: {
    flex: 1,
    gap: 4,
  },
  packName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  packDesc: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  packOddsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
    flexWrap: "wrap",
  },
  oddsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  oddsLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  oddsPct: {
    fontSize: 9,
    color: Colors.dark.textMuted,
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 64,
    justifyContent: "center",
  },
  openButtonDisabled: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000",
  },
  openingOverlay: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  openingText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  revealModal: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  revealTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.dark.primary,
    marginBottom: 4,
  },
  revealSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xl,
  },
  revealGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  revealCard: {
    width: 150,
    height: 210,
    borderRadius: 14,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  revealCardBack: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  tapText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardCounter: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  revealCardFront: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
    gap: 6,
  },
  rarityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  rarityBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  feStamp: {
    fontSize: 8,
    fontWeight: "700",
    color: "#FFD700",
  },
  cardTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  revealCardName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  revealCardType: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    textTransform: "capitalize",
  },
  miniStatsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  miniStat: {
    alignItems: "center",
  },
  miniStatValue: {
    fontSize: 11,
    fontWeight: "800",
  },
  miniStatLabel: {
    fontSize: 8,
    color: Colors.dark.textMuted,
  },
  abilityPower: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  abilityPowerText: {
    fontSize: 11,
    fontWeight: "700",
  },
  doneButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 160,
    alignItems: "center",
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
});
