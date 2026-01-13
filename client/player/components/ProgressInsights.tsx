import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

const trendConfig: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  up: { icon: "arrow-up", color: ProTennisColors.electricGreen },
  down: { icon: "arrow-down", color: "#FF6B6B" },
  stable: { icon: "remove", color: ProTennisColors.textMuted },
};

export function ProgressInsights() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();
  const pulseOpacity = useSharedValue(1);

  React.useEffect(() => {
    if (state.isNearLevelUp) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
    }
  }, [state.isNearLevelUp]);

  const promotionStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const handleSkillPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerProgress");
  };

  const handlePromotionPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("PlayerProgress");
  };

  return (
    <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.container}>
      <Text style={styles.title}>YOUR PROGRESS</Text>

      <View style={styles.card}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[ProTennisColors.surfaceCard + "90", ProTennisColors.surfaceDark + "95"]}
              style={StyleSheet.absoluteFill}
            />
          </BlurView>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.surfaceCard }]} />
        )}

        <View style={styles.content}>
          {state.skillTrends.map((skill, index) => {
            const config = trendConfig[skill.trend];
            return (
              <Pressable key={index} style={styles.skillRow} onPress={handleSkillPress}>
                <View style={[styles.trendIcon, { backgroundColor: config.color + "20" }]}>
                  <Ionicons name={config.icon} size={12} color={config.color} />
                </View>
                <Text style={styles.skillName}>{skill.skill}</Text>
                <Text style={[styles.skillLabel, { color: config.color }]}>{skill.label}</Text>
              </Pressable>
            );
          })}

          <View style={styles.divider} />

          <Pressable onPress={handlePromotionPress}>
            <Animated.View style={[styles.promotionRow, state.isNearLevelUp && promotionStyle]}>
              <View style={styles.promotionIcon}>
                <Ionicons name="medal-outline" size={16} color={ProTennisColors.electricGreen} />
              </View>
              <View style={styles.promotionContent}>
                <Text style={styles.promotionLabel}>Level progress</Text>
                <Text style={styles.promotionValue}>
                  {state.sessionsToPromotion === 1 
                    ? "1 session to level up!" 
                    : `${state.sessionsToPromotion} sessions to next level`}
                </Text>
              </View>
              {state.isNearLevelUp ? (
                <View style={styles.hotBadge}>
                  <Text style={styles.hotText}>CLOSE</Text>
                </View>
              ) : null}
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {state.coachName ? (
        <View style={styles.trackingBanner}>
          <Ionicons name="eye-outline" size={12} color={ProTennisColors.textMuted} />
          <Text style={styles.trackingText}>
            {state.coachName} is tracking your progress
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 2,
  },
  card: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ProTennisColors.surfaceElevated,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  trendIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  skillName: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.white,
    width: 70,
  },
  skillLabel: {
    fontSize: 11,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: ProTennisColors.surfaceElevated,
    marginVertical: Spacing.xs,
  },
  promotionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: ProTennisColors.electricGreen + "10",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  promotionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ProTennisColors.electricGreen + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  promotionContent: {
    flex: 1,
  },
  promotionLabel: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
  },
  promotionValue: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.electricGreen,
  },
  hotBadge: {
    backgroundColor: ProTennisColors.electricGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hotText: {
    fontSize: 8,
    fontWeight: "800",
    color: ProTennisColors.midnightBlue,
    letterSpacing: 1,
  },
  trackingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.xs,
  },
  trackingText: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
    fontStyle: "italic",
  },
});
