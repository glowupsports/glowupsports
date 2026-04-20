import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { getApiUrl } from "@/lib/query-client";
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
  const cancelledRef = useRef(false);

  const storageKey = `@glow_dismissed_tips_${role}`;
  const serverStateKey = `dismissed_tips_${role}`;

  const activeTips = tips.filter((tip) => !dismissedIds.has(tip.id));

  useEffect(() => {
    cancelledRef.current = false;
    loadDismissed();
    return () => {
      cancelledRef.current = true;
    };
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

  const persistToServer = async (ids: string[]) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      const apiUrl = getApiUrl();
      await fetch(new URL("/api/user/onboarding-state", apiUrl).toString(), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: serverStateKey, value: ids }),
      });
    } catch (error) {
      console.warn("Failed to save dismissed tips to server:", error);
    }
  };

  const loadDismissed = async () => {
    let localIds: string[] = [];
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          localIds = parsed;
          if (!cancelledRef.current && localIds.length > 0) {
            setDismissedIds(new Set(localIds));
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load dismissed tips:", error);
    } finally {
      if (!cancelledRef.current) setIsLoading(false);
    }

    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token || cancelledRef.current) return;
      const apiUrl = getApiUrl();
      const response = await fetch(
        new URL("/api/user/onboarding-state", apiUrl).toString(),
        { headers: { "Authorization": `Bearer ${token}` } },
      );
      if (!response.ok || cancelledRef.current) return;
      const data = await response.json();
      if (cancelledRef.current) return;
      const serverIds: string[] = Array.isArray(data?.state?.[serverStateKey])
        ? data.state[serverStateKey]
        : [];
      const merged = new Set<string>([...serverIds, ...localIds]);
      setDismissedIds(merged);
      const mergedArr = [...merged];
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(mergedArr));
      } catch {}
      if (mergedArr.length !== serverIds.length) {
        persistToServer(mergedArr);
      }
    } catch (error) {
      console.warn("Failed to load dismissed tips from server:", error);
    }
  };

  const dismissTip = useCallback(
    async (tipId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newDismissed = new Set(dismissedIds);
      newDismissed.add(tipId);
      setDismissedIds(newDismissed);
      const arr = [...newDismissed];
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(arr));
      } catch (error) {
        console.warn("Failed to save dismissed tips:", error);
      }
      persistToServer(arr);
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
