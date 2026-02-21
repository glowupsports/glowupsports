import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
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
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useQuests, useClaimQuestReward, useAssignWeeklyQuests, Quest } from "@/player/hooks/useQuests";

type QuestType = "daily" | "weekly";


function QuestCard({ 
  quest, 
  index, 
  onClaim,
  isClaiming,
}: { 
  quest: Quest; 
  index: number; 
  onClaim: () => void;
  isClaiming: boolean;
}) {
  const isComplete = quest.status === "completed";
  const isClaimed = quest.status === "claimed";
  const progress = quest.targetProgress > 0 ? quest.currentProgress / quest.targetProgress : 0;
  
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
  
  return (
    <Animated.View 
      entering={FadeInDown.delay(index * 100).springify()}
      style={animatedStyle}
    >
      <Card style={StyleSheet.flatten([styles.questCard, isComplete && styles.questCardComplete])}>
        <View style={styles.questHeader}>
          <View style={[styles.questIconBg, { backgroundColor: quest.iconColor + "20" }]}>
            <Ionicons 
              name={quest.iconName as any} 
              size={24} 
              color={isComplete ? Colors.dark.primary : quest.iconColor} 
            />
            {isComplete && !isClaimed ? (
              <View style={styles.completeBadge}>
                <Ionicons name="checkmark" size={10} color={Colors.dark.backgroundRoot} />
              </View>
            ) : null}
          </View>
          
          <View style={styles.questInfo}>
            <ThemedText style={[styles.questName, isComplete && styles.questNameComplete]}>
              {quest.name}
            </ThemedText>
            <ThemedText style={styles.questDescription} numberOfLines={1}>
              {quest.description}
            </ThemedText>
          </View>
          
          <View style={styles.rewardContainer}>
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
              <View style={styles.xpRewardBadge}>
                <Ionicons name="flash" size={14} color={Colors.dark.xpCyan} />
                <ThemedText style={styles.xpRewardText}>+{quest.xpReward}</ThemedText>
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
            {quest.currentProgress} / {quest.targetProgress}
          </ThemedText>
        </View>
        
        <View style={styles.questMeta}>
          <View style={[styles.difficultyBadge, getDifficultyStyle(quest.difficulty)]}>
            <ThemedText style={styles.difficultyText}>{quest.difficulty}</ThemedText>
          </View>
          <View style={styles.categoryBadge}>
            <ThemedText style={styles.categoryText}>{quest.category}</ThemedText>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

function getDifficultyStyle(difficulty: string) {
  switch (difficulty?.toLowerCase()) {
    case "easy":
      return { backgroundColor: Colors.dark.primary + "20" };
    case "medium":
      return { backgroundColor: "#FFA500" + "20" };
    case "hard":
      return { backgroundColor: Colors.dark.error + "20" };
    default:
      return { backgroundColor: Colors.dark.backgroundSecondary };
  }
}

function ChainProgressHeader({ 
  completedCount, 
  totalCount, 
  type,
  bonusUnlocked,
}: { 
  completedCount: number; 
  totalCount: number; 
  type: QuestType;
  bonusUnlocked?: boolean;
}) {
  const progress = totalCount > 0 ? completedCount / totalCount : 0;
  
  return (
    <Card style={styles.chainHeader}>
      <View style={styles.chainInfo}>
        <View style={styles.chainTitleRow}>
          <Ionicons 
            name={type === "daily" ? "sunny" : "calendar"} 
            size={24} 
            color={Colors.dark.primary} 
          />
          <ThemedText style={styles.chainTitle}>
            {type === "daily" ? "Daily Chain" : "Weekly Chain"}
          </ThemedText>
        </View>
        <ThemedText style={styles.chainSubtitle}>
          Complete all {type} quests for bonus XP
        </ThemedText>
      </View>
      
      <View style={styles.chainProgress}>
        <View style={styles.chainProgressCircle}>
          <View style={styles.chainProgressInner}>
            <ThemedText style={styles.chainProgressText}>
              {completedCount}/{totalCount}
            </ThemedText>
          </View>
          <View 
            style={[
              styles.chainProgressRing,
              { 
                borderColor: Colors.dark.primary,
                borderWidth: 3,
                borderRightColor: progress < 0.25 ? "transparent" : Colors.dark.primary,
                borderBottomColor: progress < 0.5 ? "transparent" : Colors.dark.primary,
                borderLeftColor: progress < 0.75 ? "transparent" : Colors.dark.primary,
              }
            ]} 
          />
        </View>
        
        {bonusUnlocked ? (
          <Animated.View entering={FadeIn} style={styles.bonusBadge}>
            <Ionicons name="gift" size={12} color={Colors.dark.primary} />
            <ThemedText style={styles.bonusText}>Bonus!</ThemedText>
          </Animated.View>
        ) : null}
      </View>
    </Card>
  );
}

function StepIndicator({ steps, current }: { steps: number; current: number }) {
  return (
    <View style={styles.stepIndicator}>
      {Array.from({ length: steps }).map((_, i) => (
        <View key={i} style={styles.stepRow}>
          <View 
            style={[
              styles.stepDot, 
              i < current ? styles.stepDotComplete : 
              i === current ? styles.stepDotCurrent : 
              styles.stepDotPending
            ]} 
          >
            {i < current ? (
              <Ionicons name="checkmark" size={10} color={Colors.dark.backgroundRoot} />
            ) : (
              <ThemedText style={styles.stepNumber}>{i + 1}</ThemedText>
            )}
          </View>
          {i < steps - 1 ? (
            <View 
              style={[
                styles.stepLine,
                i < current ? styles.stepLineComplete : styles.stepLinePending
              ]} 
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export default function QuestsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<QuestType>("daily");
  
  const { data: questsData, isLoading, refetch } = useQuests();
  const claimReward = useClaimQuestReward();
  const assignWeeklyQuests = useAssignWeeklyQuests();
  
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      assignWeeklyQuests.mutate();
    }, [queryClient])
  );
  
  const dailyQuests = questsData?.daily || [];
  const weeklyQuests = questsData?.weekly || [];
  const dailySlot = questsData?.dailySlot;
  
  const dailyCompletedCount = dailyQuests.filter(q => q.status === "completed" || q.status === "claimed").length;
  const weeklyCompletedCount = weeklyQuests.filter(q => q.status === "completed" || q.status === "claimed").length;
  
  const activeQuests = activeTab === "daily" ? dailyQuests : weeklyQuests;
  const activeCompletedCount = activeTab === "daily" ? dailyCompletedCount : weeklyCompletedCount;
  const activeTotalCount = activeQuests.length;
  
  const handleClaim = (questId: string) => {
    claimReward.mutate(questId);
  };
  
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === "daily" && styles.tabActive]}
            onPress={() => {
              setActiveTab("daily");
              Haptics.selectionAsync();
            }}
          >
            <Ionicons 
              name="sunny" 
              size={18} 
              color={activeTab === "daily" ? Colors.dark.backgroundRoot : Colors.dark.textSecondary} 
            />
            <ThemedText style={[styles.tabText, activeTab === "daily" && styles.tabTextActive]}>
              Daily
            </ThemedText>
            {dailyCompletedCount > 0 ? (
              <View style={[styles.tabBadge, activeTab === "daily" && styles.tabBadgeActive]}>
                <ThemedText style={styles.tabBadgeText}>{dailyCompletedCount}/{dailyQuests.length}</ThemedText>
              </View>
            ) : null}
          </Pressable>
          
          <Pressable
            style={[styles.tab, activeTab === "weekly" && styles.tabActive]}
            onPress={() => {
              setActiveTab("weekly");
              Haptics.selectionAsync();
            }}
          >
            <Ionicons 
              name="calendar" 
              size={18} 
              color={activeTab === "weekly" ? Colors.dark.backgroundRoot : Colors.dark.textSecondary} 
            />
            <ThemedText style={[styles.tabText, activeTab === "weekly" && styles.tabTextActive]}>
              Weekly
            </ThemedText>
            {weeklyCompletedCount > 0 ? (
              <View style={[styles.tabBadge, activeTab === "weekly" && styles.tabBadgeActive]}>
                <ThemedText style={styles.tabBadgeText}>{weeklyCompletedCount}/{weeklyQuests.length}</ThemedText>
              </View>
            ) : null}
          </Pressable>
        </View>
        
        <ChainProgressHeader
          completedCount={activeCompletedCount}
          totalCount={activeTotalCount}
          type={activeTab}
          bonusUnlocked={activeTab === "daily" ? dailySlot?.bonusUnlocked : false}
        />
        
        {activeTotalCount > 0 ? (
          <StepIndicator steps={activeTotalCount} current={activeCompletedCount} />
        ) : null}
        
        {isLoading ? (
          <View style={styles.loadingState}>
            <Ionicons name="hourglass" size={32} color={Colors.dark.textSecondary} />
            <ThemedText style={styles.loadingText}>Loading quests...</ThemedText>
          </View>
        ) : activeQuests.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyState}>
            <LinearGradient
              colors={[Colors.dark.primary + "10", "transparent"]}
              style={styles.emptyGradient}
            >
              <Ionicons 
                name={activeTab === "daily" ? "sunny-outline" : "calendar-outline"} 
                size={48} 
                color={Colors.dark.textSecondary} 
              />
              <ThemedText style={styles.emptyTitle}>
                No {activeTab} quests yet
              </ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                {activeTab === "daily" 
                  ? "New daily quests are assigned each day" 
                  : "Weekly quests reset every Monday"}
              </ThemedText>
            </LinearGradient>
          </Animated.View>
        ) : (
          <View style={styles.questList}>
            {activeQuests.map((quest, index) => (
              <QuestCard 
                key={quest.id} 
                quest={quest} 
                index={index}
                onClaim={() => handleClaim(quest.id)}
                isClaiming={claimReward.isPending}
              />
            ))}
          </View>
        )}
        
        {dailySlot?.allCompleted && activeTab === "daily" ? (
          <Animated.View entering={FadeIn.delay(300)}>
            <LinearGradient
              colors={[Colors.dark.primary + "20", Colors.dark.xpCyan + "10"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.allCompleteBanner}
            >
              <Ionicons name="trophy" size={24} color={Colors.dark.primary} />
              <View style={styles.allCompleteContent}>
                <ThemedText style={styles.allCompleteTitle}>Daily Chain Complete!</ThemedText>
                <ThemedText style={styles.allCompleteSubtitle}>+50 Bonus XP earned</ThemedText>
              </View>
              <Ionicons name="sparkles" size={20} color={Colors.dark.xpCyan} />
            </LinearGradient>
          </Animated.View>
        ) : null}
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
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  tabTextActive: {
    color: Colors.dark.backgroundRoot,
  },
  tabBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tabBadgeActive: {
    backgroundColor: Colors.dark.backgroundRoot + "40",
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  chainHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  chainInfo: {
    flex: 1,
  },
  chainTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 4,
  },
  chainTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  chainSubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  chainProgress: {
    alignItems: "center",
  },
  chainProgressCircle: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  chainProgressInner: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  chainProgressText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  chainProgressRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    position: "absolute",
  },
  bonusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  bonusText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotComplete: {
    backgroundColor: Colors.dark.primary,
  },
  stepDotCurrent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  stepDotPending: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  stepNumber: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  stepLine: {
    width: 32,
    height: 2,
    marginHorizontal: 4,
  },
  stepLineComplete: {
    backgroundColor: Colors.dark.primary,
  },
  stepLinePending: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  questList: {
    gap: Spacing.sm,
  },
  questCard: {
    padding: Spacing.md,
  },
  questCardComplete: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  questHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  questIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  completeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  questInfo: {
    flex: 1,
  },
  questName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  questNameComplete: {
    color: Colors.dark.primary,
  },
  questDescription: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  rewardContainer: {
    alignItems: "flex-end",
  },
  xpRewardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.xpCyan + "15",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  xpRewardText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
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
    color: Colors.dark.backgroundRoot,
  },
  progressSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressBarContainer: {
    flex: 1,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
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
    minWidth: 50,
    textAlign: "right",
  },
  questMeta: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  difficultyText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.text,
    textTransform: "capitalize",
  },
  categoryBadge: {
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    textTransform: "capitalize",
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
    marginTop: Spacing.lg,
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
  allCompleteBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  allCompleteContent: {
    flex: 1,
  },
  allCompleteTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  allCompleteSubtitle: {
    fontSize: 13,
    color: Colors.dark.xpCyan,
  },
});
