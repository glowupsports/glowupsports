import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Mission {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "claimed" | "expired";
  currentProgress: number;
  targetProgress: number;
  rewardType: string;
  rewardValue: string;
  expiresAt: string;
  completedAt: string | null;
  claimedAt: string | null;
  targetAction: string | null;
}

interface LoginStreakData {
  awarded: boolean;
  currentStreak: number;
  totalLoginDays: number;
  coinsAwarded: number;
  milestone: string | null;
  nextMilestoneDay: number;
}

interface ShopCard {
  id: string;
  name: string;
  type: string;
  rarity: string;
  basePower: number;
  description: string | null;
  price: number;
  alreadyBought: boolean;
}

interface ShopData {
  cards: ShopCard[];
  glowCoins: number;
}

interface ChallengeTier {
  tier: string;
  label: string;
  reward: string;
  claimed: boolean;
  coinsReward: number;
}

interface DailyChallengeData {
  card: {
    id: string;
    name: string;
    description: string | null;
    rarity: string;
    basePower: number;
  } | null;
  tiers: ChallengeTier[];
  date: string;
}

const RARITY_COLORS: Record<string, string> = {
  common: "#888888",
  uncommon: "#CD7F32",
  rare: "#4DA3FF",
  epic: "#C040FB",
  legendary: "#FFD700",
};

const LOGIN_MILESTONES = [
  { day: 1, label: "Day 1", reward: "50 coins" },
  { day: 3, label: "Day 3", reward: "100 coins" },
  { day: 7, label: "Day 7", reward: "Free Pack" },
  { day: 14, label: "Day 14", reward: "500 coins" },
  { day: 30, label: "Day 30", reward: "Silver Frame" },
  { day: 90, label: "Day 90", reward: "Legendary" },
  { day: 365, label: "Day 365", reward: "Diamond" },
];

const TIER_ICONS: Record<string, "target" | "package" | "zap"> = {
  easy: "target",
  medium: "package",
  hard: "zap",
};

const TIER_COLORS: Record<string, string> = {
  easy: "#4DA3FF",
  medium: "#C8FF3D",
  hard: "#FFD700",
};

