import React from "react";
import { View, StyleSheet, ViewStyle, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  withSequence,
} from "react-native-reanimated";
import { ProTennisColors, Backgrounds, BorderRadius, Spacing, GlowColors, FunctionColors, Colors } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type GlassCardVariant = "default" | "neon" | "hero" | "subtle" | "premium";

interface GlassCardProps {
  children: React.ReactNode;
  variant?: GlassCardVariant;
  style?: ViewStyle;
  neonColor?: string;
  animated?: boolean;
  intensity?: number;
}

export function GlassCard({
  children,
  variant = "default",
  style,
  neonColor = ProTennisColors.electricGreen,
  animated = false,
  intensity = 40,
}: GlassCardProps) {
  const pulseValue = useSharedValue(1);

  React.useEffect(() => {
    if (animated) {
      pulseValue.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1500 }),
          withTiming(1, { duration: 1500 })
        ),
        -1,
        true
      );
    }
  }, [animated, pulseValue]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: animated ? [{ scale: pulseValue.value }] : [],
  }));

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case "neon":
        return {
          borderWidth: 1,
          borderColor: `${neonColor}40`,
        };
      case "hero":
        return {
          borderWidth: 1,
          borderColor: "rgba(200, 255, 61, 0.2)",
        };
      case "premium":
        return {
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.1)",
        };
      case "subtle":
        return {
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.08)",
        };
      default:
        return {
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.08)",
        };
    }
  };

  const variantStyles = getVariantStyles();

  if (Platform.OS === "web") {
    return (
      <Animated.View style={[styles.container, animatedStyle]}>
        <LinearGradient
          colors={[
            "rgba(26, 34, 53, 0.85)",
            "rgba(21, 27, 41, 0.95)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientBase,
            variantStyles,
            style,
          ]}
        >
          <View style={styles.glassHighlight} />
          {children}
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <BlurView intensity={intensity} tint="dark" style={[styles.blurBase, variantStyles, style]}>
        <LinearGradient
          colors={[
            "rgba(26, 34, 53, 0.6)",
            "rgba(21, 27, 41, 0.8)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.innerGradient}
        >
          <View style={styles.glassHighlight} />
          {children}
        </LinearGradient>
      </BlurView>
    </Animated.View>
  );
}

interface NeonEdgeCardProps {
  children: React.ReactNode;
  color?: string;
  style?: ViewStyle;
  glowIntensity?: "low" | "medium" | "high";
  pulsing?: boolean;
}

export function NeonEdgeCard({
  children,
  color = ProTennisColors.electricGreen,
  style,
  glowIntensity = "medium",
  pulsing = false,
}: NeonEdgeCardProps) {
  const glowOpacity = useSharedValue(0.2);

  React.useEffect(() => {
    if (pulsing) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1000 }),
          withTiming(0.1, { duration: 1000 })
        ),
        -1,
        true
      );
    }
  }, [pulsing, glowOpacity]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowOpacity.value,
  }));

  const getGlowRadius = () => {
    switch (glowIntensity) {
      case "low": return 6;
      case "high": return 20;
      default: return 12;
    }
  };

  return (
    <Animated.View
      style={[
        styles.neonCard,
        {
          borderColor: `${color}18`,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[
          `${color}08`,
          "rgba(21, 27, 41, 0.95)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.neonInner}
      >
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

interface FloatingCardProps {
  children: React.ReactNode;
  elevation?: "low" | "medium" | "high";
  style?: ViewStyle;
}

export function FloatingCard({
  children,
  elevation = "medium",
  style,
}: FloatingCardProps) {
  const getElevationStyle = (): ViewStyle => {
    switch (elevation) {
      case "low":
        return {
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
          elevation: 3,
        };
      case "high":
        return {
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 6,
        };
      default:
        return {
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        };
    }
  };

  return (
    <View
      style={[
        styles.floatingCard,
        getElevationStyle(),
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  blurBase: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  gradientBase: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    position: "relative",
  },
  innerGradient: {
    flex: 1,
  },
  glassHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  neonCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  neonInner: {
    flex: 1,
    borderRadius: BorderRadius.md - 1,
  },
  floatingCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    shadowColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
}));
