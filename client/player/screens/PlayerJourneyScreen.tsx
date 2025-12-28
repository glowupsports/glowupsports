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

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earned: boolean;
  earnedAt: string | null;
}

interface DomainBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earned: boolean;
  earnedAt: string | null;
  progress: number;
  domainId: string;
}

interface RecognitionData {
  achievements: Achievement[];
  domainBadges: DomainBadge[];
  validations: Array<{
    id: string;
    type: string;
    domain: string;
    status: string;
    validatedAt: string;
  }>;
  summary: {
    totalAchievements: number;
    earnedAchievements: number;
    totalDomainBadges: number;
    earnedDomainBadges: number;
    totalValidations: number;
  };
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

function AchievementCard({ achievement }: { achievement: Achievement }) {
  return (
    <View style={[styles.achievementCard, !achievement.earned && styles.achievementCardLocked]}>
      <View style={[
        styles.achievementIcon, 
        { backgroundColor: achievement.earned ? `${achievement.color}20` : Colors.dark.backgroundTertiary }
      ]}>
        <Ionicons 
          name={achievement.icon as any} 
          size={28} 
          color={achievement.earned ? achievement.color : Colors.dark.textMuted} 
        />
      </View>
      <View style={styles.achievementInfo}>
        <Text style={[styles.achievementName, !achievement.earned && styles.achievementNameLocked]}>
          {achievement.name}
        </Text>
        <Text style={styles.achievementDescription}>{achievement.description}</Text>
      </View>
      {achievement.earned ? (
        <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
      ) : (
        <Ionicons name="ellipse-outline" size={20} color={Colors.dark.textMuted} />
      )}
    </View>
  );
}

function DomainBadgeCard({ badge }: { badge: DomainBadge }) {
  return (
    <View style={[styles.domainBadgeCard, !badge.earned && styles.domainBadgeCardLocked]}>
      <View style={[
        styles.domainBadgeIcon, 
        { backgroundColor: badge.earned ? `${badge.color}20` : Colors.dark.backgroundTertiary }
      ]}>
        <Ionicons 
          name={badge.icon as any} 
          size={24} 
          color={badge.earned ? badge.color : Colors.dark.textMuted} 
        />
      </View>
      <Text style={[styles.domainBadgeName, !badge.earned && styles.domainBadgeNameLocked]}>
        {badge.name}
      </Text>
      <View style={styles.domainBadgeProgress}>
        <View 
          style={[
            styles.domainBadgeProgressFill, 
            { width: `${badge.progress}%`, backgroundColor: badge.earned ? badge.color : Colors.dark.textMuted }
          ]} 
        />
      </View>
      <Text style={styles.domainBadgeProgressText}>{badge.progress}%</Text>
    </View>
  );
}

export default function PlayerJourneyScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState<"timeline" | "achievements" | "skills">("timeline");

  const { data: journeyData, isLoading: journeyLoading, error: journeyError } = useQuery<JourneyData>({
    queryKey: ["/api/player/me/journey"],
  });
  
  const { data: recognitionData, isLoading: recognitionLoading } = useQuery<RecognitionData>({
    queryKey: ["/api/player/me/recognition"],
  });
  
  const isLoading = journeyLoading;
  const error = journeyError;

  if (isLoading || recognitionLoading) {
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

  const milestones = journeyData?.milestones || [];
  const totalXp = (journeyData?.xpHistory || []).reduce((sum, xp) => sum + xp.amount, 0);
  
  const achievements = recognitionData?.achievements || [];
  const domainBadges = recognitionData?.domainBadges || [];
  const summary = recognitionData?.summary || { 
    earnedAchievements: 0, 
    totalAchievements: achievements.length, 
    earnedDomainBadges: 0, 
    totalDomainBadges: domainBadges.length 
  };

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
          <Text style={styles.statValue}>{summary.earnedAchievements}/{summary.totalAchievements}</Text>
          <Text style={styles.statLabel}>Achievements</Text>
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
            size={16} 
            color={activeTab === "timeline" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "timeline" && styles.tabTextActive]}>
            Timeline
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "achievements" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("achievements");
          }}
        >
          <Ionicons 
            name="trophy-outline" 
            size={16} 
            color={activeTab === "achievements" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "achievements" && styles.tabTextActive]}>
            Awards
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "skills" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("skills");
          }}
        >
          <Ionicons 
            name="star-outline" 
            size={16} 
            color={activeTab === "skills" ? Colors.dark.xpCyan : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "skills" && styles.tabTextActive]}>
            Skills
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
              <Ionicons name="tennisball-outline" size={64} color={Colors.dark.xpCyan} />
              <Text style={styles.emptyText}>Your story starts today</Text>
              <Text style={styles.emptySubtext}>
                Every training session writes a new chapter in your tennis journey
              </Text>
            </View>
          }
        />
      ) : activeTab === "achievements" ? (
        <FlatList
          data={achievements}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AchievementCard achievement={item} />}
          contentContainerStyle={[
            styles.achievementsContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No achievements yet</Text>
              <Text style={styles.emptySubtext}>
                Complete training sessions to earn achievements
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          key="badges-grid-2"
          data={domainBadges}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => <DomainBadgeCard badge={item} />}
          contentContainerStyle={[
            styles.badgesContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="star-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>Skill badges loading</Text>
              <Text style={styles.emptySubtext}>
                Your coach validates your skill progress
              </Text>
            </View>
          }
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
  achievementsContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  achievementCard: {
    ...CardStyles.elevated,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  achievementCardLocked: {
    opacity: 0.6,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  achievementInfo: {
    flex: 1,
  },
  achievementName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  achievementNameLocked: {
    color: Colors.dark.textMuted,
  },
  achievementDescription: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  domainBadgeCard: {
    flex: 1,
    maxWidth: "50%",
    ...CardStyles.elevated,
    padding: Spacing.md,
    margin: Spacing.xs,
    alignItems: "center",
    gap: Spacing.sm,
  },
  domainBadgeCardLocked: {
    opacity: 0.6,
  },
  domainBadgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  domainBadgeName: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
    textAlign: "center",
  },
  domainBadgeNameLocked: {
    color: Colors.dark.textMuted,
  },
  domainBadgeProgress: {
    width: "100%",
    height: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 2,
    overflow: "hidden",
  },
  domainBadgeProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  domainBadgeProgressText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
});
