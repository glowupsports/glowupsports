import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { ProTennisColors, Spacing } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
export function TrackingBanner() {
  const { state } = usePlayerState();
  const pulseOpacity = useSharedValue(0.6);

  React.useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0.6, { duration: 1500 })
      ),
      -1,
      true
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const getMessage = (): string => {
    if (state.sessionStatus === "live") {
      return "Session in progress - performance being tracked";
    }
    if (state.isNearLevelUp) {
      return "This session affects your promotion outcome";
    }
    if (state.coachName) {
      return `${state.coachName} is tracking your progress today`;
    }
    return "Your progress is being monitored";
  };

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.container}>
      <Animated.View style={[styles.dot, dotStyle]} />
      <Ionicons name="eye-outline" size={12} color={ProTennisColors.textMuted} />
      <Text style={styles.text}>{getMessage()}</Text>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ProTennisColors.electricGreen,
  },
  text: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
    fontStyle: "italic",
    textAlign: "center",
  },
}));
