import React, { useEffect } from "react";
import { View, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface LevelUpModalProps {
  visible: boolean;
  level: number;
  onClose: () => void;
}

export function LevelUpModal({ visible, level, onClose }: LevelUpModalProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const iconRotation = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      opacity.value = withSpring(1);
      scale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 150 }),
        withSpring(1, { damping: 12, stiffness: 150 })
      );
      iconRotation.value = withSequence(
        withSpring(15),
        withSpring(-15),
        withSpring(0)
      );
    } else {
      scale.value = 0;
      opacity.value = 0;
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotation.value}deg` }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Animated.View style={[styles.content, contentStyle]}>
          <Animated.View style={[styles.iconContainer, iconStyle]}>
            <Ionicons name="ribbon-outline" size={64} color={Colors.dark.gold} />
          </Animated.View>
          <ThemedText style={styles.title}>Level Up!</ThemedText>
          <ThemedText style={styles.level}>Level {level}</ThemedText>
          <ThemedText style={styles.subtitle}>Keep up the great work!</ThemedText>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.8 : 1 }]}
          >
            <ThemedText style={styles.buttonText}>Continue</ThemedText>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.dark.gold,
  },
  iconContainer: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: GlowColors.primary,
    marginBottom: Spacing.sm,
  },
  level: {
    fontSize: 48,
    fontWeight: "700",
    color: Colors.dark.gold,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.text,
    opacity: 0.7,
    marginBottom: Spacing.xl,
  },
  button: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    minWidth: 160,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
}));
