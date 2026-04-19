import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { ProTennisColors, Spacing, BorderRadius, GlowColors, FunctionColors, TextColors } from "@/constants/theme";
import { usePlayerState, BroadcastMode } from "@/player/context/PlayerStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface OnAirIndicatorProps {
  mode?: BroadcastMode;
  size?: "small" | "medium" | "large";
  showLabel?: boolean;
}

const BROADCAST_CONFIG: Record<BroadcastMode, { 
  label: string; 
  color: string; 
  bgColor: string;
  pulse: boolean;
  intensity: number;
}> = {
  on_air: {
    label: "ON AIR",
    color: FunctionColors.error,
    bgColor: FunctionColors.error + "25",
    pulse: true,
    intensity: 1,
  },
  pre_game: {
    label: "PRE-GAME",
    color: FunctionColors.social,
    bgColor: FunctionColors.social + "1F",
    pulse: true,
    intensity: 0.6,
  },
  post_game: {
    label: "POST-GAME",
    color: FunctionColors.info,
    bgColor: FunctionColors.info + "1A",
    pulse: false,
    intensity: 0.4,
  },
  rest_day: {
    label: "REST",
    color: TextColors.muted,
    bgColor: "rgba(255, 255, 255, 0.04)",
    pulse: false,
    intensity: 0.2,
  },
  off_air: {
    label: "OFF AIR",
    color: TextColors.muted,
    bgColor: "rgba(255, 255, 255, 0.08)",
    pulse: false,
    intensity: 0.3,
  },
};

export function OnAirIndicator({ 
  mode: propMode, 
  size = "medium",
  showLabel = true,
}: OnAirIndicatorProps) {
  const { state } = usePlayerState();
  const mode = propMode ?? state.broadcastMode;
  const config = BROADCAST_CONFIG[mode];
  
  const dotOpacity = useSharedValue(1);
  const dotScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (config.pulse) {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      
      dotScale.value = withRepeat(
        withSequence(
          withTiming(0.85, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      dotOpacity.value = withTiming(config.intensity, { duration: 300 });
      dotScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [config.pulse, config.intensity]);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const sizeStyles = {
    small: { dot: 6, fontSize: 8, padding: 4, gap: 4 },
    medium: { dot: 8, fontSize: 10, padding: 6, gap: 6 },
    large: { dot: 10, fontSize: 12, padding: 8, gap: 8 },
  };

  const s = sizeStyles[size];

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor, paddingHorizontal: s.padding, paddingVertical: s.padding - 2 }]}>
      <View style={styles.dotWrapper}>
        {config.pulse && (
          <Animated.View
            style={[
              styles.glow,
              glowAnimatedStyle,
              {
                width: s.dot * 2.5,
                height: s.dot * 2.5,
                borderRadius: s.dot * 1.25,
                backgroundColor: config.color,
              },
            ]}
          />
        )}
        <Animated.View
          style={[
            styles.dot,
            dotAnimatedStyle,
            {
              width: s.dot,
              height: s.dot,
              borderRadius: s.dot / 2,
              backgroundColor: config.color,
            },
          ]}
        />
      </View>
      {showLabel && (
        <Text style={[styles.label, { fontSize: s.fontSize, color: config.color }]}>
          {config.label}
        </Text>
      )}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  dotWrapper: {
    justifyContent: "center",
    alignItems: "center",
    width: 20,
    height: 20,
  },
  glow: {
    position: "absolute",
  },
  dot: {},
  label: {
    fontWeight: "800",
    letterSpacing: 1,
  },
}));
