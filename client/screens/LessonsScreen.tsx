import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";

interface Lesson {
  id: string;
  title: string;
  coach: string;
  duration: string;
  xpReward: number;
  coinsReward: number;
  status: "available" | "completed" | "locked";
  skillType: string;
  skillId: string;
}

const LESSONS: Lesson[] = [
  { id: "1", title: "Forehand Basics", coach: "Coach Maria", duration: "30 min", xpReward: 100, coinsReward: 25, status: "available", skillType: "Technical", skillId: "technical" },
  { id: "2", title: "Backhand Slice", coach: "Coach David", duration: "45 min", xpReward: 150, coinsReward: 40, status: "available", skillType: "Technical", skillId: "technical" },
  { id: "3", title: "Court Positioning", coach: "Coach Maria", duration: "30 min", xpReward: 120, coinsReward: 30, status: "available", skillType: "Tactical", skillId: "tactical" },
  { id: "4", title: "Mental Focus", coach: "Coach Lisa", duration: "25 min", xpReward: 80, coinsReward: 20, status: "available", skillType: "Mental", skillId: "mental" },
  { id: "5", title: "Serve Power", coach: "Coach David", duration: "40 min", xpReward: 140, coinsReward: 35, status: "available", skillType: "Physical", skillId: "physical" },
];

export default function LessonsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { earnXP, earnCurrency, updateSkill } = usePlayer();

  const handleCompleteLesson = async (lesson: Lesson) => {
    if (lesson.status === "locked") return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateSkill(lesson.skillId, 10);
    await earnCurrency(0, lesson.coinsReward);
    await earnXP(lesson.xpReward);
  };

  const getStatusColor = (status: Lesson["status"]) => {
    switch (status) {
      case "completed": return Colors.dark.successNeon;
      case "available": return Colors.dark.primary;
      case "locked": return Colors.dark.disabled;
    }
  };

  const getStatusIcon = (status: Lesson["status"]): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "completed": return "checkmark-circle-outline";
      case "available": return "play-circle-outline";
      case "locked": return "lock-closed-outline";
    }
  };

  const renderLesson = ({ item }: { item: Lesson }) => (
    <Card
      style={[styles.lessonCard, item.status === "locked" && styles.lockedCard]}
      onPress={() => handleCompleteLesson(item)}
    >
      <View style={styles.lessonHeader}>
        <View style={styles.lessonInfo}>
          <ThemedText style={styles.lessonTitle}>{item.title}</ThemedText>
          <ThemedText style={styles.lessonCoach}>{item.coach}</ThemedText>
        </View>
        <Ionicons name={getStatusIcon(item.status)} size={24} color={getStatusColor(item.status)} />
      </View>
      <View style={styles.lessonMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={Colors.dark.text} />
          <ThemedText style={styles.metaText}>{item.duration}</ThemedText>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="flash-outline" size={14} color={Colors.dark.xpCyan} />
          <ThemedText style={[styles.metaText, { color: Colors.dark.xpCyan }]}>+{item.xpReward} XP</ThemedText>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="ellipse-outline" size={14} color={Colors.dark.bronzeCoin} />
          <ThemedText style={[styles.metaText, { color: Colors.dark.bronzeCoin }]}>+{item.coinsReward}</ThemedText>
        </View>
      </View>
      <View style={[styles.skillBadge, { backgroundColor: Colors.dark.backgroundSecondary }]}>
        <ThemedText style={styles.skillText}>{item.skillType}</ThemedText>
      </View>
    </Card>
  );

  return (
    <FlatList
      data={LESSONS}
      keyExtractor={(item) => item.id}
      renderItem={renderLesson}
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        gap: Spacing.md,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      ListHeaderComponent={
        <ThemedText style={styles.headerText}>Tap a lesson to complete and earn rewards</ThemedText>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.sm,
  },
  lessonCard: {
    padding: Spacing.lg,
  },
  lockedCard: {
    opacity: 0.5,
  },
  lessonHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  lessonInfo: {
    flex: 1,
  },
  lessonTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  lessonCoach: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  lessonMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.8,
  },
  skillBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  skillText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
