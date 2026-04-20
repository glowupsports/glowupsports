import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
Backgrounds, } from "@/constants/theme";

export interface QuickTip {
  id: string;
  icon: string;
  text: string;
  learnMoreAction?: () => void;
}

export interface QuickTipsBannerProps {
  tips: QuickTip[];
  role: string;
}

export function QuickTipsBanner({ tips, role }: QuickTipsBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const storageKey = `@glow_dismissed_tips_${role}`;

  const activeTips = tips.filter((tip) => !dismissedIds.has(tip.id));

  useEffect(() => {
    loadDismissed();
  }, [role]);

  useEffect(() => {
    if (activeTips.length <= 1) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeTips.length);
    }, 8000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeTips.length]);

  const loadDismissed = async () => {
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        setDismissedIds(new Set(JSON.parse(stored)));
      }
    } catch (error) {
      console.warn("Failed to load dismissed tips:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const dismissTip = useCallback(
    async (tipId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newDismissed = new Set(dismissedIds);
      newDismissed.add(tipId);
      setDismissedIds(newDismissed);
      try {
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify([...newDismissed])
        );
      } catch (error) {
        console.warn("Failed to save dismissed tips:", error);
      }
      setCurrentIndex((prev) => {
        const remaining = tips.filter((t) => !newDismissed.has(t.id));
        if (remaining.length === 0) return 0;
        return prev >= remaining.length ? 0 : prev;
      });
    },
    [dismissedIds, storageKey, tips]
  );

  if (isLoading || activeTips.length === 0) return null;

  const safeIndex = currentIndex % activeTips.length;
  const currentTip = activeTips[safeIndex];

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      <Animated.View
        key={currentTip.id}
        entering={FadeIn.duration(400)}
        exiting={FadeOut.duration(200)}
        style={styles.content}
      >
        <Ionicons
          name={currentTip.icon as keyof typeof Ionicons.glyphMap}
          size={18}
          color={GlowColors.primary}
          style={styles.icon}
        />
        <Text style={styles.text} numberOfLines={1}>
          {currentTip.text}
        </Text>
        {currentTip.learnMoreAction ? (
          <Pressable onPress={currentTip.learnMoreAction} hitSlop={8}>
            <Text style={styles.learnMore}>Learn More</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => dismissTip(currentTip.id)}
          hitSlop={16}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={18} color={TextColors.secondary} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: BorderRadius.sm,
    height: 48,
    justifyContent: "center",
    overflow: "hidden",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 48,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  text: {
    ...Typography.caption,
    color: TextColors.secondary,
    flex: 1,
  },
  learnMore: {
    ...Typography.caption,
    color: GlowColors.primary,
    fontWeight: "600",
    marginRight: Spacing.sm,
  },
  closeButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.xs,
  },
}));

export default QuickTipsBanner;
