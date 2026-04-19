import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

interface FeatureInfo {
  featureKey: string;
  requiredLevel: number;
  featureName: string;
  featureDescription: string | null;
  featureIcon: string | null;
  onboardingTitle: string | null;
  onboardingDescription: string | null;
  onboardingTips: string[];
}

interface FeatureOnboardingModalProps {
  featureKey: string | null;
  playerId: string | null;
  visible: boolean;
  onDismiss: () => void;
}

export function FeatureOnboardingModal({
  featureKey,
  playerId,
  visible,
  onDismiss,
}: FeatureOnboardingModalProps) {
  const queryClient = useQueryClient();
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  const { data: featureUnlocks } = useQuery<FeatureInfo[]>({
    queryKey: ["/api/player-level/config/feature-unlocks"],
  });

  const markOnboardingShown = useMutation({
    mutationFn: async () => {
      if (!playerId || !featureKey) return;
      return apiRequest(`/api/player-level/player/${playerId}/onboarding/${featureKey}/shown`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-level/player", playerId, "status"] });
    },
  });

  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scale.value = withSpring(1, { damping: 15 });
      opacity.value = withSpring(1);
    } else {
      scale.value = 0.9;
      opacity.value = 0;
    }
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!featureKey) return null;

  const featureInfo = featureUnlocks?.find(f => f.featureKey === featureKey);
  
  if (!featureInfo) return null;

  const handleDismiss = () => {
    markOnboardingShown.mutate();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDismiss();
  };

  const displayName = featureInfo.featureName || featureKey.replace(/_/g, " ");
  const icon = featureInfo.featureIcon || "sparkles";
  const title = featureInfo.onboardingTitle || `${displayName} Unlocked!`;
  const description = featureInfo.onboardingDescription || 
    `You now have access to ${displayName}. Explore this new feature to level up your game!`;
  const tips = featureInfo.onboardingTips || [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.container, containerStyle]}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.primary]}
                style={styles.iconGradient}
              >
                <Ionicons name={icon as any} size={32} color={Colors.dark.buttonText} />
              </LinearGradient>
            </View>
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {tips.length > 0 && (
            <View style={styles.tipsSection}>
              <Text style={styles.tipsTitle}>Quick Tips</Text>
              <ScrollView style={styles.tipsList} showsVerticalScrollIndicator={false}>
                {tips.map((tip, idx) => (
                  <View key={idx} style={styles.tipRow}>
                    <View style={styles.tipBullet}>
                      <Text style={styles.tipBulletText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <Pressable style={styles.button} onPress={handleDismiss}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>Got it!</Text>
              <Ionicons name="checkmark" size={18} color={Colors.dark.buttonText} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  container: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  header: {
    position: "relative",
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
  },
  iconGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  newBadge: {
    position: "absolute",
    top: -4,
    right: -12,
    backgroundColor: Colors.dark.error,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    transform: [{ rotate: "15deg" }],
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  tipsSection: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    maxHeight: 160,
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  tipsList: {
    gap: Spacing.xs,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  tipBullet: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: `${Colors.dark.primary}30`,
    alignItems: "center",
    justifyContent: "center",
  },
  tipBulletText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
    lineHeight: 18,
  },
  button: {
    width: "100%",
    overflow: "hidden",
    borderRadius: BorderRadius.md,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});
