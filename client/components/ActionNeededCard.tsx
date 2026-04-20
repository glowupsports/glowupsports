import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  FadeInDown,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
} from "@/constants/theme";

interface ActionItem {
  id: string;
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  priority: "high" | "medium" | "low";
}

interface ActionNeededCardProps {
  title?: string;
  actions: ActionItem[];
  onPress: () => void;
  ctaText?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ActionNeededCard({
  title = "Action Needed",
  actions,
  onPress,
  ctaText = "Review Now",
}: ActionNeededCardProps) {
  const scale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  // Pulse animation for urgency
  React.useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1000 }),
        withTiming(0.4, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const totalActions = actions.reduce((sum, a) => sum + a.count, 0);
  const hasHighPriority = actions.some((a) => a.priority === "high");

  const getPriorityColor = (priority: "high" | "medium" | "low") => {
    switch (priority) {
      case "high":
        return FunctionColors.error;
      case "medium":
        return FunctionColors.social;
      default:
        return TextColors.muted;
    }
  };

  if (actions.length === 0 || totalActions === 0) return null;

  return (
    <AnimatedPressable
      entering={FadeInDown.duration(400).springify()}
      style={[styles.container, containerStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      {/* Pulsing border for urgency */}
      {hasHighPriority && (
        <Animated.View style={[styles.pulseBorder, pulseStyle]} />
      )}

      <LinearGradient
        colors={["rgba(255, 255, 255, 0.08)", "rgba(255, 255, 255, 0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons
              name="flash"
              size={18}
              color={hasHighPriority ? FunctionColors.error : GlowColors.primary}
            />
            <Text style={styles.title}>{title}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalActions}</Text>
          </View>
        </View>

        <View style={styles.actionsList}>
          {actions.map((action, index) => (
            <View key={`${action.id}-${index}`} style={styles.actionRow}>
              <Ionicons
                name={action.icon}
                size={16}
                color={getPriorityColor(action.priority)}
              />
              <Text style={styles.actionLabel}>
                {action.count} {action.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.ctaRow}>
          <Text style={styles.ctaText}>{ctaText}</Text>
          <Ionicons name="arrow-forward" size={16} color={GlowColors.primary} />
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${GlowColors.primary}30`,
  },
  pulseBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: FunctionColors.error,
  },
  gradient: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    ...Typography.h4,
    color: TextColors.primary,
  },
  badge: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  actionsList: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionLabel: {
    ...Typography.body,
    color: TextColors.muted,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  ctaText: {
    ...Typography.body,
    fontWeight: "600",
    color: GlowColors.primary,
  },
}));

export default ActionNeededCard;
