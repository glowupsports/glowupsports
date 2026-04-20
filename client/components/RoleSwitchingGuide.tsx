import React from "react";
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
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Spacing,
  BorderRadius,
  Typography,
  TextColors,
  GlowColors,
Backgrounds, } from "@/constants/theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

interface RoleSwitchingGuideProps {
  visible: boolean;
  onClose: () => void;
  availableRoles: string[];
}

const ROLE_INFO: Record<
  string,
  {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    description: string;
    color: string;
  }
> = {
  platform: {
    icon: "globe",
    label: "Platform Owner",
    description:
      "Full platform control. Monitor all academies, billing, and system health.",
    color: "#9B59B6",
  },
  academy_owner: {
    icon: "business",
    label: "Academy Owner",
    description:
      "Manage your academy. Add coaches, players, courts, and configure settings.",
    color: "#FFD700",
  },
  admin: {
    icon: "settings",
    label: "Admin",
    description:
      "Day-to-day operations. Handle scheduling, check-ins, and attendance.",
    color: "#FF851B",
  },
  coach: {
    icon: "tennisball",
    label: "Coach",
    description:
      "Coaching view. Manage sessions, give feedback, and track player progress.",
    color: "#C8FF3D",
  },
  player: {
    icon: "person",
    label: "Player",
    description:
      "Player experience. View your training, progress, and connect with others.",
    color: "#00D4FF",
  },
};

export function RoleSwitchingGuide({
  visible,
  onClose,
  availableRoles,
}: RoleSwitchingGuideProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Role Switching</Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={TextColors.secondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.subtitle}>Your Available Roles</Text>

            {availableRoles.map((role) => {
              const info = ROLE_INFO[role];
              if (!info) return null;
              return (
                <View key={role} style={styles.roleCard}>
                  <View
                    style={[
                      styles.roleIconContainer,
                      { backgroundColor: `${info.color}20` },
                    ]}
                  >
                    <Ionicons name={info.icon} size={22} color={info.color} />
                  </View>
                  <View style={styles.roleTextContainer}>
                    <Text style={styles.roleLabel}>{info.label}</Text>
                    <Text style={styles.roleDescription}>
                      {info.description}
                    </Text>
                  </View>
                </View>
              );
            })}

            <View style={styles.tipCard}>
              <Ionicons
                name="swap-horizontal"
                size={20}
                color={GlowColors.primary}
              />
              <Text style={styles.tipText}>
                Tap the mode switcher at the top of any screen to change your
                view.
              </Text>
            </View>
          </ScrollView>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  sheetTitle: {
    ...Typography.h2,
    color: TextColors.primary,
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
    paddingBottom: Spacing["2xl"],
  },
  subtitle: {
    ...Typography.caption,
    color: TextColors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  roleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleLabel: {
    ...Typography.body,
    fontWeight: "600",
    color: TextColors.primary,
    marginBottom: 4,
  },
  roleDescription: {
    ...Typography.small,
    color: TextColors.secondary,
    lineHeight: 20,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${GlowColors.primary}10`,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}25`,
    gap: Spacing.md,
  },
  tipText: {
    ...Typography.small,
    color: TextColors.secondary,
    flex: 1,
    lineHeight: 20,
  },
}));

export default RoleSwitchingGuide;
