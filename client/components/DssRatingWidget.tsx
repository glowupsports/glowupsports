import React from "react";
import { View, Text, StyleSheet, Pressable, ViewStyle, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes, GlowColors } from "@/constants/theme";
import { useQuery } from "@tanstack/react-query";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface DssRatingWidgetProps {
  playerId: string;
  compact?: boolean;
  showProgress?: boolean;
  showTrend?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

interface DssRatingData {
  dssRating: string;
  dssRatingNumeric: number;
  bracket: number;
  mmr: number;
  rankName: string;
  trend: "up" | "down" | "stable";
  isProvisional: boolean;
  progressToNext: {
    targetRank: number;
    matchesNeeded: number;
    mmrNeeded: number;
    confidence: "low" | "medium" | "high";
  };
  recentHistory: {
    mmr: number;
    dssRating: string;
    date: string;
  }[];
}

const BRACKET_COLORS: Record<number, { primary: string; secondary: string; name: string }> = {
  9: { primary: "#6B7280", secondary: "#4B5563", name: "Beginner" },
  8: { primary: "#10B981", secondary: "#059669", name: "Recreational" },
  7: { primary: "#F59E0B", secondary: "#D97706", name: "Club Player" },
  6: { primary: "#3B82F6", secondary: "#2563EB", name: "Strong Club" },
  5: { primary: "#8B5CF6", secondary: "#7C3AED", name: "Competitive" },
  4: { primary: "#EC4899", secondary: "#DB2777", name: "Advanced" },
  3: { primary: "#EF4444", secondary: "#DC2626", name: "Elite" },
  2: { primary: "#F97316", secondary: "#EA580C", name: "Talent" },
  1: { primary: "#FFD700", secondary: "#FFC000", name: "Semi-Pro" },
};

function MiniRatingChart({ history }: { history: DssRatingData["recentHistory"] }) {
  if (history.length < 2) return null;

  const ratings = history.map(h => parseFloat(h.dssRating));
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min || 0.5;

  const chartWidth = 60;
  const chartHeight = 24;
  const padding = 2;

  const points = ratings.map((rating, i) => {
    const x = padding + (i / (ratings.length - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - ((max - rating) / range) * (chartHeight - 2 * padding);
    return `${x},${y}`;
  }).join(" ");

  const isImproving = ratings[ratings.length - 1] < ratings[0];
  const lineColor = isImproving ? GlowColors.primary : "#EF4444";

  return (
    <View style={styles.miniChart}>
      <View style={{ width: chartWidth, height: chartHeight }}>
        <View style={[styles.chartLine, { backgroundColor: lineColor + "40" }]}>
          <View style={[styles.chartDot, { backgroundColor: lineColor }]} />
        </View>
      </View>
    </View>
  );
}

function TrendIndicator({ trend, delta }: { trend: "up" | "down" | "stable"; delta?: number }) {
  const config = {
    up: { icon: "trending-up" as const, color: GlowColors.primary, label: "Improving" },
    down: { icon: "trending-down" as const, color: "#EF4444", label: "Declining" },
    stable: { icon: "remove" as const, color: "#9CA3AF", label: "Stable" },
  };

  const { icon, color, label } = config[trend];

  return (
    <View style={styles.trendContainer}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.trendLabel, { color }]}>{label}</Text>
    </View>
  );
}

function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const progress = Math.min(1, Math.max(0, current / target));
  
  return (
    <View style={styles.progressBarContainer}>
      <View style={styles.progressBarBg}>
        <View 
          style={[
            styles.progressBarFill, 
            { width: `${progress * 100}%`, backgroundColor: color }
          ]} 
        />
      </View>
    </View>
  );
}

