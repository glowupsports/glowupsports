import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors, TextColors, FunctionColors } from "@/constants/theme";
import { Card } from "@/components/Card";
import { EmptyStateCard } from "@/components/EmptyStateCard";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
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

const SESSION_TYPE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  private: { color: GlowColors.primary, icon: "person", label: "Private" },
  semi_private: { color: Colors.dark.primary, icon: "people", label: "Semi-Private" },
  group: { color: Colors.dark.orange, icon: "people-circle", label: "Group" },
  camp: { color: "#9B59B6", icon: "school", label: "Camp" },
};

const FEEDBACK_TYPE_CONFIG: Record<string, { color: string; icon: string }> = {
  praise: { color: GlowColors.primary, icon: "star" },
  technique: { color: Colors.dark.primary, icon: "build" },
  effort: { color: "#FF6B6B", icon: "flame" },
  focus: { color: "#AA96DA", icon: "eye" },
  attitude: { color: "#4ECDC4", icon: "heart" },
  attendance: { color: "#FFE66D", icon: "checkmark-circle" },
  custom: { color: TextColors.secondary, icon: "chatbubble" },
};

function getSessionTypeConfig(sessionType: string) {
  const key = sessionType?.toLowerCase()?.replace("-", "_") || "private";
  return SESSION_TYPE_CONFIG[key] || SESSION_TYPE_CONFIG.private;
}

