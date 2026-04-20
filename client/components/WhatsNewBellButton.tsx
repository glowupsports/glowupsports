import React, { useEffect, useState, useCallback } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import {
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
Backgrounds, } from "@/constants/theme";
import { WhatsNewFeed, WhatsNewItem } from "@/components/WhatsNewFeed";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const STORAGE_KEY = "@glow_whats_new_last_seen";

const WHATS_NEW_ITEMS: WhatsNewItem[] = [
  {
    id: "guided_tours",
    date: "2026-02-12",
    title: "Guided Tours",
    description: "New interactive walkthroughs help you learn the platform step by step. Look for the pulsing highlights on your dashboard!",
    icon: "compass",
    iconColor: GlowColors.primary,
    tag: "new",
  },
  {
    id: "celebration_milestones",
    date: "2026-02-12",
    title: "Milestone Celebrations",
    description: "Earn XP rewards when you complete key actions for the first time. Create your first session, add your first player, and more!",
    icon: "trophy",
    iconColor: "#FFD700",
    tag: "new",
  },
  {
    id: "help_center",
    date: "2026-02-10",
    title: "Help Center",
    description: "Access FAQs, video tutorials, and support contacts anytime from the floating help button on every screen.",
    icon: "help-circle",
    iconColor: FunctionColors.info,
    tag: "new",
  },
  {
    id: "contextual_tooltips",
    date: "2026-02-10",
    title: "Contextual Help Tooltips",
    description: "See (?) icons next to complex features? Tap them for quick explanations without leaving the screen.",
    icon: "information-circle",
    iconColor: FunctionColors.info,
    tag: "improved",
  },
  {
    id: "setup_checklist",
    date: "2026-02-08",
    title: "Setup Checklists",
    description: "Personalized setup checklists for every role help you get started quickly. Check your progress on the dashboard.",
    icon: "checkmark-circle",
    iconColor: FunctionColors.success,
    tag: "new",
  },
  {
    id: "quick_tips",
    date: "2026-02-06",
    title: "Smart Tips Banner",
    description: "Rotating role-specific tips appear at the top of your dashboard. Dismiss ones you've already mastered.",
    icon: "bulb",
    iconColor: FunctionColors.social,
    tag: "improved",
  },
];

interface WhatsNewBellButtonProps {
  style?: any;
}

export function WhatsNewBellButton({ style }: WhatsNewBellButtonProps) {
  const [unseenCount, setUnseenCount] = useState(0);
  const [feedVisible, setFeedVisible] = useState(false);
  const bellRotation = useSharedValue(0);

  useEffect(() => {
    checkUnseenCount();
  }, []);

  useEffect(() => {
    if (unseenCount > 0) {
      bellRotation.value = withDelay(
        2000,
        withRepeat(
          withSequence(
            withTiming(8, { duration: 80 }),
            withTiming(-8, { duration: 80 }),
            withTiming(6, { duration: 60 }),
            withTiming(-6, { duration: 60 }),
            withTiming(0, { duration: 60 }),
            withTiming(0, { duration: 3000 })
          ),
          -1,
          false
        )
      );
    }
  }, [unseenCount]);

  const checkUnseenCount = async () => {
    try {
      const lastSeen = await AsyncStorage.getItem(STORAGE_KEY);
      if (!lastSeen) {
        setUnseenCount(WHATS_NEW_ITEMS.length);
        return;
      }
      const lastSeenDate = new Date(lastSeen);
      const unseen = WHATS_NEW_ITEMS.filter(
        (item) => new Date(item.date) > lastSeenDate
      );
      setUnseenCount(unseen.length);
    } catch {
      setUnseenCount(0);
    }
  };

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFeedVisible(true);
  }, []);

  const handleClose = useCallback(async () => {
    setFeedVisible(false);
    await AsyncStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setUnseenCount(0);
  }, []);

  const bellStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bellRotation.value}deg` }],
  }));

  return (
    <>
      <Pressable onPress={handleOpen} style={[styles.bellButton, style]}>
        <Animated.View style={bellStyle}>
          <Ionicons name="notifications-outline" size={22} color={TextColors.primary} />
        </Animated.View>
        {unseenCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unseenCount > 9 ? "9+" : unseenCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <WhatsNewFeed
        visible={feedVisible}
        onClose={handleClose}
        items={WHATS_NEW_ITEMS}
      />
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: FunctionColors.error,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  badgeText: {
    ...Typography.caption,
    fontSize: 10,
    color: "#FFFFFF",
    fontWeight: "700",
  },
}));
