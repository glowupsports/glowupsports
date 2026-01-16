import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { 
  FadeIn, 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import * as Haptics from "expo-haptics";

interface LevelSummary {
  red: { total: number; levels: { 1: number; 2: number; 3: number } };
  orange: { total: number; levels: { 1: number; 2: number; 3: number } };
  green: { total: number; levels: { 1: number; 2: number; 3: number } };
  yellow: { total: number; levels: { 1: number; 2: number; 3: number } };
  adult: { total: number; byRank: Record<number, number> };
  unassigned: { total: number };
}

const BALL_COLORS = {
  red: "#EF4444",
  orange: "#F97316",
  green: "#22C55E",
  yellow: "#EAB308",
  adult: GlowColors.primary,
  unassigned: "#6B7280",
};

const BALL_GRADIENTS: Record<string, [string, string]> = {
  red: ["#EF4444", "#DC2626"],
  orange: ["#F97316", "#EA580C"],
  green: ["#22C55E", "#16A34A"],
  yellow: ["#EAB308", "#CA8A04"],
  adult: [GlowColors.primary, GlowColors.dark],
};

const BALL_LABELS = {
  red: "RED",
  orange: "ORANGE",
  green: "GREEN",
  yellow: "YELLOW",
  adult: "ADULT",
  unassigned: "UNASSIGNED",
};

export function PlayersByLevelCard() {
  const { academy } = useCoach();

  const { data, isLoading } = useQuery<{ summary: LevelSummary }>({
    queryKey: [`/api/lesson-groups/players/by-level?academyId=${academy?.id}`],
    enabled: !!academy?.id,
  });

  if (isLoading) {
    return (
      <View style={styles.card}>
        <LinearGradient
          colors={[Backgrounds.card, Backgrounds.cardElevated]}
          style={styles.cardGradient}
        >
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="people" size={18} color={GlowColors.primary} />
            </View>
            <Text style={styles.title}>PLAYER ROSTER</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={GlowColors.primary} />
          </View>
        </LinearGradient>
      </View>
    );
  }

  const summary = data?.summary;
  if (!summary) {
    return null;
  }

  const totalYouth = summary.red.total + summary.orange.total + summary.green.total + summary.yellow.total;
  const totalPlayers = totalYouth + summary.adult.total + summary.unassigned.total;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[GlowColors.primary + "08", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGlow}
      />
      <LinearGradient
        colors={[Backgrounds.card, Backgrounds.cardElevated]}
        style={styles.cardGradient}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="people" size={18} color={GlowColors.primary} />
            </View>
            <Text style={styles.title}>PLAYER ROSTER</Text>
          </View>
          <View style={styles.totalBadge}>
            <Text style={styles.totalCount}>{totalPlayers}</Text>
            <Text style={styles.totalLabel}>TOTAL</Text>
          </View>
        </View>

        <View style={styles.levelGrid}>
          {(["red", "orange", "green", "yellow"] as const).map((level, index) => (
            <Animated.View 
              key={level} 
              entering={FadeIn.delay(index * 50).duration(300)}
              style={styles.levelCard}
            >
              <LinearGradient
                colors={[BALL_COLORS[level] + "15", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.levelCardGradient}
              >
                <View style={styles.levelHeader}>
                  <LinearGradient
                    colors={BALL_GRADIENTS[level]}
                    style={styles.levelBall}
                  >
                    <View style={styles.levelBallShine} />
                  </LinearGradient>
                  <Text style={[styles.levelLabel, { color: BALL_COLORS[level] }]}>
                    {BALL_LABELS[level]}
                  </Text>
                </View>
                <Text style={styles.levelCount}>{summary[level].total}</Text>
                <View style={styles.sublevelRow}>
                  {[1, 2, 3].map((sub) => {
                    const count = summary[level].levels[sub as 1 | 2 | 3];
                    return (
                      <View 
                        key={sub} 
                        style={[
                          styles.sublevelBadge,
                          count > 0 && { backgroundColor: BALL_COLORS[level] + "20" }
                        ]}
                      >
                        <Text style={[
                          styles.sublevelNum,
                          count > 0 && { color: BALL_COLORS[level] }
                        ]}>{sub}</Text>
                        <Text style={[
                          styles.sublevelCount,
                          count > 0 && { color: BALL_COLORS[level] }
                        ]}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>

        <View style={styles.bottomRow}>
          <Animated.View 
            entering={FadeIn.delay(200).duration(300)}
            style={styles.adultCard}
          >
            <LinearGradient
              colors={[BALL_COLORS.adult + "15", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.adultCardGradient}
            >
              <LinearGradient
                colors={BALL_GRADIENTS.adult}
                style={styles.levelBall}
              >
                <View style={styles.levelBallShine} />
              </LinearGradient>
              <View style={styles.adultInfo}>
                <Text style={[styles.levelLabel, { color: BALL_COLORS.adult }]}>
                  {BALL_LABELS.adult}
                </Text>
                <Text style={styles.adultCount}>{summary.adult.total}</Text>
              </View>
            </LinearGradient>
          </Animated.View>
          
          {summary.unassigned.total > 0 && (
            <Animated.View 
              entering={FadeIn.delay(250).duration(300)}
              style={styles.unassignedCard}
            >
              <Ionicons name="alert-circle" size={16} color={Colors.dark.warning} />
              <Text style={styles.unassignedCount}>{summary.unassigned.total}</Text>
              <Text style={styles.unassignedText}>need level</Text>
            </Animated.View>
          )}
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            {(["red", "orange", "green", "yellow", "adult"] as const).map((level) => {
              const count = level === "adult" ? summary.adult.total : summary[level].total;
              const width = totalPlayers > 0 ? (count / totalPlayers) * 100 : 0;
              if (width === 0) return null;
              return (
                <LinearGradient
                  key={level}
                  colors={BALL_GRADIENTS[level]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressSegment, { width: `${width}%` }]}
                />
              );
            })}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  cardGradient: {
    padding: Spacing.lg,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: GlowColors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  totalBadge: {
    alignItems: "center",
    backgroundColor: Backgrounds.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  totalCount: {
    fontSize: 18,
    fontWeight: "800",
    color: GlowColors.primary,
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  levelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  levelCard: {
    width: "48.5%",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.surfaceLight,
  },
  levelCardGradient: {
    padding: Spacing.md,
    minHeight: 100,
  },
  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  levelBall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  levelBallShine: {
    position: "absolute",
    top: 2,
    left: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  levelCount: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    marginVertical: Spacing.xs,
  },
  sublevelRow: {
    flexDirection: "row",
    gap: 6,
  },
  sublevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Backgrounds.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  sublevelNum: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  sublevelCount: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  bottomRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  adultCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.surfaceLight,
  },
  adultCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  adultInfo: {
    flex: 1,
  },
  adultCount: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  unassignedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.warning + "15",
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.warning + "30",
  },
  unassignedCount: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.warning,
  },
  unassignedText: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.warning,
  },
  progressBarContainer: {
    paddingTop: Spacing.sm,
  },
  progressBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    backgroundColor: Backgrounds.surface,
    overflow: "hidden",
  },
  progressSegment: {
    height: "100%",
  },
});
