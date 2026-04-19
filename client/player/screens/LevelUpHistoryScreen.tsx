import React, { useState } from "react";
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
import Animated, { FadeInRight, FadeInUp } from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/player/context/PlayerContext";
import { LockedScreen } from "../components/LockedScreen";

interface LevelUpEvent {
  id: string;
  playerId: string;
  fromLevelId: string;
  toLevelId: string;
  trialId?: string;
  xpAwarded: number;
  badgesAwarded: string[];
  titleUnlocked?: string;
  celebrationShown: boolean;
  celebrationShownAt?: string;
  promotedAt: string;
  promotedBy?: string;
  fromLevel?: {
    id: string;
    name: string;
    displayName: string;
    color: string;
  };
  toLevel?: {
    id: string;
    name: string;
    displayName: string;
    color: string;
  };
}

const BALL_COLORS: Record<string, string> = {
  RED: "#FF4136",
  ORANGE: "#FF851B",
  GREEN: "#2ECC40",
  YELLOW: "#FFD700",
};

export default function LevelUpHistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { player } = usePlayer();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: levelUpHistory = [], isLoading } = useQuery<LevelUpEvent[]>({
    queryKey: [`/api/players/${player?.id}/level-ups`],
    enabled: !!player?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: [`/api/players/${player?.id}/level-ups`] });
    setRefreshing(false);
  };

  const getBallColor = (levelId: string) => {
    const stage = levelId?.split("_")[0] || "RED";
    return BALL_COLORS[stage] || Colors.dark.primary;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const renderLevelUpItem = ({ item, index }: { item: LevelUpEvent; index: number }) => {
    const toColor = getBallColor(item.toLevelId);
    const fromColor = getBallColor(item.fromLevelId);
    
    return (
      <Animated.View entering={FadeInRight.delay(index * 100).duration(400)}>
        <Pressable style={styles.levelUpCard}>
          <LinearGradient
            colors={[toColor + "30", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          
          <View style={styles.cardHeader}>
            <View style={styles.levelTransition}>
              <View style={[styles.levelBadge, { backgroundColor: fromColor + "40" }]}>
                <Text style={[styles.levelBadgeText, { color: fromColor }]}>
                  {item.fromLevel?.displayName || item.fromLevelId}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={Colors.dark.textSecondary} />
              <View style={[styles.levelBadge, { backgroundColor: toColor + "40" }]}>
                <Text style={[styles.levelBadgeText, { color: toColor }]}>
                  {item.toLevel?.displayName || item.toLevelId}
                </Text>
              </View>
            </View>
            <Text style={styles.dateText}>{formatDate(item.promotedAt)}</Text>
          </View>

          <View style={styles.rewardsSection}>
            <View style={styles.rewardItem}>
              <View style={styles.rewardIcon}>
                <Ionicons name="flash" size={18} color={Colors.dark.primary} />
              </View>
              <Text style={styles.rewardText}>+{item.xpAwarded} XP</Text>
            </View>

            {item.titleUnlocked && (
              <View style={styles.rewardItem}>
                <View style={[styles.rewardIcon, { backgroundColor: Colors.dark.gold + "20" }]}>
                  <Ionicons name="ribbon" size={18} color={Colors.dark.gold} />
                </View>
                <Text style={[styles.rewardText, { color: Colors.dark.gold }]}>
                  {item.titleUnlocked}
                </Text>
              </View>
            )}

            {item.badgesAwarded && item.badgesAwarded.length > 0 && (
              <View style={styles.badgesRow}>
                {item.badgesAwarded.map((badge, idx) => (
                  <View key={idx} style={styles.badgeTag}>
                    <Ionicons name="shield-checkmark" size={14} color={Colors.dark.primary} />
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {item.trialId && (
            <View style={styles.trialIndicator}>
              <Ionicons name="checkmark-done-circle" size={16} color={Colors.dark.primary} />
              <Text style={styles.trialText}>Trial Gate Passed</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const renderEmptyState = () => (
    <Animated.View entering={FadeInUp.duration(400)} style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="trophy-outline" size={64} color={Colors.dark.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>No Level-Ups Yet</Text>
      <Text style={styles.emptySubtitle}>
        Keep training and improving your skills to unlock new levels!
      </Text>
    </Animated.View>
  );

  const renderStats = () => {
    if (levelUpHistory.length === 0) return null;
    
    const totalXP = levelUpHistory.reduce((sum, event) => sum + event.xpAwarded, 0);
    const totalBadges = levelUpHistory.reduce((sum, event) => sum + (event.badgesAwarded?.length || 0), 0);
    const totalTitles = levelUpHistory.filter(event => event.titleUnlocked).length;

    return (
      <Animated.View entering={FadeInUp.duration(300)} style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{levelUpHistory.length}</Text>
          <Text style={styles.statLabel}>Level-Ups</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.dark.primary }]}>{totalXP}</Text>
          <Text style={styles.statLabel}>XP Earned</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.dark.gold }]}>{totalBadges}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: "#9B59B6" }]}>{totalTitles}</Text>
          <Text style={styles.statLabel}>Titles</Text>
        </View>
      </Animated.View>
    );
  };

  if (isLoading) {
    return (
      <LockedScreen featureKey="level_up_history">
        <View style={[styles.container, styles.loadingContainer]}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading your journey...</Text>
        </View>
      </LockedScreen>
    );
  }

  return (
    <LockedScreen featureKey="level_up_history">
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Level-Up History</Text>
          <View style={styles.headerSpacer} />
        </View>

        {renderStats()}

        <FlatList
          data={levelUpHistory}
          renderItem={renderLevelUpItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.dark.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    </LockedScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.dark.textSecondary,
    fontSize: Typography.body.fontSize,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h1.fontWeight,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 32,
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h1.fontWeight,
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.dark.border,
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  levelUpCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  levelTransition: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  levelBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  levelBadgeText: {
    fontSize: Typography.small.fontSize,
    fontWeight: Typography.h2.fontWeight,
  },
  dateText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textSecondary,
  },
  rewardsSection: {
    gap: Spacing.sm,
  },
  rewardItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rewardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  rewardText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: Typography.caption.fontWeight,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  badgeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.primary,
  },
  trialIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  trialText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.primary,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.xl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h1.fontWeight,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
