import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { GlowColors } from "@/constants/theme";

interface AnimatedCheckProps {
  size?: number;
  color?: string;
  backgroundColor?: string;
  onComplete?: () => void;
  autoPlay?: boolean;
  delay?: number;
  variant?: "success" | "glow" | "subtle";
}

export function AnimatedCheck({
  size = 48,
  color,
  backgroundColor,
  onComplete,
  autoPlay = true,
  delay = 0,
  variant = "success",
}: AnimatedCheckProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  const getColors = () => {
    switch (variant) {
      case "glow":
        return {
          bg: GlowColors.primary,
          icon: "rgba(255, 255, 255, 0.06)",
          glow: GlowColors.primary,
        };
      case "subtle":
        return {
          bg: "rgba(255, 255, 255, 0.08)",
          icon: GlowColors.primary,
          glow: GlowColors.primary,
        };
      default:
        return {
          bg: GlowColors.primary,
          icon: "rgba(255, 255, 255, 0.06)",
          glow: GlowColors.primary,
        };
    }
  };

  const colors = getColors();
  const finalBg = backgroundColor || colors.bg;
  const finalColor = color || colors.icon;

  const triggerHaptic = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const triggerComplete = () => {
    onComplete?.();
  };

  useEffect(() => {
    if (autoPlay) {
      animate();
    }
  }, [autoPlay]);

  const animate = () => {
    // Reset
    scale.value = 0;
    opacity.value = 0;
    checkScale.value = 0;
    glowOpacity.value = 0;

    // Animate circle appearing
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 12, stiffness: 150 })
    );
    opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));

    // Animate check appearing with bounce
    checkScale.value = withDelay(
      delay + 200,
      withSequence(
        withSpring(1.2, { damping: 8, stiffness: 200 }),
        withSpring(1, { damping: 12 })
      )
    );

    // Glow pulse
    glowOpacity.value = withDelay(
      delay + 150,
      withSequence(
        withTiming(0.6, { duration: 200 }),
        withTiming(0, { duration: 400 })
      )
    );

    // Haptic feedback
    setTimeout(() => {
      triggerHaptic();
    }, delay + 200);

    // Completion callback
    if (onComplete) {
      setTimeout(() => {
        triggerComplete();
      }, delay + 600);
    }
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: 1.3 }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.glowCircle,
          glowStyle,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 0.75,
            backgroundColor: colors.glow,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.container,
          containerStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: finalBg,
          },
        ]}
      >
        <Animated.View style={checkStyle}>
          <Ionicons
            name="checkmark"
            size={size * 0.55}
            color={finalColor}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    justifyContent: "center",
    alignItems: "center",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  glowCircle: {
    position: "absolute",
  },
});

export default AnimatedCheck;
