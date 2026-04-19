import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface StorylineConfig {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  intensity: "low" | "medium" | "high";
}

const STORYLINE_MAP: Record<string, StorylineConfig> = {
  "PROMOTION PRESSURE": {
    icon: "arrow-up-circle",
    label: "PROMOTION PRESSURE",
    description: "One session away from breaking through",
    color: ProTennisColors.electricGreen,
    bgColor: ProTennisColors.electricGreen + "15",
    intensity: "high",
  },
  "ON FIRE": {
    icon: "flame",
    label: "ON FIRE",
    description: "Momentum is locked in, stay in the zone",
    color: ProTennisColors.warning,
    bgColor: ProTennisColors.warning + "12",
    intensity: "high",
  },
  "STREAK AT RISK": {
    icon: "warning",
    label: "STREAK AT RISK",
    description: "The streak hangs in the balance",
    color: ProTennisColors.danger,
    bgColor: ProTennisColors.danger + "12",
    intensity: "high",
  },
  "MATCH DAY": {
    icon: "tennisball",
    label: "MATCH DAY",
    description: "All eyes on center court today",
    color: ProTennisColors.neonCyan,
    bgColor: ProTennisColors.neonCyan + "12",
    intensity: "high",
  },
  "WARMING UP": {
    icon: "fitness",
    label: "WARMING UP",
    description: "The countdown to greatness begins",
    color: ProTennisColors.warning,
    bgColor: ProTennisColors.warning + "10",
    intensity: "medium",
  },
  "ROAD TO ORANGE": {
    icon: "trending-up",
    label: "ROAD TO ORANGE",
    description: "Every session brings orange closer",
    color: "#FF8C00",
    bgColor: "rgba(255, 140, 0, 0.1)",
    intensity: "low",
  },
  "CHASING GREEN": {
    icon: "leaf",
    label: "CHASING GREEN",
    description: "The green ball milestone awaits",
    color: "#32CD32",
    bgColor: "rgba(50, 205, 50, 0.1)",
    intensity: "low",
  },
  "YELLOW DREAM": {
    icon: "star",
    label: "YELLOW DREAM",
    description: "Elite status is within reach",
    color: "#FFD700",
    bgColor: "rgba(255, 215, 0, 0.1)",
    intensity: "medium",
  },
};

const DEFAULT_STORYLINE: StorylineConfig = {
  icon: "tennisball",
  label: "YOUR JOURNEY",
  description: "Write your story on the court",
  color: ProTennisColors.textMuted,
  bgColor: ProTennisColors.surfaceElevated,
  intensity: "low",
};

export function StorylineStrip() {
  const { state } = usePlayerState();
  const storyline = state.currentStoryline 
    ? STORYLINE_MAP[state.currentStoryline] || DEFAULT_STORYLINE 
    : DEFAULT_STORYLINE;

  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);
  const borderPulse = useSharedValue(0);

  useEffect(() => {
    if (storyline.intensity === "high") {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1000 }),
          withTiming(0.2, { duration: 1000 })
        ),
        -1,
        true
      );
      borderPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0.4, { duration: 800 })
        ),
        -1,
        true
      );
    } else if (storyline.intensity === "medium") {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.01, { duration: 2000 }),
          withTiming(1, { duration: 2000 })
        ),
        -1,
        true
      );
      glowOpacity.value = withTiming(0.4, { duration: 500 });
      borderPulse.value = withTiming(0.6, { duration: 500 });
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0.2, { duration: 300 });
      borderPulse.value = withTiming(0.3, { duration: 300 });
    }
  }, [storyline.intensity]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: storyline.color,
    borderWidth: 1,
    opacity: borderPulse.value,
  }));

  if (!state.currentStoryline && state.tensionLevel < 10) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <Animated.View style={[styles.borderOverlay, borderStyle]} />
      
      <View style={[styles.content, { backgroundColor: storyline.bgColor }]}>
        <Animated.View style={[styles.iconGlow, glowStyle, { backgroundColor: storyline.color }]} />
        <View style={[styles.iconWrap, { backgroundColor: storyline.color + "20" }]}>
          <Ionicons name={storyline.icon} size={18} color={storyline.color} />
        </View>
        
        <View style={styles.textContent}>
          <Text style={[styles.label, { color: storyline.color }]}>{storyline.label}</Text>
          <Text style={styles.description}>{storyline.description}</Text>
        </View>

        {storyline.intensity === "high" && (
          <View style={styles.tensionIndicator}>
            <View style={[styles.tensionDot, { backgroundColor: storyline.color }]} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.md,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  iconGlow: {
    position: "absolute",
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  textContent: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    fontWeight: "500",
    color: ProTennisColors.textMuted,
    fontStyle: "italic",
  },
  tensionIndicator: {
    justifyContent: "center",
    alignItems: "center",
  },
  tensionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
}));
