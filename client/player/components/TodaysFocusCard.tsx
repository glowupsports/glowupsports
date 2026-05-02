import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Spacing, Colors, BorderRadius, GlowColors } from "@/constants/theme";

export interface FocusCard {
  type: "session" | "quest" | "streak_risk" | "booking_nudge" | "rest_day";
  title: string;
  subtitle: string;
  cta_label: string;
  cta_action: string;
  urgency_level: "high" | "medium" | "low";
  session_time?: string;
  xp_remaining?: number;
  coach_name?: string;
  streak_count?: number;
}

interface TodaysFocusCardProps {
  focus: FocusCard | null;
  onCTA: (action: string) => void;
}

function getGradientColors(urgency: string, type: string): readonly [string, string, string] {
  if (type === "session") return ["rgba(16,185,129,0.22)", "rgba(16,185,129,0.12)", "rgba(16,185,129,0.04)"] as const;
  if (type === "streak_risk") return ["rgba(245,158,11,0.24)", "rgba(245,158,11,0.12)", "rgba(245,158,11,0.04)"] as const;
  if (type === "quest") return ["rgba(139,92,246,0.20)", "rgba(99,102,241,0.12)", "rgba(59,130,246,0.04)"] as const;
  return ["rgba(59,130,246,0.18)", "rgba(99,102,241,0.10)", "rgba(59,130,246,0.03)"] as const;
}

function getBorderColor(type: string): string {
  if (type === "session") return "rgba(16,185,129,0.35)";
  if (type === "streak_risk") return "rgba(245,158,11,0.35)";
  if (type === "quest") return "rgba(139,92,246,0.30)";
  return "rgba(99,102,241,0.25)";
}

function getCtaColors(type: string): readonly [string, string] {
  if (type === "session") return ["#10B981", "#059669"] as const;
  if (type === "streak_risk") return ["#F59E0B", "#D97706"] as const;
  if (type === "quest") return ["#8B5CF6", "#6366F1"] as const;
  return ["#6366F1", "#3B82F6"] as const;
}

function getIcon(type: string): React.ComponentProps<typeof Ionicons>["name"] {
  if (type === "session") return "tennisball";
  if (type === "streak_risk") return "flame";
  if (type === "quest") return "flash";
  if (type === "booking_nudge") return "calendar-outline";
  return "moon-outline";
}

function getAccentColor(type: string): string {
  if (type === "session") return "#10B981";
  if (type === "streak_risk") return "#F59E0B";
  if (type === "quest") return "#8B5CF6";
  return "#6366F1";
}

export function TodaysFocusCard({ focus, onCTA }: TodaysFocusCardProps) {
  const scale = useSharedValue(0.92);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 200 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!focus) return null;

  const gradientColors = getGradientColors(focus.urgency_level, focus.type);
  const borderColor = getBorderColor(focus.type);
  const ctaColors = getCtaColors(focus.type);
  const iconName = getIcon(focus.type);
  const accentColor = getAccentColor(focus.type);

  const handleCTA = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCTA(focus.cta_action);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify()}
      style={[s.wrapper, animStyle]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.card, { borderColor }]}
      >
        <View style={s.topRow}>
          <View style={[s.iconBadge, { backgroundColor: `${accentColor}20` }]}>
            <Ionicons name={iconName} size={18} color={accentColor} />
          </View>
          <View style={s.labelChip}>
            <Text style={[s.chipText, { color: accentColor }]}>{"TODAY'S FOCUS"}</Text>
          </View>
        </View>

        <Text style={s.title} numberOfLines={2}>{focus.title}</Text>
        <Text style={s.subtitle} numberOfLines={2}>{focus.subtitle}</Text>

        {focus.type !== "rest_day" ? (
          <Pressable
            onPress={handleCTA}
            style={({ pressed }) => [s.ctaWrap, pressed && { opacity: 0.82 }]}
            accessibilityRole="button"
            accessibilityLabel={focus.cta_label}
          >
            <LinearGradient
              colors={ctaColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.ctaGradient}
            >
              <Text style={s.ctaText}>{focus.cta_label}</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </LinearGradient>
          </Pressable>
        ) : (
          <View style={[s.restTag, { backgroundColor: `${accentColor}15` }]}>
            <Ionicons name="checkmark-circle" size={14} color={accentColor} />
            <Text style={[s.restTagText, { color: accentColor }]}>You earned it</Text>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  labelChip: {
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  chipText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
    lineHeight: 23,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
  ctaWrap: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginTop: Spacing.xs,
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  restTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  restTagText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
