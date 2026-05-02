// Task #1566 — Full-screen achievement celebration modal with particle burst.
// Fires when a player earns a new achievement. Shows animated badge, particle burst,
// reward info, and a "Claim Reward" button. A "Claim Later" path is safe because
// the badge detail sheet in the profile tab always surfaces an unclaimed reward.

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, GlowColors, Backgrounds } from "@/constants/theme";

export interface AchievementEarnedInfo {
  id: string;
  name: string;
  description: string;
  iconName: string;
  iconColor: string;
  rewardLabel: string;
  rewardType: string;
  rarity: string;
}

interface Props {
  achievement: AchievementEarnedInfo | null;
  onClose: () => void;
}

const { width: SCREEN_W } = Dimensions.get("window");

const RARITY_GLOW: Record<string, string[]> = {
  common: ["#4DA3FF", "#1A3A6E"],
  uncommon: [GlowColors.primary, "#0A3A1A"],
  rare: ["#9B59B6", "#3A0A6E"],
  epic: ["#A855F7", "#4A0A8E"],
  legendary: ["#FFD700", "#6E4A00"],
};

// 12 particles at equal angular spacing for the burst burst effect.
const PARTICLE_ANGLES = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
const PARTICLE_COLORS = [
  "#FFD700", "#FF6B35", "#A855F7", "#22C55E",
  "#4DA3FF", "#FF8C00", "#EC4899", "#06B6D4",
  "#FFD700", "#22C55E", "#A855F7", "#FF6B35",
];

interface ParticleDotProps {
  progress: ReturnType<typeof useSharedValue<number>>;
  angle: number;
  color: string;
  size: number;
  maxRadius: number;
}

