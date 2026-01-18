import React from "react";
import { View, Text, StyleSheet, Pressable, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, FontSizes, Backgrounds, GlowColors } from "@/constants/theme";

type BadgeSize = "xs" | "sm" | "md" | "lg";

interface GlowLevelBadgeProps {
  level: number | string;
  isAdult?: boolean;
  showGlow?: boolean;
  size?: BadgeSize;
  style?: ViewStyle;
  onPress?: () => void;
}

const GLOW_LEVEL_CONFIG: Record<number, { name: string; color: string; tier: string }> = {
  9: { name: "Beginner", color: "#6B7280", tier: "bronze" },
  8: { name: "Foundation", color: "#10B981", tier: "bronze" },
  7: { name: "Intermediate", color: "#F59E0B", tier: "silver" },
  6: { name: "Competitive", color: "#3B82F6", tier: "silver" },
  5: { name: "Performance", color: "#8B5CF6", tier: "gold" },
  4: { name: "Elite Perf", color: "#EC4899", tier: "gold" },
  3: { name: "Elite", color: "#EF4444", tier: "platinum" },
  2: { name: "Talent", color: "#F97316", tier: "platinum" },
  1: { name: "Semi-Pro", color: "#FFD700", tier: "diamond" },
};

const BALL_LEVEL_CONFIG: Record<string, { name: string; color: string }> = {
  BLUE: { name: "Blue Ball", color: "#3B82F6" },
  RED: { name: "Red Ball", color: "#EF4444" },
  ORANGE: { name: "Orange Ball", color: "#F97316" },
  GREEN: { name: "Green Ball", color: "#22C55E" },
  YELLOW: { name: "Yellow Ball", color: "#EAB308" },
  ADULT: { name: "Adult Glow", color: "#00E5FF" },
  GLOW: { name: "Glow Master", color: "#00E5FF" },
};

function getSizeStyles(size: BadgeSize) {
  switch (size) {
    case "xs":
      return {
        height: 20,
        paddingHorizontal: 6,
        fontSize: 10,
        iconSize: 10,
        rankSize: 12,
      };
    case "sm":
      return {
        height: 24,
        paddingHorizontal: 8,
        fontSize: 11,
        iconSize: 12,
        rankSize: 14,
      };
    case "md":
      return {
        height: 28,
        paddingHorizontal: 10,
        fontSize: 12,
        iconSize: 14,
        rankSize: 16,
      };
    case "lg":
      return {
        height: 36,
        paddingHorizontal: 14,
        fontSize: 14,
        iconSize: 16,
        rankSize: 20,
      };
  }
}

export function GlowLevelBadge({
  level,
  isAdult = true,
  showGlow = true,
  size = "md",
  style,
  onPress,
}: GlowLevelBadgeProps) {
  const pulseValue = useSharedValue(0);
  const sizeStyles = getSizeStyles(size);

  React.useEffect(() => {
    if (showGlow) {
      pulseValue.value = withRepeat(
        withTiming(1, { duration: 2000 }),
        -1,
        true
      );
    }
  }, [showGlow]);

  const glowStyle = useAnimatedStyle(() => {
    if (!showGlow) return { opacity: 0 };
    const opacity = interpolate(
      pulseValue.value,
      [0, 0.5, 1],
      [0.3, 0.6, 0.3],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const numericLevel = typeof level === "string" ? parseInt(level.replace(/\D/g, "")) || 9 : level;

  if (isAdult) {
    const config = GLOW_LEVEL_CONFIG[numericLevel] || GLOW_LEVEL_CONFIG[9];

    const content = (
      <View style={[styles.badge, { height: sizeStyles.height }, style]}>
        {showGlow && (
          <Animated.View
            style={[
              styles.glowBackground,
              { backgroundColor: config.color },
              glowStyle,
            ]}
          />
        )}
        <LinearGradient
          colors={[`${config.color}40`, `${config.color}20`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.gradientBg,
            { paddingHorizontal: sizeStyles.paddingHorizontal },
          ]}
        >
          <View style={[styles.rankCircle, { backgroundColor: config.color }]}>
            <Text style={[styles.rankText, { fontSize: sizeStyles.rankSize }]}>
              {numericLevel}
            </Text>
          </View>
          <Text style={[styles.levelName, { fontSize: sizeStyles.fontSize }]}>
            {config.name}
          </Text>
          <Ionicons
            name="star"
            size={sizeStyles.iconSize}
            color={config.color}
          />
        </LinearGradient>
      </View>
    );

    return onPress ? (
      <Pressable onPress={onPress}>{content}</Pressable>
    ) : (
      content
    );
  }

  const ballLevelKey = typeof level === "string" ? level.toUpperCase().split("_")[0] : "RED";
  const config = BALL_LEVEL_CONFIG[ballLevelKey] || BALL_LEVEL_CONFIG.RED;

  const content = (
    <View style={[styles.badge, { height: sizeStyles.height }, style]}>
      {showGlow && (
        <Animated.View
          style={[
            styles.glowBackground,
            { backgroundColor: config.color },
            glowStyle,
          ]}
        />
      )}
      <LinearGradient
        colors={[`${config.color}40`, `${config.color}20`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradientBg,
          { paddingHorizontal: sizeStyles.paddingHorizontal },
        ]}
      >
        <View style={[styles.ballIndicator, { backgroundColor: config.color }]} />
        <Text style={[styles.levelName, { fontSize: sizeStyles.fontSize }]}>
          {config.name}
        </Text>
      </LinearGradient>
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress}>{content}</Pressable>
  ) : (
    content
  );
}

export function GlowRankDisplay({
  rank,
  showName = true,
  size = "md",
}: {
  rank: number;
  showName?: boolean;
  size?: BadgeSize;
}) {
  const config = GLOW_LEVEL_CONFIG[rank] || GLOW_LEVEL_CONFIG[9];
  const sizeStyles = getSizeStyles(size);

  return (
    <View style={styles.rankDisplay}>
      <View style={[styles.rankBadge, { backgroundColor: config.color }]}>
        <Text style={[styles.rankBadgeText, { fontSize: sizeStyles.rankSize }]}>
          {rank}
        </Text>
      </View>
      {showName && (
        <Text style={[styles.rankLabel, { fontSize: sizeStyles.fontSize }]}>
          Glow {rank}
        </Text>
      )}
    </View>
  );
}

export function getGlowLevelColor(level: number | string): string {
  const numericLevel = typeof level === "string" ? parseInt(level.replace(/\D/g, "")) || 9 : level;
  return GLOW_LEVEL_CONFIG[numericLevel]?.color || GLOW_LEVEL_CONFIG[9].color;
}

export function getGlowLevelName(level: number | string): string {
  const numericLevel = typeof level === "string" ? parseInt(level.replace(/\D/g, "")) || 9 : level;
  return GLOW_LEVEL_CONFIG[numericLevel]?.name || GLOW_LEVEL_CONFIG[9].name;
}

export function getBallLevelColor(level: string): string {
  const key = level.toUpperCase().split("_")[0];
  return BALL_LEVEL_CONFIG[key]?.color || BALL_LEVEL_CONFIG.RED.color;
}

export { GLOW_LEVEL_CONFIG, BALL_LEVEL_CONFIG };

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.border}60`,
  },
  glowBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  gradientBg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  rankCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  levelName: {
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  ballIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rankDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  rankLabel: {
    fontWeight: "500",
    color: Colors.textMuted,
  },
});
