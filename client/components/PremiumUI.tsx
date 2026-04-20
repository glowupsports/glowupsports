import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  TextColors,
  GlowColors,
  FunctionColors,
  RoleColors,
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
  Gradients,
Backgrounds, } from "@/constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ============================================
// PREMIUM BUTTON COMPONENT
// ============================================

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "admin" | "owner";
type ButtonSize = "sm" | "md" | "lg";

interface PremiumButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  haptic?: boolean;
}

export function PremiumButton({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  haptic = true,
}: PremiumButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const getVariantStyles = (): { container: ViewStyle; text: TextStyle } => {
    const isDisabled = disabled || loading;
    
    switch (variant) {
      case "primary":
        return {
          container: {
            backgroundColor: isDisabled ? TextColors.disabled : GlowColors.primary,
            ...(!isDisabled && Shadows.glow),
          },
          text: { color: "#000000", fontWeight: "600" as const },
        };
      case "secondary":
        return {
          container: {
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: isDisabled ? TextColors.disabled : "rgba(255, 255, 255, 0.2)",
          },
          text: { color: isDisabled ? TextColors.disabled : TextColors.primary },
        };
      case "ghost":
        return {
          container: {
            backgroundColor: isDisabled ? "transparent" : "rgba(255, 255, 255, 0.05)",
          },
          text: { color: isDisabled ? TextColors.disabled : TextColors.primary },
        };
      case "danger":
        return {
          container: {
            backgroundColor: isDisabled ? TextColors.disabled : FunctionColors.error,
            ...(!isDisabled && Shadows.glowError),
          },
          text: { color: TextColors.primary, fontWeight: "600" as const },
        };
      case "admin":
        return {
          container: {
            backgroundColor: isDisabled ? TextColors.disabled : RoleColors.admin,
            ...(!isDisabled && Shadows.glowAdmin),
          },
          text: { color: "#000000", fontWeight: "600" as const },
        };
      case "owner":
        return {
          container: {
            backgroundColor: isDisabled ? TextColors.disabled : RoleColors.owner,
          },
          text: { color: "#000000", fontWeight: "600" as const },
        };
      default:
        return {
          container: { backgroundColor: GlowColors.primary },
          text: { color: "#000000" },
        };
    }
  };

  const getSizeStyles = (): { container: ViewStyle; text: TextStyle; iconSize: number } => {
    switch (size) {
      case "sm":
        return {
          container: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
          text: { fontSize: 13 },
          iconSize: 16,
        };
      case "lg":
        return {
          container: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xl },
          text: { fontSize: 16 },
          iconSize: 22,
        };
      default:
        return {
          container: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
          text: { fontSize: 14 },
          iconSize: 18,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        buttonStyles.base,
        variantStyles.container,
        sizeStyles.container,
        fullWidth && { width: "100%" },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" || variant === "admin" ? "#000000" : TextColors.primary}
        />
      ) : (
        <View style={buttonStyles.content}>
          {icon && iconPosition === "left" && (
            <Ionicons
              name={icon}
              size={sizeStyles.iconSize}
              color={variantStyles.text.color}
              style={{ marginRight: Spacing.sm }}
            />
          )}
          <Text style={[buttonStyles.text, variantStyles.text, sizeStyles.text]}>{title}</Text>
          {icon && iconPosition === "right" && (
            <Ionicons
              name={icon}
              size={sizeStyles.iconSize}
              color={variantStyles.text.color}
              style={{ marginLeft: Spacing.sm }}
            />
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}

const buttonStyles = makeReactiveStyles(() => StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "500",
  },
}));

// ============================================
// PREMIUM CARD COMPONENT
// ============================================

type CardVariant = "default" | "elevated" | "glass" | "glow" | "admin";

interface PremiumCardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  style?: ViewStyle;
  padding?: keyof typeof Spacing | number;
  animated?: boolean;
}

export function PremiumCard({
  children,
  variant = "default",
  onPress,
  style,
  padding = "lg",
  animated = true,
}: PremiumCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress && animated) {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
    }
  };

  const handlePressOut = () => {
    if (animated) {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    }
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case "elevated":
        return {
          backgroundColor: Backgrounds.elevated,
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.08)",
        };
      case "glass":
        return {
          backgroundColor: Backgrounds.elevated,
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.1)",
        };
      case "glow":
        return {
          backgroundColor: Backgrounds.card,
          borderWidth: 1,
          borderColor: "rgba(200, 255, 61, 0.3)",
          ...Shadows.glowSubtle,
        };
      case "admin":
        return {
          backgroundColor: Backgrounds.card,
          borderWidth: 1,
          borderColor: "rgba(255, 133, 27, 0.3)",
        };
      default:
        return {
          backgroundColor: Backgrounds.card,
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.06)",
        };
    }
  };

  const paddingValue = typeof padding === "number" ? padding : Spacing[padding];

  const cardContent = (
    <Animated.View
      style={[
        cardStyles.base,
        getVariantStyles(),
        { padding: paddingValue },
        animatedStyle,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {cardContent}
      </Pressable>
    );
  }

  return cardContent;
}

