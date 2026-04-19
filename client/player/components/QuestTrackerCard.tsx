import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";

interface Quest {
  id: string;
  name: string;
  iconName: string;
  iconColor: string;
  currentProgress: number;
  targetProgress: number;
  status: string;
  xpReward?: number;
}

interface QuestTrackerCardProps {
  quests: Quest[];
  completedCount: number;
  totalCount: number;
  streak?: number;
  streakMultiplier?: number;
  onQuestPress?: (quest: Quest) => void;
  onClaimReward?: (quest: Quest) => void;
  onViewAll?: () => void;
}

function QuestItem({ quest, onPress, onClaim }: { quest: Quest; onPress?: () => void; onClaim?: () => void }) {
  const isComplete = quest.status === "completed";
  const isClaimed = quest.status === "claimed";
  const progress = quest.targetProgress > 0 ? quest.currentProgress / quest.targetProgress : 0;
  
  return (
    <Pressable 
      style={[styles.questItem, isComplete && styles.questItemComplete]}
      onPress={onPress}
    >
      <View style={[styles.questIconContainer, { backgroundColor: quest.iconColor + "20" }]}>
        <Ionicons 
          name={quest.iconName as any} 
          size={20} 
          color={isComplete ? Colors.dark.primary : quest.iconColor} 
        />
        {isComplete && !isClaimed ? (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={10} color={Colors.dark.buttonText} />
          </View>
        ) : null}
      </View>
      
      <View style={styles.questContent}>
        <ThemedText style={[styles.questName, isComplete && styles.questNameComplete]} numberOfLines={1}>
          {quest.name}
        </ThemedText>
        
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${progress * 100}%`,
                  backgroundColor: isComplete ? Colors.dark.primary : quest.iconColor,
                }
              ]} 
            />
          </View>
          <ThemedText style={styles.progressText}>
            {quest.currentProgress}/{quest.targetProgress}
          </ThemedText>
        </View>
      </View>
      
      {isComplete && !isClaimed ? (
        <Pressable style={styles.claimButton} onPress={onClaim}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.claimButtonGradient}
          >
            <ThemedText style={styles.claimButtonText}>Claim</ThemedText>
          </LinearGradient>
        </Pressable>
      ) : (
        <View style={styles.xpBadge}>
          <ThemedText style={styles.xpBadgeText}>+{quest.xpReward}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export function QuestTrackerCard({ 
  quests, 
  completedCount, 
  totalCount,
  streak = 0,
  streakMultiplier = 1,
  onQuestPress, 
  onClaimReward,
  onViewAll,
}: QuestTrackerCardProps) {
  const allCompleted = completedCount >= totalCount && totalCount > 0;
  
  const sortedQuests = [...quests].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return -1;
    if (b.status === "completed" && a.status !== "completed") return 1;
    const progressA = a.targetProgress > 0 ? a.currentProgress / a.targetProgress : 0;
    const progressB = b.targetProgress > 0 ? b.currentProgress / b.targetProgress : 0;
    return progressB - progressA;
  });
  
  const displayQuests = sortedQuests.slice(0, 3);
  
  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {streak > 0 ? (
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={16} color="#FF6B35" />
              <ThemedText style={styles.streakText}>{streak}</ThemedText>
            </View>
          ) : (
            <Ionicons name="flash" size={20} color={Colors.dark.primary} />
          )}
          <ThemedText style={styles.title}>Daily Quests</ThemedText>
          {streakMultiplier > 1 ? (
            <View style={styles.multiplierMini}>
              <ThemedText style={styles.multiplierMiniText}>{streakMultiplier}x</ThemedText>
            </View>
          ) : null}
        </View>
        
        <Pressable style={styles.viewAllContainer} onPress={onViewAll}>
          <View style={styles.progressBadge}>
            <ThemedText style={styles.progressBadgeText}>
              {completedCount}/{totalCount}
            </ThemedText>
            {allCompleted ? (
              <Ionicons name="checkmark-circle" size={16} color={Colors.dark.primary} />
            ) : null}
          </View>
          {onViewAll ? (
            <Ionicons name="chevron-forward" size={16} color={Colors.dark.textSecondary} />
          ) : null}
        </Pressable>
      </View>
      
      {displayQuests.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="sparkles" size={32} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyText}>No quests yet - check back soon!</ThemedText>
        </View>
      ) : (
        <View style={styles.questList}>
          {displayQuests.map((quest, index) => (
            <Animated.View key={quest.id} entering={FadeIn.delay(index * 100)}>
              <QuestItem 
                quest={quest} 
                onPress={() => onQuestPress?.(quest)}
                onClaim={() => onClaimReward?.(quest)}
              />
            </Animated.View>
          ))}
        </View>
      )}
      
      {allCompleted ? (
        <LinearGradient
          colors={[Colors.dark.primary + "20", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.completedBanner}
        >
          <Ionicons name="trophy" size={18} color={Colors.dark.primary} />
          <ThemedText style={styles.completedText}>All quests complete! Bonus unlocked</ThemedText>
        </LinearGradient>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#FF6B35" + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  streakText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FF6B35",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  multiplierMini: {
    backgroundColor: "#FFD700" + "20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  multiplierMiniText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFD700",
  },
  viewAllContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  questList: {
    gap: Spacing.sm,
  },
  questItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  questItemComplete: {
    backgroundColor: Colors.dark.primary + "10",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  questIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  checkBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  questContent: {
    flex: 1,
  },
  questName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  questNameComplete: {
    color: Colors.dark.primary,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    minWidth: 30,
  },
  xpBadge: {
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  xpBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  claimButton: {
    borderRadius: 8,
    overflow: "hidden",
  },
  claimButtonGradient: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    alignItems: "center",
  },
  claimButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  completedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  completedText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
});
