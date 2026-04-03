import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Svg, { Path, Line, Circle, Text as SvgText } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, FontSizes } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

interface SessionDigest {
  id: string;
  sessionId: string;
  summaryText: string;
  generatedAt: string;
}

interface PillarSnapshot {
  date: string;
  TECHNIQUE: number | null;
  TACTICAL: number | null;
  PHYSICAL: number | null;
  MENTAL: number | null;
}

interface AIInsightsData {
  playerId: string;
  narrative: {
    id: string;
    narrativeText: string;
    focusAreas: string[];
    periodDays: number;
    generatedAt: string;
  } | null;
  sessionDigests: SessionDigest[];
  pillarHistory: PillarSnapshot[];
}

interface Props {
  playerId?: string;
  myProfile?: boolean;
}

const PILLAR_COLORS: Record<string, string> = {
  TECHNIQUE: "#10B981",
  TACTICAL: "#F59E0B",
  PHYSICAL: "#EF4444",
  MENTAL: "#8B5CF6",
};

const PILLAR_LABELS: Record<string, string> = {
  TECHNIQUE: "Technique",
  TACTICAL: "Tactical",
  PHYSICAL: "Physical",
  MENTAL: "Mental",
};

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

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function SkillProgressionChart({ pillarHistory }: { pillarHistory: PillarSnapshot[] }) {
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - Spacing.xl * 2 - Spacing.lg * 2 - 32;
  const chartHeight = 120;
  const padding = { left: 28, right: 10, top: 10, bottom: 28 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const minVal = 0;
  const maxVal = 3;
  const range = maxVal - minVal;

  const getX = (i: number) =>
    padding.left + (pillarHistory.length > 1 ? (i / (pillarHistory.length - 1)) * innerW : innerW / 2);

  const getY = (val: number) =>
    padding.top + innerH - ((val - minVal) / range) * innerH;

  const pillars = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL"] as const;

  const buildPath = (pillar: typeof pillars[number]) => {
    const points: Array<{ x: number; y: number }> = [];
    pillarHistory.forEach((snap, i) => {
      const val = snap[pillar];
      if (val !== null) {
        points.push({ x: getX(i), y: getY(val) });
      }
    });
    if (points.length < 2) return null;
    return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  };

  const yLabels = [0, 1, 2, 3];

  return (
    <View>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>Pillar Score Trend</Text>
        <View style={styles.chartLegend}>
          {pillars.map((p) => (
            <View key={p} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PILLAR_COLORS[p] }]} />
              <Text style={styles.legendText}>{PILLAR_LABELS[p][0]}</Text>
            </View>
          ))}
        </View>
      </View>
      <Svg width={chartWidth} height={chartHeight}>
        {yLabels.map((val) => (
          <React.Fragment key={val}>
            <Line
              x1={padding.left}
              y1={getY(val)}
              x2={padding.left + innerW}
              y2={getY(val)}
              stroke={Colors.dark.backgroundTertiary}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <SvgText
              x={padding.left - 4}
              y={getY(val) + 4}
              fontSize={9}
              fill={Colors.dark.disabled}
              textAnchor="end"
            >
              {val}
            </SvgText>
          </React.Fragment>
        ))}

        {pillarHistory.map((snap, i) => (
          <SvgText
            key={i}
            x={getX(i)}
            y={chartHeight - 4}
            fontSize={9}
            fill={Colors.dark.disabled}
            textAnchor="middle"
          >
            {formatDateShort(snap.date)}
          </SvgText>
        ))}

        {pillars.map((pillar) => {
          const pathD = buildPath(pillar);
          if (!pathD) return null;
          return (
            <Path
              key={pillar}
              d={pathD}
              stroke={PILLAR_COLORS[pillar]}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {pillars.map((pillar) =>
          pillarHistory.map((snap, i) => {
            const val = snap[pillar];
            if (val === null) return null;
            return (
              <Circle
                key={`${pillar}-${i}`}
                cx={getX(i)}
                cy={getY(val)}
                r={3}
                fill={PILLAR_COLORS[pillar]}
              />
            );
          })
        )}
      </Svg>
    </View>
  );
}

export function PlayerAIInsightsCard({ playerId, myProfile }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const queryKey = myProfile
    ? ["/api/player/me/ai-insights"]
    : [`/api/players/${playerId}/ai-insights`];

  const { data, isLoading, error } = useQuery<AIInsightsData>({
    queryKey,
    enabled: myProfile ? true : !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  const effectivePlayerId = myProfile ? (data?.playerId || user?.playerId) : playerId;

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!effectivePlayerId) throw new Error("No player ID");
      return apiRequest("POST", `/api/players/${effectivePlayerId}/ai-insights/generate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const narrative = data?.narrative;
  const digests = data?.sessionDigests || [];
  const pillarHistory = data?.pillarHistory || [];
  const hasData = !!narrative || digests.length > 0;
  const showChart = pillarHistory.length >= 2;

  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="sparkles" size={18} color={Colors.dark.primary} />
            <Text style={styles.cardTitle}>
              {myProfile ? "My Development Story" : "AI Progress Insights"}
            </Text>
          </View>
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
          <Text style={styles.cardTitle}>
            {myProfile ? "My Development Story" : "AI Progress Insights"}
          </Text>
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
              <Ionicons name="analytics-outline" size={32} color={Colors.dark.disabled} />
              <Text style={styles.emptyTitle}>No insights yet</Text>
              <Text style={styles.emptySubtitle}>
                {myProfile
                  ? "Insights are generated automatically after sessions with feedback."
                  : "Complete a session with feedback to see the first digest."}
              </Text>
              {effectivePlayerId ? (
                <Pressable
                  style={[styles.generateButton, generateMutation.isPending && styles.generateButtonDisabled]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    generateMutation.mutate();
                  }}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={14} color={Colors.dark.backgroundRoot} />
                  )}
                  <Text style={styles.generateButtonText}>
                    {generateMutation.isPending ? "Generating..." : "Generate First Insight"}
                  </Text>
                </Pressable>
              ) : null}
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

          {showChart ? (
            <View style={styles.chartBlock}>
              <SkillProgressionChart pillarHistory={pillarHistory} />
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

          {effectivePlayerId ? (
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
    color: Colors.dark.disabled,
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
    color: Colors.dark.disabled,
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
  chartBlock: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  chartTitle: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chartLegend: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
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
    color: Colors.dark.disabled,
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
