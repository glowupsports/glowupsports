import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { View, StyleSheet, ScrollView, Pressable, Dimensions, Modal } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { useTabNavigation } from "@/components/TabNavigationContext";
import {
  useQuests,
  useClaimQuestReward,
  useClaimChainBonus,
  useAssignDailyQuests,
  useAssignWeeklyQuests,
  useAssignMonthlyQuests,
  Quest,
  StreakData,
  ClaimRewardResult,
} from "@/player/hooks/useQuests";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type QuestType = "daily" | "weekly" | "monthly";

const CATEGORY_COLORS: Record<string, string> = {
  training: "#00FF88",
  social: "#00D9FF",
  performance: "#FF4444",
  consistency: "#CCFF00",
  mental: "#E040FB",
};

const CATEGORY_ICONS: Record<string, string> = {
  training: "tennisball",
  social: "people",
  performance: "trophy",
  consistency: "calendar-outline",
  mental: "shield-checkmark",
};

const DIFFICULTY_STARS: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  legendary: 4,
};

function getStreakTierInfo(streak: number) {
  if (streak >= 30) return { label: "LEGENDARY", color: "#FFD700", next: null, nextAt: null, multiplier: 3 };
  if (streak >= 14) return { label: "EPIC", color: "#E040FB", next: "LEGENDARY", nextAt: 30, multiplier: 2.5 };
  if (streak >= 7) return { label: "RARE", color: "#00D9FF", next: "EPIC", nextAt: 14, multiplier: 2 };
  if (streak >= 3) return { label: "COMMON", color: "#00FF88", next: "RARE", nextAt: 7, multiplier: 1.5 };
  return { label: "STARTER", color: Colors.dark.textSecondary, next: "COMMON", nextAt: 3, multiplier: 1 };
}

