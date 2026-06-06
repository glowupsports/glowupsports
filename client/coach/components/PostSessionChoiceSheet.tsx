import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { addPendingReview } from "@/lib/pendingReviews";
import type { PendingIntakeSession } from "@/coach/context/IntakeModalContext";

interface Props {
  visible: boolean;
  session: PendingIntakeSession | null;
  onClose: () => void;
  onFeedbackNow: () => void;
  onNextSession: () => void;
  /** Called after a review is deferred so the Dashboard can immediately refresh its pending-review list. */
  onDeferComplete?: () => void;
}

/**
 * Schedule a 20:00 local notification and return the notification identifier.
 * Returns null on web or if permission is denied.
 */
async function scheduleEveningReminder(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return null;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;

    const now = new Date();
    const evening = new Date();
    evening.setHours(20, 0, 0, 0);
    if (evening <= now) {
      evening.setDate(evening.getDate() + 1);
    }
    const secondsUntil = Math.max(
      1,
      Math.floor((evening.getTime() - now.getTime()) / 1000),
    );

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Session reviews pending",
        body: "You have coaching sessions waiting for AI review. Tap to complete them.",
        data: { screen: "PendingReviews" },
      },
      trigger: {
        seconds: secondsUntil,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });
    return notificationId;
  } catch {
    return null;
  }
}

export function PostSessionChoiceSheet({
  visible,
  session,
  onClose,
  onFeedbackNow,
  onNextSession,
  onDeferComplete,
}: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(1)).current;
  const screenHeight = Dimensions.get("window").height;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(1);
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible || !session) return null;

  const handleTonightReminder = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Schedule the notification first so we can capture its ID for later cancellation.
    const reminderNotificationId = await scheduleEveningReminder();
    await addPendingReview({
      sessionId: session.sessionId,
      startTime: session.startTime,
      sessionType: session.sessionType,
      players: session.players,
      playerCount: session.playerCount,
      needsGroupDynamics: session.needsGroupDynamics,
      cardType: session.cardType,
      savedAt: new Date().toISOString(),
      // Store the notification ID so it can be cancelled if the review is completed before 20:00.
      ...(reminderNotificationId ? { reminderNotificationId } : {}),
    });
    onClose();
    // Notify the Dashboard immediately so the pending-review card appears without waiting for focus.
    onDeferComplete?.();
  };

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + Spacing.lg },
          {
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, screenHeight],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.iconRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.dark.primary} />
          </View>
        </View>

        <Text style={styles.title}>Session Ended</Text>
        <Text style={styles.subtitle}>What would you like to do next?</Text>

        <Pressable
          style={[styles.option, styles.optionPrimary]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onFeedbackNow();
          }}
        >
          <View style={[styles.optionIcon, styles.optionIconPrimary]}>
            <Ionicons name="sparkles" size={20} color={Colors.dark.buttonText} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitlePrimary}>Give feedback now</Text>
            <Text style={styles.optionSub}>Log the session and chat with AI Coach</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.buttonText + "80"} />
        </Pressable>

        <Pressable
          style={styles.option}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNextSession();
          }}
        >
          <View style={[styles.optionIcon, styles.optionIconCyan]}>
            <Ionicons name="play-circle-outline" size={20} color={Colors.dark.xpCyan} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Next session starting</Text>
            <Text style={styles.optionSub}>Skip — jump straight to the next session</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
        </Pressable>

        <Pressable style={styles.option} onPress={handleTonightReminder}>
          <View style={[styles.optionIcon, styles.optionIconOrange]}>
            <Ionicons name="moon-outline" size={20} color={Colors.dark.orange} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Remind me tonight</Text>
            <Text style={styles.optionSub}>{"We'll nudge you at 20:00 to complete this review"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    zIndex: 998,
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.dark.cardBackground,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.md,
  },
  optionPrimary: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  optionIconPrimary: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  optionIconCyan: {
    backgroundColor: Colors.dark.xpCyan + "18",
  },
  optionIconOrange: {
    backgroundColor: Colors.dark.orange + "18",
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  optionTitlePrimary: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.buttonText,
    marginBottom: 2,
  },
  optionSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
});
