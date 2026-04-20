import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

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

const FAB_SIZE = 56;
const ACTION_ITEM_SIZE = 48;
const ACTION_ITEM_GAP = Spacing.sm;

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

  const fabBottom = bottomOffset + insets.bottom;
  const bottomBarHeight = fabBottom;

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOpen(true);
    progress.value = withSpring(1, SPRING_CONFIG);
  }, [progress]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    progress.value = withSpring(0, SPRING_CONFIG);
    setTimeout(() => setIsOpen(false), 250);
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

  const getActionStyle = (index: number) => {
    return useAnimatedStyle(() => {
      const delay = index * 0.07;
      const adjustedProgress = Math.max(0, Math.min(1, (progress.value - delay) / (1 - delay)));

      return {
        opacity: interpolate(adjustedProgress, [0, 1], [0, 1]),
        transform: [
          { scale: interpolate(adjustedProgress, [0, 1], [0.7, 1], Extrapolation.CLAMP) },
          { translateY: interpolate(adjustedProgress, [0, 1], [10, 0], Extrapolation.CLAMP) },
        ],
      };
    });
  };

  return (
    <>
      {isOpen ? (
        <Pressable
          style={[styles.backdrop, { bottom: bottomBarHeight }]}
          onPress={handleClose}
        />
      ) : null}

      <View
        style={[styles.fabContainer, { bottom: fabBottom }]}
        pointerEvents="box-none"
      >
        {actions.map((action, index) => {
          const actionStyle = getActionStyle(index);
          const actionColor = action.color || primaryColor;
          const bottomPos = FAB_SIZE + Spacing.md + index * (ACTION_ITEM_SIZE + ACTION_ITEM_GAP);

          return (
            <AnimatedPressable
              key={action.id}
              style={[
                styles.actionRow,
                actionStyle,
                { bottom: bottomPos },
              ]}
              onPress={() => handleActionPress(action)}
              pointerEvents={isOpen ? "auto" : "none"}
            >
              <Text style={styles.actionLabel} numberOfLines={1}>
                {action.label}
              </Text>
              <View style={[styles.actionIconContainer, { borderColor: actionColor + "50" }]}>
                <LinearGradient
                  colors={[actionColor + "40", actionColor + "15"]}
                  style={styles.actionIconGradient}
                >
                  <Ionicons name={action.icon} size={22} color={actionColor} />
                </LinearGradient>
                <View style={[styles.actionGlow, { backgroundColor: actionColor, shadowColor: actionColor }]} />
              </View>
            </AnimatedPressable>
          );
        })}

        <Pressable
          onPress={isOpen ? handleClose : handleOpen}
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
              colors={isOpen ? [Colors.dark.error, "#FF6B6B"] : [primaryColor, secondaryColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Ionicons name="add" size={28} color={Colors.dark.buttonText} />
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  fabContainer: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 100,
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  fabGlow: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    opacity: 0.4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  fabGradient: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: "transparent",
    zIndex: 99,
  },
  actionRow: {
    position: "absolute",
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.chromeText,
    backgroundColor: Colors.dark.chromeBackground,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.chromeBorder,
  },
  actionIconContainer: {
    width: ACTION_ITEM_SIZE,
    height: ACTION_ITEM_SIZE,
    borderRadius: ACTION_ITEM_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    overflow: "hidden",
  },
  actionIconGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  actionGlow: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    opacity: 0.3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
}));

export default QuickActionsFAB;
