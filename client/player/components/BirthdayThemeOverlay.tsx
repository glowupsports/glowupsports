import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
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

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface BirthdayThemeOverlayProps {
  playerName: string;
  playerAge?: number;
}

interface ConfettiPiece {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotation: number;
}

function ConfettiPiece({ piece }: { piece: ConfettiPiece }) {
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
          width: piece.size,
          height: piece.size * 2,
          backgroundColor: piece.color,
          borderRadius: piece.size / 4,
        },
        animatedStyle,
      ]}
    />
  );
}

export function BirthdayConfettiOverlay() {
  const confettiColors = [GlowColors.primary, "#00D4FF", "#FFD700", "#FF69B4", "#00FF88", "#FF6B6B"];
  
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
        <ConfettiPiece key={piece.id} piece={piece} />
      ))}
    </View>
  );
}

export function BirthdayBanner({ playerName, playerAge }: BirthdayThemeOverlayProps) {
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

  const ageText = playerAge ? `${playerAge}th` : "";
  const ordinalSuffix = playerAge === 1 ? "st" : playerAge === 2 ? "nd" : playerAge === 3 ? "rd" : "th";

  return (
    <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.bannerContainer}>
      <LinearGradient
        colors={["#FF69B4", "#FFD700", "#FF8C00"]}
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
              <Ionicons name="sparkles" size={14} color="rgba(255,255,255,0.8)" />
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[styles.bannerContent, containerStyle]}>
          <View style={styles.cakeIconContainer}>
            <Text style={styles.cakeEmoji}>🎂</Text>
          </View>
          
          <View style={styles.bannerTextContainer}>
            <Text style={styles.happyBirthdayText}>HAPPY BIRTHDAY!</Text>
            <Text style={styles.playerNameText}>
              {playerName}
              {playerAge && (
                <Text style={styles.ageText}> turns {playerAge}!</Text>
              )}
            </Text>
          </View>

          <View style={styles.balloonContainer}>
            <Text style={styles.balloonEmoji}>🎈</Text>
          </View>
        </Animated.View>

        <View style={styles.bonusBadge}>
          <Ionicons name="flash" size={12} color={Backgrounds.root} />
          <Text style={styles.bonusBadgeText}>2x XP TODAY</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export function BirthdayXPBonusCard() {
  return (
    <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.xpBonusCard}>
      <LinearGradient
        colors={["rgba(255, 105, 180, 0.15)", "rgba(255, 215, 0, 0.15)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.xpBonusGradient}
      >
        <View style={styles.xpBonusIcon}>
          <Ionicons name="gift" size={24} color="#FFD700" />
        </View>
        <View style={styles.xpBonusContent}>
          <Text style={styles.xpBonusTitle}>Birthday Bonus Active!</Text>
          <Text style={styles.xpBonusSubtitle}>All XP rewards are doubled today</Text>
        </View>
        <View style={styles.xpBonusMultiplier}>
          <Text style={styles.xpMultiplierText}>2x</Text>
        </View>
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
  cakeIconContainer: {
    marginRight: Spacing.sm,
  },
  cakeEmoji: {
    fontSize: 36,
  },
  bannerTextContainer: {
    flex: 1,
    alignItems: "center",
  },
  happyBirthdayText: {
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
  ageText: {
    fontWeight: "400",
    color: "rgba(255,255,255,0.85)",
  },
  balloonContainer: {
    marginLeft: Spacing.sm,
  },
  balloonEmoji: {
    fontSize: 32,
  },
  bonusBadge: {
    position: "absolute",
    bottom: 8,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GlowColors.primary,
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
    backgroundColor: "rgba(255, 215, 0, 0.2)",
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
  },
  xpMultiplierText: {
    fontSize: 16,
    fontWeight: "800",
    color: Backgrounds.root,
  },
}));
