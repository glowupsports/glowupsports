import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, type DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors, TextColors } from "@/constants/theme";
import { Card } from "@/components/Card";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";

interface PillarSummary {
  id: string;
  pillar: string;
  pillarName: string;
  averageScore: string | null;
  assessedSkills: number | null;
  totalSkills: number | null;
  lastAssessedAt: string | null;
  createdAt: string | null;
}

interface PillarProgressEntry {
  name: string;
  score: number;
  trend: string;
  skillsTotal: number;
  skillsMeetsOrAbove: number;
  lastUpdated: string | null;
}

interface PillarProgressSummary {
  pillars: PillarProgressEntry[];
  overallReadiness: number;
  trialGateReady: boolean;
  recentFeedbackCount: number;
}

const PILLAR_CONFIG: Record<string, { color: string; icon: string }> = {
  TECHNIQUE: { color: "#10B981", icon: "build" },
  TACTICAL: { color: "#F59E0B", icon: "bulb" },
  PHYSICAL: { color: "#EF4444", icon: "fitness" },
  MENTAL: { color: "#8B5CF6", icon: "flash" },
  SOCIAL: { color: "#EC4899", icon: "people" },
  MATCH: { color: "#3B82F6", icon: "trophy" },
};

function getPillarConfig(pillar: string) {
  return PILLAR_CONFIG[pillar.toUpperCase()] || { color: GlowColors.primary, icon: "star" };
}

function formatScore(score: string | null): string {
  if (score === null || score === undefined) return "—";
  const num = parseFloat(score);
  if (isNaN(num)) return "—";
  return num.toFixed(1);
}

function getScoreColor(score: string | null): string {
  if (score === null) return TextColors.muted;
  const num = parseFloat(score);
  if (isNaN(num)) return TextColors.muted;
  if (num >= 2.5) return GlowColors.primary;
  if (num >= 1.5) return Colors.dark.xpCyan;
  return Colors.dark.orange;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Not yet assessed";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PillarCard({ summary }: { summary: PillarSummary }) {
  const config = getPillarConfig(summary.pillar);
  const scoreColor = getScoreColor(summary.averageScore);
  const assessed = summary.assessedSkills ?? 0;
  const total = summary.totalSkills ?? 0;
  const progressPct = total > 0 ? Math.min((assessed / total) * 100, 100) : 0;
  const pillarLabel = summary.pillar.charAt(0) + summary.pillar.slice(1).toLowerCase();

  return (
    <View style={styles.pillarCard}>
      <View style={styles.pillarHeader}>
        <View style={[styles.pillarIcon, { backgroundColor: config.color + "20" }]}>
          <Ionicons name={config.icon as keyof typeof Ionicons.glyphMap} size={20} color={config.color} />
        </View>
        <View style={styles.pillarInfo}>
          <Text style={styles.pillarName}>{pillarLabel}</Text>
          <Text style={styles.lastAssessed}>Last assessed: {formatDate(summary.lastAssessedAt)}</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor + "20" }]}>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>{formatScore(summary.averageScore)}</Text>
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>avg</Text>
        </View>
      </View>
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>{assessed} of {total} skills assessed</Text>
        <Text style={styles.progressPct}>{Math.round(progressPct)}%</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progressPct}%` as DimensionValue, backgroundColor: config.color }]} />
      </View>
    </View>
  );
}

function getTrendIcon(trend: string): keyof typeof Ionicons.glyphMap {
  if (trend === "improving") return "trending-up";
  if (trend === "declining") return "trending-down";
  return "remove";
}

function getTrendColor(trend: string): string {
  if (trend === "improving") return GlowColors.primary;
  if (trend === "declining") return Colors.dark.error;
  return TextColors.disabled;
}

function SessionPillarCard({ entry }: { entry: PillarProgressEntry }) {
  const config = getPillarConfig(entry.name);
  const pct = Math.round(entry.score * 50);
  const pillarLabel = entry.name.charAt(0) + entry.name.slice(1).toLowerCase();

  return (
    <View style={styles.sessionPillarCard}>
      <View style={styles.pillarHeader}>
        <View style={[styles.pillarIcon, { backgroundColor: config.color + "20" }]}>
          <Ionicons name={config.icon as keyof typeof Ionicons.glyphMap} size={20} color={config.color} />
        </View>
        <View style={styles.pillarInfo}>
          <Text style={styles.pillarName}>{pillarLabel}</Text>
          <Text style={styles.lastAssessed}>Updated: {formatDate(entry.lastUpdated)}</Text>
        </View>
        <View style={styles.trendRow}>
          <Ionicons name={getTrendIcon(entry.trend)} size={16} color={getTrendColor(entry.trend)} />
          <View style={[styles.scoreBadge, { backgroundColor: config.color + "20", marginLeft: 8 }]}>
            <Text style={[styles.scoreValue, { color: config.color }]}>{pct}%</Text>
          </View>
        </View>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${pct}%` as DimensionValue, backgroundColor: config.color }]} />
      </View>
    </View>
  );
}

