import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius, GlowColors, TextColors, FunctionColors } from "@/constants/theme";
import { useLanguageSwitch } from "@/lib/useLanguageSwitch";
import type { BallStage, ViewRole } from "@shared/language-switch";

interface PillarData {
  pillar: string;
  currentScore: number;
  trend: "improving" | "stable" | "declining";
  lastSessionDelta?: number | null;
}

interface PillarProgressRingsProps {
  pillars: Record<string, PillarData>;
  stage: BallStage;
  role?: "player" | "coach" | "parent";
  onPillarPress?: (pillar: string) => void;
}

const PILLAR_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  TECHNIQUE: { icon: "tennisball", color: "#10B981" },
  TACTICAL: { icon: "bulb-outline", color: "#F59E0B" },
  PHYSICAL: { icon: "fitness", color: "#EF4444" },
  MENTAL: { icon: "flash-outline", color: "#8B5CF6" },
  SOCIAL: { icon: "people-outline", color: "#EC4899" },
  MATCH: { icon: "trophy-outline", color: "#3B82F6" },
};

const PILLAR_ORDER = ["TECHNIQUE", "TACTICAL", "PHYSICAL", "MENTAL", "SOCIAL", "MATCH"];

function ProgressRing({
  progress,
  color,
  size = 50,
  strokeWidth = 4,
}: {
  progress: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 100) / 100);
  
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color + "30"}
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="transparent"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

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

export default function PillarProgressRings({
  pillars,
  stage,
  role = "player",
  onPillarPress,
}: PillarProgressRingsProps) {
  const { translate } = useLanguageSwitch({ levelId: null, role });
  const screenWidth = Dimensions.get("window").width;
  const itemWidth = Math.min((screenWidth - Spacing.lg * 2 - Spacing.sm * 2) / 3, 100);
  
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {PILLAR_ORDER.map((pillarKey) => {
          const data = pillars[pillarKey] || {
            pillar: pillarKey,
            currentScore: 0,
            trend: "stable" as const,
          };
          const pillarConfig = PILLAR_CONFIG[pillarKey];
          const pillarName = translate.pillar(pillarKey);
          
          return (
            <Pressable
              key={pillarKey}
              style={[styles.pillarItem, { width: itemWidth }]}
              onPress={() => {
                if (onPillarPress) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPillarPress(pillarKey);
                }
              }}
            >
              <View style={styles.ringWrapper}>
                <ProgressRing
                  progress={data.currentScore}
                  color={pillarConfig.color}
                  size={56}
                  strokeWidth={5}
                />
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={pillarConfig.icon}
                    size={20}
                    color={pillarConfig.color}
                  />
                </View>
              </View>
              
              <Text style={styles.pillarName} numberOfLines={1}>
                {pillarName}
              </Text>
              
              <View style={styles.scoreRow}>
                <Text style={[styles.score, { color: pillarConfig.color }]}>
                  {Math.round(data.currentScore)}%
                </Text>
                <Ionicons
                  name={getTrendIcon(data.trend)}
                  size={12}
                  color={getTrendColor(data.trend)}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  pillarItem: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  ringWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  pillarName: {
    fontSize: Typography.small.fontSize,
    color: TextColors.primary,
    fontWeight: "500",
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  score: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
  },
});
