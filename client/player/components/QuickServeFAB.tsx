import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { ProTennisColors, Spacing, BorderRadius, Backgrounds, GlowColors, Colors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Platform } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface QuickAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 180,
  mass: 0.8,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface QuickServeFABProps {
  bottomOffset?: number;
}

export function QuickServeFAB({ bottomOffset = 70 }: QuickServeFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const progress = useSharedValue(0);
  const fabScale = useSharedValue(1);

  const actions: QuickAction[] = [
    {
      id: "log-score",
      label: "Log Score",
      icon: "tennisball-outline",
      color: ProTennisColors.electricGreen,
      onPress: () => {
        navigation.navigate("PlayerTabs", { screen: "Schedule", params: { screen: "Match" } });
      },
    },
    {
      id: "chat-coach",
      label: "Chat Coach",
      icon: "chatbubble-outline",
      color: ProTennisColors.neonCyan,
      onPress: () => {
        navigation.navigate("PlayerMessages");
      },
    },
    {
      id: "record-video",
      label: "Record",
      icon: "videocam-outline",
      color: ProTennisColors.electricGreen,
      onPress: () => {
        navigation.navigate("PlayerTabs", { screen: "Progress", params: { screen: "SkillEvidence" } });
      },
    },
  ];

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
    opacity: progress.value * 0.7,
  }));

  const menuContainerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.8, 1], Extrapolation.CLAMP) },
      { translateY: interpolate(progress.value, [0, 1], [30, 0], Extrapolation.CLAMP) },
    ],
  }));

  const getActionStyle = (index: number) => {
    return useAnimatedStyle(() => {
      const delay = index * 0.08;
      const adjustedProgress = Math.max(0, Math.min(1, (progress.value - delay) / (1 - delay)));
      return {
        opacity: adjustedProgress,
        transform: [
          { translateY: interpolate(adjustedProgress, [0, 1], [20, 0], Extrapolation.CLAMP) },
          { scale: interpolate(adjustedProgress, [0, 1], [0.8, 1], Extrapolation.CLAMP) },
        ],
      };
    });
  };

  return (
    <>
      <AnimatedPressable
        style={[
          styles.fab,
          fabAnimatedStyle,
          { bottom: bottomOffset + insets.bottom, right: Spacing.lg },
        ]}
        onPress={isOpen ? handleClose : handleOpen}
      >
        <LinearGradient
          colors={ProTennisColors.gradientElectric as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color={ProTennisColors.midnightBlue} />
        </LinearGradient>
      </AnimatedPressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={handleClose}
      >
        <View style={styles.modalContainer}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          </Animated.View>

          <Animated.View 
            style={[
              styles.menuContainer, 
              menuContainerStyle,
              { bottom: bottomOffset + insets.bottom + 70, right: Spacing.lg },
            ]}
          >
            {Platform.OS === "ios" ? (
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
                <LinearGradient
                  colors={[ProTennisColors.surfaceCard + "F0", ProTennisColors.surfaceDark + "F5"]}
                  style={StyleSheet.absoluteFill}
                />
              </BlurView>
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: ProTennisColors.surfaceCard + "F8" }]} />
            )}

            <View style={styles.menuContent}>
              {actions.map((action, index) => (
                <Animated.View key={action.id} style={getActionStyle(index)}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => handleActionPress(action)}
                  >
                    <View style={[styles.actionIcon, { borderColor: action.color }]}>
                      <Ionicons name={action.icon} size={20} color={action.color} />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </Animated.View>

          <AnimatedPressable
            style={[
              styles.fab,
              styles.fabOpen,
              fabAnimatedStyle,
              { bottom: bottomOffset + insets.bottom, right: Spacing.lg },
            ]}
            onPress={handleClose}
          >
            <LinearGradient
              colors={ProTennisColors.gradientElectric as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Ionicons name="add" size={28} color={ProTennisColors.midnightBlue} />
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  fabOpen: {
    zIndex: 1000,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.root,
  },
  menuContainer: {
    position: "absolute",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    minWidth: 160,
  },
  menuContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.md,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Backgrounds.root + "80",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
