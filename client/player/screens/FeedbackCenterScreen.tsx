import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, type DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors, TextColors, FunctionColors } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { CoachReviewModal } from "@/player/components/CoachReviewModal";
import type { PlayerStackParamList, ProgressStackParamList } from "@/player/navigation/PlayerNavigator";

type FeedbackCenterNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<ProgressStackParamList, "FeedbackCenter">,
  NativeStackNavigationProp<PlayerStackParamList>
>;

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

interface SessionFeedback {
  id: string;
  sessionId: string;
  sessionDate: string;
  sessionType: string;
  coachName: string;
  coachId: string;
  feedbackType: string;
  message: string;
  xpAwarded: number;
  visibility: string;
  pillarId: string | null;
  createdAt: string;
}

interface VideoFeedback {
  id: string;
  coachId: string;
  playerId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  annotations: { timestamp: number; text: string }[];
  createdAt: string;
}

interface PlayerProfile {
  player: {
    id: string;
    name: string;
    coachId: string | null;
  } | null;
  coach: {
    id: string;
    name: string;
  } | null;
}

const PILLAR_CONFIG: Record<string, { color: string; icon: string }> = {
  TECHNIQUE: { color: "#10B981", icon: "build" },
  TACTICAL: { color: "#F59E0B", icon: "bulb" },
  PHYSICAL: { color: "#EF4444", icon: "fitness" },
  MENTAL: { color: "#8B5CF6", icon: "flash" },
  SOCIAL: { color: "#EC4899", icon: "people" },
  MATCH: { color: "#3B82F6", icon: "trophy" },
};

