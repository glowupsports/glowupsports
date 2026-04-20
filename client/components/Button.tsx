import React, { ReactNode } from "react";
import { StyleSheet, Pressable, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
  interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, GlowColors, Backgrounds, FunctionColors, TextColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  variant?: ButtonVariant;
  haptic?: boolean;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
  energyThreshold: 0.001,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  onPress,
  children,
  style,
  disabled = false,
  variant = "primary",
  haptic = true,
}: ButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: GlowColors.primary,
          textColor: "#000000",
          borderColor: "transparent",
          pressedBg: GlowColors.soft,
        };
      case "secondary":
        return {
          backgroundColor: Backgrounds.elevated,
          textColor: TextColors.primary,
          borderColor: "rgba(255, 255, 255, 0.06)",
          pressedBg: "rgba(255, 255, 255, 0.04)",
        };
      case "ghost":
        return {
          backgroundColor: "transparent",
          textColor: GlowColors.primary,
          borderColor: GlowColors.primary + "40",
          pressedBg: GlowColors.primary + "10",
        };
      case "danger":
        return {
          backgroundColor: FunctionColors.error,
          textColor: TextColors.primary,
          borderColor: "transparent",
          pressedBg: FunctionColors.errorMuted,
        };
      default:
        return {
          backgroundColor: GlowColors.primary,
          textColor: "#000000",
          borderColor: "transparent",
          pressedBg: GlowColors.soft,
        };
    }
  };

  const variantStyles = getVariantStyles();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.97, springConfig);
      pressed.value = 1;
    }
  };

  const handlePressOut = () => {
    if (!disabled) {
      scale.value = withSpring(1, springConfig);
      pressed.value = 0;
    }
  };

  const handlePress = () => {
    if (!disabled && onPress) {
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress();
    }
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.button,
        {
          backgroundColor: variantStyles.backgroundColor,
          borderColor: variantStyles.borderColor,
          borderWidth: variant === "ghost" || variant === "secondary" ? 1 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        variant === "primary" && styles.primaryShadow,
        style,
        animatedStyle,
      ]}
    >
      <ThemedText
        type="body"
        style={[
          styles.buttonText, 
          { color: variantStyles.textColor },
          variant === "primary" && styles.primaryText,
        ]}
      >
        {children}
      </ThemedText>
    </AnimatedPressable>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  button: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  buttonText: {
    fontWeight: "600",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  primaryText: {
    fontWeight: "700",
  },
  primaryShadow: {
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
}));
