import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown, FadeIn, LinearTransition } from "react-native-reanimated";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { GlassCard } from "./GlassCard";

interface GlanceItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  route?: string;
}

export function TodayAtAGlance() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const nearbyAvailable = state.nearbyPlayers.filter((p) => p.status === "available").length;
  const isEmpty =
    state.availability.groupSessions === 0 &&
    nearbyAvailable === 0 &&
    (!state.nextEventTime || state.nextEventTime === "");

  const formIcon = state.formStatus === "rising" ? "trending-up" : state.formStatus === "declining" ? "trending-down" : "remove";
  const formColor = state.formStatus === "rising" ? ProTennisColors.electricGreen : state.formStatus === "declining" ? "#FF6B6B" : ProTennisColors.textMuted;

  if (isEmpty) {
    return (
      <Animated.View entering={FadeIn.duration(300)} layout={LinearTransition.springify()} style={collapsedStyles.pill}>
        <View style={[collapsedStyles.iconWrap, { backgroundColor: "rgba(200, 255, 61, 0.08)" }]}>
          <Ionicons name="calendar-outline" size={18} color={GlowColors.primary} />
        </View>
        <View style={collapsedStyles.textGroup}>
          <Text style={collapsedStyles.label}>Today</Text>
          <Text style={collapsedStyles.hint}>Nothing scheduled</Text>
        </View>
        <Pressable
          style={collapsedStyles.ctaButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("Schedule");
          }}
        >
          <Text style={collapsedStyles.ctaText}>View</Text>
          <Ionicons name="chevron-forward" size={14} color={ProTennisColors.textMuted} />
        </Pressable>
      </Animated.View>
    );
  }

  const glanceItems: GlanceItem[] = [
    {
      id: "training",
      icon: "tennisball-outline",
      label: "Training available",
      value: `${state.availability.groupSessions} sessions`,
      color: ProTennisColors.electricGreen,
      route: "LessonBooking",
    },
    {
      id: "players",
      icon: "people-outline",
      label: "Players nearby",
      value: `${state.nearbyPlayers.filter(p => p.status === "available").length}`,
      color: ProTennisColors.neonCyan,
      route: "PlayerFinder",
    },
    {
      id: "form",
      icon: formIcon,
      label: "Your form",
      value: state.formStatus,
      color: formColor,
      route: "PlayerProgress",
    },
    {
      id: "event",
      icon: "calendar-outline",
      label: "Next event",
      value: state.nextEventTime ? `Today ${state.nextEventTime}` : "None today",
      color: ProTennisColors.electricGreen,
      route: "Schedule",
    },
  ];

  const handlePress = (item: GlanceItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.route) {
      navigation.navigate(item.route);
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(400)} layout={LinearTransition.springify()} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TODAY AT A GLANCE</Text>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{state.courtStatus}</Text>
        </View>
      </View>

      <GlassCard variant="default" style={styles.card}>
        <View style={styles.itemsGrid}>
          {glanceItems.map((item) => (
            <Pressable
              key={item.id}
              style={styles.glanceItem}
              onPress={() => handlePress(item)}
            >
              <View style={[styles.iconContainer, { borderColor: item.color + "40" }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={[styles.itemValue, { color: item.color }]}>{item.value}</Text>
              </View>
              {item.route ? (
                <Ionicons name="chevron-forward" size={14} color={ProTennisColors.textMuted} />
              ) : null}
            </Pressable>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GlowColors.primary,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "600",
    color: GlowColors.primary,
    letterSpacing: 1,
  },
  card: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  itemsGrid: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  glanceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Backgrounds.card + "60",
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
  },
  itemValue: {
    fontSize: 13,
    fontWeight: "600",
  },
});

const collapsedStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  hint: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
});
