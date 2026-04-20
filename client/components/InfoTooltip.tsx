import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface InfoTooltipProps {
  title: string;
  description: string;
  size?: number;
  color?: string;
  iconName?: string;
}

export function InfoTooltip({
  title,
  description,
  size = 16,
  color = TextColors.muted,
  iconName = "help-circle",
}: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <>
      <Pressable
        onPress={handleOpen}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.trigger}
      >
        <Ionicons
          name={iconName as keyof typeof Ionicons.glyphMap}
          size={size}
          color={color}
        />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.tooltipCard}
          >
            <View style={styles.tooltipHeader}>
              <View style={styles.iconBubble}>
                <Ionicons
                  name="information-circle"
                  size={20}
                  color={GlowColors.primary}
                />
              </View>
              <Text style={styles.tooltipTitle}>{title}</Text>
            </View>
            <Text style={styles.tooltipDescription}>{description}</Text>
            <Pressable onPress={handleClose} style={styles.gotItButton}>
              <Text style={styles.gotItText}>Got it</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

export function InfoTooltipInline({
  label,
  title,
  description,
  labelStyle,
}: {
  label: string;
  title: string;
  description: string;
  labelStyle?: any;
}) {
  return (
    <View style={styles.inlineRow}>
      <Text style={[styles.inlineLabel, labelStyle]}>{label}</Text>
      <InfoTooltip title={title} description={description} />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  trigger: {
    marginLeft: Spacing.xs,
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  tooltipCard: {
    width: "100%",
    maxWidth: SCREEN_WIDTH - 48,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: Spacing.xl,
  },
  tooltipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${GlowColors.primary}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  tooltipTitle: {
    ...Typography.h3,
    color: TextColors.primary,
    flex: 1,
  },
  tooltipDescription: {
    ...Typography.body,
    color: TextColors.secondary,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  gotItButton: {
    alignSelf: "flex-end",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: `${GlowColors.primary}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}30`,
  },
  gotItText: {
    ...Typography.bodyBold,
    color: GlowColors.primary,
    fontSize: 14,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineLabel: {
    ...Typography.bodyBold,
    color: TextColors.primary,
  },
}));
