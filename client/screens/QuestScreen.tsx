import React, { useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Alert, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";

interface Quest {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: { xp: number; coins: number };
  type: "daily" | "weekly";
  icon: string;
}

const INITIAL_QUESTS: Quest[] = [
  { id: "1", title: "Practice Forehand", description: "Complete 3 forehand drills", progress: 2, target: 3, reward: { xp: 150, coins: 50 }, type: "daily", icon: "radio-button-on-outline" },
  { id: "2", title: "Social Butterfly", description: "Send 5 messages in chat", progress: 3, target: 5, reward: { xp: 100, coins: 30 }, type: "daily", icon: "chatbubble-outline" },
  { id: "3", title: "Consistency King", description: "Practice 5 days in a row", progress: 3, target: 5, reward: { xp: 500, coins: 200 }, type: "weekly", icon: "calendar-outline" },
  { id: "4", title: "Match Winner", description: "Win 3 matches this week", progress: 1, target: 3, reward: { xp: 400, coins: 150 }, type: "weekly", icon: "ribbon-outline" },
];

export default function QuestScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { earnXP, earnCurrency } = usePlayer();
  const [quests, setQuests] = useState(INITIAL_QUESTS);

  const handleProgressQuest = async (quest: Quest) => {
    if (quest.progress >= quest.target) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuests(prev => prev.map(q => 
      q.id === quest.id ? { ...q, progress: Math.min(q.progress + 1, q.target) } : q
    ));
  };

  const handleClaimReward = async (quest: Quest) => {
    if (quest.progress < quest.target) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await earnXP(quest.reward.xp);
    await earnCurrency(0, quest.reward.coins);
    
    setQuests(prev => prev.map(q => 
      q.id === quest.id ? { ...q, progress: 0 } : q
    ));
    
    Alert.alert("Quest Complete!", `You earned ${quest.reward.xp} XP and ${quest.reward.coins} coins!`);
  };

  const renderQuest = ({ item }: { item: Quest }) => {
    const progressPercent = (item.progress / item.target) * 100;
    const isComplete = item.progress >= item.target;

    return (
      <Card 
        style={StyleSheet.flatten([styles.questCard, isComplete ? styles.completeCard : {}]) as ViewStyle}
        onPress={() => isComplete ? handleClaimReward(item) : handleProgressQuest(item)}
      >
        <View style={styles.questHeader}>
          <View style={[styles.iconContainer, { backgroundColor: isComplete ? Colors.dark.successNeon : Colors.dark.primary }]}>
            <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={Colors.dark.buttonText} />
          </View>
          <View style={styles.questInfo}>
            <ThemedText style={styles.questTitle}>{item.title}</ThemedText>
            <ThemedText style={styles.questDesc}>{item.description}</ThemedText>
          </View>
          {isComplete ? (
            <View style={styles.claimButton}>
              <ThemedText style={styles.claimText}>Claim</ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <ThemedText style={styles.progressText}>{item.progress}/{item.target}</ThemedText>
        </View>
        <View style={styles.rewards}>
          <View style={styles.rewardItem}>
            <Ionicons name="flash-outline" size={14} color={Colors.dark.xpCyan} />
            <ThemedText style={styles.rewardText}>+{item.reward.xp} XP</ThemedText>
          </View>
          <View style={styles.rewardItem}>
            <Ionicons name="ellipse-outline" size={14} color={Colors.dark.bronzeCoin} />
            <ThemedText style={styles.rewardText}>+{item.reward.coins}</ThemedText>
          </View>
        </View>
      </Card>
    );
  };

  const dailyQuests = quests.filter(q => q.type === "daily");
  const weeklyQuests = quests.filter(q => q.type === "weekly");

  return (
    <FlatList
      data={[...dailyQuests, ...weeklyQuests]}
      keyExtractor={(item) => item.id}
      renderItem={renderQuest}
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        gap: Spacing.md,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      ListHeaderComponent={
        <View style={styles.header}>
          <ThemedText style={styles.sectionTitle}>Daily Challenges</ThemedText>
          <ThemedText style={styles.headerHint}>Tap to progress, tap complete quests to claim</ThemedText>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerHint: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.5,
    marginTop: 4,
  },
  questCard: {
    padding: Spacing.lg,
  },
  completeCard: {
    borderWidth: 1,
    borderColor: Colors.dark.successNeon,
  },
  questHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  questInfo: {
    flex: 1,
  },
  questTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  questDesc: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  claimButton: {
    backgroundColor: Colors.dark.successNeon,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  claimText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    minWidth: 32,
    textAlign: "right",
  },
  rewards: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  rewardItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rewardText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
