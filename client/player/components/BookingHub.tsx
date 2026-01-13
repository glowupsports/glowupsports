import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ProTennisColors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { GlassCard } from "./GlassCard";

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
      <Text style={styles.title}>BOOK & PLAN</Text>

      <GlassCard variant="default" style={styles.card}>
        <View style={styles.optionsContainer}>
          {bookingOptions.map((option, index) => (
            <React.Fragment key={option.id}>
              <Pressable style={styles.option} onPress={() => handlePress(option)}>
                <View style={[styles.iconContainer, { backgroundColor: option.color + "20" }]}>
                  <Ionicons name={option.icon} size={18} color={option.color} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionValue}>
                    <Text style={[styles.optionCount, { color: option.color }]}>{option.count}</Text>
                    {" "}{option.suffix}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={ProTennisColors.textMuted} />
              </Pressable>
              {index < bookingOptions.length - 1 ? <View style={styles.divider} /> : null}
            </React.Fragment>
          ))}
        </View>
      </GlassCard>
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
  optionsContainer: {
    padding: Spacing.md,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  optionValue: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
  },
  optionCount: {
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: ProTennisColors.surfaceElevated,
    marginVertical: Spacing.xs,
  },
});
