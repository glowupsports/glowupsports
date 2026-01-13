import React, { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  FadeInUp,
  ZoomIn,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes } from "@/constants/theme";
import { TimeSlot } from "./TimeSlotGrid";

interface BookingConfirmationCardProps {
  selectedDate: Date;
  selectedSlot: TimeSlot;
  xpReward?: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const formatDate = (date: Date): string => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
};

export function BookingConfirmationCard({
  selectedDate,
  selectedSlot,
  xpReward = 50,
  onConfirm,
  onCancel,
  isLoading = false,
}: BookingConfirmationCardProps) {
  const buttonScale = useSharedValue(1);
  const xpPulse = useSharedValue(1);

  useEffect(() => {
    xpPulse.value = withSequence(
      withDelay(300, withSpring(1.1, { damping: 10 })),
      withSpring(1, { damping: 10 })
    );
  }, []);

  const handleConfirm = () => {
    buttonScale.value = withSequence(
      withSpring(0.95, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const xpAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: xpPulse.value }],
  }));

  return (
    <Animated.View entering={FadeInUp.duration(400)} style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
        style={styles.card}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Confirm Booking</Text>
          <Text style={styles.subtitle}>Tap 3 of 3</Text>
        </View>

        <View style={styles.details}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar" size={20} color={Colors.dark.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(selectedDate)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="time" size={20} color={Colors.dark.xpCyan} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{selectedSlot.time}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="tennisball" size={20} color={Colors.dark.gold} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Court</Text>
              <Text style={styles.detailValue}>{selectedSlot.courtName || "Court"}</Text>
            </View>
          </View>

          {selectedSlot.price && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="card" size={20} color={Colors.dark.primary} />
              </View>
              <View>
                <Text style={styles.detailLabel}>Price</Text>
                <Text style={styles.detailValue}>
                  {selectedSlot.currency || "€"}{selectedSlot.price}
                </Text>
              </View>
            </View>
          )}
        </View>

        <Animated.View entering={ZoomIn.delay(200).duration(300)} style={styles.xpContainer}>
          <Animated.View style={xpAnimatedStyle}>
            <LinearGradient
              colors={[Colors.dark.xpCyan + "30", Colors.dark.primary + "20"]}
              style={styles.xpBadge}
            >
              <Ionicons name="flash" size={18} color={Colors.dark.xpCyan} />
              <Text style={styles.xpText}>+{xpReward} XP</Text>
              <Text style={styles.xpLabel}>Booking Reward</Text>
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.cancelButton} disabled={isLoading}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <AnimatedPressable
            onPress={handleConfirm}
            style={[buttonAnimatedStyle]}
            disabled={isLoading}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primary + "DD"]}
              style={styles.confirmButton}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.dark.text} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.dark.text} />
                  <Text style={styles.confirmText}>Book Now</Text>
                </>
              )}
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  card: {
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  details: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  detailValue: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  xpContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  xpText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  xpLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  confirmButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  confirmText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
  },
});

export default BookingConfirmationCard;
