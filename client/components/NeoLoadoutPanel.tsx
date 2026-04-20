import React, { useEffect } from "react";
import { View, StyleSheet, ViewStyle, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  withDelay,
} from "react-native-reanimated";
import { Colors, BorderRadius, Spacing } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

/**
 * DESIGN HIERARCHY NOTES (20/60/20 Rule):
 * - tone="epic" (20%): Command centers, dashboards - glow/sweep allowed
 * - tone="calm" (60%): List screens, settings - glow disabled by default
 * - tone="focused" (20%): Detail screens - minimal visual noise
 * 
 * Use tone prop to enforce design consistency. Default is "calm" to prevent
 * accidental glow effects on majority of screens.
 */
type PanelTone = "epic" | "calm" | "focused";

interface NeoLoadoutPanelProps {
  children: React.ReactNode;
  accentColor?: string;
  variant?: "card" | "header" | "chip" | "tab";
  style?: ViewStyle;
  animationDelay?: number;
  /** Enable glow effect. For calm/focused tones, this defaults to false. */
  enableGlow?: boolean;
  enableSweep?: boolean;
  /** Design tone: epic (glow allowed), calm (default, no glow), focused (minimal) */
  tone?: PanelTone;
}

export function NeoLoadoutPanel({
  children,
  accentColor = Colors.dark.primary,
  variant = "card",
  style,
  animationDelay = 0,
  enableGlow,
  enableSweep = false,
  tone = "calm",
}: NeoLoadoutPanelProps) {
  // Default enableGlow based on tone if not explicitly set
  const shouldGlow = enableGlow !== undefined 
    ? enableGlow 
    : tone === "epic"; // Only epic tone gets glow by default
  const glowAnim = useSharedValue(0.3);
  const glowScaleAnim = useSharedValue(1);
  const sweepAnim = useSharedValue(-1);

  useEffect(() => {
    // Only run glow animations if shouldGlow is true
    if (shouldGlow) {
      glowAnim.value = withDelay(
        animationDelay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.3, { duration: 1400, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
      glowScaleAnim.value = withDelay(
        animationDelay,
        withRepeat(
          withSequence(
            withTiming(1.02, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.98, { duration: 1400, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    }
    // Only run sweep animation if enabled (typically epic tone)
    if (enableSweep && tone === "epic") {
      sweepAnim.value = withDelay(
        animationDelay,
        withRepeat(
          withTiming(2, { duration: 3000, easing: Easing.linear }),
          -1,
          false
        )
      );
    }
  }, [animationDelay, enableSweep, shouldGlow, tone]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowAnim.value,
    transform: [{ scale: glowScaleAnim.value }],
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweepAnim.value * 100 }],
    opacity: sweepAnim.value > 0 && sweepAnim.value < 1 ? 0.3 : 0,
  }));

  const getBorderRadius = () => {
    switch (variant) {
      case "header": return BorderRadius.lg;
      case "chip": return BorderRadius.full;
      case "tab": return BorderRadius.xl;
      default: return BorderRadius.md;
    }
  };

  const getAccentStripHeight = () => {
    switch (variant) {
      case "header": return 6;
      case "chip": return 0;
      case "tab": return 3;
      default: return 4;
    }
  };

  const borderRadius = getBorderRadius();
  const accentStripHeight = getAccentStripHeight();

  return (
    <View style={[styles.container, { borderRadius }, style]}>
      {shouldGlow && (
        <Animated.View
          style={[
            styles.glowFrame,
            { borderRadius: borderRadius + 4, borderColor: accentColor },
            glowStyle,
          ]}
        />
      )}
      
      <View style={[styles.innerGlowFrame, { borderRadius: borderRadius + 2, borderColor: accentColor + "40" }]} />
      
      <LinearGradient
        colors={[
          Colors.dark.backgroundDefault,
          Colors.dark.backgroundSecondary,
          Colors.dark.backgroundDefault,
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientBase, { borderRadius }]}
      />
      
      {Platform.OS === "ios" && (
        <BlurView
          intensity={20}
          tint="dark"
          style={[styles.blurOverlay, { borderRadius }]}
        />
      )}
      
      {accentStripHeight > 0 && (
        <LinearGradient
          colors={[accentColor, accentColor + "60"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.accentStrip,
            { 
              height: accentStripHeight,
              borderTopLeftRadius: borderRadius,
              borderTopRightRadius: borderRadius,
            },
          ]}
        />
      )}
      
      {enableSweep && (
        <Animated.View style={[styles.sweepOverlay, { borderRadius }, sweepStyle]}>
          <LinearGradient
            colors={["transparent", accentColor + "30", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      
      <View style={[styles.contentContainer, { borderRadius }]}>
        {children}
      </View>
      
      <View
        style={[
          styles.borderFrame,
          { 
            borderRadius,
            borderColor: accentColor + "30",
          },
        ]}
      />
    </View>
  );
}

interface NeoGlowBadgeProps {
  children: React.ReactNode;
  size?: number;
  accentColor?: string;
  animationDelay?: number;
}

export function NeoGlowBadge({
  children,
  size = 48,
  accentColor = Colors.dark.primary,
  animationDelay = 0,
}: NeoGlowBadgeProps) {
  const pulseAnim = useSharedValue(1);
  const glowAnim = useSharedValue(0.3);
  const ringAnim = useSharedValue(0.4);

  useEffect(() => {
    pulseAnim.value = withDelay(
      animationDelay,
      withRepeat(
        withSequence(
          withTiming(1.1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
    glowAnim.value = withDelay(
      animationDelay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
    ringAnim.value = withDelay(
      animationDelay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, [animationDelay]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowAnim.value,
    transform: [{ scale: 0.9 + glowAnim.value * 0.2 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringAnim.value,
    transform: [{ scale: 0.95 + ringAnim.value * 0.1 }],
  }));

  const outerGlowSize = size + 20;
  const innerGlowSize = size + 12;
  const ringSize = size + 6;

  return (
    <View style={[styles.badgeContainer, { width: outerGlowSize, height: outerGlowSize }]}>
      <Animated.View
        style={[
          styles.badgeOuterGlow,
          {
            width: outerGlowSize,
            height: outerGlowSize,
            borderRadius: outerGlowSize / 2,
            backgroundColor: accentColor + "20",
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.badgeInnerGlow,
          {
            width: innerGlowSize,
            height: innerGlowSize,
            borderRadius: innerGlowSize / 2,
            backgroundColor: accentColor + "40",
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.badgeRing,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: accentColor,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.badgeCore,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: accentColor,
          },
          pulseStyle,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

interface NeoTabBarProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  accentColor?: string;
}

export function NeoTabBar({
  tabs,
  activeTab,
  onTabChange,
  accentColor = Colors.dark.primary,
}: NeoTabBarProps) {
  const underglowAnim = useSharedValue(0.4);

  useEffect(() => {
    underglowAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const underglowStyle = useAnimatedStyle(() => ({
    opacity: underglowAnim.value,
  }));

  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBarInner}>
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          return (
            <View key={tab.id} style={styles.tabWrapper}>
              {isActive && (
                <Animated.View
                  style={[
                    styles.tabUnderglow,
                    { backgroundColor: accentColor },
                    underglowStyle,
                  ]}
                />
              )}
              <NeoLoadoutPanel
                variant="tab"
                accentColor={isActive ? accentColor : Colors.dark.backgroundTertiary}
                enableGlow={isActive}
                style={isActive ? { ...styles.tabItem, ...styles.tabItemActive } : styles.tabItem}
              >
                <View
                  style={styles.tabContent}
                  onTouchEnd={() => onTabChange(tab.id)}
                >
                  {tab.icon}
                  <Animated.Text
                    style={[
                      styles.tabLabel,
                      isActive && { color: accentColor },
                    ]}
                  >
                    {tab.label}
                  </Animated.Text>
                </View>
              </NeoLoadoutPanel>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "relative",
    overflow: "visible",
  },
  glowFrame: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 3,
  },
  innerGlowFrame: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderWidth: 2,
  },
  gradientBase: {
    ...StyleSheet.absoluteFillObject,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  accentStrip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  sweepOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  contentContainer: {
    position: "relative",
    zIndex: 10,
  },
  borderFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    pointerEvents: "none",
  },
  badgeContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badgeOuterGlow: {
    position: "absolute",
  },
  badgeInnerGlow: {
    position: "absolute",
  },
  badgeRing: {
    position: "absolute",
    borderWidth: 3,
  },
  badgeCore: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tabBarInner: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  tabWrapper: {
    flex: 1,
    position: "relative",
  },
  tabUnderglow: {
    position: "absolute",
    bottom: -4,
    left: 10,
    right: 10,
    height: 8,
    borderRadius: 4,
  },
  tabItem: {
    flex: 1,
  },
  tabItemActive: {
    transform: [{ scale: 1.02 }],
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  tabLabel: {
    color: Colors.dark.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
}));
