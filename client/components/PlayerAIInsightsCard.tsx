import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface SessionDigest {
  id: string;
  sessionId: string;
  summaryText: string;
  generatedAt: string;
}

interface AIInsightsData {
  narrative: {
    id: string;
    narrativeText: string;
    focusAreas: string[];
    periodDays: number;
    generatedAt: string;
  } | null;
  sessionDigests: SessionDigest[];
}

interface Props {
  playerId?: string;
  myProfile?: boolean;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

export function PlayerAIInsightsCard({ playerId, myProfile }: Props) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const queryKey = myProfile
    ? ["/api/player/me/ai-insights"]
    : [`/api/players/${playerId}/ai-insights`];

  const { data, isLoading, error } = useQuery<AIInsightsData>({
    queryKey,
    enabled: myProfile ? true : !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const endpoint = playerId
        ? `/api/players/${playerId}/ai-insights/generate`
        : `/api/players/${playerId}/ai-insights/generate`;
      return apiRequest("POST", endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const narrative = data?.narrative;
  const digests = data?.sessionDigests || [];
  const hasData = !!narrative || digests.length > 0;

  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles" size={18} color={Colors.dark.primary} />
          <Text style={styles.cardTitle}>AI Progress Insights</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.dark.primary} />
          <Text style={styles.loadingText}>Loading insights...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardHeader}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(!expanded);
        }}
      >
        <View style={styles.cardHeaderLeft}>
          <Ionicons name="sparkles" size={18} color={Colors.dark.primary} />
          <Text style={styles.cardTitle}>AI Progress Insights</Text>
          {narrative ? (
            <View style={styles.freshBadge}>
              <Text style={styles.freshBadgeText}>
                {narrative.periodDays}d
              </Text>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.dark.textMuted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.cardBody}>
          {!hasData ? (
            <View style={styles.emptyState}>
              <Ionicons name="analytics-outline" size={32} color={Colors.dark.textDisabled} />
              <Text style={styles.emptyTitle}>No insights yet</Text>
              <Text style={styles.emptySubtitle}>
                Insights are generated automatically after sessions. Complete a session with feedback to see your first digest.
              </Text>
            </View>
          ) : null}

          {narrative ? (
            <View style={styles.narrativeBlock}>
              <View style={styles.narrativeHeader}>
                <Ionicons name="document-text-outline" size={14} color={Colors.dark.primary} />
                <Text style={styles.narrativeLabel}>
                  {narrative.periodDays}-Day Progress Narrative
                </Text>
                <Text style={styles.narrativeDate}>
                  {formatRelativeDate(narrative.generatedAt)}
                </Text>
              </View>
              <Text style={styles.narrativeText}>{narrative.narrativeText}</Text>

              {narrative.focusAreas && narrative.focusAreas.length > 0 ? (
                <View style={styles.focusBlock}>
                  <Text style={styles.focusLabel}>Recommended Focus Areas</Text>
                  {narrative.focusAreas.map((area, i) => (
                    <View key={i} style={styles.focusRow}>
                      <View style={styles.focusNumber}>
                        <Text style={styles.focusNumberText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.focusText}>{area}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {digests.length > 0 ? (
            <View style={styles.digestsBlock}>
              <Text style={styles.digestsLabel}>Recent Session Digests</Text>
              {digests.map((digest) => (
                <View key={digest.id} style={styles.digestRow}>
                  <View style={styles.digestDot} />
                  <View style={styles.digestContent}>
                    <Text style={styles.digestText}>{digest.summaryText}</Text>
                    <Text style={styles.digestDate}>
                      {formatRelativeDate(digest.generatedAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {playerId ? (
            <Pressable
              style={[
                styles.generateButton,
                generateMutation.isPending && styles.generateButtonDisabled,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                generateMutation.mutate();
              }}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
              ) : (
                <Ionicons name="refresh" size={14} color={Colors.dark.backgroundRoot} />
              )}
              <Text style={styles.generateButtonText}>
                {generateMutation.isPending
                  ? "Generating..."
                  : narrative
                  ? "Refresh Insights"
                  : "Generate Insights"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...CardStyles.elevated,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  cardTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  freshBadge: {
    backgroundColor: Colors.dark.primary + "25",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  freshBadgeText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
    fontSize: 10,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  cardBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  emptyState: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  emptySubtitle: {
    ...Typography.small,
    color: Colors.dark.textDisabled,
    textAlign: "center",
    lineHeight: 18,
  },
  narrativeBlock: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  narrativeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  narrativeLabel: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
    flex: 1,
  },
  narrativeDate: {
    ...Typography.caption,
    color: Colors.dark.textDisabled,
  },
  narrativeText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  focusBlock: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  focusLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  focusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  focusNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "20",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  focusNumberText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "700",
    fontSize: 10,
  },
  focusText: {
    ...Typography.small,
    color: Colors.dark.text,
    flex: 1,
    lineHeight: 18,
  },
  digestsBlock: {
    gap: Spacing.md,
  },
  digestsLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  digestRow: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  digestDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.primary,
    marginTop: 7,
    flexShrink: 0,
  },
  digestContent: {
    flex: 1,
    gap: 2,
  },
  digestText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  digestDate: {
    ...Typography.caption,
    color: Colors.dark.textDisabled,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    ...Typography.small,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
});
