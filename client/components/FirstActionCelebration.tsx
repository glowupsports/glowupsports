import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withRepeat,
  withTiming,
  FadeIn,
} from "react-native-reanimated";
import {
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
Backgrounds, } from "@/constants/theme";

const CELEBRATIONS_KEY = "@glow_celebrations_shown";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface FirstActionCelebrationProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  icon: string;
  iconColor?: string;
  xpReward?: number;
}

const CONFETTI_COLORS = [
  GlowColors.primary,
  FunctionColors.info,
  FunctionColors.success,
  FunctionColors.social,
  "#FF6B9D",
  GlowColors.soft,
  FunctionColors.planning,
  "#E040FB",
  "#FFD700",
  "#00E5FF",
];

interface ConfettiPieceProps {
  index: number;
  color: string;
}

function ConfettiPiece({ index, color }: ConfettiPieceProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scaleVal = useSharedValue(0);

  const angle = (index / 10) * Math.PI * 2;
  const distance = 80 + Math.random() * 60;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance;
  const delay = index * 60;
  const size = 6 + Math.random() * 6;

  useEffect(() => {
    opacity.value = withDelay(delay, withSpring(1, { damping: 12 }));
    scaleVal.value = withDelay(delay, withSpring(1, { damping: 8, stiffness: 120 }));
    translateX.value = withDelay(delay, withSpring(targetX, { damping: 10, stiffness: 80 }));
    translateY.value = withDelay(delay, withSpring(targetY, { damping: 10, stiffness: 80 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scaleVal.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

function PulsingIcon({ icon, iconColor }: { icon: string; iconColor: string }) {
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withTiming(0.8, { duration: 1200 }),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.iconWrapper}>
      <Animated.View
        style={[
          styles.iconGlow,
          { backgroundColor: iconColor, shadowColor: iconColor },
          glowStyle,
        ]}
      />
      <View style={[styles.iconCircle, { borderColor: `${iconColor}40` }]}>
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={40}
          color={iconColor}
        />
      </View>
    </View>
  );
}

export function FirstActionCelebration({
  visible,
  onClose,
  title,
  description,
  icon,
  iconColor = GlowColors.primary,
  xpReward,
}: FirstActionCelebrationProps) {
  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      markCelebrationShown(title);
    }
  }, [visible, title]);

  const markCelebrationShown = async (celebrationTitle: string) => {
    try {
      const stored = await AsyncStorage.getItem(CELEBRATIONS_KEY);
      const shown: string[] = stored ? JSON.parse(stored) : [];
      if (!shown.includes(celebrationTitle)) {
        shown.push(celebrationTitle);
        await AsyncStorage.setItem(CELEBRATIONS_KEY, JSON.stringify(shown));
      }
    } catch (error) {
      console.warn("Failed to save celebration state:", error);
    }
  };

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          entering={FadeIn.duration(400)}
          style={styles.celebrationCard}
        >
          <View style={styles.confettiContainer}>
            {CONFETTI_COLORS.map((color, index) => (
              <ConfettiPiece key={index} index={index} color={color} />
            ))}
          </View>

          <PulsingIcon icon={icon} iconColor={iconColor} />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {xpReward ? (
            <View style={styles.xpBadge}>
              <Ionicons name="flash" size={18} color={GlowColors.primary} />
              <Text style={styles.xpText}>+{xpReward} XP</Text>
            </View>
          ) : null}

          <Pressable onPress={handleClose} style={styles.continueButton}>
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export async function hasCelebrationBeenShown(
  celebrationTitle: string
): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(CELEBRATIONS_KEY);
    const shown: string[] = stored ? JSON.parse(stored) : [];
    return shown.includes(celebrationTitle);
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  celebrationCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing["4xl"],
    paddingBottom: Spacing.xl,
    overflow: "visible",
  },
  confettiContainer: {
    position: "absolute",
    top: 80,
    left: "50%",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  confettiPiece: {
    position: "absolute",
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  iconGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Backgrounds.card,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.h1,
    color: TextColors.primary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    ...Typography.body,
    color: TextColors.secondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: `${GlowColors.primary}15`,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}30`,
    marginBottom: Spacing.xl,
  },
  xpText: {
    ...Typography.numberMedium,
    color: GlowColors.primary,
  },
  continueButton: {
    width: "100%",
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  continueText: {
    ...Typography.h4,
    color: Colors.dark.buttonText,
  },
});

export default FirstActionCelebration;