function StreakHero({ streak }: { streak: StreakData }) {
  const flameScale = useSharedValue(1);
  const flameOpacity = useSharedValue(0.7);
  const xpBarWidth = useSharedValue(0);

  const tier = getStreakTierInfo(streak.currentStreak);
  const progressToNext = tier.nextAt
    ? Math.min((streak.currentStreak / tier.nextAt) * 100, 100)
    : 100;

  useEffect(() => {
    if (streak.currentStreak > 0) {
      flameScale.value = withRepeat(
        withSequence(
          withTiming(1.18, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      flameOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700 }),
          withTiming(0.65, { duration: 700 })
        ),
        -1,
        true
      );
    }
    xpBarWidth.value = withDelay(400, withTiming(progressToNext, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [streak.currentStreak, progressToNext]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value }],
    opacity: flameOpacity.value,
  }));

  const xpBarStyle = useAnimatedStyle(() => ({
    width: `${xpBarWidth.value}%`,
  }));

  const getTierGradient = (): [string, string] => {
    switch (tier.label) {
      case "LEGENDARY": return ["#FFD700", "#FF8C00"];
      case "EPIC": return ["#E040FB", "#9C27B0"];
      case "RARE": return ["#00D9FF", "#0288D1"];
      case "COMMON": return ["#00FF88", "#00BCD4"];
      default: return [Colors.dark.textSecondary, Colors.dark.backgroundSecondary];
    }
  };

  const [gradStart, gradEnd] = getTierGradient();

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <LinearGradient
        colors={[tier.color + "22", tier.color + "08", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <Animated.View style={[styles.flameRing, flameStyle]}>
            <LinearGradient
              colors={["#FF6B35", "#FF4500"]}
              style={styles.flameRingInner}
            >
              <Ionicons
                name="flame"
                size={32}
                color={streak.currentStreak > 0 ? "#FFF" : Colors.dark.textSecondary}
              />
            </LinearGradient>
          </Animated.View>

          <View style={styles.heroStreakInfo}>
            <ThemedText style={[styles.heroStreakCount, { color: tier.color }]}>
              {streak.currentStreak}
            </ThemedText>
            <ThemedText style={styles.heroStreakLabel}>Day Streak</ThemedText>
          </View>

          <View style={styles.heroRight}>
            <LinearGradient
              colors={[gradStart, gradEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tierBadge}
            >
              <ThemedText style={styles.tierBadgeText}>{tier.label}</ThemedText>
            </LinearGradient>
            <LinearGradient
              colors={[tier.color + "30", tier.color + "10"]}
              style={styles.multiplierPill}
            >
              <Ionicons name="flash" size={12} color={tier.color} />
              <ThemedText style={[styles.multiplierPillText, { color: tier.color }]}>
                {tier.multiplier}x XP
              </ThemedText>
            </LinearGradient>
          </View>
        </View>

        {tier.nextAt ? (
          <View style={styles.xpProgressSection}>
            <View style={styles.xpProgressBar}>
              <Animated.View
                style={[styles.xpProgressFill, xpBarStyle, { backgroundColor: tier.color }]}
              />
            </View>
            <ThemedText style={styles.xpProgressLabel}>
              {streak.currentStreak}/{tier.nextAt} to {tier.next}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <ThemedText style={styles.heroStatValue}>{streak.longestStreak}</ThemedText>
            <ThemedText style={styles.heroStatLabel}>Best</ThemedText>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <ThemedText style={styles.heroStatValue}>{streak.totalDaysActive}</ThemedText>
            <ThemedText style={styles.heroStatLabel}>Total Days</ThemedText>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <View style={styles.shieldRow}>
              <Ionicons name="shield-checkmark" size={13} color={Colors.dark.xpCyan} />
              <ThemedText style={styles.heroStatValue}>{streak.streakShields}</ThemedText>
            </View>
            <ThemedText style={styles.heroStatLabel}>Shields</ThemedText>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function ChainCompleteCelebration({ visible, type, onDone }: { visible: boolean; type: QuestType; onDone: () => void }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSequence(
        withSpring(1.08, { damping: 12 }),
        withDelay(1800, withTiming(0, { duration: 300 }))
      );
      opacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(1800, withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }))
      );
      setTimeout(() => onDone(), 2500);
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const labels: Record<QuestType, string> = {
    daily: "Daily Chain Complete",
    weekly: "Weekly Chain Complete",
    monthly: "Monthly Chain Complete",
  };

  return (
    <Animated.View style={[styles.chainCelebration, animStyle]}>
      <LinearGradient
        colors={[Colors.dark.primary + "20", Colors.dark.xpCyan + "10"]}
        style={styles.chainCelebrationInner}
      >
        <Ionicons name="trophy" size={28} color={Colors.dark.primary} />
        <View style={styles.chainCelebrationText}>
          <ThemedText style={styles.chainCelebrationTitle}>{labels[type]}</ThemedText>
          <ThemedText style={styles.chainCelebrationSub}>+50 Bonus XP</ThemedText>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function ClaimCelebrationModal({
  visible,
  xpAwarded,
  coinsAwarded,
  multiplier,
  onClose,
}: {
  visible: boolean;
  xpAwarded: number;
  coinsAwarded: number;
  multiplier: number;
  onClose: () => void;
}) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 14, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 200 });
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        3,
        true
      );
    } else {
      scale.value = withTiming(0.5, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View style={[styles.claimModal, containerStyle]}>
          <LinearGradient
            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
            style={styles.claimModalInner}
          >
            <Animated.View style={pulseStyle}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                style={styles.xpBurst}
              >
                <Ionicons name="flash" size={36} color="#000" />
              </LinearGradient>
            </Animated.View>

            <ThemedText style={styles.claimModalTitle}>XP Earned!</ThemedText>

            <View style={styles.claimXpRow}>
              <ThemedText style={styles.claimXpValue}>+{xpAwarded}</ThemedText>
              <ThemedText style={styles.claimXpLabel}>XP</ThemedText>
            </View>

            {multiplier > 1 ? (
              <View style={styles.claimMultiplierRow}>
                <Ionicons name="flame" size={14} color="#FF6B35" />
                <ThemedText style={styles.claimMultiplierText}>{multiplier}x Streak Bonus Applied</ThemedText>
              </View>
            ) : null}

            {coinsAwarded > 0 ? (
              <View style={styles.claimCoinsRow}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <ThemedText style={styles.claimCoinsText}>+{coinsAwarded} Glow Coins</ThemedText>
              </View>
            ) : null}

            <Pressable style={styles.claimModalClose} onPress={onClose}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.claimModalCloseGradient}
              >
                <ThemedText style={styles.claimModalCloseText}>Awesome!</ThemedText>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function ChainProgress({ quests, type }: { quests: Quest[]; type: QuestType }) {
  const completed = quests.filter(q => q.status === "completed" || q.status === "claimed").length;
  const total = quests.length;
  const allDone = completed >= total && total > 0;

  return (
    <View style={styles.chainContainer}>
      <View style={styles.chainRow}>
        {quests.map((q, i) => {
          const isDone = q.status === "completed" || q.status === "claimed";
          const catColor = CATEGORY_COLORS[q.category] || Colors.dark.textSecondary;
          return (
            <React.Fragment key={q.id}>
              <Animated.View
                entering={FadeIn.delay(i * 100)}
                style={[
                  styles.chainLink,
                  isDone && styles.chainLinkComplete,
                  allDone && styles.chainLinkAllDone,
                  !isDone && { borderColor: catColor + "40" },
                ]}
              >
                <Ionicons
                  name={isDone ? "checkmark" : (CATEGORY_ICONS[q.category] as any || "ellipse-outline")}
                  size={15}
                  color={isDone ? "#000" : catColor}
                />
              </Animated.View>
              {i < quests.length - 1 ? (
                <View style={[styles.chainLine, isDone && { backgroundColor: Colors.dark.primary }]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      <ThemedText style={styles.chainLabel}>
        {allDone ? "All quests complete!" : `${completed}/${total} complete`}
      </ThemedText>
    </View>
  );
}

function QuestCard({
  quest,
  index,
  onClaim,
  isClaiming,
  multiplier,
  onPress,
}: {
  quest: Quest;
  index: number;
  onClaim: () => void;
  isClaiming: boolean;
  multiplier: number;
  onPress?: () => void;
}) {
  const isComplete = quest.status === "completed";
  const isClaimed = quest.status === "claimed";
  const progress = quest.targetProgress > 0 ? quest.currentProgress / quest.targetProgress : 0;
  const categoryColor = CATEGORY_COLORS[quest.category] || Colors.dark.textSecondary;
  const categoryIcon = CATEGORY_ICONS[quest.category] || "ellipse";
  const stars = DIFFICULTY_STARS[quest.difficulty] || 1;

  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    progressWidth.value = withDelay(
      index * 60 + 200,
      withTiming(Math.min(progress * 100, 100), {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      })
    );
    if (isComplete && !isClaimed) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0.3, { duration: 800 })
        ),
        -1,
        true
      );
    }
  }, [progress, isComplete, isClaimed]);

  const animatedScale = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const handleClaim = () => {
    if (!isComplete || isClaimed || isClaiming) return;
    scale.value = withSequence(
      withSpring(0.96, { damping: 20 }),
      withSpring(1.04, { damping: 14 }),
      withSpring(1)
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClaim();
  };

  const handleCardPress = () => {
    if (!isClaimed && !isComplete && onPress) {
      onPress();
    }
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).springify()}
      style={animatedScale}
    >
      <Pressable
        onPress={handleCardPress}
        disabled={isClaimed || isComplete || !onPress}
      >
      <View style={[
        styles.questCard,
        isClaimed && styles.questCardClaimed,
        isComplete && !isClaimed && styles.questCardComplete,
      ]}>
        {isComplete && !isClaimed ? (
          <Animated.View style={[styles.questGlow, glowStyle, { borderColor: Colors.dark.primary + "60" }]} />
        ) : null}

        <View style={styles.questCardHeader}>
          <View style={[styles.questIconBox, { backgroundColor: categoryColor + "18" }]}>
            <Ionicons
              name={categoryIcon as any}
              size={22}
              color={isClaimed ? Colors.dark.primary : categoryColor}
            />
            {isClaimed ? (
              <View style={styles.claimedOverlay}>
                <Ionicons name="checkmark" size={14} color="#000" />
              </View>
            ) : null}
            {isComplete && !isClaimed ? (
              <View style={[styles.completeDot, { backgroundColor: Colors.dark.primary }]} />
            ) : null}
          </View>

          <View style={styles.questCardBody}>
            <View style={styles.questTitleRow}>
              <ThemedText
                style={[
                  styles.questName,
                  isComplete && { color: Colors.dark.primary },
                  isClaimed && { color: Colors.dark.textSecondary },
                ]}
                numberOfLines={1}
              >
                {quest.name}
              </ThemedText>
              <View style={styles.difficultyRow}>
                {Array.from({ length: stars }).map((_, i) => (
                  <Ionicons
                    key={i}
                    name="star"
                    size={9}
                    color={quest.difficulty === "legendary" ? "#FFD700" : "#FFA500"}
                  />
                ))}
              </View>
            </View>

            {quest.aiReason ? (
              <View style={styles.aiReasonRow}>
                <Ionicons name="sparkles" size={10} color="#00FF88" />
                <ThemedText style={styles.aiReasonText} numberOfLines={2}>
                  {quest.aiReason}
                </ThemedText>
              </View>
            ) : (
              <ThemedText style={styles.questDesc} numberOfLines={1}>
                {quest.description}
              </ThemedText>
            )}

            <View style={styles.questMeta}>
              <View style={[styles.categoryChip, { backgroundColor: categoryColor + "15" }]}>
                <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
                <ThemedText style={[styles.categoryChipText, { color: categoryColor }]}>
                  {quest.category}
                </ThemedText>
              </View>
              {quest.personalisedBy ? (
                <View style={styles.aiChip}>
                  <Ionicons name="sparkles" size={9} color="#00FF88" />
                  <ThemedText style={styles.aiChipText}>AI Pick</ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.questReward}>
            {isComplete && !isClaimed ? (
              <Pressable
                style={[styles.claimBtn, isClaiming && styles.claimBtnDisabled]}
                onPress={handleClaim}
                disabled={isClaiming}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.claimBtnGradient}
                >
                  <ThemedText style={styles.claimBtnText}>
                    {isClaiming ? "..." : "Claim"}
                  </ThemedText>
                </LinearGradient>
              </Pressable>
            ) : isClaimed ? (
              <View style={styles.claimedBadge}>
                <Ionicons name="checkmark-circle" size={22} color={Colors.dark.primary} />
              </View>
            ) : (
              <View style={styles.xpBadge}>
                <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
                <ThemedText style={styles.xpBadgeText}>+{quest.xpReward}</ThemedText>
                {multiplier > 1 ? (
                  <ThemedText style={styles.multiplierTag}>x{multiplier}</ThemedText>
                ) : null}
              </View>
            )}
          </View>
        </View>

        <View style={styles.questProgressRow}>
          <View style={styles.questProgressTrack}>
            <Animated.View
              style={[
                styles.questProgressFill,
                progressBarStyle,
                {
                  backgroundColor: isClaimed
                    ? Colors.dark.primary + "60"
                    : isComplete
                    ? Colors.dark.primary
                    : categoryColor,
                },
              ]}
            />
          </View>
          <ThemedText style={styles.questProgressLabel}>
            {quest.currentProgress}/{quest.targetProgress}
          </ThemedText>
        </View>
      </View>
      </Pressable>
    </Animated.View>
  );
}

function InfoToast({ message, onHide }: { message: string; onHide: () => void }) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const timer = setTimeout(onHide, 3000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      style={[
        infoToastStyles.container,
        { bottom: insets.bottom + 100 },
      ]}
    >
      <Ionicons name="information-circle" size={18} color="#fff" />
      <ThemedText style={infoToastStyles.text}>{message}</ThemedText>
    </Animated.View>
  );
}

const infoToastStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
    zIndex: 9999,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: "#fff",
  },
});

function EmptyState({ type }: { type: QuestType }) {
  const icons: Record<QuestType, string> = {
    daily: "sunny-outline",
    weekly: "calendar-outline",
    monthly: "trophy-outline",
  };
  const messages: Record<QuestType, { title: string; subtitle: string }> = {
    daily: { title: "All caught up!", subtitle: "New daily quests arrive each morning" },
    weekly: { title: "Weekly quests loading", subtitle: "Check back — new challenges every Monday" },
    monthly: { title: "Monthly missions incoming", subtitle: "Epic challenges reset on the 1st" },
  };

  return (
    <Animated.View entering={FadeIn} style={styles.emptyState}>
      <LinearGradient
        colors={[Colors.dark.primary + "08", "transparent"]}
        style={styles.emptyGradient}
      >
        <Ionicons name={icons[type] as any} size={48} color={Colors.dark.textSecondary} />
        <ThemedText style={styles.emptyTitle}>{messages[type].title}</ThemedText>
        <ThemedText style={styles.emptySubtitle}>{messages[type].subtitle}</ThemedText>
      </LinearGradient>
    </Animated.View>
  );
}

const TAB_CONFIG: { key: QuestType; label: string; icon: string }[] = [
  { key: "daily", label: "Daily", icon: "sunny" },
  { key: "weekly", label: "Weekly", icon: "calendar" },
  { key: "monthly", label: "Monthly", icon: "trophy" },
];