export function DssRatingWidget({
  playerId,
  compact = false,
  showProgress = true,
  showTrend = true,
  style,
  onPress,
}: DssRatingWidgetProps) {
  const scaleValue = useSharedValue(1);

  const { data, isLoading, error } = useQuery<DssRatingData>({
    queryKey: ["/api/adult-glow/player", playerId, "dss-rating"],
    enabled: !!playerId,
  });

  const handlePressIn = () => {
    scaleValue.value = withSpring(0.97);
  };

  const handlePressOut = () => {
    scaleValue.value = withSpring(1);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, style]}>
        <ActivityIndicator color={GlowColors.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorText}>Rating unavailable</Text>
      </View>
    );
  }

  const bracketConfig = BRACKET_COLORS[data.bracket] || BRACKET_COLORS[9];
  const ratingParts = data.dssRating.split(".");
  const wholeNumber = ratingParts[0];
  const decimal = ratingParts[1] || "0000";

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.compactContainer, animatedStyle, style]}>
          <View style={[styles.bracketBadge, { backgroundColor: bracketConfig.primary }]}>
            <Text style={styles.bracketNumber}>{data.bracket}</Text>
          </View>
          <View style={styles.compactRating}>
            <Text style={styles.compactRatingText}>{data.dssRating}</Text>
            {showTrend && (
              <Ionicons
                name={data.trend === "up" ? "trending-up" : data.trend === "down" ? "trending-down" : "remove"}
                size={14}
                color={data.trend === "up" ? GlowColors.primary : data.trend === "down" ? "#EF4444" : "#9CA3AF"}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[animatedStyle]}>
        <LinearGradient
          colors={["rgba(255, 255, 255, 0.06)", "rgba(255, 255, 255, 0.08)"]}
          style={[styles.container, style]}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.label}>Glow Rating</Text>
              {data.isProvisional && (
                <View style={styles.provisionalBadge}>
                  <Text style={styles.provisionalText}>Provisional</Text>
                </View>
              )}
            </View>
            {showTrend && <TrendIndicator trend={data.trend} />}
          </View>

          <View style={styles.ratingRow}>
            <View style={[styles.bracketCircle, { backgroundColor: bracketConfig.primary }]}>
              <Text style={styles.bracketCircleText}>{data.bracket}</Text>
            </View>

            <View style={styles.ratingDisplay}>
              <Text style={styles.ratingWhole}>{wholeNumber}</Text>
              <Text style={styles.ratingDot}>.</Text>
              <Text style={styles.ratingDecimal}>{decimal}</Text>
            </View>

            {data.recentHistory.length > 1 && (
              <MiniRatingChart history={data.recentHistory} />
            )}
          </View>

          <Text style={[styles.rankName, { color: bracketConfig.primary }]}>
            {bracketConfig.name}
          </Text>

          {showProgress && data.progressToNext.targetRank > 0 && data.progressToNext.matchesNeeded > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  To Glow {data.progressToNext.targetRank}
                </Text>
                <Text style={styles.progressValue}>
                  ~{data.progressToNext.matchesNeeded} matches
                </Text>
              </View>
              <ProgressBar
                current={data.mmr - (data.progressToNext.mmrNeeded > 0 ? data.mmr - data.progressToNext.mmrNeeded : 0)}
                target={data.progressToNext.mmrNeeded}
                color={bracketConfig.primary}
              />
              {data.progressToNext.confidence !== "high" && (
                <Text style={styles.confidenceNote}>
                  {data.progressToNext.confidence === "low" ? "Estimate varies" : "Approximate"}
                </Text>
              )}
            </View>
          )}

          <View style={styles.footer}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>MMR</Text>
              <Text style={styles.statValue}>{data.mmr}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Bracket</Text>
              <Text style={styles.statValue}>{data.bracket}</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export function DssRatingBadge({
  dssRating,
  bracket,
  trend,
  size = "md",
  style,
}: {
  dssRating: string;
  bracket: number;
  trend?: "up" | "down" | "stable";
  size?: "sm" | "md" | "lg";
  style?: ViewStyle;
}) {
  const bracketConfig = BRACKET_COLORS[bracket] || BRACKET_COLORS[9];
  
  const sizeStyles = {
    sm: { fontSize: 12, badgeSize: 18, padding: 6 },
    md: { fontSize: 14, badgeSize: 22, padding: 8 },
    lg: { fontSize: 18, badgeSize: 28, padding: 10 },
  }[size];

  return (
    <View style={[styles.badgeContainer, { paddingHorizontal: sizeStyles.padding }, style]}>
      <View 
        style={[
          styles.badgeCircle, 
          { 
            width: sizeStyles.badgeSize, 
            height: sizeStyles.badgeSize,
            backgroundColor: bracketConfig.primary 
          }
        ]}
      >
        <Text style={[styles.badgeNumber, { fontSize: sizeStyles.fontSize * 0.8 }]}>
          {bracket}
        </Text>
      </View>
      <Text style={[styles.badgeRating, { fontSize: sizeStyles.fontSize }]}>
        {dssRating}
      </Text>
      {trend && (
        <Ionicons
          name={trend === "up" ? "trending-up" : trend === "down" ? "trending-down" : "remove"}
          size={sizeStyles.fontSize}
          color={trend === "up" ? GlowColors.primary : trend === "down" ? "#EF4444" : "#9CA3AF"}
          style={{ marginLeft: 4 }}
        />
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 120,
  },
  errorContainer: {
    justifyContent: "center",
    alignItems: "center",
    minHeight: 60,
    backgroundColor: Backgrounds.card,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: "500",
  },
  provisionalBadge: {
    backgroundColor: "#F59E0B20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  provisionalText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "600",
  },
  trendContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trendLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "500",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  bracketCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  bracketCircleText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  ratingDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
    flex: 1,
  },
  ratingWhole: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
  },
  ratingDot: {
    color: Colors.textSecondary,
    fontSize: 28,
    fontWeight: "700",
  },
  ratingDecimal: {
    color: Colors.textSecondary,
    fontSize: 24,
    fontWeight: "600",
  },
  miniChart: {
    marginLeft: Spacing.sm,
  },
  chartLine: {
    height: 24,
    width: 60,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 4,
  },
  chartDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rankName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  progressSection: {
    marginBottom: Spacing.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  progressValue: {
    color: Colors.text,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  progressBarContainer: {
    marginBottom: 4,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Backgrounds.elevated,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  confidenceNote: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontStyle: "italic",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginBottom: 2,
  },
  statValue: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bracketBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  bracketNumber: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  compactRating: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactRatingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeCircle: {
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  badgeNumber: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  badgeRating: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
}));
