import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Dimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export interface QuickAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress: () => void;
}

interface QuickActionsFABProps {
  actions: QuickAction[];
  primaryColor?: string;
  secondaryColor?: string;
  bottomOffset?: number;
}

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.8,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function QuickActionsFAB({
  actions,
  primaryColor = Colors.dark.xpCyan,
  secondaryColor = Colors.dark.primary,
  bottomOffset = 90,
}: QuickActionsFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const fabScale = useSharedValue(1);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOpen(true);
    progress.value = withSpring(1, SPRING_CONFIG);
  }, [progress]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    progress.value = withSpring(0, SPRING_CONFIG);
    setTimeout(() => setIsOpen(false), 200);
  }, [progress]);

  const handleActionPress = useCallback((action: QuickAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    progress.value = withSpring(0, SPRING_CONFIG);
    setTimeout(() => {
      setIsOpen(false);
      action.onPress();
    }, 150);
  }, [progress]);

  const fabAnimatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(progress.value, [0, 1], [0, 45]);
    return {
      transform: [
        { scale: fabScale.value },
        { rotate: `${rotation}deg` },
      ],
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const menuContainerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.8, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(progress.value, [0, 1], [50, 0], Extrapolation.CLAMP) },
    ],
  }));

  const getActionStyle = (index: number) => {
    return useAnimatedStyle(() => {
      const delay = index * 0.08;
      const adjustedProgress = Math.max(0, Math.min(1, (progress.value - delay) / (1 - delay)));
      
      return {
        opacity: interpolate(adjustedProgress, [0, 1], [0, 1]),
        transform: [
          { scale: interpolate(adjustedProgress, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
          { translateY: interpolate(adjustedProgress, [0, 1], [20, 0], Extrapolation.CLAMP) },
        ],
      };
    });
  };

  return (
    <>
      <Pressable
        style={[styles.fabContainer, { bottom: bottomOffset + insets.bottom }]}
        onPress={handleOpen}
        onPressIn={() => {
          fabScale.value = withSpring(0.9, { damping: 10, stiffness: 400 });
        }}
        onPressOut={() => {
          fabScale.value = withSpring(1, { damping: 10, stiffness: 400 });
        }}
      >
        <View style={[styles.fabGlow, { shadowColor: primaryColor }]} />
        <Animated.View style={fabAnimatedStyle}>
          <LinearGradient
            colors={[primaryColor, secondaryColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
          </LinearGradient>
        </Animated.View>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        <View style={styles.modalContainer}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            </Pressable>
          </Animated.View>

          <Animated.View 
            style={[
              styles.menuContainer, 
              menuContainerStyle,
              { bottom: bottomOffset + insets.bottom + 80 }
            ]}
          >
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Quick Actions</Text>
              <View style={[styles.menuTitleLine, { backgroundColor: primaryColor }]} />
            </View>

            <View style={styles.actionsGrid}>
              {actions.map((action, index) => {
                const actionStyle = getActionStyle(index);
                const actionColor = action.color || primaryColor;

                return (
                  <AnimatedPressable
                    key={action.id}
                    style={[styles.actionItem, actionStyle]}
                    onPress={() => handleActionPress(action)}
                  >
                    <View style={[styles.actionIconContainer, { borderColor: actionColor + "40" }]}>
                      <LinearGradient
                        colors={[actionColor + "30", actionColor + "10"]}
                        style={styles.actionIconGradient}
                      >
                        <Ionicons name={action.icon} size={24} color={actionColor} />
                      </LinearGradient>
                      <View style={[styles.actionGlow, { backgroundColor: actionColor, shadowColor: actionColor }]} />
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={2}>
                      {action.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </Animated.View>

          <Pressable
            style={[styles.closeFab, { bottom: bottomOffset + insets.bottom }]}
            onPress={handleClose}
          >
            <Animated.View style={fabAnimatedStyle}>
              <LinearGradient
                colors={[Colors.dark.error, "#FF6B6B"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fabGradient}
              >
                <Ionicons name="add" size={28} color={Colors.dark.text} />
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  fabGlow: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    opacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalContainer: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  menuContainer: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  menuHeader: {
    marginBottom: Spacing.lg,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  menuTitleLine: {
    height: 2,
    width: 40,
    borderRadius: 1,
    alignSelf: "center",
    marginTop: Spacing.sm,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  actionItem: {
    width: 90,
    minWidth: 80,
    maxWidth: 100,
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  actionIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  actionIconGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  actionGlow: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    opacity: 0.3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
    lineHeight: 14,
  },
  closeFab: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 101,
  },
});

export default QuickActionsFAB;
