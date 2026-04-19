import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInRight } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";
import { usePlayerLevelContext } from "@/player/context/PlayerLevelContext";
import { LockedScreen } from "../components/LockedScreen";

interface XPEvent {
  id: string;
  playerId: string;
  actionSource: string;
  xpAmount: number;
  contextType?: string;
  contextId?: string;
  previousXp?: number;
  newXp?: number;
  previousLevel?: number;
  newLevel?: number;
  triggeredLevelUp: boolean;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  session_attendance: { icon: "tennisball", color: Colors.dark.primary, label: "Session Attended" },
  positive_feedback: { icon: "happy", color: Colors.dark.gold, label: "Positive Feedback" },
  match_played: { icon: "trophy", color: Colors.dark.primary, label: "Match Played" },
  match_won: { icon: "medal", color: Colors.dark.gold, label: "Match Won" },
  match_reflection: { icon: "bulb", color: "#9B59B6", label: "Match Reflection" },
  quest_completed: { icon: "flag", color: Colors.dark.orange, label: "Quest Completed" },
  daily_login: { icon: "sunny", color: Colors.dark.gold, label: "Daily Login" },
  first_session: { icon: "rocket", color: "#E91E63", label: "First Session" },
  streak_bonus: { icon: "flame", color: Colors.dark.orange, label: "Streak Bonus" },
  level_up_bonus: { icon: "star", color: Colors.dark.gold, label: "Level Up Bonus" },
  skill_evidence: { icon: "videocam", color: Colors.dark.primary, label: "Skill Evidence" },
  trial_passed: { icon: "checkmark-circle", color: Colors.dark.primary, label: "Trial Passed" },
  community_post: { icon: "chatbubble", color: "#9B59B6", label: "Community Post" },
  friend_added: { icon: "people", color: "#E91E63", label: "Friend Added" },
};

const DEFAULT_ACTION_CONFIG = { icon: "flash", color: Colors.dark.primary, label: "XP Earned" };

export default function XPHistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { player } = usePlayer();
  const { level, currentXp, xpForNextLevel } = usePlayerLevelContext();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: xpHistory = [], isLoading } = useQuery<XPEvent[]>({
    queryKey: [`/api/player-level/player/${player?.id}/xp-history`],
    enabled: !!player?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: [`/api/player-level/player/${player?.id}/xp-history`] });
    setRefreshing(false);
  };

  const totalXpEarned = xpHistory.reduce((sum, event) => sum + event.xpAmount, 0);
  const levelUpsTriggered = xpHistory.filter(e => e.triggeredLevelUp).length;

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const groupEventsByDate = (events: XPEvent[]) => {
    const groups: Record<string, XPEvent[]> = {};
    
    events.forEach(event => {
      const date = new Date(event.createdAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let key: string;
      if (date.toDateString() === today.toDateString()) {
        key = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = "Yesterday";
      } else {
        key = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    
    return Object.entries(groups);
  };

  const renderXPEvent = (event: XPEvent, index: number) => {
    const config = ACTION_CONFIG[event.actionSource] || DEFAULT_ACTION_CONFIG;
    
    return (
      <Animated.View
        key={event.id}
        entering={FadeInRight.delay(index * 30)}
        style={styles.eventCard}
      >
        <View style={[styles.eventIcon, { backgroundColor: config.color + "20" }]}>
          <Ionicons name={config.icon as any} size={20} color={config.color} />
        </View>
        
        <View style={styles.eventContent}>
          <Text style={styles.eventLabel}>{config.label}</Text>
          <Text style={styles.eventTime}>{formatTimeAgo(event.createdAt)}</Text>
        </View>
        
        <View style={styles.eventXp}>
          <Text style={[styles.xpAmount, { color: config.color }]}>+{event.xpAmount}</Text>
          <Text style={styles.xpLabel}>XP</Text>
        </View>
        
        {event.triggeredLevelUp ? (
          <View style={styles.levelUpBadge}>
            <Ionicons name="arrow-up" size={12} color={Colors.dark.gold} />
          </View>
        ) : null}
      </Animated.View>
    );
  };

  const renderSection = ({ item }: { item: [string, XPEvent[]] }) => {
    const [date, events] = item;
    const dayTotal = events.reduce((sum, e) => sum + e.xpAmount, 0);
    
    return (
      <View style={styles.dateSection}>
        <View style={styles.dateSectionHeader}>
          <Text style={styles.dateLabel}>{date}</Text>
          <Text style={styles.dateTotalXp}>+{dayTotal} XP</Text>
        </View>
        {events.map((event, index) => renderXPEvent(event, index))}
      </View>
    );
  };

  const groupedEvents = groupEventsByDate(xpHistory);

  return (
    <LockedScreen featureKey="xp_history">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>XP History</Text>
          <View style={styles.headerSpacer} />
        </View>

      <View style={styles.summaryCard}>
        <LinearGradient
          colors={[Colors.dark.primary + "20", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summaryGradient}
        >
          <View style={styles.currentLevel}>
            <View style={styles.levelBadge}>
              <Ionicons name="star" size={20} color={Colors.dark.gold} />
              <Text style={styles.levelNumber}>{level}</Text>
            </View>
            <View style={styles.levelProgress}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${Math.min((currentXp / xpForNextLevel) * 100, 100)}%` },
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {currentXp} / {xpForNextLevel} XP to Level {level + 1}
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalXpEarned.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total XP Earned</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{xpHistory.length}</Text>
              <Text style={styles.statLabel}>Activities</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{levelUpsTriggered}</Text>
              <Text style={styles.statLabel}>Level Ups</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={styles.loader} />
      ) : xpHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="flash-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No XP Activity Yet</Text>
          <Text style={styles.emptySubtext}>
            Attend sessions, complete quests, and play matches to earn XP!
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupedEvents}
          keyExtractor={([date]) => date}
          renderItem={renderSection}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.dark.primary}
            />
          }
        />
      )}
      </View>
    </LockedScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.heading3,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  summaryCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  summaryGradient: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  currentLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  levelNumber: {
    ...Typography.heading3,
    color: Colors.dark.gold,
  },
  levelProgress: {
    flex: 1,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 4,
  },
  progressText: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.heading4,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  listContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  dateSection: {
    marginBottom: Spacing.lg,
  },
  dateSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  dateLabel: {
    ...Typography.bodyLarge,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  dateTotalXp: {
    ...Typography.bodySmall,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  eventContent: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  eventLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  eventTime: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  eventXp: {
    alignItems: "flex-end",
  },
  xpAmount: {
    ...Typography.heading4,
    fontWeight: "700",
  },
  xpLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  levelUpBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.gold,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  emptyText: {
    ...Typography.bodyLarge,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.bodySmall,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  loader: {
    marginTop: Spacing.xl,
  },
});
