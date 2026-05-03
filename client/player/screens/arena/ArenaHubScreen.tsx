import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Animated,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight, HeaderButton } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Spacing } from "@/constants/theme";
import ChampionCard from "@/player/components/arena/ChampionCard";
import { apiRequest } from "@/lib/query-client";

const ARENA_INTRO_SEEN_KEY = "@glow_arena_intro_seen_v1";

interface Mission {
  id: string;
  name: string;
  status: "active" | "completed" | "claimed";
  currentProgress: number;
  targetProgress: number;
}

interface LoginReward {
  awarded: boolean;
  currentStreak: number;
  totalLoginDays: number;
  coinsAwarded: number;
  milestone: string | null;
}

interface ShopPreviewCard {
  id: string;
  name: string;
  rarity: string;
  price: number;
}

interface HubData {
  card: {
    rarityTier: string;
    rarityLabel: string;
    rarityMarker: string;
    statPower: number;
    statTechnique: number;
    statMental: number;
    statTactics: number;
    arenaMmr: number;
    arenaWins: number;
    arenaLosses: number;
    streakSnapshot: number;
  } | null;
  player: {
    name: string;
    profilePhotoUrl?: string | null;
    level?: number;
    streak?: number;
  } | null;
  arenaRecord: { wins: number; losses: number; mmr: number };
  activeSeason: { name: string; endDate: string } | null;
  glowCoins: number;
  collectedCount: number;
  loginReward: LoginReward | null;
  missions: Mission[];
  shopPreview: ShopPreviewCard[];
  features: { battleUnlocked: boolean; collectionUnlocked: boolean; packShopUnlocked: boolean };
}

const RARITY_COLORS: Record<string, string> = {
  common: "#888888", uncommon: "#CD7F32", rare: "#4DA3FF", epic: "#C040FB", legendary: "#FFD700",
};

// ── Login Reward Modal ─────────────────────────────────────────────────────────
function LoginRewardModal({
  reward,
  onDismiss,
}: {
  reward: LoginReward;
  onDismiss: () => void;
}) {
  const scale = new Animated.Value(0.8);
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 7 }).start();
  }, []);

  return (
    <Modal visible animationType="fade" transparent>
      <View style={rewardStyles.overlay}>
        <Animated.View style={[rewardStyles.modal, { transform: [{ scale }] }]}>
          <View style={rewardStyles.coinIcon}>
            <Feather name="zap" size={36} color={Colors.dark.primary} />
          </View>
          <Text style={rewardStyles.title}>Daily Login Reward</Text>
          <Text style={rewardStyles.streakText}>
            Day {reward.totalLoginDays} streak
          </Text>
          <Text style={rewardStyles.coinsText}>+{reward.coinsAwarded} Glow Coins</Text>
          {reward.milestone && (
            <View style={rewardStyles.milestoneBanner}>
              <Feather name="award" size={14} color="#FFD700" />
              <Text style={rewardStyles.milestoneText}>{reward.milestone}</Text>
            </View>
          )}
          <Pressable style={rewardStyles.doneBtn} onPress={onDismiss}>
            <Text style={rewardStyles.doneBtnText}>Collect</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const rewardStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.3)",
  },
  coinIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(200,255,61,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(200,255,61,0.3)",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  streakText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  coinsText: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  milestoneBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,215,0,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.3)",
  },
  milestoneText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFD700",
  },
  doneBtn: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: Spacing.sm,
    minWidth: 140,
    alignItems: "center",
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
});

// ── Arena Intro Modal ──────────────────────────────────────────────────────────
const INTRO_SECTIONS = [
  {
    icon: "zap" as const,
    color: Colors.dark.primary,
    title: "What is the Glow Arena?",
    body: "The Arena is your competitive battleground. Collect Champion Cards, battle other players, and climb the MMR leaderboard each season.",
  },
  {
    icon: "credit-card" as const,
    color: "#C040FB",
    title: "Champion Cards",
    body: "Your Champion Card reflects your real tennis stats — Power, Technique, Mental and Tactics. Sync it regularly to keep your card strong.",
  },
  {
    icon: "package" as const,
    color: "#4DA3FF",
    title: "Pack Shop & Collection",
    body: "Spend Glow Coins in the Pack Shop to open card packs and grow your collection. Rarer cards give you a tactical edge in battles.",
  },
  {
    icon: "crosshair" as const,
    color: "#FF6B35",
    title: "Quick Draw & Battles",
    body: "Challenge opponents in Quick Draw for instant head-to-head card battles, or join full Arena battles to win Coins and boost your MMR.",
  },
];

