import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";

import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  Backgrounds,
  TextColors,
  Shadows,
} from "@/constants/theme";

export interface UpdateSheetProps {
  iconName: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  releaseNotes?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  primaryAccessibilityLabel?: string;
  secondaryAccessibilityLabel?: string;
}

/**
 * Shared dismissible bottom sheet used by both update flows:
 *  - `ForceUpdateGate` → soft store-update prompt
 *  - `UpdateController` → OTA "update ready" prompt
 *
 * Visuals are extracted verbatim from the original `SoftUpdatePrompt`
 * inside `ForceUpdateGate.tsx` so both gates share one design language.
 */
export function UpdateSheet({
  iconName,
  title,
  subtitle,
  releaseNotes,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  primaryAccessibilityLabel,
  secondaryAccessibilityLabel,
}: UpdateSheetProps) {
  const insets = useSafeAreaInsets();

  const handleRequestClose = () => {
    if (onSecondary) onSecondary();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleRequestClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + Spacing.lg },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.iconCircle}>
            <Feather name={iconName} size={28} color={GlowColors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {releaseNotes ? (
            <Text style={styles.releaseNotes}>{releaseNotes}</Text>
          ) : null}

          <Pressable
            onPress={onPrimary}
            disabled={primaryDisabled}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.primaryButtonPressed : null,
              primaryDisabled ? styles.primaryButtonDisabled : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={primaryAccessibilityLabel ?? primaryLabel}
            accessibilityState={{ disabled: !!primaryDisabled }}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButtonGradient}
            >
              <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
            </LinearGradient>
          </Pressable>

          {secondaryLabel && onSecondary ? (
            <Pressable
              onPress={onSecondary}
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel={secondaryAccessibilityLabel ?? secondaryLabel}
            >
              <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Backgrounds.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    alignItems: "center",
    ...Shadows.glow,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  releaseNotes: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  primaryButton: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: TextColors.primary,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  secondaryButtonText: {
    color: Colors.dark.textMuted,
    fontWeight: "500",
    fontSize: 14,
  },
});
