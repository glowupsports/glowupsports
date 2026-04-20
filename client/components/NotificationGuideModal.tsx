import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import Animated, {
  FadeInDown,
  FadeIn,
} from "react-native-reanimated";
import {
  Spacing,
  BorderRadius,
  Typography,
  GlowColors,
  TextColors,
  FunctionColors,
Backgrounds, } from "@/constants/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const STORAGE_KEY_PREFIX = "@glow_notification_guide_seen_";

interface NotificationType {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  description: string;
  frequency: string;
  color: string;
}

const COACH_NOTIFICATIONS: NotificationType[] = [
  {
    icon: "alarm",
    name: "Session Reminders",
    description: "Get notified before your upcoming coaching sessions",
    frequency: "Before each session",
    color: FunctionColors.planning,
  },
  {
    icon: "person-add",
    name: "New Player Assignments",
    description: "When a new player is assigned to your roster",
    frequency: "As it happens",
    color: FunctionColors.success,
  },
  {
    icon: "checkmark-circle",
    name: "Attendance Reminders",
    description: "Reminders to mark attendance for completed sessions",
    frequency: "After each session",
    color: FunctionColors.social,
  },
  {
    icon: "swap-horizontal",
    name: "Schedule Changes",
    description: "Alerts when sessions are rescheduled or cancelled",
    frequency: "As it happens",
    color: FunctionColors.error,
  },
];

const PLAYER_NOTIFICATIONS: NotificationType[] = [
  {
    icon: "alarm",
    name: "Session Reminders",
    description: "Get notified before your upcoming training sessions",
    frequency: "Before each session",
    color: FunctionColors.planning,
  },
  {
    icon: "chatbubble",
    name: "Feedback Received",
    description: "When your coach leaves feedback on your performance",
    frequency: "After assessments",
    color: FunctionColors.info,
  },
  {
    icon: "flash",
    name: "XP Earned",
    description: "Celebrate when you earn experience points",
    frequency: "After activities",
    color: GlowColors.primary,
  },
  {
    icon: "trophy",
    name: "Level Up Notifications",
    description: "When you reach a new player level or milestone",
    frequency: "On achievement",
    color: FunctionColors.social,
  },
  {
    icon: "wallet",
    name: "Credit Expiry Warnings",
    description: "Alerts when your session credits are about to expire",
    frequency: "7 days before expiry",
    color: FunctionColors.error,
  },
];

const ADMIN_NOTIFICATIONS: NotificationType[] = [
  {
    icon: "person-add",
    name: "New Registrations",
    description: "When a new player or coach registers at your academy",
    frequency: "As it happens",
    color: FunctionColors.success,
  },
  {
    icon: "calendar",
    name: "Session Alerts",
    description: "Important updates about session capacity and scheduling",
    frequency: "Daily digest",
    color: FunctionColors.planning,
  },
  {
    icon: "card",
    name: "Payment Notifications",
    description: "Payment confirmations, failures, and refund requests",
    frequency: "As it happens",
    color: FunctionColors.social,
  },
  {
    icon: "warning",
    name: "System Alerts",
    description: "Critical system notifications and maintenance updates",
    frequency: "As needed",
    color: FunctionColors.error,
  },
];

function getNotificationsForRole(role: string): NotificationType[] {
  switch (role.toLowerCase()) {
    case "coach":
      return COACH_NOTIFICATIONS;
    case "player":
      return PLAYER_NOTIFICATIONS;
    case "admin":
    case "academy_owner":
    case "platform_owner":
      return ADMIN_NOTIFICATIONS;
    default:
      return PLAYER_NOTIFICATIONS;
  }
}

function getRoleLabel(role: string): string {
  switch (role.toLowerCase()) {
    case "coach":
      return "Coach";
    case "player":
      return "Player";
    case "admin":
    case "academy_owner":
      return "Admin";
    case "platform_owner":
      return "Owner";
    default:
      return "Player";
  }
}

export interface NotificationGuideModalProps {
  visible: boolean;
  onClose: () => void;
  role: string;
}

export function NotificationGuideModal({
  visible,
  onClose,
  role,
}: NotificationGuideModalProps) {
  const notifications = getNotificationsForRole(role);
  const roleLabel = getRoleLabel(role);
  const storageKey = `${STORAGE_KEY_PREFIX}${role.toLowerCase()}`;

  useEffect(() => {
    if (visible) {
      AsyncStorage.setItem(storageKey, "true").catch(() => {});
    }
  }, [visible, storageKey]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          <Animated.View entering={FadeIn.duration(300)} style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Ionicons name="notifications" size={24} color={GlowColors.primary} />
              <View>
                <Text style={styles.sheetTitle}>Notification Guide</Text>
                <Text style={styles.sheetSubtitle}>
                  As a {roleLabel}, you'll receive these notifications
                </Text>
              </View>
            </View>
            <Pressable style={styles.closeButton} onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={TextColors.secondary} />
            </Pressable>
          </Animated.View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {notifications.map((notif, index) => (
              <Animated.View
                key={notif.name}
                entering={FadeInDown.delay(index * 80).duration(300)}
                style={styles.notifCard}
              >
                <View style={[styles.notifIconContainer, { backgroundColor: `${notif.color}20` }]}>
                  <Ionicons name={notif.icon} size={22} color={notif.color} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={styles.notifName}>{notif.name}</Text>
                  <Text style={styles.notifDescription}>{notif.description}</Text>
                  <View style={styles.frequencyRow}>
                    <Ionicons name="time-outline" size={12} color={TextColors.muted} />
                    <Text style={styles.frequencyText}>{notif.frequency}</Text>
                  </View>
                </View>
              </Animated.View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.gotItButton} onPress={handleClose}>
              <Text style={styles.gotItText}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    height: SCREEN_HEIGHT * 0.6,
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: TextColors.disabled,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    flex: 1,
    marginRight: Spacing.sm,
  },
  sheetTitle: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  sheetSubtitle: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  notifIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  notifContent: {
    flex: 1,
  },
  notifName: {
    ...Typography.small,
    fontWeight: "600",
    color: TextColors.primary,
  },
  notifDescription: {
    ...Typography.caption,
    color: TextColors.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  frequencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
  },
  frequencyText: {
    ...Typography.caption,
    color: TextColors.muted,
    fontSize: 10,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  gotItButton: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  gotItText: {
    ...Typography.body,
    fontWeight: "600",
    color: "#000000",
  },
}));

export default NotificationGuideModal;
