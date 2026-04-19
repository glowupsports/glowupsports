import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from "react-native-reanimated";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { PlayerAIInsightsCard } from "@/components/PlayerAIInsightsCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
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

function MilestoneCard({ milestone, isFirst, isExpanded, onToggle }: { 
  milestone: Milestone; 
  isFirst: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const date = new Date(milestone.date);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const getSkillImprovements = () => {
    const typeMap: Record<string, { domain: string; skill: string; improvement: string }> = {
      "training": { domain: "Technical", skill: "Groundstrokes", improvement: "Improved stroke consistency" },
      "session": { domain: "Technical", skill: "Serve", improvement: "Better ball placement" },
      "feedback": { domain: "Mental", skill: "Focus", improvement: "Enhanced concentration" },
      "level_up": { domain: "Overall", skill: "Tennis IQ", improvement: "Leveled up!" },
      "badge": { domain: "Achievement", skill: "Recognition", improvement: "Unlocked badge" },
    };
    return typeMap[milestone.type] || { domain: "General", skill: "Training", improvement: "Made progress" };
  };

  const skillInfo = getSkillImprovements();

  return (
    <Pressable 
      style={styles.milestoneContainer}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle();
      }}
    >
      <View style={styles.timelineTrack}>
        <View style={[styles.timelineDot, { backgroundColor: milestone.color }]}>
          <Ionicons name={milestone.icon as any} size={14} color={Colors.dark.buttonText} />
        </View>
        {!isFirst ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={[styles.milestoneCard, isExpanded && styles.milestoneCardExpanded]}>
        <View style={styles.milestoneHeader}>
          <Text style={styles.milestoneTitle}>{milestone.title}</Text>
          <View style={styles.milestoneHeaderRight}>
            {milestone.xpEarned ? (
              <View style={styles.xpBadge}>
                <Ionicons name="flash" size={12} color={Colors.dark.primary} />
                <Text style={styles.xpText}>+{milestone.xpEarned}</Text>
              </View>
            ) : null}
            <Ionicons 
              name={isExpanded ? "chevron-up" : "chevron-down"} 
              size={16} 
              color={Colors.dark.textMuted} 
            />
          </View>
        </View>
        <Text style={styles.milestoneDescription}>{milestone.description}</Text>
        
        {isExpanded ? (
          <View style={styles.milestoneExpanded}>
            <View style={styles.skillImprovementRow}>
              <View style={styles.skillChip}>
                <Ionicons name="fitness" size={12} color={Colors.dark.primary} />
                <Text style={styles.skillChipText}>{skillInfo.domain}</Text>
              </View>
              <View style={[styles.skillChip, { backgroundColor: Colors.dark.primary + "15" }]}>
                <Ionicons name="trending-up" size={12} color={Colors.dark.primary} />
                <Text style={[styles.skillChipText, { color: Colors.dark.primary }]}>{skillInfo.skill}</Text>
              </View>
            </View>
            <View style={styles.improvementBox}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.dark.primary} />
              <Text style={styles.improvementText}>{skillInfo.improvement}</Text>
            </View>
          </View>
        ) : null}
        
        <View style={styles.milestoneFooter}>
          <Text style={styles.milestoneDate}>{dateStr}</Text>
          {milestone.coachName ? (
            <Text style={styles.milestoneCoach}>by {milestone.coachName}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
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

function AchievementCard({ achievement, onPress }: { achievement: Achievement; onPress: () => void }) {
  return (
    <Pressable 
      style={[styles.achievementCard, !achievement.earned && styles.achievementCardLocked]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
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
      <View style={styles.achievementRight}>
        {achievement.earned ? (
          <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
        ) : (
          <Ionicons name="ellipse-outline" size={20} color={Colors.dark.textMuted} />
        )}
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );
}

function DomainBadgeCard({ badge, onPress }: { badge: DomainBadge; onPress: () => void }) {
  return (
    <Pressable 
      style={[styles.domainBadgeCard, !badge.earned && styles.domainBadgeCardLocked]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
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
      <Ionicons name="information-circle-outline" size={14} color={Colors.dark.textMuted} style={{ marginTop: 4 }} />
    </Pressable>
  );
}

function AchievementDetailModal({ 
  achievement, 
  visible, 
  onClose 
}: { 
  achievement: Achievement | null; 
  visible: boolean; 
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!achievement) return null;

  const getRequirements = () => {
    const reqMap: Record<string, { xp: number; requirement: string }> = {
      "first_session": { xp: 50, requirement: "Complete your first training session" },
      "week_streak": { xp: 100, requirement: "Train 7 days in a row" },
      "level_5": { xp: 150, requirement: "Reach Level 5" },
      "level_10": { xp: 250, requirement: "Reach Level 10" },
      "feedback_master": { xp: 75, requirement: "Receive 10 coach feedbacks" },
      "skill_specialist": { xp: 200, requirement: "Max out one skill domain" },
    };
    return reqMap[achievement.id] || { xp: 100, requirement: "Complete specific training goals" };
  };

  const req = getRequirements();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Achievement Details</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <View style={[styles.achievementModalIcon, { backgroundColor: achievement.earned ? `${achievement.color}20` : Colors.dark.backgroundTertiary }]}>
              <Ionicons 
                name={achievement.icon as any} 
                size={48} 
                color={achievement.earned ? achievement.color : Colors.dark.textMuted} 
              />
            </View>
            <Text style={styles.achievementModalName}>{achievement.name}</Text>
            <Text style={styles.achievementModalDesc}>{achievement.description}</Text>

            <View style={styles.achievementModalStats}>
              <View style={styles.achievementStat}>
                <Ionicons name="flash" size={20} color={Colors.dark.primary} />
                <Text style={styles.achievementStatValue}>+{req.xp} XP</Text>
                <Text style={styles.achievementStatLabel}>Reward</Text>
              </View>
              <View style={styles.achievementStatDivider} />
              <View style={styles.achievementStat}>
                <Ionicons 
                  name={achievement.earned ? "checkmark-circle" : "time"} 
                  size={20} 
                  color={achievement.earned ? Colors.dark.primary : Colors.dark.orange} 
                />
                <Text style={styles.achievementStatValue}>
                  {achievement.earned ? "Earned" : "In Progress"}
                </Text>
                <Text style={styles.achievementStatLabel}>Status</Text>
              </View>
            </View>

            <View style={styles.requirementBox}>
              <Text style={styles.requirementLabel}>How to earn</Text>
              <Text style={styles.requirementText}>{req.requirement}</Text>
            </View>

            {achievement.earnedAt ? (
              <Text style={styles.earnedDate}>
                Earned on {new Date(achievement.earnedAt).toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric"
                })}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SkillDetailModal({ 
  badge, 
  visible, 
  onClose 
}: { 
  badge: DomainBadge | null; 
  visible: boolean; 
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!badge) return null;

  const getSkillBreakdown = () => {
    const breakdowns: Record<string, { skills: Array<{ name: string; level: number }> }> = {
      "technical": { skills: [
        { name: "Forehand", level: 75 }, { name: "Backhand", level: 60 }, 
        { name: "Serve", level: 50 }, { name: "Volley", level: 40 }
      ]},
      "mental": { skills: [
        { name: "Focus", level: 80 }, { name: "Resilience", level: 65 }, 
        { name: "Match IQ", level: 55 }
      ]},
      "physical": { skills: [
        { name: "Endurance", level: 70 }, { name: "Speed", level: 60 }, 
        { name: "Strength", level: 50 }
      ]},
      "tactical": { skills: [
        { name: "Shot Selection", level: 65 }, { name: "Court Coverage", level: 55 }, 
        { name: "Pattern Play", level: 45 }
      ]},
      "social": { skills: [
        { name: "Sportsmanship", level: 85 }, { name: "Teamwork", level: 70 }
      ]},
    };
    return breakdowns[badge.domainId] || { skills: [{ name: "General", level: badge.progress }] };
  };

  const breakdown = getSkillBreakdown();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Skill Breakdown</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={[styles.skillModalIcon, { backgroundColor: `${badge.color}20` }]}>
              <Ionicons name={badge.icon as any} size={40} color={badge.color} />
            </View>
            <Text style={styles.skillModalName}>{badge.name}</Text>
            <Text style={styles.skillModalDesc}>{badge.description}</Text>

            <View style={styles.overallProgress}>
              <Text style={styles.overallProgressLabel}>Overall Progress</Text>
              <Text style={styles.overallProgressValue}>{badge.progress}%</Text>
              <View style={styles.overallProgressBar}>
                <View style={[styles.overallProgressFill, { width: `${badge.progress}%`, backgroundColor: badge.color }]} />
              </View>
            </View>

            <Text style={styles.skillBreakdownTitle}>Skill Details</Text>
            {breakdown.skills.map((skill, index) => (
              <View key={index} style={styles.skillRow}>
                <Text style={styles.skillRowName}>{skill.name}</Text>
                <View style={styles.skillRowBar}>
                  <View style={[styles.skillRowFill, { width: `${skill.level}%`, backgroundColor: badge.color }]} />
                </View>
                <Text style={styles.skillRowValue}>{skill.level}%</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function PlayerJourneyScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"timeline" | "achievements" | "skills">("timeline");
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<DomainBadge | null>(null);

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
        <ActivityIndicator size="large" color={Colors.dark.primary} />
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
            color={activeTab === "timeline" ? Colors.dark.primary : Colors.dark.textMuted} 
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
            color={activeTab === "achievements" ? Colors.dark.primary : Colors.dark.textMuted} 
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
            color={activeTab === "skills" ? Colors.dark.primary : Colors.dark.textMuted} 
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
            <MilestoneCard 
              milestone={item} 
              isFirst={index === 0} 
              isExpanded={expandedMilestone === item.id}
              onToggle={() => setExpandedMilestone(expandedMilestone === item.id ? null : item.id)}
            />
          )}
          contentContainerStyle={[
            styles.timelineContent,
            { paddingBottom: insets.bottom + 200 },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <PlayerAIInsightsCard myProfile />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="tennisball-outline" size={64} color={Colors.dark.primary} />
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
          renderItem={({ item }) => (
            <AchievementCard 
              achievement={item} 
              onPress={() => setSelectedAchievement(item)}
            />
          )}
          contentContainerStyle={[
            styles.achievementsContent,
            { paddingBottom: insets.bottom + 200 },
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
          renderItem={({ item }) => (
            <DomainBadgeCard 
              badge={item} 
              onPress={() => setSelectedSkill(item)}
            />
          )}
          contentContainerStyle={[
            styles.badgesContent,
            { paddingBottom: insets.bottom + 200 },
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

      <AchievementDetailModal 
        achievement={selectedAchievement}
        visible={selectedAchievement !== null}
        onClose={() => setSelectedAchievement(null)}
      />

      <SkillDetailModal 
        badge={selectedSkill}
        visible={selectedSkill !== null}
        onClose={() => setSelectedSkill(null)}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    color: Colors.dark.primary,
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
    color: Colors.dark.primary,
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
    color: Colors.dark.primary,
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
  milestoneCardExpanded: {
    borderColor: Colors.dark.primary + "40",
    borderWidth: 1,
  },
  milestoneHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  milestoneExpanded: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  skillImprovementRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  skillChipText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  improvementBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  improvementText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  achievementRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalContent: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  modalBody: {
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
  },
  achievementModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  achievementModalName: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  achievementModalDesc: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  achievementModalStats: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  achievementStat: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  achievementStatValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  achievementStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  achievementStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  requirementBox: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  requirementLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  requirementText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  earnedDate: {
    ...Typography.small,
    color: Colors.dark.primary,
    marginBottom: Spacing.lg,
  },
  skillModalIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    alignSelf: "center",
  },
  skillModalName: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  skillModalDesc: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  overallProgress: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  overallProgressLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  overallProgressValue: {
    ...Typography.h2,
    color: Colors.dark.primary,
    marginBottom: Spacing.sm,
  },
  overallProgressBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
  },
  overallProgressFill: {
    height: "100%",
    borderRadius: 4,
  },
  skillBreakdownTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  skillRowName: {
    ...Typography.small,
    color: Colors.dark.text,
    width: 100,
  },
  skillRowBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  skillRowFill: {
    height: "100%",
    borderRadius: 3,
  },
  skillRowValue: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 40,
    textAlign: "right",
  },
}));
