import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { View, StyleSheet, ScrollView, Pressable, Dimensions, Platform, Linking, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import Animated, { 
  FadeIn, 
  FadeInDown,
  FadeInRight,
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { 
  useQuests, 
  useClaimQuestReward, 
  useAssignDailyQuests,
  useAssignWeeklyQuests, 
  useAssignMonthlyQuests,
  useUploadQuestEvidence,
  Quest, 
  StreakData,
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

function StreakHeader({ streak }: { streak: StreakData }) {
  const flameScale = useSharedValue(1);
  const flameOpacity = useSharedValue(0.7);
  
  useEffect(() => {
    if (streak.currentStreak > 0) {
      flameScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      flameOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600 }),
          withTiming(0.7, { duration: 600 })
        ),
        -1,
        true
      );
    }
  }, [streak.currentStreak]);
  
  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value }],
    opacity: flameOpacity.value,
  }));
  
  const tier = getStreakTierInfo(streak.currentStreak);
  const progressToNext = tier.nextAt 
    ? (streak.currentStreak / tier.nextAt) * 100 
    : 100;
  
  return (
    <Animated.View entering={FadeInDown.springify()}>
      <LinearGradient
        colors={[tier.color + "15", Colors.dark.backgroundSecondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.streakHeader}
      >
        <View style={styles.streakTopRow}>
          <Animated.View style={[styles.streakFlameContainer, flameStyle]}>
            <Ionicons 
              name="flame" 
              size={40} 
              color={streak.currentStreak > 0 ? "#FF6B35" : Colors.dark.textSecondary} 
            />
          </Animated.View>
          
          <View style={styles.streakInfo}>
            <ThemedText style={[styles.streakCount, { color: tier.color }]}>
              {streak.currentStreak}
            </ThemedText>
            <ThemedText style={styles.streakLabel}>
              Day Streak
            </ThemedText>
          </View>
          
          <View style={styles.streakMultiplierContainer}>
            <LinearGradient
              colors={[tier.color, tier.color + "80"]}
              style={styles.multiplierBadge}
            >
              <Ionicons name="flash" size={14} color="#000" />
              <ThemedText style={styles.multiplierText}>
                {tier.multiplier}x XP
              </ThemedText>
            </LinearGradient>
            <ThemedText style={[styles.tierLabel, { color: tier.color }]}>
              {tier.label}
            </ThemedText>
          </View>
        </View>
        
        {tier.nextAt ? (
          <View style={styles.streakProgressSection}>
            <View style={styles.streakProgressBar}>
              <Animated.View 
                entering={FadeIn.delay(300)}
                style={[
                  styles.streakProgressFill,
                  { width: `${Math.min(progressToNext, 100)}%`, backgroundColor: tier.color }
                ]}
              />
            </View>
            <ThemedText style={styles.streakProgressText}>
              {streak.currentStreak}/{tier.nextAt} to {tier.next}
            </ThemedText>
          </View>
        ) : null}
        
        <View style={styles.streakStats}>
          <View style={styles.streakStat}>
            <ThemedText style={styles.streakStatValue}>{streak.longestStreak}</ThemedText>
            <ThemedText style={styles.streakStatLabel}>Best</ThemedText>
          </View>
          <View style={styles.streakStatDivider} />
          <View style={styles.streakStat}>
            <ThemedText style={styles.streakStatValue}>{streak.totalDaysActive}</ThemedText>
            <ThemedText style={styles.streakStatLabel}>Total Days</ThemedText>
          </View>
          <View style={styles.streakStatDivider} />
          <View style={styles.streakStat}>
            <View style={styles.shieldRow}>
              <Ionicons name="shield-checkmark" size={14} color={Colors.dark.xpCyan} />
              <ThemedText style={styles.streakStatValue}>{streak.streakShields}</ThemedText>
            </View>
            <ThemedText style={styles.streakStatLabel}>Shields</ThemedText>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
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
          return (
            <React.Fragment key={q.id}>
              <Animated.View 
                entering={FadeIn.delay(i * 100)}
                style={[
                  styles.chainLink,
                  isDone && styles.chainLinkComplete,
                  allDone && styles.chainLinkAllDone,
                ]}
              >
                <Ionicons 
                  name={isDone ? "checkmark" : (q.iconName as any)} 
                  size={16} 
                  color={isDone ? "#000" : Colors.dark.textSecondary} 
                />
              </Animated.View>
              {i < quests.length - 1 ? (
                <View style={[
                  styles.chainLine,
                  isDone && styles.chainLineComplete,
                ]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      {allDone ? (
        <Animated.View entering={FadeIn.delay(400)} style={styles.chainBonusCard}>
          <LinearGradient
            colors={[Colors.dark.primary + "20", Colors.dark.xpCyan + "10"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chainBonusGradient}
          >
            <Ionicons name="gift" size={18} color={Colors.dark.primary} />
            <ThemedText style={styles.chainBonusText}>
              Chain Complete! +50 Bonus XP
            </ThemedText>
          </LinearGradient>
        </Animated.View>
      ) : (
        <ThemedText style={styles.chainLabel}>
          {completed}/{total} complete
        </ThemedText>
      )}
    </View>
  );
}

function QuestCard({ 
  quest, 
  index, 
  onClaim,
  onUploadEvidence,
  isClaiming,
  multiplier,
}: { 
  quest: Quest; 
  index: number; 
  onClaim: () => void;
  onUploadEvidence: () => void;
  isClaiming: boolean;
  multiplier: number;
}) {
  const isComplete = quest.status === "completed";
  const isClaimed = quest.status === "claimed";
  const progress = quest.targetProgress > 0 ? quest.currentProgress / quest.targetProgress : 0;
  const categoryColor = CATEGORY_COLORS[quest.category] || Colors.dark.textSecondary;
  const stars = DIFFICULTY_STARS[quest.difficulty] || 1;
  
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handleClaim = () => {
    if (!isComplete || isClaimed || isClaiming) return;
    scale.value = withSequence(
      withSpring(0.95),
      withSpring(1.05),
      withSpring(1)
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClaim();
  };
  
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));
  
  return (
    <Animated.View 
      entering={FadeInDown.delay(index * 80).springify()}
      style={animatedStyle}
    >
      <View style={styles.questCardOuter}>
        <LinearGradient
          colors={isComplete 
            ? [Colors.dark.primary + "08", Colors.dark.primary + "03"]
            : [Colors.dark.backgroundSecondary, Colors.dark.backgroundSecondary]
          }
          style={[
            styles.questCard,
            isComplete && { borderColor: Colors.dark.primary + "40", borderWidth: 1 },
          ]}
        >
          <View style={styles.questHeader}>
            <View style={styles.questProgressRing}>
              <View style={[styles.questIconBg, { backgroundColor: quest.iconColor + "15" }]}>
                <Ionicons 
                  name={quest.iconName as any} 
                  size={22} 
                  color={isComplete ? Colors.dark.primary : quest.iconColor} 
                />
              </View>
              {isComplete && !isClaimed ? (
                <View style={styles.completeBadge}>
                  <Ionicons name="checkmark" size={10} color="#000" />
                </View>
              ) : null}
            </View>
            
            <View style={styles.questInfo}>
              <View style={styles.questTitleRow}>
                <ThemedText style={[styles.questName, isComplete && styles.questNameComplete]} numberOfLines={1}>
                  {quest.name}
                </ThemedText>
                <View style={styles.difficultyStars}>
                  {Array.from({ length: stars }).map((_, i) => (
                    <Ionicons 
                      key={i} 
                      name="star" 
                      size={10} 
                      color={quest.difficulty === "legendary" ? "#FFD700" : "#FFA500"} 
                    />
                  ))}
                </View>
              </View>
              <ThemedText style={styles.questDescription} numberOfLines={1}>
                {quest.description}
              </ThemedText>
              
              <View style={styles.questTags}>
                <View style={[styles.categoryPill, { backgroundColor: categoryColor + "15" }]}>
                  <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
                  <ThemedText style={[styles.categoryText, { color: categoryColor }]}>
                    {quest.category}
                  </ThemedText>
                </View>
                {quest.personalisedBy === "ai" ? (
                  <View style={styles.personalisedBadge}>
                    <Ionicons name="sparkles" size={10} color="#00FF88" />
                    <ThemedText style={styles.personalisedText}>For you</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
            
            <View style={styles.rewardSection}>
              {isComplete && !isClaimed ? (
                <Pressable 
                  style={[styles.claimButton, isClaiming && styles.claimButtonDisabled]} 
                  onPress={handleClaim}
                  disabled={isClaiming}
                >
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.claimButtonGradient}
                  >
                    <ThemedText style={styles.claimButtonText}>
                      {isClaiming ? "..." : "Claim"}
                    </ThemedText>
                  </LinearGradient>
                </Pressable>
              ) : (
                <View style={styles.xpRewardContainer}>
                  <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
                  <ThemedText style={styles.xpRewardText}>+{quest.xpReward}</ThemedText>
                  {multiplier > 1 ? (
                    <ThemedText style={styles.multiplierLabel}>x{multiplier}</ThemedText>
                  ) : null}
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.progressSection}>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar}>
                <Animated.View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${Math.min(progress * 100, 100)}%`,
                      backgroundColor: isComplete ? Colors.dark.primary : quest.iconColor,
                    }
                  ]} 
                />
              </View>
            </View>
            <ThemedText style={styles.progressLabel}>
              {quest.currentProgress}/{quest.targetProgress}
            </ThemedText>
          </View>
          
          <View style={styles.questActions}>
            <Pressable 
              style={styles.evidenceButton} 
              onPress={onUploadEvidence}
            >
              <Ionicons 
                name={quest.evidenceUrl ? "checkmark-circle" : "camera-outline"} 
                size={16} 
                color={quest.evidenceUrl ? Colors.dark.primary : Colors.dark.textSecondary} 
              />
              <ThemedText style={[
                styles.evidenceText,
                quest.evidenceUrl && { color: Colors.dark.primary }
              ]}>
                {quest.evidenceUrl ? "Proof added" : "Add proof"}
              </ThemedText>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

function EmptyState({ type }: { type: QuestType }) {
  const icons: Record<QuestType, string> = {
    daily: "sunny-outline",
    weekly: "calendar-outline", 
    monthly: "trophy-outline",
  };
  const messages: Record<QuestType, { title: string; subtitle: string }> = {
    daily: { title: "All caught up!", subtitle: "New daily quests arrive each morning" },
    weekly: { title: "Weekly quests loading", subtitle: "Check back - new challenges every Monday" },
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
  const [activeTab, setActiveTab] = useState<QuestType>("daily");
  
  const { data: questsData, isLoading } = useQuests();
  const claimReward = useClaimQuestReward();
  const assignDailyQuests = useAssignDailyQuests();
  const assignWeeklyQuests = useAssignWeeklyQuests();
  const assignMonthlyQuests = useAssignMonthlyQuests();
  const uploadEvidence = useUploadQuestEvidence();
  
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
    currentStreak: 0, longestStreak: 0, multiplier: 1, 
    lastActiveDate: null, streakShields: 0, totalDaysActive: 0 
  };
  
  const questsByTab: Record<QuestType, Quest[]> = {
    daily: dailyQuests,
    weekly: weeklyQuests,
    monthly: monthlyQuests,
  };
  
  const activeQuests = questsByTab[activeTab];
  
  const getCompletedCount = (quests: Quest[]) => 
    quests.filter(q => q.status === "completed" || q.status === "claimed").length;
  
  const handleClaim = (questId: string) => {
    track("quests:claim");
    claimReward.mutate(questId);
  };
  
  const handleUploadEvidence = async (questId: string) => {
    try {
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== "granted") {
        if (!canAskAgain && Platform.OS !== "web") {
          Alert.alert(
            "Permission Required",
            "Media library access is needed to upload quest evidence. Please enable it in Settings.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => { 
                try { Linking.openSettings(); } catch {} 
              }},
            ]
          );
        }
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `evidence-${Date.now()}.jpg`;
        const mimeType = asset.mimeType || "image/jpeg";
        
        track("quests:upload_proof");
        uploadEvidence.mutate({
          questId,
          fileUri: asset.uri,
          fileName,
          mimeType,
        });
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.error("Error picking evidence:", err);
    }
  };
  
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + Spacing.sm, paddingBottom: insets.bottom + Spacing.xl + 80 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <StreakHeader streak={streak} />
        
        <View style={styles.tabBar}>
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.key;
            const quests = questsByTab[tab.key];
            const completed = getCompletedCount(quests);
            
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
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tabActiveGradient}
                  >
                    <Ionicons name={tab.icon as any} size={16} color="#000" />
                    <ThemedText style={styles.tabTextActive}>{tab.label}</ThemedText>
                    {completed > 0 ? (
                      <View style={styles.tabBadgeActive}>
                        <ThemedText style={styles.tabBadgeTextActive}>{completed}</ThemedText>
                      </View>
                    ) : null}
                  </LinearGradient>
                ) : (
                  <View style={styles.tabInner}>
                    <Ionicons name={tab.icon as any} size={16} color={Colors.dark.textSecondary} />
                    <ThemedText style={styles.tabText}>{tab.label}</ThemedText>
                    {completed > 0 ? (
                      <View style={styles.tabBadge}>
                        <ThemedText style={styles.tabBadgeText}>{completed}</ThemedText>
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
        
        {isLoading ? (
          <View style={styles.loadingState}>
            <Ionicons name="hourglass" size={32} color={Colors.dark.textSecondary} />
            <ThemedText style={styles.loadingText}>Loading quests...</ThemedText>
          </View>
        ) : activeQuests.length === 0 ? (
          <EmptyState type={activeTab} />
        ) : (
          <View style={styles.questList}>
            {activeQuests.map((quest, index) => (
              <QuestCard 
                key={quest.id} 
                quest={quest} 
                index={index}
                onClaim={() => handleClaim(quest.id)}
                onUploadEvidence={() => handleUploadEvidence(quest.id)}
                isClaiming={claimReward.isPending}
                multiplier={streak.multiplier}
              />
            ))}
          </View>
        )}
      </ScrollView>
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
  
  streakHeader: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  streakTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  streakFlameContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FF6B35" + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  streakInfo: {
    flex: 1,
  },
  streakCount: {
    fontSize: 36,
    fontWeight: "900",
    lineHeight: 40,
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginTop: -2,
  },
  streakMultiplierContainer: {
    alignItems: "center",
    gap: 4,
  },
  multiplierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  multiplierText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#000",
  },
  tierLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  streakProgressSection: {
    marginTop: Spacing.md,
  },
  streakProgressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  streakProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  streakProgressText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 4,
    textAlign: "right",
  },
  streakStats: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundRoot + "60",
  },
  streakStat: {
    alignItems: "center",
    flex: 1,
  },
  streakStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  streakStatLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  streakStatDivider: {
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
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  tabTextActive: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000",
  },
  tabBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  tabBadgeActive: {
    backgroundColor: "rgba(0,0,0,0.2)",
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  tabBadgeTextActive: {
    fontSize: 10,
    fontWeight: "700",
    color: "#000",
  },
  
  chainContainer: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  chainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  chainLink: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    borderColor: Colors.dark.xpCyan,
  },
  chainLine: {
    width: 24,
    height: 3,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
  },
  chainLineComplete: {
    backgroundColor: Colors.dark.primary,
  },
  chainLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  chainBonusCard: {
    width: "100%",
  },
  chainBonusGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  chainBonusText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  
  questList: {
    gap: Spacing.sm,
  },
  questCardOuter: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  questCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  questHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  questProgressRing: {
    position: "relative",
  },
  questIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  completeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  questInfo: {
    flex: 1,
    gap: 2,
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
  questNameComplete: {
    color: Colors.dark.primary,
  },
  difficultyStars: {
    flexDirection: "row",
    gap: 1,
  },
  questDescription: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  questTags: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rewardSection: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  xpRewardContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.xpCyan + "12",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  xpRewardText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  multiplierLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFD700",
  },
  claimButton: {
    borderRadius: 10,
    overflow: "hidden",
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonGradient: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  claimButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  progressSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  progressBarContainer: {
    flex: 1,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    minWidth: 40,
    textAlign: "right",
  },
  questActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: Spacing.xs,
  },
  evidenceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundRoot + "60",
  },
  evidenceText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
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
  personalisedBadge: {
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
  personalisedText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#00FF88",
  },
});
