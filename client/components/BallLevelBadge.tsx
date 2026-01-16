import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, Typography, BorderRadius, Backgrounds, GlowColors, FunctionColors } from "@/constants/theme";
import { getStageFromLevel, getStageColor, translateLevelLabel } from "@shared/language-switch";

interface BallLevelBadgeProps {
  levelId: string;
  status?: "active" | "trial";
  size?: "small" | "medium" | "large";
  showLabel?: boolean;
  trialEndsAt?: string | null;
}

export default function BallLevelBadge({
  levelId,
  status = "active",
  size = "medium",
  showLabel = true,
  trialEndsAt,
}: BallLevelBadgeProps) {
  // Guard against undefined levelId
  if (!levelId) {
    return null;
  }
  
  const stage = getStageFromLevel(levelId);
  const stageColor = getStageColor(stage);
  const levelLabel = translateLevelLabel(levelId, { stage, role: "player" });
  
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
          name="tennisball" 
          size={dims.iconSize} 
          color={stageColor} 
        />
        {isTrial ? (
          <View style={[styles.trialIndicator, { backgroundColor: FunctionColors.social }]}>
            <Ionicons name="time" size={8} color="#FFF" />
          </View>
        ) : null}
      </View>
      
      {showLabel ? (
        <View style={styles.labelContainer}>
          <Text style={[styles.levelLabel, { fontSize: dims.fontSize, color: stageColor }]}>
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
    borderColor: Backgrounds.card,
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
