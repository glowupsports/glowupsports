import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import { Colors, Spacing, BorderRadius, Typography, GlowColors, Backgrounds, TextColors } from "@/constants/theme";
import { useTranslation } from "react-i18next";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ConfettiPiece {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotation: number;
}

function StarConfettiPiece({ piece }: { piece: ConfettiPiece }) {
  const translateY = useSharedValue(-50);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withDelay(
      piece.delay,
      withRepeat(
        withTiming(SCREEN_HEIGHT + 100, { duration: piece.duration }),
        -1,
        false
      )
    );
    rotate.value = withDelay(
      piece.delay,
      withRepeat(
        withTiming(360, { duration: piece.duration }),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          left: piece.x,
        },
        animatedStyle,
      ]}
    >
      <Ionicons name="star" size={piece.size} color={piece.color} />
    </Animated.View>
  );
}

export function RamadanConfettiOverlay() {
  const confettiColors = ["#FFD700", "#9B59B6", "#1A1A5E", "#2ECC71", "#DAA520", "#7D3C98"];

  const confettiPieces = useMemo<ConfettiPiece[]>(() => {
    return [...Array(40)].map((_, i) => ({
      id: i,
      x: Math.random() * SCREEN_WIDTH,
      delay: Math.random() * 3000,
      duration: 4000 + Math.random() * 3000,
      color: confettiColors[i % confettiColors.length],
      size: 6 + Math.random() * 8,
      rotation: Math.random() * 360,
    }));
  }, []);

  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {confettiPieces.map((piece) => (
        <StarConfettiPiece key={piece.id} piece={piece} />
      ))}
    </View>
  );
}

interface RamadanBannerProps {
  playerName: string;
  onDismiss?: () => void;
}

export function RamadanBanner({ playerName, onDismiss }: RamadanBannerProps) {
  const { t } = useTranslation();
  const scale = useSharedValue(0.8);
  const sparkleOpacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 150 });
    sparkleOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkleOpacity.value,
  }));

  return (
    <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.bannerContainer}>
      <LinearGradient
        colors={["#4A0E78", "#1A1A5E", "#0C2340"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bannerGradient}
      >
        <Animated.View style={[styles.sparkleOverlay, sparkleStyle]}>
          {[...Array(8)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.sparkle,
                {
                  top: `${10 + Math.random() * 80}%`,
                  left: `${5 + Math.random() * 90}%`,
                },
              ]}
            >
              <Ionicons name="star" size={14} color="rgba(255,215,0,0.8)" />
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.bannerContent, containerStyle]}>
          <View style={styles.moonIconContainer}>
            <Ionicons name="moon-outline" size={36} color="#FFD700" />
          </View>

          <View style={styles.bannerTextContainer}>
            <Text style={styles.ramadanMubarakText}>{t('ramadan.mubarak', 'RAMADAN MUBARAK!')}</Text>
            <Text style={styles.playerNameText}>
              {playerName}
            </Text>
          </View>

          <View style={styles.starContainer}>
            <Ionicons name="star" size={28} color="#FFD700" />
          </View>
        </Animated.View>

        <View style={styles.bonusBadge}>
          <Ionicons name="moon" size={12} color={Backgrounds.root} />
          <Text style={styles.bonusBadgeText}>Blessed Month</Text>
        </View>

        {onDismiss ? (
          <Pressable style={styles.dismissButton} onPress={onDismiss} hitSlop={8}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

export function RamadanBonusCard({ onDismiss }: { onDismiss?: () => void }) {
  const { t } = useTranslation();

  return (
    <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.xpBonusCard}>
      <LinearGradient
        colors={["rgba(74, 14, 120, 0.15)", "rgba(255, 215, 0, 0.15)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.xpBonusGradient}
      >
        <View style={styles.xpBonusIcon}>
          <Ionicons name="moon" size={24} color="#FFD700" />
        </View>
        <View style={styles.xpBonusContent}>
          <Text style={styles.xpBonusTitle}>{t('ramadan.blessingsActive', 'Ramadan Blessings!')}</Text>
          <Text style={styles.xpBonusSubtitle}>{t('ramadan.blessingsSubtitle', 'Wishing you peace and joy this holy month')}</Text>
        </View>
        <View style={styles.xpBonusMultiplier}>
          <Ionicons name="moon" size={14} color={Backgrounds.root} />
          <Ionicons name="star" size={12} color={Backgrounds.root} style={{ marginLeft: 2 }} />
        </View>
        {onDismiss ? (
          <Pressable style={styles.bonusCardDismiss} onPress={onDismiss} hitSlop={8}>
            <Ionicons name="close" size={14} color="rgba(255,255,255,0.5)" />
          </Pressable>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  confettiContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    overflow: "hidden",
  },
  confettiPiece: {
    position: "absolute",
    top: -50,
  },
  bannerContainer: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  bannerGradient: {
    padding: Spacing.lg,
    position: "relative",
  },
  sparkleOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sparkle: {
    position: "absolute",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  moonIconContainer: {
    marginRight: Spacing.sm,
  },
  bannerTextContainer: {
    flex: 1,
    alignItems: "center",
  },
  ramadanMubarakText: {
    fontSize: 18,
    fontWeight: "800",
    color: TextColors.primary,
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playerNameText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    marginTop: 2,
  },
  starContainer: {
    marginLeft: Spacing.sm,
  },
  bonusBadge: {
    position: "absolute",
    bottom: 8,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFD700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  bonusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Backgrounds.root,
    marginLeft: 3,
    letterSpacing: 0.5,
  },
  xpBonusCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  xpBonusGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  xpBonusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(74, 14, 120, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  xpBonusContent: {
    flex: 1,
  },
  xpBonusTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFD700",
  },
  xpBonusSubtitle: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  xpBonusMultiplier: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  xpMultiplierText: {
    fontSize: 16,
    fontWeight: "800",
    color: Backgrounds.root,
  },
  dismissButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  bonusCardDismiss: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
}));