export default function QuestsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const track = useTrackFeature();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const [activeTab, setActiveTab] = useState<QuestType>("daily");
  const [claimResult, setClaimResult] = useState<ClaimRewardResult | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showChainCelebration, setShowChainCelebration] = useState(false);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const prevAllDoneRef = useRef<Record<QuestType, boolean>>({ daily: false, weekly: false, monthly: false });

  const { data: questsData, isLoading } = useQuests();
  const claimReward = useClaimQuestReward();
  const claimChainBonus = useClaimChainBonus();
  const assignDailyQuests = useAssignDailyQuests();
  const assignWeeklyQuests = useAssignWeeklyQuests();
  const assignMonthlyQuests = useAssignMonthlyQuests();

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      assignDailyQuests.mutate();
      assignWeeklyQuests.mutate();
      assignMonthlyQuests.mutate();
    }, [queryClient])
  );

  const dailyQuests = questsData?.daily || [];
  const weeklyQuests = questsData?.weekly || [];
  const monthlyQuests = questsData?.monthly || [];
  const streak = questsData?.streak || {
    currentStreak: 0,
    longestStreak: 0,
    multiplier: 1,
    lastActiveDate: null,
    streakShields: 0,
    totalDaysActive: 0,
  };

  const sortQuests = (quests: Quest[]) => {
    const order = { completed: 0, active: 1, claimed: 2 };
    return [...quests].sort((a, b) => (order[a.status as keyof typeof order] ?? 1) - (order[b.status as keyof typeof order] ?? 1));
  };

  const questsByTab: Record<QuestType, Quest[]> = {
    daily: sortQuests(dailyQuests),
    weekly: sortQuests(weeklyQuests),
    monthly: sortQuests(monthlyQuests),
  };

  const activeQuests = questsByTab[activeTab];

  const getCompletedCount = (quests: Quest[]) =>
    quests.filter(q => q.status === "completed" || q.status === "claimed").length;

  const isTabAllDone = (quests: Quest[]) =>
    quests.length > 0 && quests.every(q => q.status === "completed" || q.status === "claimed");

  useEffect(() => {
    const allDoneNow = isTabAllDone(activeQuests);
    const wasDone = prevAllDoneRef.current[activeTab];
    if (allDoneNow && !wasDone) {
      setShowChainCelebration(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevAllDoneRef.current[activeTab] = allDoneNow;
  }, [activeQuests, activeTab]);

  const handleClaim = (questId: string) => {
    if (claimingQuestId === questId) return;
    track("quests:claim");
    setClaimingQuestId(questId);
    claimReward.mutate(questId, {
      onSuccess: (data) => {
        setClaimingQuestId(null);
        setClaimResult(data);
        setShowClaimModal(true);

        const allActiveQuests = questsByTab[activeTab];
        const alreadyClaimed = allActiveQuests.filter(q => q.status === "claimed").length;
        const claimedAfterThis = alreadyClaimed + 1;
        const isLastClaim = claimedAfterThis >= allActiveQuests.length && allActiveQuests.length > 0;

        if (isLastClaim) {
          const alreadyClaimedBonus = questsData?.chainBonusClaimed?.[activeTab] ?? false;
          if (!alreadyClaimedBonus) {
            if (activeTab === "daily") {
              const slot = questsData?.dailySlot;
              if (slot?.bonusUnlocked) {
                claimChainBonus.mutate({ type: "daily" });
              }
            } else {
              claimChainBonus.mutate({ type: activeTab });
            }
          }
        }
      },
      onError: () => {
        setClaimingQuestId(null);
      },
    });
  };

  const handleQuestTap = (quest: Quest) => {
    const action = quest.targetAction;
    const category = quest.category;

    if (action === "mood_check" || category === "mental") {
      navigation.navigate("PlayerAICoach");
    } else if (action === "give_reaction" || action === "post_moment" || action === "post_comment") {
      navigateToTab("Community");
    } else if (action === "send_connection") {
      navigation.navigate("FriendsList");
    } else if (action === "read_coach_feedback") {
      navigateToTab("Progress", { screen: "FeedbackCenter" });
    } else if (action === "log_match" || action === "win_match") {
      navigateToTab("PlayStack");
    } else if (action === "daily_login" || action === "complete_session") {
      setInfoToast("Keep using the app — this quest will complete automatically");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + Spacing.sm, paddingBottom: insets.bottom + Spacing.xl + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <StreakHero streak={streak} />

        <View style={styles.tabBar}>
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.key;
            const quests = questsByTab[tab.key];
            const completed = getCompletedCount(quests);
            const total = quests.length;
            const allDone = isTabAllDone(quests);

            return (
              <Pressable
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => {
                  track(`quests:tab_${tab.key}`);
                  setActiveTab(tab.key);
                  Haptics.selectionAsync();
                }}
              >
                {isActive ? (
                  <LinearGradient
                    colors={allDone
                      ? ["#FFD700", "#FF8C00"]
                      : [Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tabActiveGradient}
                  >
                    <Ionicons name={tab.icon as any} size={15} color="#000" />
                    <ThemedText style={styles.tabTextActive}>{tab.label}</ThemedText>
                    {total > 0 ? (
                      <View style={styles.tabBadgeActive}>
                        <ThemedText style={styles.tabBadgeTextActive}>{completed}/{total}</ThemedText>
                      </View>
                    ) : null}
                  </LinearGradient>
                ) : (
                  <View style={styles.tabInner}>
                    <Ionicons name={tab.icon as any} size={15} color={allDone ? "#FFD700" : Colors.dark.textSecondary} />
                    <ThemedText style={[styles.tabText, allDone && { color: "#FFD700" }]}>{tab.label}</ThemedText>
                    {total > 0 ? (
                      <View style={[styles.tabBadge, allDone && styles.tabBadgeGold]}>
                        <ThemedText style={[styles.tabBadgeText, allDone && { color: "#FFD700" }]}>{completed}/{total}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {activeQuests.length > 0 ? (
          <ChainProgress quests={activeQuests} type={activeTab} />
        ) : null}

        <ChainCompleteCelebration
          visible={showChainCelebration}
          type={activeTab}
          onDone={() => setShowChainCelebration(false)}
        />

        {isLoading ? (
          <View style={styles.loadingState}>
            <Ionicons name="hourglass" size={32} color={Colors.dark.textSecondary} />
            <ThemedText style={styles.loadingText}>Loading quests...</ThemedText>
          </View>
        ) : activeQuests.length === 0 ? (
          <EmptyState type={activeTab} />
        ) : (
          <View style={styles.questList}>
            {(() => {
              const readyToClaim = activeQuests.filter(q => q.status === "completed");
              const inProgress = activeQuests.filter(q => q.status === "active");
              const claimed = activeQuests.filter(q => q.status === "claimed");
              return (
                <>
                  {readyToClaim.length > 0 && (
                    <>
                      <View style={styles.sectionHeader}>
                        <View style={styles.sectionDot} />
                        <ThemedText style={styles.sectionLabel}>Claim Now</ThemedText>
                        <View style={styles.sectionBadge}>
                          <ThemedText style={styles.sectionBadgeText}>{readyToClaim.length}</ThemedText>
                        </View>
                      </View>
                      {readyToClaim.map((quest, index) => (
                        <QuestCard
                          key={quest.id}
                          quest={quest}
                          index={index}
                          onClaim={() => handleClaim(quest.id)}
                          isClaiming={claimingQuestId === quest.id}
                          multiplier={streak.multiplier}
                          onPress={() => handleQuestTap(quest)}
                        />
                      ))}
                    </>
                  )}
                  {inProgress.length > 0 && (
                    <>
                      <View style={styles.sectionHeader}>
                        <View style={[styles.sectionDot, { backgroundColor: Colors.dark.textSecondary }]} />
                        <ThemedText style={styles.sectionLabel}>In Progress</ThemedText>
                      </View>
                      {inProgress.map((quest, index) => (
                        <QuestCard
                          key={quest.id}
                          quest={quest}
                          index={readyToClaim.length + index}
                          onClaim={() => handleClaim(quest.id)}
                          isClaiming={claimingQuestId === quest.id}
                          multiplier={streak.multiplier}
                          onPress={() => handleQuestTap(quest)}
                        />
                      ))}
                    </>
                  )}
                  {claimed.length > 0 && (
                    <>
                      <View style={styles.sectionHeader}>
                        <View style={[styles.sectionDot, { backgroundColor: "#4CAF50" }]} />
                        <ThemedText style={styles.sectionLabel}>Done</ThemedText>
                      </View>
                      {claimed.map((quest, index) => (
                        <QuestCard
                          key={quest.id}
                          quest={quest}
                          index={readyToClaim.length + inProgress.length + index}
                          onClaim={() => handleClaim(quest.id)}
                          isClaiming={claimingQuestId === quest.id}
                          multiplier={streak.multiplier}
                          onPress={() => handleQuestTap(quest)}
                        />
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </View>
        )}
      </ScrollView>

      <ClaimCelebrationModal
        visible={showClaimModal}
        xpAwarded={claimResult?.xpAwarded || 0}
        coinsAwarded={claimResult?.coinsAwarded || 0}
        multiplier={claimResult?.multiplier || 1}
        onClose={() => {
          setShowClaimModal(false);
          setClaimResult(null);
        }}
      />
      {infoToast !== null ? (
        <InfoToast message={infoToast} onHide={() => setInfoToast(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
  },

  heroCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  flameRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  flameRingInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  heroStreakInfo: {
    flex: 1,
  },
  heroStreakCount: {
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 44,
  },
  heroStreakLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginTop: -2,
  },
  heroRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 1,
  },
  multiplierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  multiplierPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  xpProgressSection: {
    marginTop: Spacing.md,
  },
  xpProgressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  xpProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  xpProgressLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 4,
    textAlign: "right",
  },
  heroStats: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot + "80",
  },
  heroStat: {
    alignItems: "center",
    flex: 1,
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  heroStatLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  shieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  tabActive: {},
  tabActiveGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  tabTextActive: {
    fontSize: 12,
    fontWeight: "700",
    color: "#000",
  },
  tabBadge: {
    backgroundColor: Colors.dark.backgroundRoot + "80",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tabBadgeGold: {
    backgroundColor: "#FFD70020",
  },
  tabBadgeActive: {
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  tabBadgeTextActive: {
    fontSize: 9,
    fontWeight: "700",
    color: "#000",
  },

  chainContainer: {
    alignItems: "center",
    gap: 4,
  },
  chainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  chainLink: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  chainLinkComplete: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  chainLinkAllDone: {
    borderColor: "#FFD700",
  },
  chainLine: {
    width: 28,
    height: 3,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
  },
  chainLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },

  chainCelebration: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  chainCelebrationInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  chainCelebrationText: {
    flex: 1,
  },
  chainCelebrationTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.primary,
  },
  chainCelebrationSub: {
    fontSize: 12,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },

  questList: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  sectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#000",
  },
  questCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "transparent",
    position: "relative",
    overflow: "hidden",
  },
  questCardComplete: {
    borderColor: Colors.dark.primary + "50",
  },
  questCardClaimed: {
    opacity: 0.7,
    borderColor: Colors.dark.primary + "20",
  },
  questGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  questCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  questIconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  claimedOverlay: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  completeDot: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  questCardBody: {
    flex: 1,
    gap: 3,
  },
  questTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  questName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  difficultyRow: {
    flexDirection: "row",
    gap: 1,
  },
  questDesc: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
  },
  aiReasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  aiReasonText: {
    fontSize: 11,
    color: "#00FF88",
    flex: 1,
    lineHeight: 15,
    fontStyle: "italic",
  },
  questMeta: {
    flexDirection: "row",
    gap: 6,
    marginTop: 3,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  categoryChipText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aiChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#00FF8820",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#00FF8840",
  },
  aiChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#00FF88",
  },

  questReward: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.xpCyan + "14",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  xpBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  multiplierTag: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFD700",
  },
  claimBtn: {
    borderRadius: 10,
    overflow: "hidden",
  },
  claimBtnDisabled: {
    opacity: 0.6,
  },
  claimBtnGradient: {
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  claimBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000",
  },
  claimedBadge: {
    padding: 6,
  },

  questProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  questProgressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  questProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  questProgressLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    minWidth: 36,
    textAlign: "right",
  },

  loadingState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  emptyState: {
    marginTop: Spacing.md,
  },
  emptyGradient: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  claimModal: {
    width: "100%",
    maxWidth: 320,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  claimModalInner: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
    borderRadius: BorderRadius.xl,
  },
  xpBurst: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  claimModalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: Colors.dark.text,
  },
  claimXpRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  claimXpValue: {
    fontSize: 48,
    fontWeight: "900",
    color: Colors.dark.primary,
    lineHeight: 52,
  },
  claimXpLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  claimMultiplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FF6B3520",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  claimMultiplierText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF6B35",
  },
  claimCoinsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFD70020",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  claimCoinsText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFD700",
  },
  claimModalClose: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  claimModalCloseGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  claimModalCloseText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
});
