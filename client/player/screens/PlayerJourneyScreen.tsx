import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";

interface Milestone {
  id: string;
  type: "level_up" | "badge" | "skill_unlock" | "validation" | "achievement" | "streak";
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

  const { data: journeyData } = useQuery({
    queryKey: ["/api/player/journey"],
    enabled: false,
  });

  const mockMilestones: Milestone[] = [
    {
      id: "1",
      type: "level_up",
      title: "Reached Level 12",
      description: "You've grown from Rising Star to Intermediate player!",
      date: new Date(Date.now() - 86400000 * 2).toISOString(),
      icon: "star",
      color: Colors.dark.gold,
      xpEarned: 100,
    },
    {
      id: "2",
      type: "badge",
      title: "Consistency Champion",
      description: "Attended 10 training sessions in a row",
      date: new Date(Date.now() - 86400000 * 5).toISOString(),
      icon: "trophy",
      color: Colors.dark.primary,
      xpEarned: 50,
    },
    {
      id: "3",
      type: "validation",
      title: "Forehand Level 3 Unlocked",
      description: "Your coach validated your forehand technique progression",
      date: new Date(Date.now() - 86400000 * 7).toISOString(),
      icon: "checkmark-circle",
      color: Colors.dark.xpCyan,
      xpEarned: 75,
      coachName: "Coach Mike",
    },
    {
      id: "4",
      type: "streak",
      title: "5-Day Training Streak",
      description: "You've trained 5 days in a row. Keep the momentum!",
      date: new Date(Date.now() - 86400000 * 10).toISOString(),
      icon: "flame",
      color: Colors.dark.orange,
      xpEarned: 25,
    },
    {
      id: "5",
      type: "level_up",
      title: "Reached Level 11",
      description: "Climbing the ranks steadily!",
      date: new Date(Date.now() - 86400000 * 14).toISOString(),
      icon: "star",
      color: Colors.dark.gold,
      xpEarned: 100,
    },
    {
      id: "6",
      type: "achievement",
      title: "First Match Played",
      description: "Competed in your first official match",
      date: new Date(Date.now() - 86400000 * 20).toISOString(),
      icon: "tennisball",
      color: Colors.dark.primary,
      xpEarned: 150,
    },
    {
      id: "7",
      type: "skill_unlock",
      title: "Red to Orange Transition",
      description: "Graduated from red ball to orange ball level",
      date: new Date(Date.now() - 86400000 * 30).toISOString(),
      icon: "arrow-up-circle",
      color: Colors.dark.ballOrange,
      xpEarned: 200,
      coachName: "Coach Mike",
    },
    {
      id: "8",
      type: "achievement",
      title: "Journey Begins",
      description: "Started your tennis journey at Glow Up Academy",
      date: new Date(Date.now() - 86400000 * 60).toISOString(),
      icon: "rocket",
      color: "#E040FB",
    },
  ];

  const mockBadges: Badge[] = [
    { id: "1", name: "First Steps", description: "Complete your first session", icon: "footsteps", color: Colors.dark.primary, earnedAt: new Date().toISOString(), isLocked: false },
    { id: "2", name: "Rising Star", description: "Reach level 5", icon: "star", color: Colors.dark.gold, earnedAt: new Date().toISOString(), isLocked: false },
    { id: "3", name: "Consistency", description: "10 sessions in a row", icon: "ribbon", color: Colors.dark.xpCyan, earnedAt: new Date().toISOString(), isLocked: false },
    { id: "4", name: "On Fire", description: "5-day training streak", icon: "flame", color: Colors.dark.orange, earnedAt: new Date().toISOString(), isLocked: false },
    { id: "5", name: "Ball Master", description: "Progress through all ball levels", icon: "tennisball", color: "#E040FB", earnedAt: "", isLocked: true },
    { id: "6", name: "Champion", description: "Win your first tournament", icon: "trophy", color: Colors.dark.gold, earnedAt: "", isLocked: true },
    { id: "7", name: "Iron Will", description: "30-day training streak", icon: "shield", color: Colors.dark.primary, earnedAt: "", isLocked: true },
    { id: "8", name: "Perfectionist", description: "100% attendance for a month", icon: "diamond", color: Colors.dark.xpCyan, earnedAt: "", isLocked: true },
  ];

  const milestones = mockMilestones;
  const badges = mockBadges;
  const earnedBadges = badges.filter(b => !b.isLocked).length;

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
            {milestones.reduce((sum, m) => sum + (m.xpEarned || 0), 0).toLocaleString()}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
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
