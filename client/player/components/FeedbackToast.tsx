import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import Animated, { FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface ToastData {
  id: string;
  title: string;
  body: string;
  type: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  feedback: { icon: "chatbubbles", color: "#00E5FF" },
  xp: { icon: "flash", color: "#FFD700" },
  praise: { icon: "trophy", color: "#FFD700" },
  session_reminder: { icon: "calendar", color: "#00E676" },
  level_up: { icon: "trending-up", color: "#E040FB" },
  achievement: { icon: "trophy", color: "#FF6B35" },
  general: { icon: "notifications", color: "#78909C" },
};

export function FeedbackToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const scaleValue = useSharedValue(1);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      const type = (data?.type as string) || "general";
      
      const id = Date.now().toString();
      setToast({ id, title: title || "New Notification", body: body || "", type });
      
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      scaleValue.value = withSpring(1.05, { damping: 8 }, () => {
        scaleValue.value = withSpring(1);
      });
    });

    return () => subscription.remove();
  }, [scaleValue]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  const dismiss = useCallback(() => setToast(null), []);

  if (!toast) return null;

  const config = TYPE_CONFIG[toast.type] || TYPE_CONFIG.general;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(15)}
      exiting={FadeOutUp.duration(300)}
      style={[styles.container, animatedStyle]}
      key={toast.id}
    >
      <Pressable style={styles.inner} onPress={dismiss}>
        <View style={[styles.iconCircle, { backgroundColor: config.color + "25" }]}>
          <Ionicons name={config.icon as any} size={20} color={config.color} />
        </View>
        <View style={styles.textContent}>
          <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{toast.body}</Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={12}>
          <Ionicons name="close" size={18} color={Colors.dark.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextBorder,
    gap: Spacing.sm,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  textContent: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  body: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
  },
}));
