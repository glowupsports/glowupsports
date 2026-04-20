import React, { useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
} from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ToastVariant = "success" | "error" | "info" | "warning";

interface SuccessToastProps {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onHide?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function SuccessToast({
  visible,
  message,
  variant = "success",
  duration = 2500,
  onHide,
  icon,
}: SuccessToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const iconRotate = useSharedValue(0);

  const getVariantStyles = () => {
    switch (variant) {
      case "success":
        return {
          bg: GlowColors.primary,
          icon: icon || "checkmark-circle",
          iconColor: "rgba(255, 255, 255, 0.06)",
          textColor: "rgba(255, 255, 255, 0.06)",
        };
      case "error":
        return {
          bg: Colors.dark.error,
          icon: icon || "close-circle",
          iconColor: TextColors.primary,
          textColor: TextColors.primary,
        };
      case "info":
        return {
          bg: Colors.dark.xpCyan,
          icon: icon || "information-circle",
          iconColor: "rgba(255, 255, 255, 0.06)",
          textColor: "rgba(255, 255, 255, 0.06)",
        };
      case "warning":
        return {
          bg: Colors.dark.orange,
          icon: icon || "warning",
          iconColor: "rgba(255, 255, 255, 0.06)",
          textColor: "rgba(255, 255, 255, 0.06)",
        };
      default:
        return {
          bg: GlowColors.primary,
          icon: icon || "checkmark-circle",
          iconColor: "rgba(255, 255, 255, 0.06)",
          textColor: "rgba(255, 255, 255, 0.06)",
        };
    }
  };

  const styles_variant = getVariantStyles();

  const triggerHaptic = useCallback(() => {
    if (variant === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (variant === "error") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [variant]);

  const handleHide = useCallback(() => {
    onHide?.();
  }, [onHide]);

  useEffect(() => {
    if (visible) {
      // Show animation
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 12 });
      iconRotate.value = withSequence(
        withSpring(-10, { damping: 8 }),
        withSpring(10, { damping: 8 }),
        withSpring(0, { damping: 12 })
      );

      // Haptic
      triggerHaptic();

      // Auto hide
      const timer = setTimeout(() => {
        translateY.value = withSpring(-100, { damping: 15 });
        opacity.value = withTiming(0, { duration: 200 });
        scale.value = withTiming(0.8, { duration: 200 });
        
        setTimeout(() => {
          handleHide();
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    } else {
      translateY.value = -100;
      opacity.value = 0;
      scale.value = 0.8;
    }
  }, [visible, duration]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotate.value}deg` }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        containerStyle,
        {
          top: insets.top + Spacing.md,
          backgroundColor: styles_variant.bg,
        },
      ]}
    >
      <Animated.View style={iconStyle}>
        <Ionicons
          name={styles_variant.icon as keyof typeof Ionicons.glyphMap}
          size={22}
          color={styles_variant.iconColor}
        />
      </Animated.View>
      <Text
        style={[styles.message, { color: styles_variant.textColor }]}
        numberOfLines={2}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    zIndex: 9999,
    shadowColor: "rgba(255, 255, 255, 0.06)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  message: {
    ...Typography.body,
    fontWeight: "600",
    flex: 1,
  },
}));

export default SuccessToast;
