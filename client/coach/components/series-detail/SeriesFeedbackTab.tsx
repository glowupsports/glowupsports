import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { FeedbackData, SeriesDetail } from "./types";

interface SeriesFeedbackTabProps {
  feedbackLoading: boolean;
  feedbackData: FeedbackData | undefined;
  series: SeriesDetail | undefined;
  formatDate: (dateStr: string) => string;
}

function getFeedbackTypeStyle(type: string) {
  switch (type) {
    case "praise": return { icon: "star" as const, color: GlowColors.primary, label: "Praise" };
    case "effort": return { icon: "flame" as const, color: Colors.dark.orange, label: "Effort" };
    case "technique": return { icon: "bulb" as const, color: Colors.dark.xpCyan, label: "Technique" };
    case "improvement": return { icon: "trending-up" as const, color: Colors.dark.successNeon, label: "Improvement" };
    case "focus": return { icon: "eye" as const, color: Colors.dark.gold, label: "Focus" };
    case "attitude": return { icon: "happy" as const, color: "#EC4899", label: "Attitude" };
    default: return { icon: "chatbubble" as const, color: Colors.dark.textSecondary, label: "Feedback" };
  }
}

export function SeriesFeedbackTab({ feedbackLoading, feedbackData, series, formatDate }: SeriesFeedbackTabProps) {
  if (feedbackLoading) {
    return (
      <View style={styles.tabContent}>
        <ActivityIndicator size="large" color={Colors.dark.successNeon} />
      </View>
    );
  }

  const hasAnyFeedback = (feedbackData?.summary.withFeedback || 0) > 0 ||
    (feedbackData?.playerFeedback?.length || 0) > 0;

  if (!feedbackData || !hasAnyFeedback) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No feedback recorded yet</Text>
          <Text style={styles.emptySubtext}>
            Complete sessions and add feedback to track progress
          </Text>
        </View>
      </View>
    );
  }

  const { summary, feedback, playerFeedback } = feedbackData;

  const getPlayerName = (playerId: string) => {
    const player = series?.players?.find((p) => p.id === playerId);
    return player?.name || "Player";
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.feedbackSummary}>
        <View style={styles.feedbackStat}>
          <Text style={styles.feedbackStatValue}>{summary.withFeedback}</Text>
          <Text style={styles.feedbackStatLabel}>Sessions with Feedback</Text>
        </View>
        <View style={styles.feedbackStat}>
          <Text style={styles.feedbackStatValue}>{summary.total - summary.withFeedback}</Text>
          <Text style={styles.feedbackStatLabel}>Pending Feedback</Text>
        </View>
      </View>

      {Object.keys(summary.intensity).length > 0 ? (
        <View style={styles.intensityBreakdown}>
          <Text style={styles.sectionTitle}>Intensity Breakdown</Text>
          <View style={styles.intensityRow}>
            {Object.entries(summary.intensity).map(([level, count]) => (
              <View key={level} style={styles.intensityChip}>
                <Ionicons
                  name={level === "intense" ? "flame" : level === "normal" ? "fitness" : "leaf"}
                  size={16}
                  color={level === "intense" ? Colors.dark.error : level === "normal" ? Colors.dark.successNeon : Colors.dark.textMuted}
                />
                <Text style={styles.intensityText}>{level}: {count}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {playerFeedback && playerFeedback.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Player Feedback ({playerFeedback.length})</Text>
          {playerFeedback.slice(0, 10).map((pf) => {
            const typeStyle = getFeedbackTypeStyle(pf.feedbackType);
            return (
              <View key={pf.id} style={styles.feedbackCard}>
                <View style={styles.feedbackHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                    <View style={[styles.feedbackTypeIcon, { backgroundColor: `${typeStyle.color}20` }]}>
                      <Ionicons name={typeStyle.icon} size={14} color={typeStyle.color} />
                    </View>
                    <Text style={styles.feedbackPlayerName}>{getPlayerName(pf.playerId)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                    {pf.xpAwarded > 0 ? (
                      <View style={styles.xpBadge}>
                        <Text style={styles.xpBadgeText}>+{pf.xpAwarded} XP</Text>
                      </View>
                    ) : null}
                    <View style={[styles.visibilityBadge, { backgroundColor: pf.visibility === "public" ? `${GlowColors.primary}20` : `${Colors.dark.textMuted}20` }]}>
                      <Ionicons
                        name={pf.visibility === "public" ? "eye" : "eye-off"}
                        size={12}
                        color={pf.visibility === "public" ? GlowColors.primary : Colors.dark.textMuted}
                      />
                    </View>
                  </View>
                </View>
                <Text style={styles.feedbackNote} numberOfLines={2}>{pf.message}</Text>
                <Text style={styles.feedbackTimestamp}>
                  {formatDate(pf.createdAt)} • {typeStyle.label}
                </Text>
              </View>
            );
          })}
        </>
      ) : null}

      {feedback.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Session Notes</Text>
          {feedback.slice(0, 5).map((fb) => (
            <View key={fb.id} style={styles.feedbackCard}>
              <View style={styles.feedbackHeader}>
                <Text style={styles.feedbackDate}>
                  {fb.sessionDate ? formatDate(fb.sessionDate) : "Session"}
                </Text>
                {fb.intensity ? (
                  <View style={[styles.intensityBadge, { backgroundColor: fb.intensity === "intense" ? `${Colors.dark.error}20` : `${Colors.dark.successNeon}20` }]}>
                    <Text style={[styles.intensityBadgeText, { color: fb.intensity === "intense" ? Colors.dark.error : Colors.dark.successNeon }]}>
                      {fb.intensity}
                    </Text>
                  </View>
                ) : null}
              </View>
              {fb.coachNotes ? (
                <Text style={styles.feedbackNote} numberOfLines={2}>{fb.coachNotes}</Text>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
