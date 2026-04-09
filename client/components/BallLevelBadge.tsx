import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, GlowColors, FunctionColors, TextColors } from "@/constants/theme";
import { getStageFromLevel, getStageColor, translateLevelLabel } from "@shared/language-switch";
import { getSportConfig, formatSportSkillLevel, getSportSkillLevelColor } from "@shared/sportConfig";

interface BallLevelBadgeProps {
  levelId: string;
  sport?: string | null;
  status?: "active" | "trial";
  size?: "small" | "medium" | "large";
  showLabel?: boolean;
  trialEndsAt?: string | null;
  labelOverride?: string | null;
}

export default function BallLevelBadge({
  levelId,
  sport,
  status = "active",
  size = "medium",
  showLabel = true,
  trialEndsAt,
  labelOverride,
}: BallLevelBadgeProps) {
  // Guard against undefined levelId
  if (!levelId) {
    return null;
  }

  const normalizedSport = sport && sport !== "tennis" ? sport : null;
  const sportCfg = normalizedSport ? getSportConfig(normalizedSport) : null;

  const stage = getStageFromLevel(levelId);
  const stageColor = sportCfg ? getSportSkillLevelColor(normalizedSport, levelId) : getStageColor(stage);
  const levelLabel = labelOverride
    ? labelOverride
    : sportCfg
      ? formatSportSkillLevel(normalizedSport, levelId)
      : translateLevelLabel(levelId, { stage, role: "player" });
  
  const isTrial = status === "trial";
  
  const getDimensions = () => {
    switch (size) {
      case "small":
        return { width: 40, height: 40, iconSize: 16, fontSize: 10 };
      case "large":
        return { width: 80, height: 80, iconSize: 32, fontSize: 16 };
      default:
        return { width: 56, height: 56, iconSize: 24, fontSize: 12 };
    }
  };
  
  const dims = getDimensions();
  
  const getTrialDaysRemaining = () => {
    if (!trialEndsAt) return null;
    const end = new Date(trialEndsAt);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };
  
  const trialDays = getTrialDaysRemaining();

  const iconName = sportCfg
    ? (sportCfg.icon as "tennisball" | "grid" | "disc" | "apps")
    : "tennisball";
  
  return (
    <View style={styles.container}>
      <View 
        style={[
          styles.badge,
          { 
            width: dims.width, 
            height: dims.height,
            borderColor: isTrial ? FunctionColors.social : stageColor,
          }
        ]}
      >
        <LinearGradient
          colors={[stageColor + "40", stageColor + "20"]}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons 
          name={iconName}
          size={dims.iconSize} 
          color={stageColor} 
        />
        {isTrial ? (
          <View style={[styles.trialIndicator, { backgroundColor: FunctionColors.social }]}>
            <Ionicons name="time" size={8} color={TextColors.primary} />
          </View>
        ) : null}
      </View>
      
      {showLabel ? (
        <View style={styles.labelContainer}>
          <Text style={[styles.levelLabel, { fontSize: dims.fontSize, color: stageColor }, labelOverride ? { textTransform: "none" } : undefined]}>
            {levelLabel}
          </Text>
          {isTrial && trialDays !== null ? (
            <Text style={styles.trialLabel}>
              Trial ({trialDays}d left)
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  badge: {
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    overflow: "hidden",
  },
  trialIndicator: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  labelContainer: {
    alignItems: "center",
  },
  levelLabel: {
    fontWeight: "600",
    textTransform: "uppercase",
  },
  trialLabel: {
    fontSize: Typography.small.fontSize,
    color: FunctionColors.social,
    marginTop: 2,
  },
});