export default function FeedbackCenterScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const { data: summaries, isLoading: loadingAssessments, error } = useQuery<PillarSummary[]>({
    queryKey: ["/api/player/me/skill-assessments"],
  });

  const { data: pillarProgress, isLoading: loadingPillars } = useQuery<PillarProgressSummary>({
    queryKey: ["/api/player/me/pillar-progress"],
    queryFn: async () => {
      const url = new URL("/api/player/me/pillar-progress", getApiUrl());
      const r = await fetch(url.toString(), { headers: getAuthHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const isLoading = loadingAssessments || loadingPillars;

  const sortedSummaries = React.useMemo(() => {
    if (!summaries || summaries.length === 0) return [];
    return [...summaries].sort((a, b) => a.pillar.localeCompare(b.pillar));
  }, [summaries]);

  const activePillars = React.useMemo(() => {
    if (!pillarProgress?.pillars) return [];
    return pillarProgress.pillars.filter(p => p.score > 0 || p.lastUpdated !== null);
  }, [pillarProgress]);

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={GlowColors.primary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Feedback Center</Text>
          <Text style={styles.headerSubtitle}>Your coach ratings and skill progress</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GlowColors.primary} />
            <Text style={styles.loadingText}>Loading feedback...</Text>
          </View>
        ) : (
          <>
            {activePillars.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: GlowColors.primary + "20" }]}>
                    <Ionicons name="stats-chart" size={16} color={GlowColors.primary} />
                  </View>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>Session Ratings</Text>
                    <Text style={styles.sectionSubtitle}>Coach pillar scores from training sessions</Text>
                  </View>
                  {pillarProgress?.trialGateReady ? (
                    <View style={styles.trialBadge}>
                      <Ionicons name="trophy" size={12} color={GlowColors.primary} />
                      <Text style={styles.trialBadgeText}>Trial Ready</Text>
                    </View>
                  ) : null}
                </View>
                {pillarProgress && pillarProgress.overallReadiness > 0 ? (
                  <View style={styles.readinessBanner}>
                    <Text style={styles.readinessLabel}>Overall Readiness</Text>
                    <Text style={[styles.readinessValue, { color: pillarProgress.overallReadiness >= 75 ? GlowColors.primary : Colors.dark.orange }]}>
                      {pillarProgress.overallReadiness}%
                    </Text>
                  </View>
                ) : null}
                <View style={styles.pillarsList}>
                  {activePillars.map((entry) => (
                    <SessionPillarCard key={entry.name} entry={entry} />
                  ))}
                </View>
                {pillarProgress && pillarProgress.recentFeedbackCount > 0 ? (
                  <Text style={styles.feedbackCount}>
                    {pillarProgress.recentFeedbackCount} session{pillarProgress.recentFeedbackCount !== 1 ? "s" : ""} rated in last 30 days
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: GlowColors.primary + "20" }]}>
                    <Ionicons name="stats-chart" size={16} color={GlowColors.primary} />
                  </View>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>Session Ratings</Text>
                    <Text style={styles.sectionSubtitle}>Coach pillar scores from training sessions</Text>
                  </View>
                </View>
                <View style={styles.emptySection}>
                  <Ionicons name="chatbubble-outline" size={28} color={TextColors.disabled} />
                  <Text style={styles.emptyText}>No session ratings yet. Your coach will rate your pillars after training sessions.</Text>
                </View>
              </View>
            )}

            {sortedSummaries.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                    <Ionicons name="school" size={16} color={Colors.dark.xpCyan} />
                  </View>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>Deep Assessments</Text>
                    <Text style={styles.sectionSubtitle}>Detailed skill-by-skill evaluations</Text>
                  </View>
                </View>
                <View style={styles.pillarsList}>
                  {sortedSummaries.map((summary) => (
                    <PillarCard key={summary.id} summary={summary} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                    <Ionicons name="school" size={16} color={Colors.dark.xpCyan} />
                  </View>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>Deep Assessments</Text>
                    <Text style={styles.sectionSubtitle}>Detailed skill-by-skill evaluations</Text>
                  </View>
                </View>
                <View style={styles.emptySection}>
                  <Ionicons name="analytics-outline" size={28} color={TextColors.disabled} />
                  <Text style={styles.emptyText}>No deep assessments yet. Your coach will record these during dedicated assessment sessions.</Text>
                </View>
              </View>
            )}

            {activePillars.length === 0 && sortedSummaries.length === 0 ? (
              <EmptyStateCard
                icon="school"
                title="No Feedback Yet"
                description="Your coach will rate your progress after training sessions. Check back after your next lesson!"
                ctaText="Go Back"
                onPress={() => navigation.goBack()}
                variant="info"
              />
            ) : null}
          </>
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
    gap: Spacing.lg,
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
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    ...Typography.h3,
    color: TextColors.primary,
    fontWeight: "700",
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  trialBadgeText: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "700",
  },
  readinessBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  readinessLabel: {
    ...Typography.body,
    color: TextColors.secondary,
  },
  readinessValue: {
    ...Typography.h3,
    fontWeight: "700",
  },
  pillarsList: {
    gap: Spacing.sm,
  },
  feedbackCount: {
    ...Typography.caption,
    color: TextColors.muted,
    textAlign: "center",
  },
  emptySection: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
  },
  emptyText: {
    ...Typography.small,
    color: TextColors.muted,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  pillarCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  sessionPillarCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: Spacing.sm,
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
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
  lastAssessed: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreBadge: {
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    minWidth: 52,
  },
  scoreValue: {
    ...Typography.h3,
    fontWeight: "700",
  },
  scoreLabel: {
    ...Typography.caption,
    fontSize: 10,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  progressPct: {
    ...Typography.caption,
    color: TextColors.secondary,
    fontWeight: "600",
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
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
});
