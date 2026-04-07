import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn } from "react-native-reanimated";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";

interface MatchReadinessData {
  id: string;
  playerId: string;
  tournamentMatchId: string | null;
  matchDate: string;
  readinessScore: number;
  topStrength: string;
  biggestGap: string;
  tacticalTips: string[];
  dismissed: boolean;
  createdAt: string;
  expiresAt: string | null;
}

interface MatchReadinessCardProps {
  playerId: string;
}

function ReadinessGauge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 75) return "#00E676";
    if (s >= 50) return Colors.dark.orange;
    return Colors.dark.error;
  };
  const color = getColor(score);

  return (
    <View style={gaugeStyles.container}>
      <View style={[gaugeStyles.ring, { borderColor: color + "40" }]}>
        <View style={[gaugeStyles.innerRing, { borderColor: color }]}>
          <Text style={[gaugeStyles.scoreText, { color }]}>{score}</Text>
          <Text style={gaugeStyles.percentText}>%</Text>
        </View>
      </View>
      <Text style={[gaugeStyles.label, { color }]}>READY</Text>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  ring: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 22,
    fontWeight: "800",
  },
  percentText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: -4,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 4,
  },
});

export function MatchReadinessCard({ playerId }: MatchReadinessCardProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<MatchReadinessData | null>({
    queryKey: [`/api/players/${playerId}/match-readiness`],
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!data?.id) return;
      return apiRequest("POST", `/api/players/${playerId}/match-readiness/${data.id}/dismiss`);
    },
    onSuccess: () => {
      queryClient.setQueryData(
        [`/api/players/${playerId}/match-readiness`],
        null
      );
    },
  });

  // Auto-dismiss on view: mark the card as viewed/dismissed after it has been shown
  // so it does not reappear on the next home screen load (per task: "dismisses once viewed")
  const autoDismissedRef = useRef(false);
  useEffect(() => {
    if (data && !data.dismissed && !autoDismissedRef.current) {
      autoDismissedRef.current = true;
      const timer = setTimeout(() => {
        dismissMutation.mutate();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [data?.id]);

  if (isLoading) return null;
  if (!data) return null;
  if (data.dismissed) return null;

  const score = data.readinessScore;
  const getScoreColor = (s: number) => {
    if (s >= 75) return "#00E676";
    if (s >= 50) return Colors.dark.orange;
    return Colors.dark.error;
  };
  const scoreColor = getScoreColor(score);

  const tips = Array.isArray(data.tacticalTips) ? data.tacticalTips.slice(0, 3) : [];

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.wrapper}>
      <LinearGradient
        colors={[scoreColor + "18", Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault + "E0"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.badge, { borderColor: scoreColor + "60", backgroundColor: scoreColor + "15" }]}>
              <Ionicons name="trophy" size={12} color={scoreColor} />
              <Text style={[styles.badgeText, { color: scoreColor }]}>MATCH DAY PREP</Text>
            </View>
          </View>
          <Pressable
            style={styles.dismissBtn}
            onPress={() => dismissMutation.mutate()}
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <View style={styles.mainRow}>
          <ReadinessGauge score={score} />

          <View style={styles.infoPanel}>
            <View style={styles.infoItem}>
              <Ionicons name="arrow-up-circle" size={16} color="#00E676" />
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>Top Strength</Text>
                <Text style={styles.infoValue} numberOfLines={2}>{data.topStrength}</Text>
              </View>
            </View>
            <View style={[styles.infoItem, { marginTop: Spacing.sm }]}>
              <Ionicons name="warning" size={16} color={Colors.dark.orange} />
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>Focus Area</Text>
                <Text style={styles.infoValue} numberOfLines={2}>{data.biggestGap}</Text>
              </View>
            </View>
          </View>
        </View>

        {tips.length > 0 ? (
          <View style={styles.tipsSection}>
            <View style={styles.tipsDivider} />
            <Text style={styles.tipsTitle}>Tactical Tips</Text>
            {tips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: scoreColor }]} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  dismissBtn: {
    padding: 4,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  infoPanel: {
    flex: 1,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 12,
    color: Colors.dark.text,
    lineHeight: 16,
  },
  tipsSection: {
    marginTop: Spacing.sm,
  },
  tipsDivider: {
    height: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginBottom: Spacing.sm,
  },
  tipsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  tipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
    flexShrink: 0,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
  },
});