function ParticleDot({ progress, angle, color, size, maxRadius }: ParticleDotProps) {
  const rad = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => {
    const dist = interpolate(progress.value, [0, 1], [0, maxRadius], Extrapolation.CLAMP);
    const opacity = interpolate(progress.value, [0, 0.5, 1], [1, 0.9, 0], Extrapolation.CLAMP);
    const scale = interpolate(progress.value, [0, 0.3, 1], [0, 1.2, 0.4], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: dist * Math.cos(rad) },
        { translateY: dist * Math.sin(rad) },
        { scale },
      ],
      opacity,
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export default function AchievementCelebrationModal({ achievement, onClose }: Props) {
  const queryClient = useQueryClient();

  const backdropOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0);
  const badgeRotate = useSharedValue(-15);
  const contentTranslateY = useSharedValue(60);
  const contentOpacity = useSharedValue(0);
  const shimmerX = useSharedValue(-200);
  const pulseScale = useSharedValue(1);
  const burstProgress = useSharedValue(0);

  useEffect(() => {
    if (!achievement) return;

    // Reset animation values
    backdropOpacity.value = 0;
    badgeScale.value = 0;
    badgeRotate.value = -15;
    contentTranslateY.value = 60;
    contentOpacity.value = 0;
    shimmerX.value = -200;
    pulseScale.value = 1;
    burstProgress.value = 0;

    backdropOpacity.value = withTiming(1, { duration: 300 });

    badgeScale.value = withDelay(
      150,
      withSpring(1, { damping: 7, stiffness: 180, mass: 0.8 }),
    );
    badgeRotate.value = withDelay(
      150,
      withSpring(0, { damping: 10, stiffness: 160 }),
    );

    // Particle burst fires as the badge pops in
    burstProgress.value = withDelay(
      280,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
    );

    contentTranslateY.value = withDelay(
      350,
      withSpring(0, { damping: 14, stiffness: 140 }),
    );
    contentOpacity.value = withDelay(350, withTiming(1, { duration: 350 }));

    shimmerX.value = withDelay(
      550,
      withTiming(400, { duration: 800, easing: Easing.out(Easing.quad) }),
    );

    pulseScale.value = withDelay(
      600,
      withSequence(
        withTiming(1.1, { duration: 180 }),
        withSpring(1, { damping: 8, stiffness: 200 }),
      ),
    );

    if (Platform.OS !== "web") {
      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 250);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 600);
    }
  }, [achievement]);

  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!achievement) throw new Error("No achievement");
      return apiRequest("POST", `/api/player/achievements/${achievement.id}/claim`);
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/achievements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile-data"] });
      onClose();
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: badgeScale.value },
      {
        rotate: `${interpolate(badgeRotate.value, [-15, 0], [-15, 0], Extrapolation.CLAMP)}deg`,
      },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
    opacity: contentOpacity.value,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowColors = RARITY_GLOW[achievement?.rarity ?? "common"] ?? RARITY_GLOW.common;
  const iconColor = achievement?.iconColor ?? GlowColors.primary;

  if (!achievement) return null;

  return (
    <Modal
      visible
      transparent={false}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.fullScreen, backdropStyle]}>
        <LinearGradient
          colors={["#070714", "#0E0E26", "#070714"]}
          style={StyleSheet.absoluteFill}
        />

        {/* Radial glow behind badge */}
        <View style={[styles.radialGlow, { shadowColor: iconColor }]} pointerEvents="none">
          <LinearGradient
            colors={[iconColor + "40", iconColor + "10", "transparent"]}
            style={styles.radialGradient}
          />
        </View>

        {/* Particle burst — emits from badge center */}
        <View style={styles.particleContainer} pointerEvents="none">
          {PARTICLE_ANGLES.map((angle, i) => (
            <ParticleDot
              key={angle}
              progress={burstProgress}
              angle={angle}
              color={PARTICLE_COLORS[i % PARTICLE_COLORS.length]}
              size={i % 3 === 0 ? 10 : 6}
              maxRadius={130}
            />
          ))}
        </View>

        {/* Badge — centered in the screen */}
        <Animated.View style={[styles.badgeWrap, pulseStyle]}>
          <Animated.View style={badgeStyle}>
            <LinearGradient
              colors={glowColors as [string, string, ...string[]]}
              style={styles.badgeOuter}
            >
              <View style={[styles.badgeInner, { borderColor: iconColor + "80" }]}>
                <View style={[styles.badgeIconCircle, { backgroundColor: iconColor + "20" }]}>
                  <Ionicons name={achievement.iconName as IoniconsName} size={48} color={iconColor} />
                </View>
                <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none">
                  <LinearGradient
                    colors={["transparent", "rgba(255,255,255,0.26)", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.shimmerGradient}
                  />
                </Animated.View>
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        {/* "NEW ACHIEVEMENT UNLOCKED" pill */}
        <View style={[styles.bannerPill, { borderColor: iconColor + "60" }]}>
          <Ionicons name="trophy" size={10} color={iconColor} />
          <Text style={[styles.bannerText, { color: iconColor }]}>
            NEW ACHIEVEMENT UNLOCKED
          </Text>
        </View>

        {/* Content card slides up from below */}
        <Animated.View style={[styles.contentCard, contentStyle]}>
          <Text style={styles.achievementName}>{achievement.name}</Text>
          <Text style={styles.achievementDesc}>{achievement.description}</Text>

          <View style={styles.rewardCard}>
            <LinearGradient
              colors={[iconColor + "18", iconColor + "08"]}
              style={styles.rewardCardGradient}
            >
              <Ionicons name="gift" size={18} color={iconColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rewardTitle}>REWARD UNLOCKED</Text>
                <Text style={[styles.rewardLabel, { color: iconColor }]}>
                  {achievement.rewardLabel}
                </Text>
              </View>
            </LinearGradient>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.claimBtn,
              { backgroundColor: iconColor, opacity: pressed ? 0.85 : 1 },
              claimMutation.isPending && { opacity: 0.6 },
            ]}
            onPress={() => claimMutation.mutate()}
            disabled={claimMutation.isPending}
          >
            <Ionicons name="checkmark-circle" size={18} color="#000" />
            <Text style={styles.claimBtnText}>
              {claimMutation.isPending ? "Claiming..." : "Claim Reward"}
            </Text>
          </Pressable>

          <Pressable style={styles.laterBtn} onPress={onClose}>
            <Text style={styles.laterBtnText}>Claim Later from Profile</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  radialGlow: {
    position: "absolute",
    top: "15%",
    left: "10%",
    right: "10%",
    height: SCREEN_W * 0.8,
    alignItems: "center",
    justifyContent: "center",
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    elevation: 0,
  },
  radialGradient: {
    width: SCREEN_W * 0.8,
    height: SCREEN_W * 0.8,
    borderRadius: SCREEN_W * 0.4,
  },
  particleContainer: {
    position: "absolute",
    top: "30%",
    left: "50%",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWrap: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  badgeOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeInner: {
    width: 132,
    height: 132,
    borderRadius: 66,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
    borderWidth: 1.5,
  },
  badgeIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -80,
    width: 80,
    pointerEvents: "none" as const,
  },
  shimmerGradient: {
    flex: 1,
  },
  bannerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: Spacing.xl,
  },
  bannerText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  contentCard: {
    width: "100%",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  achievementName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  achievementDesc: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  rewardCard: {
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  rewardCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  rewardTitle: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  rewardLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    width: "100%",
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
  },
  claimBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#000",
  },
  laterBtn: {
    paddingVertical: Spacing.sm,
  },
  laterBtnText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    fontWeight: "500",
    textAlign: "center",
  },
});
