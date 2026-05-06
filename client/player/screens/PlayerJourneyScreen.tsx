import React, { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, SectionList, Pressable, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { PlayerAIInsightsCard } from "@/components/PlayerAIInsightsCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { PostSessionCheckInModal } from "@/player/components/PostSessionCheckInModal";
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
  validations: {
    id: string;
    type: string;
    domain: string;
    status: string;
    validatedAt: string;
  }[];
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
  xpHistory: {
    id: string;
    amount: number;
    reason: string;
    date: string;
  }[];
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
    const breakdowns: Record<string, { skills: { name: string; level: number }[] }> = {
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
            {(breakdown.skills ?? []).map((skill, index) => (
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

interface SessionHistoryItem {
  sessionId: string;
  sessionType: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  status: string;
  coachName: string | null;
  xpEarned: number;
  levelUp: { newLevel: number } | null;
  checkin: { energyLevel: number; mood: number; notes: string | null; createdAt: string } | null;
}

interface SessionSection {
  title: string;
  data: SessionHistoryItem[];
}

function sessionMonthKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function groupSessionsByMonth(sessions: SessionHistoryItem[]): SessionSection[] {
  const map = new Map<string, SessionHistoryItem[]>();
  for (const s of sessions) {
    const key = sessionMonthKey(s.startTime);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

function sessionDotColor(sessionType: string, hasCheckin: boolean): string {
  if (!hasCheckin) return Colors.dark.backgroundTertiary; // grey — skipped check-in
  const t = (sessionType ?? "").toLowerCase();
  if (t === "private" || t === "semi_private" || t === "semi") return "#3B82F6"; // blue — lesson
  if (t === "group") return "#6366F1"; // indigo — group lesson
  if (t === "match" || t === "physical" || t === "activity") return "#22C55E"; // green — match/activity
  return "#3B82F6"; // default blue for unknown lesson types
}

function SessionDot({ sessionType, hasCheckin }: { sessionType: string; hasCheckin: boolean }) {
  return (
    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sessionDotColor(sessionType, hasCheckin), borderWidth: 2, borderColor: Colors.dark.backgroundDefault }} />
  );
}

function SessionDetailModal({ item, visible, onClose, onRate }: {
  item: SessionHistoryItem | null;
  visible: boolean;
  onClose: () => void;
  onRate: (sessionId: string, sessionType: string, coachName: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const energyLabels = ["Exhausted", "Tired", "Okay", "Energized", "Peak"];
  const moodLabels = ["Rough", "Meh", "Good", "Great", "Amazing"];
  const moodColors = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#6366F1"];

  if (!item) {
    return <Modal visible={false} transparent />;
  }

  const date = new Date(item.startTime);
  const dateStr = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const typeLabel = item.sessionType === "group" ? "Group"
    : item.sessionType === "private" ? "Private"
    : item.sessionType === "semi_private" ? "Semi-Private"
    : item.sessionType || "Session";
  const hasCheckin = item.checkin != null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={sd.overlay}>
        <Pressable style={sd.backdrop} onPress={onClose} />
        <View style={[sd.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={sd.handle} />
          <View style={sd.header}>
            <View>
              <Text style={sd.title}>{typeLabel} Session</Text>
              <Text style={sd.subtitle}>{dateStr} · {timeStr}</Text>
              {item.coachName ? <Text style={sd.coach}>with {item.coachName}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close-circle" size={26} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <View style={sd.metaRow}>
            {item.durationMinutes ? (
              <>
                <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
                <Text style={sd.metaText}>{item.durationMinutes} min session</Text>
              </>
            ) : null}
            {item.xpEarned > 0 ? (
              <>
                {item.durationMinutes ? <Text style={[sd.metaText, { marginHorizontal: 6 }]}>·</Text> : null}
                <Ionicons name="star" size={13} color="#EAB308" />
                <Text style={[sd.metaText, { color: "#EAB308", fontWeight: "700" }]}>+{item.xpEarned} XP</Text>
              </>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {hasCheckin ? (
              <View style={sd.section}>
                <Text style={sd.sectionTitle}>Check-in</Text>
                <View style={sd.checkinGrid}>
                  <View style={sd.checkinCell}>
                    <Ionicons name="flame" size={22} color="#F97316" />
                    <Text style={sd.checkinValue}>{item.checkin!.energyLevel}/5</Text>
                    <Text style={sd.checkinLabel}>{energyLabels[(item.checkin!.energyLevel ?? 1) - 1]}</Text>
                  </View>
                  <View style={sd.checkinCell}>
                    <Ionicons name="happy-outline" size={22} color={moodColors[(item.checkin!.mood ?? 1) - 1]} />
                    <Text style={[sd.checkinValue, { color: moodColors[(item.checkin!.mood ?? 1) - 1] }]}>{item.checkin!.mood}/5</Text>
                    <Text style={sd.checkinLabel}>{moodLabels[(item.checkin!.mood ?? 1) - 1]}</Text>
                  </View>
                </View>
                {item.checkin!.notes ? (
                  <View style={sd.notesBlock}>
                    <Text style={sd.notesText}>{item.checkin!.notes}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={sd.section}>
                <Text style={sd.sectionTitle}>Check-in</Text>
                <Pressable
                  style={sd.rateFullBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                    setTimeout(() => onRate(item.sessionId, typeLabel, item.coachName), 300);
                  }}
                >
                  <Ionicons name="star-outline" size={18} color={Colors.dark.primary} />
                  <Text style={sd.rateFullBtnText}>Rate this session</Text>
                </Pressable>
              </View>
            )}

            {item.levelUp ? (
              <View style={sd.section}>
                <Text style={sd.sectionTitle}>Milestone</Text>
                <View style={sd.milestoneBadge}>
                  <Ionicons name="trophy" size={20} color="#EAB308" />
                  <View>
                    <Text style={sd.milestoneTitle}>Level Up!</Text>
                    <Text style={sd.milestoneDesc}>Reached Level {item.levelUp.newLevel} after this session</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const sd = makeReactiveStyles(() => StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  backdrop: { flex: 1 },
  sheet: { backgroundColor: Colors.dark.backgroundDefault, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, minHeight: 300 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.dark.backgroundTertiary, alignSelf: "center", marginBottom: Spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: Spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: Colors.dark.text },
  subtitle: { fontSize: 13, color: Colors.dark.textMuted, marginTop: 2 },
  coach: { fontSize: 12, color: Colors.dark.primary, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: Spacing.md },
  metaText: { fontSize: 12, color: Colors.dark.textMuted },
  section: { marginTop: Spacing.md, marginBottom: Spacing.md },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: Spacing.sm },
  checkinGrid: { flexDirection: "row", gap: Spacing.md },
  checkinCell: { flex: 1, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: 12, padding: Spacing.md, alignItems: "center", gap: 4 },
  checkinValue: { fontSize: 20, fontWeight: "800", color: Colors.dark.text },
  checkinLabel: { fontSize: 11, color: Colors.dark.textMuted, fontWeight: "600" },
  notesBlock: { marginTop: Spacing.sm, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: 10, padding: Spacing.md },
  notesText: { fontSize: 13, color: Colors.dark.text, lineHeight: 20 },
  rateFullBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderColor: Colors.dark.primary, borderRadius: 12, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, justifyContent: "center" },
  rateFullBtnText: { fontSize: 14, fontWeight: "700", color: Colors.dark.primary },
  milestoneBadge: { flexDirection: "row", alignItems: "center", gap: Spacing.md, backgroundColor: "#EAB30815", borderRadius: 12, padding: Spacing.md, borderWidth: 1, borderColor: "#EAB30830" },
  milestoneTitle: { fontSize: 14, fontWeight: "800", color: "#EAB308" },
  milestoneDesc: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 1 },
}));

function SessionHistoryCard({
  item,
  isLast,
  onRate,
  onPress,
}: {
  item: SessionHistoryItem;
  isLast: boolean;
  onRate: (sessionId: string, sessionType: string, coachName: string | null) => void;
  onPress: (item: SessionHistoryItem) => void;
}) {
  const date = new Date(item.startTime);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const typeLabel = item.sessionType === "group" ? "Group"
    : item.sessionType === "private" ? "Private"
    : item.sessionType === "semi_private" ? "Semi-Private"
    : item.sessionType || "Session";
  const hasCheckin = item.checkin != null;

  return (
    <Pressable
      style={sh.card}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(item);
      }}
    >
      <View style={sh.leftTrack}>
        <SessionDot sessionType={item.sessionType} hasCheckin={item.checkin != null} />
        {isLast ? null : <View style={sh.trackLine} />}
      </View>
      <View style={[sh.content, isLast && sh.contentLast]}>
        <View style={sh.row}>
          <Text style={sh.type}>{typeLabel}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={sh.date}>{dateStr} · {timeStr}</Text>
            <Ionicons name="chevron-forward" size={12} color={Colors.dark.textMuted} />
          </View>
        </View>
        {item.coachName ? <Text style={sh.coach}>with {item.coachName}</Text> : null}
        {hasCheckin ? (
          <View style={sh.checkinRow}>
            <View style={sh.pill}>
              <Ionicons name="flame" size={11} color="#F97316" />
              <Text style={sh.pillText}>Energy {item.checkin!.energyLevel}/5</Text>
            </View>
            <View style={sh.pill}>
              <Ionicons name="happy-outline" size={11} color="#22C55E" />
              <Text style={sh.pillText}>Mood {item.checkin!.mood}/5</Text>
            </View>
          </View>
        ) : (
          <View style={sh.noCheckinRow}>
            <Text style={sh.noCheckin}>No check-in recorded</Text>
            <Pressable
              style={sh.rateBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRate(item.sessionId, typeLabel, item.coachName);
              }}
            >
              <Ionicons name="star-outline" size={11} color={Colors.dark.primary} />
              <Text style={sh.rateBtnText}>Rate session</Text>
            </Pressable>
          </View>
        )}
        {item.checkin?.notes ? (
          <Text style={sh.notes} numberOfLines={2}>{item.checkin.notes}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function SessionMonthHeader({ title }: { title: string }) {
  return (
    <View style={sh.monthHeader}>
      <Text style={sh.monthText}>{title}</Text>
    </View>
  );
}

const sh = makeReactiveStyles(() => StyleSheet.create({
  card: { flexDirection: "row", marginBottom: 0, paddingHorizontal: Spacing.xl },
  leftTrack: { width: 20, alignItems: "center", paddingTop: 4 },
  trackLine: { flex: 1, width: 1.5, backgroundColor: Colors.dark.backgroundTertiary, marginTop: 4 },
  content: { flex: 1, marginLeft: Spacing.md, paddingBottom: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.dark.backgroundTertiary },
  contentLast: { borderBottomWidth: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  type: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, flex: 1 },
  date: { fontSize: 11, color: Colors.dark.textMuted, marginLeft: 4 },
  coach: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 1 },
  checkinRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  noCheckinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  pill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: "600", color: Colors.dark.text },
  noCheckin: { fontSize: 11, color: Colors.dark.textMuted, fontStyle: "italic" },
  rateBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: Colors.dark.primary },
  rateBtnText: { fontSize: 11, fontWeight: "600", color: Colors.dark.primary },
  notes: { fontSize: 12, color: Colors.dark.textMuted, marginTop: 4 },
  monthHeader: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  monthText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
}));

export default function PlayerJourneyScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"timeline" | "achievements" | "skills" | "sessions">("timeline");
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<DomainBadge | null>(null);
  const [checkinSession, setCheckinSession] = useState<{ sessionId: string; sessionTitle: string; coachName: string | null } | null>(null);
  const [detailSession, setDetailSession] = useState<SessionHistoryItem | null>(null);

  const handleRateSession = useCallback((sessionId: string, sessionType: string, coachName: string | null) => {
    setCheckinSession({ sessionId, sessionTitle: `${sessionType} Session`, coachName });
  }, []);

  const handleSessionPress = useCallback((item: SessionHistoryItem) => {
    setDetailSession(item);
  }, []);

  const { data: journeyData, isLoading: journeyLoading, error: journeyError } = useQuery<JourneyData>({
    queryKey: ["/api/player/me/journey"],
  });
  
  const { data: recognitionData, isLoading: recognitionLoading } = useQuery<RecognitionData>({
    queryKey: ["/api/player/me/recognition"],
  });

  const { data: sessionHistoryData, isLoading: sessionHistoryLoading } = useQuery<{ sessions: SessionHistoryItem[]; hasMore: boolean }>({
    queryKey: ["/api/player/me/session-history"],
    enabled: activeTab === "sessions",
  });

  const sessionSections = useMemo(
    () => groupSessionsByMonth(sessionHistoryData?.sessions ?? []),
    [sessionHistoryData],
  );

  const isLoading = journeyLoading;
  const error = journeyError;

  if (isLoading || recognitionLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <TennisBallSpinner size="large" />
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
        <Pressable
          style={[styles.tab, activeTab === "sessions" && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("sessions");
          }}
        >
          <Ionicons 
            name="fitness-outline" 
            size={16} 
            color={activeTab === "sessions" ? Colors.dark.primary : Colors.dark.textMuted} 
          />
          <Text style={[styles.tabText, activeTab === "sessions" && styles.tabTextActive]}>
            Sessions
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
      ) : activeTab === "sessions" ? (
        sessionHistoryLoading ? (
          <View style={[styles.centered, { flex: 1 }]}>
            <TennisBallSpinner size="large" />
          </View>
        ) : sessionSections.length === 0 ? (
          <View style={[styles.emptyState, { flex: 1 }]}>
            <Ionicons name="fitness-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No sessions yet</Text>
            <Text style={styles.emptySubtext}>Your session history will appear here after your first lesson</Text>
          </View>
        ) : (
          <SectionList
            sections={sessionSections}
            keyExtractor={(item) => item.sessionId}
            renderItem={({ item, index, section }) => (
              <SessionHistoryCard
                item={item}
                isLast={index === section.data.length - 1}
                onRate={handleRateSession}
                onPress={handleSessionPress}
              />
            )}
            renderSectionHeader={({ section }) => (
              <SessionMonthHeader title={section.title} />
            )}
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingBottom: insets.bottom + 200, paddingTop: Spacing.sm }}
            showsVerticalScrollIndicator={false}
          />
        )
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

      {checkinSession ? (
        <PostSessionCheckInModal
          visible={checkinSession !== null}
          sessionId={checkinSession.sessionId}
          sessionTitle={checkinSession.sessionTitle}
          coachName={checkinSession.coachName ?? undefined}
          onClose={() => setCheckinSession(null)}
        />
      ) : null}

      <SessionDetailModal
        item={detailSession}
        visible={detailSession !== null}
        onClose={() => setDetailSession(null)}
        onRate={handleRateSession}
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