function ArenaIntroModal({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const slideY = React.useRef(new Animated.Value(60)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [opacity, slideY]);

  return (
    <Modal visible animationType="none" transparent>
      <View style={introStyles.overlay}>
        <Animated.View style={[introStyles.sheet, { transform: [{ translateY: slideY }], opacity }]}>
          {/* Handle */}
          <View style={introStyles.handle} />

          {/* Scrollable content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[introStyles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
            bounces={false}
          >
            {/* Header */}
            <View style={introStyles.headerRow}>
              <View style={introStyles.logoCircle}>
                <Feather name="zap" size={22} color={Colors.dark.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={introStyles.sheetTitle}>Welcome to the Arena</Text>
                <Text style={introStyles.sheetSubtitle}>{"Here's how everything works"}</Text>
              </View>
            </View>

            {/* Sections */}
            {INTRO_SECTIONS.map((s) => (
              <View key={s.title} style={introStyles.section}>
                <View style={[introStyles.sectionIcon, { backgroundColor: s.color + "20" }]}>
                  <Feather name={s.icon} size={18} color={s.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={introStyles.sectionTitle}>{s.title}</Text>
                  <Text style={introStyles.sectionBody}>{s.body}</Text>
                </View>
              </View>
            ))}

            {/* CTA */}
            <Pressable style={introStyles.cta} onPress={onDismiss}>
              <Text style={introStyles.ctaText}>{"Let's go!"}</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const introStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.15)",
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  scrollContent: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingTop: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(200,255,61,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(200,255,61,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  section: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 3,
  },
  sectionBody: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 17,
  },
  cta: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#000",
  },
});

// ── Hub Feature Card ───────────────────────────────────────────────────────────
function FeatureCard({
  icon,
  label,
  sublabel,
  onPress,
  badge,
  color,
}: {
  icon: string;
  label: string;
  sublabel: string;
  onPress: () => void;
  badge?: string | number;
  color?: string;
}) {
  return (
    <Pressable style={styles.featureCard} onPress={onPress}>
      <View style={[styles.featureIcon, { backgroundColor: (color ?? Colors.dark.primary) + "22" }]}>
        <Feather name={icon as any} size={22} color={color ?? Colors.dark.primary} />
        {badge != null && String(badge) !== "0" && (
          <View style={styles.featureBadge}>
            <Text style={styles.featureBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.featureLabel}>{label}</Text>
      <Text style={styles.featureSublabel}>{sublabel}</Text>
      <Feather name="chevron-right" size={14} color={Colors.dark.disabled} style={styles.featureArrow} />
    </Pressable>
  );
}

// ── Compact Mission Bar ────────────────────────────────────────────────────────
function CompactMissionBar({ mission }: { mission: Mission }) {
  const pct = mission.targetProgress > 0 ? (mission.currentProgress / mission.targetProgress) * 100 : 0;
  const isComplete = mission.status === "completed";

  return (
    <View style={styles.missionBar}>
      <Text style={styles.missionBarName} numberOfLines={1}>{mission.name}</Text>
      <View style={styles.missionBarProgress}>
        <View style={styles.missionBarBg}>
          <View style={[
            styles.missionBarFill,
            { width: `${pct}%`, backgroundColor: isComplete ? Colors.dark.primary : "#4DA3FF" },
          ]} />
        </View>
        <Text style={styles.missionBarText}>
          {mission.currentProgress}/{mission.targetProgress}
        </Text>
        {isComplete && (
          <View style={styles.missionCompleteTag}>
            <Text style={styles.missionCompleteTagText}>Claim</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main Hub Screen ────────────────────────────────────────────────────────────
export default function ArenaHubScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [showLoginReward, setShowLoginReward] = useState(false);
  const [loginRewardDismissed, setLoginRewardDismissed] = useState(false);
  const [showIntroModal, setShowIntroModal] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<HubData>({
    queryKey: ["/api/arena/hub"],
  });

  // Check if this is the first time opening Arena
  useEffect(() => {
    AsyncStorage.getItem(ARENA_INTRO_SEEN_KEY).then((val) => {
      if (val === null) setShowIntroModal(true);
    });
  }, []);

  // Show login reward modal once on load
  useEffect(() => {
    if (data?.loginReward?.awarded && !loginRewardDismissed) {
      setShowLoginReward(true);
    }
  }, [data?.loginReward?.awarded, loginRewardDismissed]);

  const handleDismissIntro = useCallback(() => {
    setShowIntroModal(false);
    AsyncStorage.setItem(ARENA_INTRO_SEEN_KEY, "1");
  }, []);

  const handleShowIntro = useCallback(() => {
    setShowIntroModal(true);
  }, []);

  // Header info button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton onPress={handleShowIntro}>
          <Feather name="info" size={20} color={Colors.dark.textMuted} />
        </HeaderButton>
      ),
    });
  }, [navigation, handleShowIntro]);

  const handleCardPress = useCallback(() => {
    navigation.navigate("ArenaMyCard");
  }, [navigation]);

  const handleSyncCard = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/arena/sync-card");
      queryClient.invalidateQueries({ queryKey: ["/api/arena/hub"] });
      queryClient.invalidateQueries({ queryKey: ["/api/arena/my-card"] });
    } catch {}
  }, [queryClient]);

  const handleDismissLoginReward = useCallback(() => {
    setShowLoginReward(false);
    setLoginRewardDismissed(true);
  }, []);

  const daysRemaining = data?.activeSeason
    ? Math.max(0, Math.ceil((new Date(data.activeSeason.endDate).getTime() - Date.now()) / 86400000))
    : null;

  const activeMissions = (data?.missions ?? []).filter((m) => m.status !== "claimed");

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.primary} />
        }
      >
        {/* Hero title */}
        <View style={styles.header}>
          <Text style={styles.title}>Glow Arena</Text>
          <Text style={styles.subtitle}>Collect. Battle. Conquer.</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.dark.primary} size="large" />
          </View>
        ) : (
          <>
            {/* Coin + collection bar */}
            <View style={styles.statsBar}>
              <View style={styles.statsBarItem}>
                <Feather name="zap" size={14} color={Colors.dark.primary} />
                <Text style={styles.statsBarValue}>{data?.glowCoins ?? 0}</Text>
                <Text style={styles.statsBarLabel}>Coins</Text>
              </View>
              <View style={styles.statsBarDivider} />
              <View style={styles.statsBarItem}>
                <Feather name="layers" size={14} color="#4DA3FF" />
                <Text style={[styles.statsBarValue, { color: "#4DA3FF" }]}>{data?.collectedCount ?? 0}</Text>
                <Text style={styles.statsBarLabel}>Cards</Text>
              </View>
              <View style={styles.statsBarDivider} />
              <View style={styles.statsBarItem}>
                <Feather name="trending-up" size={14} color="#FFD700" />
                <Text style={[styles.statsBarValue, { color: "#FFD700" }]}>{data?.arenaRecord.mmr ?? 1000}</Text>
                <Text style={styles.statsBarLabel}>MMR</Text>
              </View>
            </View>

            {/* Season badge */}
            {data?.activeSeason && (
              <View style={styles.seasonBadge}>
                <Feather name="award" size={14} color={Colors.dark.primary} />
                <Text style={styles.seasonText}>
                  {data.activeSeason.name}
                  {daysRemaining !== null ? `  ·  ${daysRemaining}d left` : ""}
                </Text>
              </View>
            )}

            {/* Champion Card */}
            <Pressable style={styles.cardContainer} onPress={handleCardPress}>
              {data?.card && data?.player ? (
                <ChampionCard card={data.card} player={data.player} size="standard" onPress={handleCardPress} />
              ) : (
                <View style={styles.noCardPlaceholder}>
                  <Feather name="credit-card" size={40} color={Colors.dark.disabled} />
                  <Text style={styles.noCardText}>Generating your card...</Text>
                </View>
              )}
            </Pressable>

            {/* Sync + record */}
            <View style={styles.cardActions}>
              <Pressable style={styles.syncButton} onPress={handleSyncCard}>
                <Feather name="refresh-cw" size={12} color={Colors.dark.text} />
                <Text style={styles.syncButtonText}>Sync Card</Text>
              </Pressable>
              <View style={styles.miniRecord}>
                <RecordStat label="W" value={data?.arenaRecord.wins ?? 0} color={Colors.dark.success} />
                <Text style={styles.recordSep}>/</Text>
                <RecordStat label="L" value={data?.arenaRecord.losses ?? 0} color={Colors.dark.error} />
              </View>
            </View>

            {/* Feature Grid */}
            <Text style={styles.sectionTitle}>Arena Features</Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon="package"
                label="Pack Shop"
                sublabel="Open card packs"
                onPress={() => navigation.navigate("ArenaPackShop")}
                color={Colors.dark.primary}
              />
              <FeatureCard
                icon="layers"
                label="My Collection"
                sublabel={`${data?.collectedCount ?? 0} cards`}
                onPress={() => navigation.navigate("ArenaMyCollection")}
                color="#4DA3FF"
                badge={data?.collectedCount}
              />
              <FeatureCard
                icon="globe"
                label="The Exchange"
                sublabel="All cards gallery"
                onPress={() => navigation.navigate("ArenaGallery")}
                color="#C040FB"
              />
              <FeatureCard
                icon="zap"
                label="Quick Draw"
                sublabel="Instant battles"
                onPress={() => navigation.navigate("ArenaQuickDraw")}
                color="#FF4D4D"
              />
              <FeatureCard
                icon="target"
                label="Missions"
                sublabel="Weekly challenges"
                onPress={() => navigation.navigate("ArenaDailyChallenge")}
                color="#FFD700"
                badge={activeMissions.filter((m) => m.status === "completed").length || undefined}
              />
              <FeatureCard
                icon="credit-card"
                label="My Card"
                sublabel="Champion card"
                onPress={handleCardPress}
                color={Colors.dark.primary}
              />
            </View>

            {/* Phase 3 Feature Grid */}
            <Text style={styles.sectionTitle}>Battle Zone</Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon="users"
                label="Squad Builder"
                sublabel="Build your team"
                onPress={() => navigation.navigate("ArenaSquadBuilder")}
                color="#4DA3FF"
              />
              <FeatureCard
                icon="crosshair"
                label="Battle Arena"
                sublabel="Challenge rivals"
                onPress={() => navigation.navigate("ArenaBattle")}
                color="#FF4D4D"
              />
              <FeatureCard
                icon="trending-up"
                label="Leaderboard"
                sublabel="Season rankings"
                onPress={() => navigation.navigate("ArenaLeaderboard")}
                color="#FFD700"
              />
              <FeatureCard
                icon="alert-octagon"
                label="Bounties"
                sublabel="Place & claim"
                onPress={() => navigation.navigate("ArenaBounty")}
                color="#C040FB"
              />
            </View>

            {/* Active missions preview */}
            {activeMissions.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Weekly Missions</Text>
                <Pressable
                  style={styles.missionsPreviewCard}
                  onPress={() => navigation.navigate("ArenaDailyChallenge")}
                >
                  {activeMissions.slice(0, 3).map((m) => (
                    <CompactMissionBar key={m.id} mission={m} />
                  ))}
                  <View style={styles.viewAllRow}>
                    <Text style={styles.viewAllText}>View all missions</Text>
                    <Feather name="chevron-right" size={14} color={Colors.dark.primary} />
                  </View>
                </Pressable>
              </>
            )}

            {/* Shop preview */}
            {(data?.shopPreview ?? []).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{"Today's Shop"}</Text>
                <Pressable
                  style={styles.shopPreviewCard}
                  onPress={() => navigation.navigate("ArenaDailyChallenge")}
                >
                  {(data?.shopPreview ?? []).map((card) => {
                    const color = RARITY_COLORS[card.rarity] ?? "#888";
                    return (
                      <View key={card.id} style={styles.shopPreviewItem}>
                        <View style={[styles.shopPreviewIcon, { backgroundColor: color + "22" }]}>
                          <Feather name="zap" size={16} color={color} />
                        </View>
                        <Text style={styles.shopPreviewName} numberOfLines={1}>{card.name}</Text>
                        <View style={styles.shopPreviewPrice}>
                          <Feather name="zap" size={10} color={Colors.dark.primary} />
                          <Text style={styles.shopPreviewPriceText}>{card.price}</Text>
                        </View>
                      </View>
                    );
                  })}
                  <View style={styles.viewAllRow}>
                    <Text style={styles.viewAllText}>Open shop</Text>
                    <Feather name="chevron-right" size={14} color={Colors.dark.primary} />
                  </View>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Login Reward Modal */}
      {showLoginReward && data?.loginReward && (
        <LoginRewardModal reward={data.loginReward} onDismiss={handleDismissLoginReward} />
      )}

      {/* First-time Arena Intro Modal */}
      {showIntroModal && <ArenaIntroModal onDismiss={handleDismissIntro} />}
    </>
  );
}

function RecordStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.recordStat}>
      <Text style={[styles.recordValue, { color }]}>{value}</Text>
      <Text style={styles.recordStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  statsBar: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  statsBarItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    flexDirection: "row",
    justifyContent: "center",
  },
  statsBarValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.text,
    marginLeft: 4,
  },
  statsBarLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    marginLeft: 2,
  },
  statsBarDivider: {
    width: 1,
    backgroundColor: Colors.dark.divider,
    marginVertical: 2,
  },
  seasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "rgba(200,255,61,0.10)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.20)",
  },
  seasonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  cardContainer: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  noCardPlaceholder: {
    width: 220,
    height: 308,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: 12,
  },
  noCardText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  miniRecord: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordStat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  recordValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  recordStatLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  recordSep: {
    fontSize: 13,
    color: Colors.dark.disabled,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  featureCard: {
    width: "48.5%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: 4,
    position: "relative",
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    position: "relative",
  },
  featureBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  featureBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#000",
  },
  featureLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  featureSublabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  featureArrow: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
  },
  missionsPreviewCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  missionBar: {
    gap: 4,
  },
  missionBarName: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  missionBarProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  missionBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  missionBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  missionBarText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    minWidth: 28,
    textAlign: "right",
  },
  missionCompleteTag: {
    backgroundColor: "rgba(200,255,61,0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  missionCompleteTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.borderSubtle,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  shopPreviewCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 14,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  shopPreviewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  shopPreviewIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  shopPreviewName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  shopPreviewPrice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(200,255,61,0.10)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  shopPreviewPriceText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
});