const cardStyles = makeReactiveStyles(() => StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
}));

// ============================================
// GLASS PANEL COMPONENT
// ============================================

interface GlassPanelProps {
  children: React.ReactNode;
  intensity?: number;
  style?: ViewStyle;
  padding?: keyof typeof Spacing | number;
}

export function GlassPanel({
  children,
  intensity = 40,
  style,
  padding = "lg",
}: GlassPanelProps) {
  const paddingValue = typeof padding === "number" ? padding : Spacing[padding];

  if (Platform.OS === "web") {
    return (
      <View
        style={[
          glassPanelStyles.base,
          glassPanelStyles.webFallback,
          { padding: paddingValue },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[glassPanelStyles.base, { padding: paddingValue }, style]}
    >
      <View style={glassPanelStyles.highlight} />
      {children}
    </BlurView>
  );
}

const glassPanelStyles = makeReactiveStyles(() => StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  webFallback: {
    backgroundColor: Backgrounds.elevated,
  },
  highlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
}));

// ============================================
// STAT BADGE COMPONENT
// ============================================

type BadgeVariant = "default" | "glow" | "success" | "warning" | "error" | "info";

interface StatBadgeProps {
  value: string | number;
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: BadgeVariant;
  size?: "sm" | "md" | "lg";
  pulsing?: boolean;
  style?: ViewStyle;
}

export function StatBadge({
  value,
  label,
  icon,
  variant = "default",
  size = "md",
  pulsing = false,
  style,
}: StatBadgeProps) {
  const pulseOpacity = useSharedValue(1);

  React.useEffect(() => {
    if (pulsing) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [pulsing, pulseOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const getVariantStyles = (): { bg: string; color: string; borderColor: string } => {
    switch (variant) {
      case "glow":
        return {
          bg: "rgba(200, 255, 61, 0.15)",
          color: GlowColors.primary,
          borderColor: "rgba(200, 255, 61, 0.3)",
        };
      case "success":
        return {
          bg: "rgba(0, 230, 118, 0.15)",
          color: FunctionColors.success,
          borderColor: "rgba(0, 230, 118, 0.3)",
        };
      case "warning":
        return {
          bg: "rgba(255, 176, 32, 0.15)",
          color: FunctionColors.social,
          borderColor: "rgba(255, 176, 32, 0.3)",
        };
      case "error":
        return {
          bg: "rgba(255, 77, 77, 0.15)",
          color: FunctionColors.error,
          borderColor: "rgba(255, 77, 77, 0.3)",
        };
      case "info":
        return {
          bg: "rgba(77, 163, 255, 0.15)",
          color: FunctionColors.planning,
          borderColor: "rgba(77, 163, 255, 0.3)",
        };
      default:
        return {
          bg: "rgba(255, 255, 255, 0.05)",
          color: TextColors.primary,
          borderColor: "rgba(255, 255, 255, 0.1)",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return { padding: Spacing.xs, fontSize: 11, iconSize: 12 };
      case "lg":
        return { padding: Spacing.md, fontSize: 16, iconSize: 20 };
      default:
        return { padding: Spacing.sm, fontSize: 13, iconSize: 16 };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <Animated.View
      style={[
        badgeStyles.base,
        {
          backgroundColor: variantStyles.bg,
          borderColor: variantStyles.borderColor,
          padding: sizeStyles.padding,
        },
        pulsing && animatedStyle,
        style,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={sizeStyles.iconSize}
          color={variantStyles.color}
          style={{ marginRight: Spacing.xs }}
        />
      )}
      <Text style={[badgeStyles.value, { color: variantStyles.color, fontSize: sizeStyles.fontSize }]}>
        {value}
      </Text>
      {label && (
        <Text style={[badgeStyles.label, { color: TextColors.muted, fontSize: sizeStyles.fontSize - 2 }]}>
          {label}
        </Text>
      )}
    </Animated.View>
  );
}

const badgeStyles = makeReactiveStyles(() => StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  value: {
    fontWeight: "600",
  },
  label: {
    marginLeft: Spacing.xs,
  },
}));

// ============================================
// SECTION HEADER COMPONENT
// ============================================

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  icon?: keyof typeof Ionicons.glyphMap;
  accentColor?: string;
  style?: ViewStyle;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  icon,
  accentColor = TextColors.secondary,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[sectionStyles.container, style]}>
      <View style={sectionStyles.left}>
        {icon && (
          <View style={[sectionStyles.iconContainer, { backgroundColor: `${accentColor}20` }]}>
            <Ionicons name={icon} size={16} color={accentColor} />
          </View>
        )}
        <View>
          <Text style={sectionStyles.title}>{title}</Text>
          {subtitle && <Text style={sectionStyles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[sectionStyles.action, { color: GlowColors.primary }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const sectionStyles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: TextColors.primary,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: TextColors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  action: {
    fontSize: 13,
    fontWeight: "500",
  },
}));

// ============================================
// SHIMMER LOADER COMPONENT
// ============================================

interface ShimmerLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function ShimmerLoader({
  width = "100%",
  height = 20,
  borderRadius = BorderRadius.sm,
  style,
}: ShimmerLoaderProps) {
  const shimmerValue = useSharedValue(0);

  React.useEffect(() => {
    shimmerValue.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.linear }),
      -1,
      false
    );
  }, [shimmerValue]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmerValue.value, [0, 1], [-100, 200]) }],
  }));

  return (
    <View
      style={[
        shimmerStyles.base,
        { width: width as any, height, borderRadius },
        style,
      ]}
    >
      <Animated.View style={[shimmerStyles.shimmer, animatedStyle]} />
    </View>
  );
}