function CardOfTheDaySection({
  data,
  onClaim,
  claiming,
}: {
  data: DailyChallengeData;
  onClaim: (tier: string) => void;
  claiming: string | null;
}) {
  const { card, tiers } = data;
  const rarityColor = card ? (RARITY_COLORS[card.rarity] ?? RARITY_COLORS.common) : "#888";

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Card of the Day</Text>

      {/* Featured card */}
      <View style={[styles.featuredCard, { borderColor: rarityColor + "66" }]}>
        <View style={[styles.featuredCardIcon, { backgroundColor: rarityColor + "22" }]}>
          <Feather name="star" size={32} color={rarityColor} />
        </View>
        <View style={styles.featuredCardInfo}>
          {card ? (
            <>
              <Text style={[styles.featuredCardName, { color: rarityColor }]}>{card.name}</Text>
              <Text style={[styles.featuredCardRarity, { color: rarityColor }]}>
                {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)} Ability Card
              </Text>
              {card.description ? (
                <Text style={styles.featuredCardDesc} numberOfLines={2}>{card.description}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.featuredCardName}>No card available today</Text>
          )}
        </View>
      </View>

      {/* Difficulty tiers */}
      <View style={styles.tierList}>
        {tiers.map((t) => {
          const color = TIER_COLORS[t.tier] ?? "#888";
          const icon = TIER_ICONS[t.tier] ?? "target";
          const isClaiming = claiming === t.tier;

          return (
            <View
              key={t.tier}
              style={[
                styles.tierRow,
                t.claimed && styles.tierRowClaimed,
                { borderColor: t.claimed ? "transparent" : color + "44" },
              ]}
            >
              <View style={[styles.tierIconBg, { backgroundColor: color + "22" }]}>
                <Feather name={icon} size={16} color={t.claimed ? Colors.dark.disabled : color} />
              </View>
              <View style={styles.tierInfo}>
                <Text style={[styles.tierLabel, t.claimed && styles.tierLabelClaimed]}>
                  {t.label}
                </Text>
                <Text style={styles.tierReward}>{t.reward}</Text>
              </View>
              {t.claimed ? (
                <View style={styles.tierClaimedBadge}>
                  <Feather name="check" size={12} color={Colors.dark.success} />
                  <Text style={styles.tierClaimedText}>Claimed</Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.tierClaimBtn, { backgroundColor: color }]}
                  onPress={() => !isClaiming && onClaim(t.tier)}
                  disabled={isClaiming}
                >
                  {isClaiming ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.tierClaimBtnText}>Claim</Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MissionCard({ mission, onClaim }: { mission: Mission; onClaim: (id: string) => void }) {
  const progress = mission.targetProgress > 0
    ? Math.min(1, mission.currentProgress / mission.targetProgress)
    : 0;
  const pct = Math.round(progress * 100);

  const statusColor =
    mission.status === "claimed" ? Colors.dark.disabled
    : mission.status === "completed" ? Colors.dark.primary
    : Colors.dark.text;

  const rewardLabel = mission.rewardType === "coins"
    ? `${mission.rewardValue} Glow Coins`
    : mission.rewardType === "pack"
    ? "Pack Reward"
    : "Ability Card";

  const daysLeft = Math.max(0, Math.ceil(
    (new Date(mission.expiresAt).getTime() - Date.now()) / 86400000,
  ));

  return (
    <View style={[
      styles.missionCard,
      mission.status === "claimed" && styles.missionCardClaimed,
      mission.status === "completed" && styles.missionCardCompleted,
    ]}>
      <View style={styles.missionHeader}>
        <View style={styles.missionTitleRow}>
          <Text style={[styles.missionName, { color: statusColor }]} numberOfLines={1}>
            {mission.name ?? "Mission"}
          </Text>
          {mission.status === "claimed" && (
            <View style={styles.claimedBadge}>
              <Feather name="check" size={10} color={Colors.dark.success} />
              <Text style={styles.claimedText}>Claimed</Text>
            </View>
          )}
        </View>
        {mission.description ? (
          <Text style={styles.missionDesc}>{mission.description}</Text>
        ) : null}
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${pct}%`,
                backgroundColor: mission.status === "completed" ? Colors.dark.primary : "#4DA3FF",
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {mission.currentProgress}/{mission.targetProgress}
        </Text>
      </View>

      <View style={styles.missionFooter}>
        <View style={styles.rewardPill}>
          <Feather name="gift" size={11} color={Colors.dark.primary} />
          <Text style={styles.rewardPillText}>{rewardLabel}</Text>
        </View>

        {daysLeft > 0 && mission.status !== "claimed" ? (
          <Text style={styles.expiryText}>{daysLeft}d left</Text>
        ) : null}

        {mission.status === "completed" && !mission.claimedAt ? (
          <Pressable style={styles.claimButton} onPress={() => onClaim(mission.id)}>
            <Text style={styles.claimButtonText}>Claim</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ShopCardItem({
  card,
  coins,
  onBuy,
}: {
  card: ShopCard;
  coins: number;
  onBuy: (id: string, price: number) => void;
}) {
  const color = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.common;
  const canAfford = coins >= card.price;

  return (
    <View style={[styles.shopCard, { borderColor: color + "55" }]}>
      <View style={[styles.shopCardIcon, { backgroundColor: color + "22" }]}>
        <Feather name="zap" size={22} color={color} />
      </View>
      <View style={styles.shopCardInfo}>
        <Text style={styles.shopCardName}>{card.name}</Text>
        <Text style={[styles.shopCardRarity, { color }]}>{card.rarity}</Text>
        {card.description ? (
          <Text style={styles.shopCardDesc} numberOfLines={1}>{card.description}</Text>
        ) : null}
      </View>
      <Pressable
        style={[
          styles.shopBuyBtn,
          (!canAfford || card.alreadyBought) && styles.shopBuyBtnDisabled,
        ]}
        onPress={() => (canAfford && !card.alreadyBought) ? onBuy(card.id, card.price) : undefined}
        disabled={!canAfford || card.alreadyBought}
      >
        {card.alreadyBought ? (
          <Feather name="check" size={13} color={Colors.dark.success} />
        ) : (
          <>
            <Feather name="zap" size={11} color={canAfford ? "#000" : Colors.dark.disabled} />
            <Text style={[styles.shopBuyText, !canAfford && { color: Colors.dark.disabled }]}>
              {card.price}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export default function DailyChallengeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  const { data: challengeData, refetch: refetchChallenge } = useQuery<DailyChallengeData>({
    queryKey: ["/api/arena/daily-challenge"],
  });

  const { data: missionsData, isLoading: missionsLoading, refetch: refetchMissions, isRefetching } = useQuery<{ missions: Mission[] }>({
    queryKey: ["/api/arena/missions"],
  });

  const { data: shopData, refetch: refetchShop } = useQuery<ShopData>({
    queryKey: ["/api/arena/shop"],
  });

  const { data: loginData } = useQuery<LoginStreakData>({
    queryKey: ["/api/arena/login-reward"],
  });

  const handleChallengeClaim = useCallback(async (tier: string) => {
    if (claiming) return;
    setClaiming(tier);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const url = new URL("/api/arena/daily-challenge/claim", getApiUrl());
      const res = await apiRequest("POST", url.pathname, { tier });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to claim");
      queryClient.invalidateQueries({ queryKey: ["/api/arena/daily-challenge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error("[DailyChallenge] tier claim:", err);
    } finally {
      setClaiming(null);
    }
  }, [claiming, queryClient]);

  const handleClaim = useCallback(async (missionId: string) => {
    if (claiming) return;
    setClaiming(missionId);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const url = new URL(`/api/arena/missions/${missionId}/claim`, getApiUrl());
      const res = await apiRequest("POST", url.pathname);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to claim");
      queryClient.invalidateQueries({ queryKey: ["/api/arena/missions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error("[DailyChallenge] claim:", err);
    } finally {
      setClaiming(null);
    }
  }, [claiming, queryClient]);

  const handleBuy = useCallback(async (cardId: string, _price: number) => {
    if (buying) return;
    setBuying(cardId);
    try {
      const url = new URL("/api/arena/shop/buy", getApiUrl());
      const res = await apiRequest("POST", url.pathname, { cardId });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to buy");
      queryClient.invalidateQueries({ queryKey: ["/api/arena/shop"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error("[DailyChallenge] buy:", err);
    } finally {
      setBuying(null);
    }
  }, [buying, queryClient]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchChallenge(), refetchMissions(), refetchShop()]);
  }, [refetchChallenge, refetchMissions, refetchShop]);

  const missions = missionsData?.missions ?? [];
  const shopCards = shopData?.cards ?? [];
  const coins = shopData?.glowCoins ?? 0;

  const streak = loginData?.currentStreak ?? 0;
  const totalDays = loginData?.totalLoginDays ?? 0;
  const nextMilestone = loginData?.nextMilestoneDay ?? 7;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.dark.primary} />
      }
    >
      {/* Card of the Day */}
      {challengeData ? (
        <CardOfTheDaySection
          data={challengeData}
          onClaim={handleChallengeClaim}
          claiming={claiming}
        />
      ) : null}

      {/* Login Streak */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily Login Streak</Text>
        <View style={styles.streakCard}>
          <View style={styles.streakNumbers}>
            <View style={styles.streakStat}>
              <Text style={[styles.streakValue, { color: Colors.dark.primary }]}>{streak}</Text>
              <Text style={styles.streakLabel}>Current Streak</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakStat}>
              <Text style={[styles.streakValue, { color: "#4DA3FF" }]}>{totalDays}</Text>
              <Text style={styles.streakLabel}>Total Days</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakStat}>
              <Text style={[styles.streakValue, { color: "#FFD700" }]}>{nextMilestone}</Text>
              <Text style={styles.streakLabel}>Next Milestone</Text>
            </View>
          </View>

          {loginData?.awarded ? (
            <View style={styles.rewardBanner}>
              <Feather name="zap" size={14} color={Colors.dark.primary} />
              <Text style={styles.rewardBannerText}>
                +{loginData.coinsAwarded} Glow Coins today
                {loginData.milestone ? ` · ${loginData.milestone}` : ""}
              </Text>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.milestoneScroll}>
            <View style={styles.milestoneRow}>
              {LOGIN_MILESTONES.map((m, idx) => {
                const reached = totalDays >= m.day;
                const current = totalDays < m.day &&
                  (idx === 0 || totalDays >= LOGIN_MILESTONES[idx - 1].day);
                return (
                  <View key={m.day} style={styles.milestoneItem}>
                    {idx > 0 ? (
                      <View style={[styles.milestoneConnector, reached && styles.milestoneConnectorReached]} />
                    ) : null}
                    <View style={[
                      styles.milestoneDot,
                      reached && styles.milestoneDotReached,
                      current && styles.milestoneDotCurrent,
                    ]}>
                      {reached ? <Feather name="check" size={8} color="#000" /> : null}
                    </View>
                    <Text style={[styles.milestoneDotLabel, { color: reached ? Colors.dark.primary : Colors.dark.disabled }]}>
                      D{m.day}
                    </Text>
                    <Text style={[styles.milestoneReward, { color: reached ? Colors.dark.textMuted : Colors.dark.disabled }]}>
                      {m.reward}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Weekly Missions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly Card Missions</Text>
        {missionsLoading ? (
          <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: Spacing.lg }} />
        ) : missions.length === 0 ? (
          <View style={styles.emptyMissions}>
            <Feather name="target" size={36} color={Colors.dark.disabled} />
            <Text style={styles.emptyText}>No missions this week yet</Text>
            <Text style={styles.emptySubtext}>Check back after opening a pack</Text>
          </View>
        ) : (
          <View style={styles.missionList}>
            {missions.map((m) => (
              <MissionCard key={m.id} mission={m} onClaim={handleClaim} />
            ))}
          </View>
        )}
      </View>

      {/* Daily Shop */}
      <View style={styles.section}>
        <View style={styles.shopHeader}>
          <Text style={styles.sectionTitle}>Card Shop</Text>
          <View style={styles.coinsChip}>
            <Feather name="zap" size={12} color={Colors.dark.primary} />
            <Text style={styles.coinsChipText}>{coins} coins</Text>
          </View>
        </View>
        <Text style={styles.shopSubtitle}>Rotates daily — 1 purchase per card per day</Text>

        {shopCards.length === 0 ? (
          <View style={styles.emptyMissions}>
            <Feather name="shopping-bag" size={36} color={Colors.dark.disabled} />
            <Text style={styles.emptyText}>Shop is loading</Text>
          </View>
        ) : (
          <View style={styles.shopList}>
            {shopCards.map((card) => (
              <ShopCardItem key={card.id} card={card} coins={coins} onBuy={handleBuy} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  featuredCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  featuredCardIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredCardInfo: {
    flex: 1,
    gap: 3,
  },
  featuredCardName: {
    fontSize: 16,
    fontWeight: "800",
  },
  featuredCardRarity: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  featuredCardDesc: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  tierList: {
    gap: Spacing.sm,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  tierRowClaimed: {
    backgroundColor: Colors.dark.backgroundSecondary,
    opacity: 0.7,
  },
  tierIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tierInfo: {
    flex: 1,
    gap: 2,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  tierLabelClaimed: {
    color: Colors.dark.disabled,
  },
  tierReward: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  tierClaimedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,200,83,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierClaimedText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.success,
  },
  tierClaimBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  tierClaimBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
  streakCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: Spacing.md,
  },
  streakNumbers: {
    flexDirection: "row",
  },
  streakStat: {
    flex: 1,
    alignItems: "center",
  },
  streakValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  streakLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  streakDivider: {
    width: 1,
    backgroundColor: Colors.dark.divider,
    marginVertical: 4,
  },
  rewardBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(200,255,61,0.10)",
    borderRadius: 10,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.2)",
  },
  rewardBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
    flex: 1,
  },
  milestoneScroll: {
    marginTop: Spacing.sm,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  milestoneItem: {
    alignItems: "center",
    width: 52,
    position: "relative",
  },
  milestoneConnector: {
    position: "absolute",
    left: -26,
    top: 9,
    width: 52,
    height: 2,
    backgroundColor: Colors.dark.borderSubtle,
  },
  milestoneConnectorReached: {
    backgroundColor: Colors.dark.primary,
  },
  milestoneDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  milestoneDotReached: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  milestoneDotCurrent: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
  },
  milestoneDotLabel: {
    fontSize: 9,
    fontWeight: "700",
  },
  milestoneReward: {
    fontSize: 8,
    textAlign: "center",
  },
  missionList: {
    gap: Spacing.sm,
  },
  missionCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: Spacing.sm,
  },
  missionCardClaimed: {
    opacity: 0.6,
  },
  missionCardCompleted: {
    borderColor: "rgba(200,255,61,0.3)",
  },
  missionHeader: {
    gap: 4,
  },
  missionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  missionName: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  claimedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,200,83,0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  claimedText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.success,
  },
  missionDesc: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    minWidth: 36,
    textAlign: "right",
  },
  missionFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(200,255,61,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flex: 1,
  },
  rewardPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  expiryText: {
    fontSize: 11,
    color: Colors.dark.disabled,
  },
  claimButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  claimButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
  emptyMissions: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.dark.disabled,
  },
  shopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  shopSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  coinsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(200,255,61,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  coinsChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  shopList: {
    gap: Spacing.sm,
  },
  shopCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  shopCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  shopCardInfo: {
    flex: 1,
    gap: 2,
  },
  shopCardName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  shopCardRarity: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  shopCardDesc: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  shopBuyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 56,
    justifyContent: "center",
  },
  shopBuyBtnDisabled: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  shopBuyText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
});
