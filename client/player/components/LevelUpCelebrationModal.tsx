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
  runOnJS,
} from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { PendingCelebration } from "../hooks/usePlayerLevel";

interface LevelUpCelebrationModalProps {
  celebration: PendingCelebration | null;
  visible: boolean;
  onDismiss: () => void;
}

export function LevelUpCelebrationModal({
  celebration,
  visible,
  onDismiss,
}: LevelUpCelebrationModalProps) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const badgeScale = useSharedValue(0);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (visible && celebration) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      opacity.value = withSpring(1);
      
      badgeScale.value = withDelay(
        300,
        withSequence(
          withSpring(1.2, { damping: 10 }),
          withSpring(1)
        )
      );
      
      setTimeout(() => setShowContent(true), 100);
    } else {
      scale.value = 0.5;
      opacity.value = 0;
      badgeScale.value = 0;
      setShowContent(false);
    }
  }, [visible, celebration]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  if (!celebration) return null;

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.container, containerStyle]}>
          <LinearGradient
            colors={[GlowColors.primary, GlowColors.dark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.sparkles}>
              {[...Array(8)].map((_, i) => (
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
                  <Ionicons name="star" size={16} color={Colors.dark.gold} />
                </View>
              ))}
            </View>
            
            <Animated.View style={[styles.levelBadgeContainer, badgeStyle]}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelNumber}>{celebration.level}</Text>
              </View>
            </Animated.View>
            
            <Text style={styles.levelUpText}>LEVEL UP!</Text>
          </LinearGradient>

          <View style={styles.content}>
            <Text style={styles.newTitle}>
              You are now: <Text style={styles.titleHighlight}>{celebration.title}</Text>
            </Text>

            {celebration.badgeUnlock && (
              <View style={styles.rewardRow}>
                <View style={styles.rewardIcon}>
                  <Ionicons name="ribbon" size={20} color={Colors.dark.gold} />
                </View>
                <View style={styles.rewardInfo}>
                  <Text style={styles.rewardLabel}>New Badge</Text>
                  <Text style={styles.rewardValue}>{celebration.badgeUnlock}</Text>
                </View>
              </View>
            )}

            {celebration.titleUnlock && (
              <View style={styles.rewardRow}>
                <View style={styles.rewardIcon}>
                  <Ionicons name="trophy" size={20} color={Colors.dark.primary} />
                </View>
                <View style={styles.rewardInfo}>
                  <Text style={styles.rewardLabel}>Title Unlocked</Text>
                  <Text style={styles.rewardValue}>{celebration.titleUnlock}</Text>
                </View>
              </View>
            )}

            {celebration.featuresUnlocked && celebration.featuresUnlocked.length > 0 && (
              <View style={styles.featuresSection}>
                <Text style={styles.featuresTitle}>Features Unlocked</Text>
                <View style={styles.featuresList}>
                  {celebration.featuresUnlocked.slice(0, 4).map((feature, idx) => (
                    <View key={idx} style={styles.featureChip}>
                      <Ionicons name="lock-open" size={12} color={Colors.dark.primary} />
                      <Text style={styles.featureText}>
                        {feature.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Pressable style={styles.continueButton} onPress={handleDismiss}>
              <LinearGradient
                colors={[GlowColors.primary, GlowColors.dark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.continueButtonGradient}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  container: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  header: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    position: "relative",
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
  levelBadgeContainer: {
    marginBottom: Spacing.md,
  },
  levelBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: Colors.dark.gold,
    shadowColor: Colors.dark.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  levelNumber: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.dark.gold,
  },
  levelUpText: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.buttonText,
    letterSpacing: 3,
  },
  content: {
    padding: Spacing.lg,
  },
  newTitle: {
    fontSize: 16,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  titleHighlight: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.dark.gold}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardInfo: {
    flex: 1,
  },
  rewardLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  rewardValue: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  featuresSection: {
    marginTop: Spacing.md,
  },
  featuresTitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  featuresList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${Colors.dark.primary}20`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  featureText: {
    fontSize: 11,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  continueButton: {
    marginTop: Spacing.lg,
    overflow: "hidden",
    borderRadius: BorderRadius.md,
  },
  continueButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});
