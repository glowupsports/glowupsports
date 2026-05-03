import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { CoachStackParamList } from "@/coach/navigation/CoachNavigator";

type RouteProps = RouteProp<CoachStackParamList, "CoachTechniqueAnalysisDetail">;

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const RATING_CONFIG: Record<string, { color: string; icon: IoniconName; bg: string }> = {
  Good: { color: "#22C55E", icon: "checkmark-circle", bg: "#22C55E18" },
  "Needs Work": { color: "#F59E0B", icon: "time", bg: "#F59E0B18" },
  "Focus Area": { color: "#EF4444", icon: "alert-circle", bg: "#EF444418" },
};

export default function CoachTechniqueAnalysisDetailScreen() {
  const route = useRoute<RouteProps>();
  const { analysis } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const score = analysis.overall_score ?? 0;
  const scoreColor = score >= 80 ? "#22C55E" : score >= 60 ? "#F59E0B" : "#EF4444";
  const scoreLabel = score >= 80 ? "EXCELLENT" : score >= 60 ? "DEVELOPING" : "NEEDS WORK";
  const checkpoints = analysis.checkpoints ?? [];
  const tips = analysis.tips ?? [];
  const dateStr = analysis.completed_at
    ? new Date(analysis.completed_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : new Date(analysis.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.scoreHeader}>
        <Text style={styles.strokeLabel}>{analysis.stroke_type}</Text>
        <View style={[styles.scoreRing, { borderColor: scoreColor, backgroundColor: scoreColor + "14" }]}>
          <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
        </View>
        <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
        <Text style={styles.dateText}>{dateStr}</Text>
        <View style={styles.coachBadge}>
          <Ionicons name="eye-outline" size={13} color={Colors.dark.textMuted} />
          <Text style={styles.coachBadgeText}>Read-only coach view</Text>
        </View>
      </View>

      {checkpoints.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checkpoints</Text>
          <View style={styles.checkpointList}>
            {checkpoints.map((cp, i) => {
              const cfg = RATING_CONFIG[cp.rating] ?? RATING_CONFIG["Needs Work"];
              return (
                <View key={i} style={[styles.checkpointCard, { backgroundColor: cfg.bg }]}>
                  <View style={styles.checkpointHeader}>
                    <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                    <Text style={[styles.checkpointName, { color: cfg.color }]}>{cp.name}</Text>
                    <View style={[styles.ratingPill, { backgroundColor: cfg.color + "25" }]}>
                      <Text style={[styles.ratingPillText, { color: cfg.color }]}>{cp.rating}</Text>
                    </View>
                  </View>
                  <Text style={styles.checkpointExplanation}>{cp.explanation}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {tips.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Tips</Text>
          <View style={styles.tipList}>
            {tips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipNumber}>
                  <Text style={styles.tipNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  scoreHeader: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  strokeLabel: {
    ...Typography.heading2,
    color: Colors.dark.text,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scoreRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNumber: { fontSize: 28, fontWeight: "900" },
  scoreLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  dateText: { ...Typography.caption, color: Colors.dark.textMuted },
  coachBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  coachBadgeText: { fontSize: 11, color: Colors.dark.textMuted },
  section: { marginHorizontal: Spacing.lg, gap: Spacing.sm },
  sectionTitle: { ...Typography.heading3, color: Colors.dark.text, fontWeight: "700" },
  checkpointList: { gap: Spacing.sm },
  checkpointCard: { borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.xs },
  checkpointHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  checkpointName: { fontWeight: "700", fontSize: 14, flex: 1 },
  ratingPill: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  ratingPillText: { fontSize: 11, fontWeight: "700" },
  checkpointExplanation: { ...Typography.body, color: Colors.dark.textSecondary, lineHeight: 20 },
  tipList: { gap: Spacing.sm },
  tipRow: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "flex-start",
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  tipNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
  },
  tipNumberText: { fontSize: 12, fontWeight: "800", color: Colors.dark.primary },
  tipText: { ...Typography.body, color: Colors.dark.text, flex: 1, lineHeight: 22 },
});
