import logger from "@/lib/logger";
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors, TextColors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface BirthdayCelebrationModalProps {
  visible: boolean;
  onDismiss: () => void;
  playerName?: string;
}

const BIRTHDAY_STORAGE_KEY = "last_birthday_celebration";

export function BirthdayCelebrationModal({
  visible,
  onDismiss,
  playerName = "Champion",
}: BirthdayCelebrationModalProps) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const cakeScale = useSharedValue(0);
  const confettiY = useSharedValue(-100);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      opacity.value = withSpring(1);
      
      cakeScale.value = withDelay(
        300,
        withSequence(
          withSpring(1.3, { damping: 10 }),
          withSpring(1)
        )
      );
      
      confettiY.value = withRepeat(
        withSequence(
          withTiming(20, { duration: 1000 }),
          withTiming(-100, { duration: 0 })
        ),
        -1,
        false
      );
      
      setTimeout(() => setShowContent(true), 100);
    } else {
      scale.value = 0.5;
      opacity.value = 0;
      cakeScale.value = 0;
      confettiY.value = -100;
      setShowContent(false);
    }
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const cakeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cakeScale.value }],
  }));

  const confettiStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: confettiY.value }],
  }));

  const handleDismiss = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const today = new Date().toISOString().split("T")[0];
    await AsyncStorage.setItem(BIRTHDAY_STORAGE_KEY, today);
    onDismiss();
  };

  const confettiColors = [GlowColors.primary, "#00D4FF", "#FFD700", "#FF69B4", "#00FF88"];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.confettiContainer, confettiStyle]}>
          {[...Array(30)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.confetti,
                {
                  left: `${Math.random() * 100}%`,
                  backgroundColor: confettiColors[i % confettiColors.length],
                  transform: [
                    { rotate: `${Math.random() * 360}deg` },
                    { scale: Math.random() * 0.5 + 0.5 },
                  ],
                },
              ]}
            />
          ))}
        </Animated.View>

        <Animated.View style={[styles.container, containerStyle]}>
          <LinearGradient
            colors={["#FF69B4", "#FFD700"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.sparkles}>
              {[...Array(12)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.sparkle,
                    {
                      top: `${Math.random() * 80 + 10}%`,
                      left: `${Math.random() * 80 + 10}%`,
                      transform: [{ scale: Math.random() * 0.5 + 0.5 }],
                    },
                  ]}
                >
                  <Ionicons name="star" size={16} color={TextColors.primary} />
                </View>
              ))}
            </View>
            
            <Animated.View style={[styles.cakeContainer, cakeStyle]}>
              <Text style={styles.cakeEmoji}>🎂</Text>
            </Animated.View>
            
            <Text style={styles.birthdayText}>HAPPY BIRTHDAY!</Text>
          </LinearGradient>

          <View style={styles.content}>
            <Text style={styles.messageTitle}>
              Hey {playerName}!
            </Text>
            
            <Text style={styles.messageBody}>
              Today is your special day! Enjoy double XP on all activities as our birthday gift to you.
            </Text>

            <View style={styles.bonusSection}>
              <View style={styles.bonusRow}>
                <View style={styles.bonusIcon}>
                  <Ionicons name="flash" size={24} color={Colors.dark.accentText} />
                </View>
                <View style={styles.bonusInfo}>
                  <Text style={styles.bonusLabel}>Birthday Bonus</Text>
                  <Text style={styles.bonusValue}>2x XP All Day!</Text>
                </View>
              </View>
              
              <View style={styles.bonusRow}>
                <View style={styles.bonusIcon}>
                  <Ionicons name="ribbon" size={24} color="#FFD700" />
                </View>
                <View style={styles.bonusInfo}>
                  <Text style={styles.bonusLabel}>Special Badge</Text>
                  <Text style={styles.bonusValue}>Birthday Star Unlocked</Text>
                </View>
              </View>
            </View>

            <Pressable style={styles.celebrateButton} onPress={handleDismiss}>
              <LinearGradient
                colors={[GlowColors.primary, "#00FF88"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Let&apos;s Play!</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export async function shouldShowBirthdayCelebration(isBirthday: boolean): Promise<boolean> {
  if (!isBirthday) return false;
  
  try {
    const lastCelebration = await AsyncStorage.getItem(BIRTHDAY_STORAGE_KEY);
    const today = new Date().toISOString().split("T")[0];
    logger.log("[Birthday] shouldShow check - lastCelebration:", lastCelebration, "today:", today, "result:", lastCelebration !== today);
    // Always show the birthday celebration if it's their birthday (reset if needed)
    if (lastCelebration === today) {
      // Clear the cache to allow showing again for testing
      await AsyncStorage.removeItem(BIRTHDAY_STORAGE_KEY);
      logger.log("[Birthday] Cleared cache to show celebration again");
    }
    return true; // Always show if it's their birthday
  } catch {
    return isBirthday;
  }
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  confettiContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    pointerEvents: "none",
  },
  confetti: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  container: {
    width: "100%",
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
  },
  header: {
    padding: Spacing.xl,
    alignItems: "center",
    position: "relative",
    minHeight: 180,
    justifyContent: "center",
  },
  sparkles: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sparkle: {
    position: "absolute",
  },
  cakeContainer: {
    marginBottom: Spacing.md,
  },
  cakeEmoji: {
    fontSize: 64,
  },
  birthdayText: {
    fontSize: 28,
    fontWeight: "800",
    color: TextColors.primary,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 2,
  },
  content: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  messageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  messageBody: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  bonusSection: {
    width: "100%",
    marginBottom: Spacing.lg,
  },
  bonusRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.accentTextSoft,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  bonusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  bonusInfo: {
    flex: 1,
  },
  bonusLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bonusValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: 2,
  },
  celebrateButton: {
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  buttonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Backgrounds.root,
    letterSpacing: 0.5,
  },
}));
