import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, FontSizes, Backgrounds, GlowColors } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const CARD_HEIGHT = undefined; // Use flex: 1 instead of fixed height

interface BaselineFlowCardProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  step: number;
  totalSteps: number;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  isActive?: boolean;
  glowColor?: string;
}

export function BaselineFlowCard({
  children,
  title,
  subtitle,
  icon,
  iconColor = GlowColors.primary,
  step,
  totalSteps,
  onNext,
  onBack,
  nextLabel = "Next",
  nextDisabled = false,
  showBack = true,
  isActive = true,
  glowColor,
}: BaselineFlowCardProps) {
  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 150 });
    } else {
      scale.value = withTiming(0.95, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(20, { duration: 200 });
    }
  }, [isActive]);

  const cardStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  const handleNext = () => {
    if (nextDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNext?.();
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  };

  const progress = step / totalSteps;

  return (
    <Animated.View style={[styles.cardWrapper, cardStyle]}>
      <View style={[styles.card, glowColor && { borderColor: `${glowColor}40` }]}>
        {/* Glow effect */}
        {glowColor && (
          <View style={[styles.glowOverlay, { backgroundColor: `${glowColor}08` }]} />
        )}

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{step} / {totalSteps}</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          {icon && (
            <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
              <Ionicons name={icon} size={28} color={iconColor} />
            </View>
          )}
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {children}
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          {showBack && step > 1 ? (
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backPlaceholder} />
          )}

          {onNext && (
            <Pressable
              style={[styles.nextButton, nextDisabled && styles.nextButtonDisabled]}
              onPress={handleNext}
              disabled={nextDisabled}
            >
              <View style={styles.nextButtonInner}>
                <Text style={[styles.nextButtonText, nextDisabled && styles.nextButtonTextDisabled]}>
                  {nextLabel}
                </Text>
                <Ionicons 
                  name="arrow-forward" 
                  size={18} 
                  color={nextDisabled ? "#666666" : "#FFFFFF"} 
                />
              </View>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// Animated checkbox component for requirements
interface AnimatedCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  sublabel?: string;
  color?: string;
}

export function AnimatedCheckbox({
  checked,
  onToggle,
  label,
  sublabel,
  color = GlowColors.primary,
}: AnimatedCheckboxProps) {
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    checkScale.value = withSpring(checked ? 1 : 0, { damping: 12, stiffness: 200 });
  }, [checked]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: checked ? color : `${Colors.dark.textMuted}60`,
    backgroundColor: checked ? `${color}20` : "transparent",
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const handlePress = () => {
    scale.value = withSpring(0.9, { damping: 15 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  return (
    <Pressable style={styles.checkboxRow} onPress={handlePress}>
      <Animated.View style={[styles.checkbox, boxStyle]}>
        <Animated.View style={checkStyle}>
          <Ionicons name="checkmark" size={16} color={color} />
        </Animated.View>
      </Animated.View>
      <View style={styles.checkboxLabelContainer}>
        <Text style={[styles.checkboxLabel, checked && { color: Colors.dark.text }]}>
          {label}
        </Text>
        {sublabel && (
          <Text style={styles.checkboxSublabel}>{sublabel}</Text>
        )}
      </View>
    </Pressable>
  );
}

// Circular progress ring for pillar summary
interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function ProgressRing({
  progress,
  size = 60,
  strokeWidth = 4,
  color = GlowColors.primary,
  label,
  icon,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={[styles.progressRingContainer, { width: size, height: size }]}>
      <View style={styles.progressRingBackground}>
        <View
          style={[
            styles.progressRingTrack,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: `${color}20`,
            },
          ]}
        />
        <View
          style={[
            styles.progressRingFill,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: color,
              borderTopColor: "transparent",
              borderRightColor: progress > 0.25 ? color : "transparent",
              borderBottomColor: progress > 0.5 ? color : "transparent",
              borderLeftColor: progress > 0.75 ? color : "transparent",
              transform: [{ rotate: "-90deg" }],
            },
          ]}
        />
      </View>
      <View style={styles.progressRingCenter}>
        {icon ? (
          <Ionicons name={icon} size={size * 0.35} color={color} />
        ) : (
          <Text style={[styles.progressRingText, { color }]}>
            {Math.round(progress * 100)}%
          </Text>
        )}
      </View>
      {label && <Text style={styles.progressRingLabel}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: CARD_WIDTH,
    alignSelf: "center",
    flex: 1,
  },
  card: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    borderColor: GlowColors.primary + "50",
    overflow: "hidden",
    flex: 1,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  glowOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  progressBackground: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: GlowColors.primary,
    marginTop: 2,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.15)",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  backButtonText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  backPlaceholder: {
    width: 80,
  },
  nextButton: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: "#1A1F2A",
    borderWidth: 1.5,
    borderColor: GlowColors.primary + "60",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  nextButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    borderColor: "#333333",
  },
  nextButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
  },
  nextButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  nextButtonTextDisabled: {
    color: "#666666",
  },
  // Checkbox styles
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxLabelContainer: {
    flex: 1,
    paddingTop: 2,
  },
  checkboxLabel: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  checkboxSublabel: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    marginTop: 2,
    fontWeight: "500",
  },
  // Progress ring styles
  progressRingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingBackground: {
    position: "absolute",
  },
  progressRingTrack: {
    position: "absolute",
  },
  progressRingFill: {
    position: "absolute",
  },
  progressRingCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  progressRingLabel: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    marginTop: Spacing.xs,
    textAlign: "center",
    fontWeight: "600",
  },
});
