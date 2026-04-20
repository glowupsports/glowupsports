import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
  FadeIn,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
Backgrounds, } from "@/constants/theme";

interface ActionOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant: "primary" | "secondary" | "ghost";
  onPress: () => void;
}

interface PostActionModalProps {
  visible: boolean;
  onClose: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  message?: string;
  actions: ActionOption[];
}

export function PostActionModal({
  visible,
  onClose,
  icon = "checkmark-circle",
  iconColor,
  title,
  subtitle,
  message,
  actions,
}: PostActionModalProps) {
  const backdropOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(50);
  const cardOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 300 });
      cardTranslateY.value = withSpring(0, { damping: 15, stiffness: 120 });
      cardOpacity.value = withTiming(1, { duration: 300 });
      iconScale.value = withDelay(
        200,
        withSequence(
          withSpring(1.15, { damping: 8 }),
          withSpring(1, { damping: 12 })
        )
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      backdropOpacity.value = 0;
      cardTranslateY.value = 50;
      cardOpacity.value = 0;
      iconScale.value = 0;
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
    opacity: cardOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    backdropOpacity.value = withTiming(0, { duration: 200 });
    cardTranslateY.value = withTiming(50, { duration: 200 });
    cardOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(onClose, 200);
  };

  const handleAction = (action: ActionOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action.onPress();
  };

  const getButtonStyle = (variant: ActionOption["variant"]) => {
    switch (variant) {
      case "primary":
        return styles.primaryButton;
      case "secondary":
        return styles.secondaryButton;
      case "ghost":
        return styles.ghostButton;
    }
  };

  const getButtonTextStyle = (variant: ActionOption["variant"]) => {
    switch (variant) {
      case "primary":
        return styles.primaryButtonText;
      case "secondary":
        return styles.secondaryButtonText;
      case "ghost":
        return styles.ghostButtonText;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <BlurView intensity={20} style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View style={[styles.card, cardStyle]}>
          {/* Icon */}
          <Animated.View
            style={[
              styles.iconContainer,
              iconStyle,
              iconColor ? { backgroundColor: `${iconColor}20` } : {},
            ]}
          >
            <Ionicons
              name={icon}
              size={36}
              color={iconColor || GlowColors.primary}
            />
          </Animated.View>

          {/* Content */}
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {message && <Text style={styles.message}>{message}</Text>}

          {/* What's Next Section */}
          <View style={styles.whatsNextSection}>
            <Text style={styles.whatsNextLabel}>What's Next?</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {actions.map((action, index) => (
              <Animated.View
                key={action.id}
                entering={FadeIn.delay(300 + index * 100).duration(300)}
              >
                <Pressable
                  style={[styles.button, getButtonStyle(action.variant)]}
                  onPress={() => handleAction(action)}
                >
                  <Ionicons
                    name={action.icon}
                    size={18}
                    color={
                      action.variant === "primary"
                        ? "#000"
                        : action.variant === "secondary"
                        ? GlowColors.primary
                        : TextColors.muted
                    }
                  />
                  <Text style={getButtonTextStyle(action.variant)}>
                    {action.label}
                  </Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${GlowColors.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: TextColors.primary,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: GlowColors.primary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  message: {
    ...Typography.body,
    color: TextColors.muted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  whatsNextSection: {
    width: "100%",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
    paddingTop: Spacing.lg,
  },
  whatsNextLabel: {
    ...Typography.caption,
    color: TextColors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  actions: {
    width: "100%",
    gap: Spacing.md,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  primaryButton: {
    backgroundColor: GlowColors.primary,
  },
  secondaryButton: {
    backgroundColor: `${GlowColors.primary}15`,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}40`,
  },
  ghostButton: {
    backgroundColor: "transparent",
  },
  primaryButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  secondaryButtonText: {
    ...Typography.body,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  ghostButtonText: {
    ...Typography.body,
    color: TextColors.muted,
  },
}));

export default PostActionModal;