const SESSION_TYPE_CONFIG: Record<string, { label: string }> = {
  private: { label: "Private" },
  semi_private: { label: "Semi-Private" },
  group: { label: "Group" },
  camp: { label: "Camp" },
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

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getSessionTypeLabel(sessionType: string): string {
  const key = sessionType?.toLowerCase()?.replace("-", "_") || "private";
  return SESSION_TYPE_CONFIG[key]?.label || sessionType;
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

function CoachNoteCard({ feedback }: { feedback: SessionFeedback }) {
  return (
    <View style={styles.noteCard}>
      <View style={styles.noteHeader}>
        <Text style={styles.noteDateText}>{formatShortDate(feedback.sessionDate || feedback.createdAt)}</Text>
        <View style={[styles.noteTypeBadge]}>
          <Text style={styles.noteTypeText}>{getSessionTypeLabel(feedback.sessionType)}</Text>
        </View>
      </View>
      <Text style={styles.noteMessage} numberOfLines={3}>{feedback.message}</Text>
      <Text style={styles.noteCoach}>{feedback.coachName}</Text>
    </View>
  );
}

export default function FeedbackCenterScreen() {
  const navigation = useNavigation<FeedbackCenterNavProp>();
  const insets = useSafeAreaInsets();
  const [showReviewModal, setShowReviewModal] = useState(false);

  const { data: summaries, isLoading: loadingAssessments } = useQuery<PillarSummary[]>({
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

  const { data: sessionFeedbacks, isLoading: loadingNotes } = useQuery<SessionFeedback[]>({
    queryKey: ["/api/player/me/session-feedback"],
  });

  const { data: videoFeedbacks, isLoading: loadingVideos } = useQuery<VideoFeedback[]>({
    queryKey: ["/api/player/me/video-feedback"],
  });

  const { data: playerProfile, isLoading: loadingProfile } = useQuery<PlayerProfile>({
    queryKey: ["/api/player/me/profile"],
  });

  const isLoading = loadingAssessments || loadingPillars || loadingNotes || loadingVideos || loadingProfile;

  const sortedSummaries = React.useMemo(() => {
    if (!summaries || summaries.length === 0) return [];
    return [...summaries].sort((a, b) => a.pillar.localeCompare(b.pillar));
  }, [summaries]);

  const activePillars = React.useMemo(() => {
    if (!pillarProgress?.pillars) return [];
    return pillarProgress.pillars.filter(p => p.score > 0 || p.lastUpdated !== null);
  }, [pillarProgress]);

  const recentNotes = React.useMemo(() => {
    if (!sessionFeedbacks || sessionFeedbacks.length === 0) return [];
    return [...sessionFeedbacks]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [sessionFeedbacks]);

  const videoCount = videoFeedbacks?.length ?? 0;
  const assignedCoach = playerProfile?.coach ?? null;

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

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: Colors.dark.orange + "20" }]}>
                  <Ionicons name="document-text" size={16} color={Colors.dark.orange} />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Coach Notes</Text>
                  <Text style={styles.sectionSubtitle}>Written feedback from training sessions</Text>
                </View>
              </View>
              {recentNotes.length > 0 ? (
                <>
                  <View style={styles.notesList}>
                    {recentNotes.map((note) => (
                      <CoachNoteCard key={note.id} feedback={note} />
                    ))}
                  </View>
                  <Pressable
                    style={styles.seeAllButton}
                    onPress={() => navigation.navigate("CoachFeedbackHistory")}
                  >
                    <Text style={styles.seeAllText}>See all notes</Text>
                    <Ionicons name="chevron-forward" size={14} color={GlowColors.primary} />
                  </Pressable>
                </>
              ) : (
                <View style={styles.emptySection}>
                  <Ionicons name="document-outline" size={28} color={TextColors.disabled} />
                  <Text style={styles.emptyText}>No coach notes yet. Your coach will leave written feedback after sessions.</Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: FunctionColors.planning + "20" }]}>
                  <Ionicons name="videocam" size={16} color={FunctionColors.planning} />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Video Feedback</Text>
                  <Text style={styles.sectionSubtitle}>Technique clips from your coach</Text>
                </View>
                {videoCount > 0 ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{videoCount}</Text>
                  </View>
                ) : null}
              </View>
              {videoCount > 0 ? (
                <Pressable
                  style={styles.videoCard}
                  onPress={() => navigation.navigate("VideoFeedbackPlayer")}
                >
                  <View style={styles.videoCardIcon}>
                    <Ionicons name="play-circle" size={32} color={FunctionColors.planning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.videoCardTitle}>
                      {videoCount} video clip{videoCount !== 1 ? "s" : ""} available
                    </Text>
                    <Text style={styles.videoCardSubtitle}>Tap to watch your coach's technique feedback</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
                </Pressable>
              ) : (
                <View style={styles.emptySection}>
                  <Ionicons name="videocam-outline" size={28} color={TextColors.disabled} />
                  <Text style={styles.emptyText}>No video feedback yet. Your coach will share technique clips here.</Text>
                </View>
              )}
            </View>

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

            {assignedCoach ? (
              <View style={styles.section}>
                <View style={styles.rateCoachCard}>
                  <View style={styles.rateCoachAvatar}>
                    <Text style={styles.rateCoachAvatarText}>{assignedCoach.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rateCoachTitle}>Rate My Coach</Text>
                    <Text style={styles.rateCoachSubtitle}>{assignedCoach.name}</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.rateCoachButton, { opacity: pressed ? 0.8 : 1 }]}
                    onPress={() => setShowReviewModal(true)}
                  >
                    <Ionicons name="star" size={14} color={Colors.dark.backgroundRoot} />
                    <Text style={styles.rateCoachButtonText}>Write a review</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <CoachReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        coach={assignedCoach}
        onSuccess={() => setShowReviewModal(false)}
      />
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
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: FunctionColors.planning + "20",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
  },
  countBadgeText: {
    ...Typography.caption,
    color: FunctionColors.planning,
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
  notesList: {
    gap: Spacing.sm,
  },
  noteCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    gap: Spacing.xs,
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  noteDateText: {
    ...Typography.caption,
    color: TextColors.muted,
    fontWeight: "600",
  },
  noteTypeBadge: {
    backgroundColor: Colors.dark.orange + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  noteTypeText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  noteMessage: {
    ...Typography.body,
    color: TextColors.primary,
    lineHeight: 20,
  },
  noteCoach: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingVertical: Spacing.xs,
  },
  seeAllText: {
    ...Typography.small,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  videoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: FunctionColors.planning + "25",
  },
  videoCardIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    backgroundColor: FunctionColors.planning + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  videoCardTitle: {
    ...Typography.body,
    color: TextColors.primary,
    fontWeight: "600",
  },
  videoCardSubtitle: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  rateCoachCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.gold + "25",
  },
  rateCoachAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.gold + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  rateCoachAvatarText: {
    ...Typography.h3,
    color: Colors.dark.gold,
    fontWeight: "700",
  },
  rateCoachTitle: {
    ...Typography.body,
    color: TextColors.primary,
    fontWeight: "700",
  },
  rateCoachSubtitle: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 1,
  },
  rateCoachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.gold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  rateCoachButtonText: {
    ...Typography.caption,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
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
