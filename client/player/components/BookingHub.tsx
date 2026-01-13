import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { 
  FadeInUp, 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming,
  withSpring,
  cancelAnimation 
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { NeonEdgeCard } from "./GlassCard";

interface BookingOption {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  count: number;
  suffix: string;
  color: string;
  route: string;
}

export function BookingHub() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const bookingOptions: BookingOption[] = [
    {
      id: "group",
      icon: "people-outline",
      title: "Group sessions",
      count: state.availability.groupSessions,
      suffix: "open",
      color: ProTennisColors.electricGreen,
      route: "LessonBooking",
    },
    {
      id: "private",
      icon: "person-outline",
      title: "Private lessons",
      count: state.availability.privateLessons,
      suffix: "slot today",
      color: ProTennisColors.neonCyan,
      route: "LessonBooking",
    },
    {
      id: "courts",
      icon: "grid-outline",
      title: "Courts available",
      count: state.availability.courtsAvailable,
      suffix: "tonight",
      color: "#FFD93D",
      route: "CourtBooking",
    },
  ];

  const handlePress = (option: BookingOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(option.route);
  };

  return (
    <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.titleGaming}>BOOK & PLAN</Text>
        <View style={styles.titleGlow} />
      </View>

      <View style={styles.optionsGrid}>
        {bookingOptions.map((option, index) => (
          <BookingOptionCard 
            key={option.id} 
            option={option} 
            onPress={() => handlePress(option)} 
            delay={index * 80}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function BookingOptionCard({ option, onPress, delay }: { option: BookingOption; onPress: () => void; delay: number }) {
  const glowPulse = useSharedValue(0.3);
  const scaleValue = useSharedValue(1);
  
  useEffect(() => {
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1800 }),
        withTiming(0.3, { duration: 1800 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(glowPulse);
  }, [glowPulse]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowPulse.value,
  }));

  const handlePressIn = () => {
    scaleValue.value = withSpring(0.97, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scaleValue.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Animated.View 
      entering={FadeInUp.delay(delay).duration(400)} 
      style={[scaleStyle]}
    >
      <Pressable 
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.optionCard, { shadowColor: option.color }, glowStyle]}>
          <LinearGradient
            colors={[`${option.color}15`, `${option.color}05`, "rgba(21, 27, 41, 0.9)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.optionCardGradient}
          >
            <View style={[styles.iconContainerGaming, { backgroundColor: `${option.color}25`, borderColor: `${option.color}40` }]}>
              <Ionicons name={option.icon} size={22} color={option.color} />
            </View>
            <Text style={styles.optionTitleGaming}>{option.title}</Text>
            <View style={styles.optionValueRow}>
              <Text style={[styles.optionCountGaming, { color: option.color, textShadowColor: option.color }]}>
                {option.count}
              </Text>
              <Text style={styles.optionSuffix}>{option.suffix}</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  titleGaming: {
    fontSize: 12,
    fontWeight: "800",
    color: ProTennisColors.textSecondary,
    letterSpacing: 3,
  },
  titleGlow: {
    flex: 1,
    height: 1,
    backgroundColor: `${ProTennisColors.neonCyan}30`,
  },
  optionsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  optionCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 6,
  },
  optionCardGradient: {
    padding: Spacing.md,
    gap: Spacing.sm,
    minHeight: 120,
  },
  iconContainerGaming: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  optionTitleGaming: {
    fontSize: 11,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
    marginTop: Spacing.xs,
  },
  optionValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.xs,
    marginTop: "auto",
  },
  optionCountGaming: {
    fontSize: 28,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  optionSuffix: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
    fontWeight: "500",
  },
});
