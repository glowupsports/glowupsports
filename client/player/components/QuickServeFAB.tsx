import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Dimensions, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, GlowColors, Colors } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useChatState } from "@/coach/context/ChatStateContext";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { useGlassTint } from "@/hooks/useGlassTint";
import { useCategoryAccent } from "@/player/theme/useCategoryAccent";
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

interface ActionItemProps {
  action: QuickAction;
  index: number;
  progress: SharedValue<number>;
  onPress: (action: QuickAction) => void;
}

function ActionItem({ action, index, progress, onPress }: ActionItemProps) {
  const animStyle = useAnimatedStyle(() => {
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

  return (
    <Animated.View style={animStyle}>
      <Pressable style={styles.actionButton} onPress={() => onPress(action)}>
        <View style={[styles.actionIcon, { borderColor: action.color }]}>
          <Ionicons name={action.icon} size={20} color={action.color} />
        </View>
        <Text style={styles.actionLabel}>{action.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

interface QuickServeFABProps {
  bottomOffset?: number;
}

export function QuickServeFAB({ bottomOffset = 70 }: QuickServeFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const { openGlowChat } = useChatState();
  const progress = useSharedValue(0);
  const fabScale = useSharedValue(1);
  const track = useTrackFeature();
  const glassTint = useGlassTint();
  const tournamentsAccent = useCategoryAccent("tournaments", "#FFD700");

  const actions: QuickAction[] = [
    {
      id: "tournaments",
      label: "Tournaments",
      icon: "trophy-outline",
      color: tournamentsAccent,
      onPress: () => {
        track("action:tournaments");
        navigation.navigate("PlayerTabs", { screen: "PlayStack", params: { screen: "Play", params: { initialTab: "Tournaments" } } });
      },
    },
    {
      id: "classes",
      label: "Classes",
      icon: "people-outline",
      color: Colors.dark.accentText,
      onPress: () => {
        track("action:classes");
        navigation.navigate("ClassesDiscovery");
      },
    },
    {
      id: "log-score",
      label: "Log Score",
      icon: "tennisball-outline",
      color: ProTennisColors.electricGreen,
      onPress: () => {
        track("action:open_session");
        navigateToTab("Growth", { screen: "Match" });
      },
    },
    {
      id: "chat-coach",
      label: "Chat Coach",
      icon: "chatbubble-outline",
      color: "rgba(255, 255, 255, 0.6)",
      onPress: () => {
        track("action:chat_coach");
        openGlowChat({ tab: "coaches", fullscreen: true });
      },
    },
    {
      id: "record-video",
      label: "Record",
      icon: "videocam-outline",
      color: ProTennisColors.electricGreen,
      onPress: () => {
        track("action:record_video");
        navigateToTab("Growth", { screen: "SkillEvidence" });
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
          <Ionicons name="add" size={24} color={ProTennisColors.midnightBlue} />
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
              { bottom: bottomOffset + insets.bottom + 60, right: Spacing.lg },
            ]}
          >
            {Platform.OS === "ios" ? (
              <BlurView intensity={40} tint={glassTint} style={StyleSheet.absoluteFill}>
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
                <ActionItem
                  key={action.id}
                  action={action}
                  index={index}
                  progress={progress}
                  onPress={handleActionPress}
                />
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
              <Ionicons name="add" size={24} color={ProTennisColors.midnightBlue} />
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </Modal>
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  fab: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
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
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.card,
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
    backgroundColor: Backgrounds.card + "80",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
}));