function getFeedbackTypeConfig(feedbackType: string) {
  const key = feedbackType?.toLowerCase() || "custom";
  return FEEDBACK_TYPE_CONFIG[key] || FEEDBACK_TYPE_CONFIG.custom;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function FeedbackCard({ feedback }: { feedback: SessionFeedback }) {
  const sessionConfig = getSessionTypeConfig(feedback.sessionType);
  const feedbackConfig = getFeedbackTypeConfig(feedback.feedbackType);

  return (
    <View style={styles.feedbackCard}>
      <View style={styles.feedbackHeader}>
        <View style={[styles.sessionTypeBadge, { backgroundColor: sessionConfig.color + "20" }]}>
          <Ionicons name={sessionConfig.icon as any} size={14} color={sessionConfig.color} />
          <Text style={[styles.sessionTypeText, { color: sessionConfig.color }]}>
            {sessionConfig.label}
          </Text>
        </View>
        {feedback.xpAwarded > 0 ? (
          <View style={styles.xpBadge}>
            <Ionicons name="flash" size={12} color={Colors.dark.primary} />
            <Text style={styles.xpText}>+{feedback.xpAwarded} XP</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.feedbackContent}>
        <View style={[styles.feedbackTypeIcon, { backgroundColor: feedbackConfig.color + "20" }]}>
          <Ionicons name={feedbackConfig.icon as any} size={18} color={feedbackConfig.color} />
        </View>
        <View style={styles.feedbackMessage}>
          <Text style={styles.messageText}>{feedback.message}</Text>
          <Text style={styles.feedbackMeta}>
            {feedback.coachName} • {formatDate(feedback.sessionDate || feedback.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DateGroupSection({ date, feedbacks }: { date: string; feedbacks: SessionFeedback[] }) {
  return (
    <View style={styles.dateSection}>
      <View style={styles.dateBadge}>
        <Ionicons name="calendar-outline" size={14} color={GlowColors.primary} />
        <Text style={styles.dateText}>{date}</Text>
      </View>
      <View style={styles.feedbacksList}>
        {feedbacks.map((feedback) => (
          <FeedbackCard key={feedback.id} feedback={feedback} />
        ))}
      </View>
    </View>
  );
}

export default function CoachFeedbackHistoryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const { data: feedbacks, isLoading, error } = useQuery<SessionFeedback[]>({
    queryKey: ["/api/player/me/session-feedback"],
  });

  const groupedByDate = React.useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return [];

    const groups: Record<string, SessionFeedback[]> = {};

    feedbacks.forEach((feedback) => {
      const dateKey = formatDate(feedback.sessionDate || feedback.createdAt);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(feedback);
    });

    return Object.entries(groups)
      .sort((a, b) => {
        const dateA = new Date(feedbacks.find(f => formatDate(f.sessionDate || f.createdAt) === a[0])?.createdAt || "");
        const dateB = new Date(feedbacks.find(f => formatDate(f.sessionDate || f.createdAt) === b[0])?.createdAt || "");
        return dateB.getTime() - dateA.getTime();
      })
      .map(([date, items]) => ({ date, feedbacks: items }));
  }, [feedbacks]);

  const totalXP = React.useMemo(() => {
    if (!feedbacks) return 0;
    return feedbacks.reduce((sum, f) => sum + (f.xpAwarded || 0), 0);
  }, [feedbacks]);

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
          <Text style={styles.headerTitle}>Coach Feedback</Text>
          <Text style={styles.headerSubtitle}>Session reviews and feedback</Text>
        </View>
      </View>

      {/* Video Feedback Banner */}
      <Pressable
        style={styles.videoFeedbackBanner}
        onPress={() => navigation.navigate("VideoFeedbackPlayer")}
      >
        <View style={styles.videoFeedbackBannerIcon}>
          <Ionicons name="videocam" size={20} color={FunctionColors.planning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.videoFeedbackBannerTitle}>Video Feedback</Text>
          <Text style={styles.videoFeedbackBannerSubtitle}>Watch technique clips from your coach</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={TextColors.muted} />
      </Pressable>

      {!isLoading && feedbacks && feedbacks.length > 0 ? (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="chatbubbles" size={20} color={GlowColors.primary} />
            <Text style={styles.statValue}>{feedbacks.length}</Text>
            <Text style={styles.statLabel}>Feedbacks</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="flash" size={20} color={Colors.dark.primary} />
            <Text style={styles.statValue}>{totalXP}</Text>
            <Text style={styles.statLabel}>XP Earned</Text>
          </View>
        </View>
      ) : null}

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
        ) : error ? (
          <Card elevation={1} style={styles.errorCard}>
            <Ionicons name="alert-circle" size={32} color={Colors.dark.error} />
            <Text style={styles.errorText}>Failed to load feedback</Text>
          </Card>
        ) : groupedByDate.length === 0 ? (
          <EmptyStateCard
            icon="chatbubbles"
            title="No Feedback Yet"
            description="Your coaches will leave feedback during and after training sessions. Complete a session to receive your first feedback!"
            ctaText="View Schedule"
            onPress={() => navigation.goBack()}
            variant="info"
          />
        ) : (
          <View style={styles.dateSections}>
            {groupedByDate.map(({ date, feedbacks }) => (
              <DateGroupSection key={date} date={date} feedbacks={feedbacks} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Backgrounds.card,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    ...Typography.numberMedium,
    color: TextColors.primary,
    marginTop: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Backgrounds.surface,
    marginHorizontal: Spacing.xl,
  },
  videoFeedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: FunctionColors.planning + "30",
  },
  videoFeedbackBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: FunctionColors.planning + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  videoFeedbackBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: TextColors.primary,
  },
  videoFeedbackBannerSubtitle: {
    fontSize: 12,
    color: TextColors.muted,
    marginTop: 1,
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
  dateSections: {
    gap: Spacing.xl,
  },
  dateSection: {
    gap: Spacing.md,
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: GlowColors.primary + "15",
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  dateText: {
    ...Typography.caption,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  feedbacksList: {
    gap: Spacing.md,
  },
  feedbackCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  feedbackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sessionTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  sessionTypeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.full,
  },
  xpText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  feedbackContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  feedbackTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  feedbackMessage: {
    flex: 1,
  },
  messageText: {
    ...Typography.body,
    color: TextColors.primary,
    lineHeight: 22,
  },
  feedbackMeta: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: Spacing.sm,
  },
}));
