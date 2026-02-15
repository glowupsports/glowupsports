import React, { useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors, TextColors } from "@/constants/theme";
import { Card } from "@/components/Card";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { useCoachMarks, CoachMarkTarget } from "@/components/CoachMarks";

interface SkillAssessment {
  id: string;
  pillarId: string;
  pillarName: string;
  skillName: string;
  rating: number;
  coachName: string;
  coachId: string;
  comment: string | null;
  createdAt: string;
}

interface PillarGroup {
  pillarId: string;
  pillarName: string;
  color: string;
  icon: string;
  assessments: SkillAssessment[];
}

const PILLAR_CONFIG: Record<string, { color: string; icon: string }> = {
  forehand: { color: "#FF6B6B", icon: "tennisball" },
  backhand: { color: "#4ECDC4", icon: "tennisball-outline" },
  serve: { color: "#FFE66D", icon: "flash" },
  volley: { color: "#95E1D3", icon: "hand-right" },
  footwork: { color: "#F38181", icon: "footsteps" },
  tactics: { color: "#AA96DA", icon: "bulb" },
  movement: { color: "#F38181", icon: "footsteps" },
  technical: { color: "#4DA3FF", icon: "build" },
  mental: { color: "#E040FB", icon: "flash" },
  physical: { color: "#00E676", icon: "fitness" },
};

function getPillarConfig(pillarId: string) {
  const key = pillarId.toLowerCase();
  return PILLAR_CONFIG[key] || { color: GlowColors.primary, icon: "star" };
}

function getRatingLabel(rating: number): string {
  switch (rating) {
    case 0:
      return "Developing";
    case 1:
      return "Competent";
    case 2:
      return "Proficient";
    default:
      return "Not Rated";
  }
}

function getRatingColor(rating: number): string {
  switch (rating) {
    case 0:
      return Colors.dark.orange;
    case 1:
      return Colors.dark.xpCyan;
    case 2:
      return GlowColors.primary;
    default:
      return TextColors.muted;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function AssessmentCard({ assessment }: { assessment: SkillAssessment }) {
  const ratingColor = getRatingColor(assessment.rating);

  return (
    <View style={styles.assessmentCard}>
      <View style={styles.assessmentHeader}>
        <View style={styles.assessmentInfo}>
          <Text style={styles.skillName}>{assessment.skillName}</Text>
          <Text style={styles.assessmentMeta}>
            {assessment.coachName} • {formatDate(assessment.createdAt)}
          </Text>
        </View>
        <View style={[styles.ratingBadge, { backgroundColor: ratingColor + "20" }]}>
          <Text style={[styles.ratingText, { color: ratingColor }]}>
            {getRatingLabel(assessment.rating)}
          </Text>
        </View>
      </View>
      {assessment.comment ? (
        <Text style={styles.comment}>{assessment.comment}</Text>
      ) : null}
    </View>
  );
}

function PillarSection({ group }: { group: PillarGroup }) {
  const config = getPillarConfig(group.pillarId);

  return (
    <View style={styles.pillarSection}>
      <View style={styles.pillarHeader}>
        <View style={[styles.pillarIcon, { backgroundColor: config.color + "20" }]}>
          <Ionicons name={config.icon as any} size={20} color={config.color} />
        </View>
        <View style={styles.pillarInfo}>
          <Text style={styles.pillarName}>{group.pillarName}</Text>
          <Text style={styles.assessmentCount}>{group.assessments.length} assessment{group.assessments.length !== 1 ? "s" : ""}</Text>
        </View>
      </View>
      <View style={styles.assessmentsList}>
        {group.assessments.map((assessment) => (
          <AssessmentCard key={assessment.id} assessment={assessment} />
        ))}
      </View>
    </View>
  );
}

export default function FeedbackCenterScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { startTour, isActive } = useCoachMarks();

  const feedbackTourSteps = useMemo(() => [
    { id: "player_feedback_header", title: "Feedback Center", description: "View all skill assessments and feedback from your coaches.", position: "bottom" as const },
    { id: "player_feedback_pillars", title: "Skill Pillars", description: "Assessments are grouped by skill area like forehand, serve, and tactics.", position: "top" as const },
    { id: "player_feedback_ratings", title: "Your Ratings", description: "See how your coach rated each skill and read their comments.", position: "top" as const },
  ], []);

  useEffect(() => {
    if (!isActive) {
      const timer = setTimeout(() => {
        startTour("player_feedback_tour", feedbackTourSteps);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const { data: assessments, isLoading, error } = useQuery<SkillAssessment[]>({
    queryKey: ["/api/player/me/skill-assessments"],
  });

  const groupedByPillar: PillarGroup[] = React.useMemo(() => {
    if (!assessments || assessments.length === 0) return [];

    const groups: Record<string, PillarGroup> = {};

    assessments.forEach((assessment) => {
      const pillarId = assessment.pillarId || "other";
      if (!groups[pillarId]) {
        const config = getPillarConfig(pillarId);
        groups[pillarId] = {
          pillarId,
          pillarName: assessment.pillarName || pillarId.charAt(0).toUpperCase() + pillarId.slice(1),
          color: config.color,
          icon: config.icon,
          assessments: [],
        };
      }
      groups[pillarId].assessments.push(assessment);
    });

    return Object.values(groups).sort((a, b) => a.pillarName.localeCompare(b.pillarName));
  }, [assessments]);

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <CoachMarkTarget id="player_feedback_header">
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={GlowColors.primary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Feedback Center</Text>
          <Text style={styles.headerSubtitle}>Skill assessments from your coaches</Text>
        </View>
      </View>
      </CoachMarkTarget>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GlowColors.primary} />
            <Text style={styles.loadingText}>Loading assessments...</Text>
          </View>
        ) : error ? (
          <Card elevation={1} style={styles.errorCard}>
            <Ionicons name="alert-circle" size={32} color={Colors.dark.error} />
            <Text style={styles.errorText}>Failed to load assessments</Text>
          </Card>
        ) : groupedByPillar.length === 0 ? (
          <CoachMarkTarget id="player_feedback_pillars">
          <EmptyStateCard
            icon="school"
            title="No Assessments Yet"
            description="Your coaches will record skill assessments during training sessions. Check back after your next lesson!"
            ctaText="View Progress"
            onPress={() => navigation.goBack()}
            variant="info"
          />
          </CoachMarkTarget>
        ) : (
          <CoachMarkTarget id="player_feedback_pillars">
          <View style={styles.pillarsList}>
            {groupedByPillar.map((group) => (
              <PillarSection key={group.pillarId} group={group} />
            ))}
          </View>
          </CoachMarkTarget>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  headerSubtitle: {
    ...Typography.small,
    color: TextColors.muted,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  loadingText: {
    ...Typography.body,
    color: TextColors.muted,
    marginTop: Spacing.md,
  },
  errorCard: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  pillarsList: {
    gap: Spacing.xl,
  },
  pillarSection: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  pillarIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  pillarInfo: {
    flex: 1,
  },
  pillarName: {
    ...Typography.h3,
    color: TextColors.primary,
  },
  assessmentCount: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  assessmentsList: {
    gap: Spacing.md,
  },
  assessmentCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  assessmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  assessmentInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  skillName: {
    ...Typography.body,
    fontWeight: "600",
    color: TextColors.primary,
  },
  assessmentMeta: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  ratingBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  ratingText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  comment: {
    ...Typography.small,
    color: TextColors.secondary,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
