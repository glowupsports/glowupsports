import React, { useCallback } from "react";
import { StyleSheet, Pressable, Platform } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { useTabNavigation } from "@/components/TabNavigationContext";
import { useChatState } from "@/coach/context/ChatStateContext";

const TAB_BAR_HEIGHT = 85;

export function FeedbackPill() {
  const insets = useSafeAreaInsets();
  const { navigateToTab } = useTabNavigation();
  const { isChatExpanded } = useChatState();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 350 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    navigateToTab("Coaching", { screen: "feedback" });
  }, [navigateToTab]);

  if (isChatExpanded) return null;

  const bottomOffset = TAB_BAR_HEIGHT + (insets.bottom > 0 ? insets.bottom : 16) + 8;

  return (
    <Animated.View
      style={[styles.pillWrapper, { bottom: bottomOffset }, animatedStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        android_ripple={{ color: "rgba(0,0,0,0.15)", borderless: false }}
        accessibilityLabel="Feedback"
        accessibilityRole="button"
        accessibilityHint="Open the feedback command center"
      >
        <Ionicons name="chatbubble-ellipses" size={14} color="#000000" />
        <Animated.Text style={styles.pillLabel}>Feedback</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pillWrapper: {
    position: "absolute",
    left: 8,
    zIndex: 90,
    elevation: 90,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.55,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  pillPressed: {
    opacity: 0.9,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000000",
    letterSpacing: 0.2,
  },
});
