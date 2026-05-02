import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  interpolate,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, GlowColors, Spacing, BorderRadius } from "@/constants/theme";
import type { PendingCelebration } from "../hooks/usePlayerLevel";

const { width: SW, height: SH } = Dimensions.get("window");
const PARTICLE_COUNT = 20;

interface ParticleProps {
  index: number;
  visible: boolean;
}

const PARTICLE_COLORS = [
  GlowColors.primary,
  "#F59E0B",
  "#10B981",
  "#8B5CF6",
  "#EC4899",
  "#00D4FF",
  "#F97316",
];

function Particle({ index, visible }: ParticleProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const sc = useSharedValue(0);

  const angle = (index / PARTICLE_COUNT) * 2 * Math.PI + Math.random() * 0.5;
  const distance = 120 + Math.random() * 180;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance - 60;
  const color = PARTICLE_COLORS[index % PARTICLE_COLORS.length];
  const size = 6 + Math.random() * 8;
  const delay = index * 30;

  useEffect(() => {
    if (visible) {
      tx.value = 0;
      ty.value = 0;
      opacity.value = 0;
      rotate.value = 0;
      sc.value = 0;

      sc.value = withDelay(delay, withSpring(1, { damping: 8, stiffness: 300 }));
      opacity.value = withDelay(delay, withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(400, withTiming(0, { duration: 600 }))
      ));
      tx.value = withDelay(delay, withTiming(targetX, { duration: 900, easing: Easing.out(Easing.cubic) }));
      ty.value = withDelay(delay, withTiming(targetY, { duration: 900, easing: Easing.out(Easing.cubic) }));
      rotate.value = withDelay(delay, withTiming(
        (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
        { duration: 900 }
      ));
    } else {
      tx.value = 0;
      ty.value = 0;
      opacity.value = 0;
      sc.value = 0;
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rotate.value}deg` },
      { scale: sc.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        particleStyle.dot,
        { width: size, height: size, backgroundColor: color, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

const particleStyle = StyleSheet.create({
  dot: { position: "absolute" },
});

interface LevelUpCelebrationOverlayProps {
  celebration: PendingCelebration | null;
  visible: boolean;
  onDismiss: () => void;
}

export function LevelUpCelebrationOverlay({
  celebration,
  visible,
  onDismiss,
}: LevelUpCelebrationOverlayProps) {
  const ballScale = useSharedValue(0);
  const ballGlow = useSharedValue(0);
  const containerScale = useSharedValue(0.3);
  const containerOpacity = useSharedValue(0);
  const levelScale = useSharedValue(0);
  const bannerY = useSharedValue(40);
  const bannerOpacity = useSharedValue(0);
  const pulseAnim = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible && celebration) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      overlayOpacity.value = withTiming(1, { duration: 300 });
      ballScale.value = withSequence(
        withSpring(1.3, { damping: 6, stiffness: 200 }),
        withSpring(1, { damping: 12, stiffness: 300 })
      );
      ballGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1200 }),
          withTiming(0.3, { duration: 1200 })
        ),
        -1,
        false
      );
      containerScale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 180 }));
      containerOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
      levelScale.value = withDelay(400, withSequence(
        withSpring(1.4, { damping: 8, stiffness: 250 }),
        withSpring(1, { damping: 12 })
      ));
      bannerY.value = withDelay(600, withSpring(0, { damping: 16, stiffness: 200 }));
      bannerOpacity.value = withDelay(600, withTiming(1, { duration: 350 }));
      pulseAnim.value = withDelay(800, withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0, { duration: 800 })
        ),
        -1,
        false
      ));

      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 300);
      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 600);
    } else {
      overlayOpacity.value = withTiming(0, { duration: 200 });
      ballScale.value = 0;
      ballGlow.value = 0;
      containerScale.value = 0.3;
      containerOpacity.value = 0;
      levelScale.value = 0;
      bannerY.value = 40;
      bannerOpacity.value = 0;
      pulseAnim.value = 0;
    }
  }, [visible, celebration]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
    opacity: containerOpacity.value,
  }));
  const ballStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ballScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => {
    const glow = interpolate(ballGlow.value, [0, 1], [0.3, 1]);
    return { opacity: glow };
  });
  const levelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: levelScale.value }],
  }));
  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerY.value }],
    opacity: bannerOpacity.value,
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnim.value, [0, 1], [0.2, 0.55]),
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 1.25]) }],
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
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[s.overlay, overlayStyle]}>
        {/* Full-screen particles */}
        <View style={s.particleField} pointerEvents="none">
          {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
            <Particle key={i} index={i} visible={visible} />
          ))}
        </View>

        <Animated.View style={[s.container, containerStyle]}>
          {/* Glowing ball */}
          <View style={s.ballSection}>
            <Animated.View style={[s.ballGlowOuter, glowStyle, pulseStyle]} />
            <Animated.View style={[s.ballGlowMid, glowStyle]} />
            <Animated.View style={[s.ballWrap, ballStyle]}>
              <LinearGradient
                colors={[GlowColors.primary, "#00D4FF", GlowColors.soft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.ball}
              >
                <Animated.View style={levelStyle}>
                  <Text style={s.levelNum}>{celebration.level}</Text>
                </Animated.View>
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Banner */}
          <Animated.View style={[s.bannerWrap, bannerStyle]}>
            <Text style={s.levelUpLabel}>LEVEL UP</Text>
            <Text style={s.youreNow}>
              {"You're now"}{" "}
              <Text style={s.titleHighlight}>Level {celebration.level}</Text>
            </Text>
            {celebration.title ? (
              <View style={s.rankBadge}>
                <Ionicons name="ribbon" size={14} color={Colors.dark.gold} />
                <Text style={s.rankText}>{celebration.title}</Text>
              </View>
            ) : null}

            {celebration.badgeUnlock ? (
              <View style={s.rewardRow}>
                <View style={s.rewardIcon}>
                  <Ionicons name="ribbon" size={16} color={Colors.dark.gold} />
                </View>
                <View>
                  <Text style={s.rewardLabel}>Badge Unlocked</Text>
                  <Text style={s.rewardValue}>{celebration.badgeUnlock}</Text>
                </View>
              </View>
            ) : null}

            {celebration.featuresUnlocked && celebration.featuresUnlocked.length > 0 ? (
              <View style={s.featuresRow}>
                {celebration.featuresUnlocked.slice(0, 3).map((f, i) => (
                  <View key={i} style={s.featureChip}>
                    <Ionicons name="lock-open-outline" size={10} color={GlowColors.primary} />
                    <Text style={s.featureChipText}>
                      {f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [s.keepGoingBtn, pressed && { opacity: 0.82 }]}
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel="Keep going"
            >
              <LinearGradient
                colors={[GlowColors.primary, "#00D4FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.keepGoingGradient}
              >
                <Text style={s.keepGoingText}>Keep Going</Text>
                <Ionicons name="flash" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const BALL_SIZE = 120;
const GLOW_SIZE = BALL_SIZE + 60;

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  particleField: {
    position: "absolute",
    top: SH / 2,
    left: SW / 2,
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: Spacing.xl,
  },
  ballSection: {
    alignItems: "center",
    justifyContent: "center",
    width: GLOW_SIZE + 40,
    height: GLOW_SIZE + 40,
  },
  ballGlowOuter: {
    position: "absolute",
    width: GLOW_SIZE + 40,
    height: GLOW_SIZE + 40,
    borderRadius: (GLOW_SIZE + 40) / 2,
    backgroundColor: GlowColors.primary,
  },
  ballGlowMid: {
    position: "absolute",
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: GlowColors.primary,
    opacity: 0.6,
  },
  ballWrap: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    overflow: "hidden",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 30,
    elevation: 20,
  },
  ball: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  levelNum: {
    fontSize: 52,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -2,
  },
  bannerWrap: {
    alignItems: "center",
    gap: Spacing.sm,
    width: "100%",
  },
  levelUpLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: GlowColors.primary,
    letterSpacing: 4,
  },
  youreNow: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  titleHighlight: {
    color: GlowColors.primary,
  },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,200,0,0.12)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,200,0,0.25)",
  },
  rankText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.gold,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    width: "100%",
  },
  rewardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,200,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  rewardLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  rewardValue: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  featuresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${GlowColors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  featureChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: GlowColors.primary,
  },
  keepGoingBtn: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  keepGoingGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
  },
  keepGoingText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
  },
});