const shimmerStyles = makeReactiveStyles(() => StyleSheet.create({
  base: {
    backgroundColor: Backgrounds.surface,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 100,
    backgroundColor: Backgrounds.card,
  },
}));

// ============================================
// EMPTY STATE COMPONENT
// ============================================

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  style?: ViewStyle;
}

export function EmptyState({
  icon = "cube-outline",
  title,
  message,
  action,
  style,
}: EmptyStateProps) {
  return (
    <View style={[emptyStyles.container, style]}>
      <View style={emptyStyles.iconContainer}>
        <Ionicons name={icon} size={48} color={TextColors.muted} />
      </View>
      <Text style={emptyStyles.title}>{title}</Text>
      {message && <Text style={emptyStyles.message}>{message}</Text>}
      {action && (
        <PremiumButton
          title={action.label}
          onPress={action.onPress}
          variant="secondary"
          size="sm"
          style={{ marginTop: Spacing.lg }}
        />
      )}
    </View>
  );
}

const emptyStyles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    color: TextColors.primary,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  message: {
    color: TextColors.muted,
    fontSize: 14,
    textAlign: "center",
    marginTop: Spacing.sm,
    maxWidth: 280,
  },
}));

// ============================================
// DIVIDER COMPONENT
// ============================================

interface DividerProps {
  style?: ViewStyle;
  withGlow?: boolean;
}

export function Divider({ style, withGlow = false }: DividerProps) {
  return (
    <View
      style={[
        dividerStyles.base,
        withGlow && dividerStyles.glow,
        style,
      ]}
    />
  );
}

const dividerStyles = makeReactiveStyles(() => StyleSheet.create({
  base: {
    height: 1,
    backgroundColor: Backgrounds.card,
    marginVertical: Spacing.md,
  },
  glow: {
    backgroundColor: "rgba(200, 255, 61, 0.2)",
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
}));

// ============================================
// GLOW INDICATOR COMPONENT
// ============================================

interface GlowIndicatorProps {
  active?: boolean;
  color?: string;
  size?: number;
  pulsing?: boolean;
}

export function GlowIndicator({
  active = true,
  color = GlowColors.primary,
  size = 8,
  pulsing = true,
}: GlowIndicatorProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  React.useEffect(() => {
    if (active && pulsing) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(0.5, { duration: 0 })
        ),
        -1,
        false
      );
    }
  }, [active, pulsing, pulseScale, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  if (!active) {
    return (
      <View
        style={[
          indicatorStyles.dot,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: TextColors.disabled },
        ]}
      />
    );
  }

  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          indicatorStyles.pulse,
          {
            width: size * 2,
            height: size * 2,
            borderRadius: size,
            backgroundColor: color,
          },
          pulseStyle,
        ]}
      />
      <View
        style={[
          indicatorStyles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 4,
          },
        ]}
      />
    </View>
  );
}

const indicatorStyles = makeReactiveStyles(() => StyleSheet.create({
  dot: {
    position: "absolute",
  },
  pulse: {
    position: "absolute",
  },
}));
