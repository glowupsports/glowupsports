import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";

interface Milestone {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  icon: string;
  color: string;
  xpEarned?: number;
  coachName?: string;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earnedAt: string;
  isLocked: boolean;
}

interface JourneyData {
  milestones: Milestone[];
  badges: Badge[];
  badgesAvailable: boolean;
  badgeMessage?: string;
  totalMilestones: number;
  totalBadges: number;
  xpHistory: Array<{
    id: string;
    amount: number;
    reason: string;
    date: string;
  }>;
}

function MilestoneCard({ milestone, isFirst }: { milestone: Milestone; isFirst: boolean }) {
  const date = new Date(milestone.date);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={styles.milestoneContainer}>
      <View style={styles.timelineTrack}>
        <View style={[styles.timelineDot, { backgroundColor: milestone.color }]}>
          <Ionicons name={milestone.icon as any} size={14} color={Colors.dark.backgroundRoot} />
        </View>
        {!isFirst ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.milestoneCard}>
        <View style={styles.milestoneHeader}>
          <Text style={styles.milestoneTitle}>{milestone.title}</Text>
          {milestone.xpEarned ? (
            <View style={styles.xpBadge}>
              <Ionicons name="flash" size={12} color={Colors.dark.xpCyan} />
              <Text style={styles.xpText}>+{milestone.xpEarned}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.milestoneDescription}>{milestone.description}</Text>
        <View style={styles.milestoneFooter}>
          <Text style={styles.milestoneDate}>{dateStr}</Text>
          {milestone.coachName ? (
            <Text style={styles.milestoneCoach}>by {milestone.coachName}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <View style={[styles.badgeCard, badge.isLocked && styles.badgeCardLocked]}>
      <View style={[
        styles.badgeIcon, 
        { backgroundColor: badge.isLocked ? Colors.dark.backgroundTertiary : `${badge.color}20` }
      ]}>
        <Ionicons 
          name={badge.icon as any} 
          size={24} 
          color={badge.isLocked ? Colors.dark.textMuted : badge.color} 
        />
      </View>
      <Text style={[styles.badgeName, badge.isLocked && styles.badgeNameLocked]}>
        {badge.name}
      </Text>
      {badge.isLocked ? (
        <Ionicons name="lock-closed" size={12} color={Colors.dark.textMuted} />
      ) : null}
    </View>
  );
}

export default function PlayerJourneyScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState<"timeline" | "badges">("timeline");

  const { data: journeyData, isLoading, error } = useQuery<JourneyData>({
    queryKey: ["/api/player/me/journey"],
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        <Text style={styles.loadingText}>Loading your journey...</Text>
      </View>
    );
  }

  if (error || !journeyData) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Unable to load journey</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
      </View>
    );
  }

  const milestones = journeyData.milestones;
  const badges = journeyData.badges;
  const badgesAvailable = journeyData.badgesAvailable;
  const badgeMessage = journeyData.badgeMessage;
  const earnedBadges = badges.filter(b => !b.isLocked).length;
  const totalXp = journeyData.xpHistory.reduce((sum, xp) => sum + xp.amount, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Journey</Text>
        <Text style={styles.subtitle}>Your tennis story unfolds</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{milestones.length}</Text>
          <Text style={styles.statLabel}>Milestones</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{earnedBadges}/{badges.length}</Text>
          <Text style={styles.statLabel}>Badges</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {totalXp.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>XP Earned</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === "timeline" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("timeline");
          }}
        >
          <Ionicons 
            name="time-outline" 
            size={18} 
            color={activeTab === "timeline" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "timeline" && styles.tabTextActive]}>
            Timeline
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "badges" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("badges");
          }}
        >
          <Ionicons 
            name="medal-outline" 
            size={18} 
            color={activeTab === "badges" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "badges" && styles.tabTextActive]}>
            Badges
          </Text>
        </Pressable>
      </View>

      {activeTab === "timeline" ? (
        <FlatList
          data={milestones}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <MilestoneCard milestone={item} isFirst={index === 0} />
          )}
          contentContainerStyle={[
            styles.timelineContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="rocket-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>Your journey is just beginning</Text>
              <Text style={styles.emptySubtext}>
                Complete training sessions to earn milestones
              </Text>
            </View>
          }
        />
      ) : (
        badgesAvailable && badges.length > 0 ? (
          <FlatList
            data={badges}
            keyExtractor={(item) => item.id}
            numColumns={4}
            renderItem={({ item }) => <BadgeCard badge={item} />}
            contentContainerStyle={[
              styles.badgesContent,
              { paddingBottom: insets.bottom + 100 },
            ]}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={[styles.emptyState, { paddingBottom: insets.bottom + 100 }]}>
            <Ionicons name="medal-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>Badges Coming Soon</Text>
            <Text style={styles.emptySubtext}>
              {badgeMessage || "Keep training to unlock achievements!"}
            </Text>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  errorSubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  header: {
    padding: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  subtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    ...CardStyles.statusCard,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: {
    ...Typography.numberMedium,
    color: Colors.dark.xpCyan,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
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
    borderRadius: BorderRadius.xs,
  },
  tabActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  tabText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  tabTextActive: {
    color: Colors.dark.xpCyan,
  },
  timelineContent: {
    paddingHorizontal: Spacing.xl,
  },
  milestoneContainer: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  timelineTrack: {
    width: 32,
    alignItems: "center",
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  timelineLine: {
    position: "absolute",
    top: 28,
    bottom: -Spacing.md,
    width: 2,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  milestoneCard: {
    flex: 1,
    ...CardStyles.elevated,
    marginLeft: Spacing.md,
    padding: Spacing.lg,
  },
  milestoneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  milestoneTitle: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    marginLeft: Spacing.sm,
  },
  xpText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontSize: 10,
  },
  milestoneDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  milestoneFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  milestoneDate: {
    ...Typography.caption,
    color: Colors.dark.textSubtle,
  },
  milestoneCoach: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  badgesContent: {
    paddingHorizontal: Spacing.lg,
  },
  badgeCard: {
    flex: 1,
    maxWidth: "25%",
    alignItems: "center",
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  badgeCardLocked: {
    opacity: 0.5,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  badgeName: {
    ...Typography.caption,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: 2,
  },
  badgeNameLocked: {
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
});
