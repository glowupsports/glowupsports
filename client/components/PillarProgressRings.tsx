import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors, TextColors, FunctionColors } from "@/constants/theme";
import type { BallStage } from "@shared/language-switch";

interface PillarData {
  pillar: string;
  currentScore: number;
  trend: "improving" | "stable" | "declining";
  lastSessionDelta?: number | null;
  subtitle?: string;
}

interface PillarProgressRingsProps {
  pillars: Record<string, PillarData>;
  stage: BallStage;
  role?: "player" | "coach" | "parent";
  onPillarPress?: (pillar: string) => void;
}

const PILLAR_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; gradient: [string, string]; shortLabel: string }> = {
  TECHNIQUE: { icon: "tennisball", color: "#10B981", gradient: ["#10B98130", "#10B98110"], shortLabel: "Technical" },
  TACTICAL: { icon: "bulb-outline", color: "#F59E0B", gradient: ["#F59E0B30", "#F59E0B10"], shortLabel: "Tactical" },
  PHYSICAL: { icon: "fitness", color: "#EF4444", gradient: ["#EF444430", "#EF444410"], shortLabel: "Physical" },
  MENTAL: { icon: "flash-outline", color: "#8B5CF6", gradient: ["#8B5CF630", "#8B5CF610"], shortLabel: "Mental" },
  SOCIAL: { icon: "people-outline", color: "#EC4899", gradient: ["#EC489930", "#EC489910"], shortLabel: "Social" },
  MATCH: { icon: "trophy-outline", color: "#3B82F6", gradient: ["#3B82F630", "#3B82F610"], shortLabel: "Competition" },
};

const PILLAR_ORDER = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];

function ProgressBar({
  progress,
  color,
}: {
  progress: number;
  color: string;
}) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  
  return (
    <View style={progressStyles.track}>
      <View 
        style={[
          progressStyles.fill, 
          { 
            width: `${clampedProgress}%`,
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 4,
          }
        ]} 
      />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
});

function getTrendIcon(trend: string): keyof typeof Ionicons.glyphMap {
  switch (trend) {
    case "improving":
      return "trending-up";
    case "declining":
      return "trending-down";
    default:
      return "remove";
  }
}

function getTrendColor(trend: string): string {
  switch (trend) {
    case "improving":
      return GlowColors.primary;
    case "declining":
      return FunctionColors.error;
    default:
      return TextColors.disabled;
  }
}

function PillarCard({ 
  pillarKey, 
  data, 
  onPress 
}: { 
  pillarKey: string;
  data: PillarData;
  onPress: () => void;
}) {
  const config = PILLAR_CONFIG[pillarKey];
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15 });
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };
  
  return (
    <Animated.View style={[styles.cardWrapper, animatedStyle]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardPressable}
      >
        <LinearGradient
          colors={["rgba(30, 35, 45, 0.95)", "rgba(20, 25, 30, 0.98)"]}
          style={[styles.card, { borderColor: config.color + "50" }]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: config.color + "25", borderColor: config.color + "40" }]}>
              <Ionicons name={config.icon} size={22} color={config.color} />
            </View>
            <View style={styles.trendBadge}>
              <Ionicons
                name={getTrendIcon(data.trend)}
                size={14}
                color={getTrendColor(data.trend)}
              />
            </View>
          </View>
          
          <Text style={styles.cardTitle}>{config.shortLabel}</Text>
          
          <View style={styles.scoreSection}>
            <Text style={[styles.scoreValue, { color: config.color }]}>
              {Math.round(data.currentScore)}%
            </Text>
            {data.subtitle ? (
              <Text style={styles.scoreSubtitle}>{data.subtitle}</Text>
            ) : null}
          </View>
          
          <ProgressBar progress={data.currentScore} color={config.color} />
          
          <View style={styles.tapHint}>
            <Ionicons name="chevron-forward" size={12} color={Colors.dark.textMuted} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function PillarProgressRings({
  pillars,
  stage,
  role = "player",
  onPillarPress,
}: PillarProgressRingsProps) {
  const screenWidth = Dimensions.get("window").width;
  // Calculate card width for 2-column layout: screen width - horizontal padding (lg * 2) - gap between cards (sm)
  const cardWidth = (screenWidth - Spacing.lg * 2 - Spacing.sm) / 2;
  
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {PILLAR_ORDER.map((pillarKey) => {
          const data = pillars[pillarKey] || {
            pillar: pillarKey,
            currentScore: 0,
            trend: "stable" as const,
          };
          
          return (
            <View key={pillarKey} style={styles.cardColumn}>
              <PillarCard
                pillarKey={pillarKey}
                data={data}
                onPress={() => onPillarPress?.(pillarKey)}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: Spacing.sm,
  },
  cardColumn: {
    width: "48.5%",
  },
  cardWrapper: {
    marginBottom: 0,
  },
  cardPressable: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    minHeight: 130,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
  },
  trendBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Backgrounds.elevated,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  scoreSection: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  scoreSubtitle: {
    fontSize: 10,
    color: TextColors.disabled,
    marginTop: 1,
  },
  tapHint: {
    position: "absolute",
    bottom: Spacing.sm,
    right: Spacing.sm,
    opacity: 0.5,
  },
});
