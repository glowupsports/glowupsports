import React, { useCallback } from "react";
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
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface SettingsArea {
  id: string;
  icon: string;
  title: string;
  description: string;
  whyImportant: string;
  actionLabel: string;
  onAction: () => void;
  isConfigured?: boolean;
}

export interface SettingsWalkthroughModalProps {
  visible: boolean;
  onClose: () => void;
  areas: SettingsArea[];
}

function AreaCard({ area, index }: { area: SettingsArea; index: number }) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300).delay(index * 60)}
    >
      <AnimatedPressable
        style={[styles.areaCard, area.isConfigured && styles.areaCardConfigured, animatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          area.onAction();
        }}
      >
        <View style={styles.areaCardHeader}>
          <View style={styles.areaCardLeft}>
            <View style={[styles.areaIconContainer, area.isConfigured && styles.areaIconConfigured]}>
              {area.isConfigured ? (
                <Ionicons name="checkmark" size={20} color={"rgba(255, 255, 255, 0.06)"} />
              ) : (
                <Ionicons
                  name={area.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={GlowColors.primary}
                />
              )}
            </View>
            <View style={styles.areaTextContainer}>
              <Text style={[styles.areaTitle, area.isConfigured && styles.areaTitleConfigured]}>
                {area.title}
              </Text>
              <Text style={styles.areaDescription}>{area.description}</Text>
            </View>
          </View>
        </View>

        <View style={styles.whySection}>
          <View style={styles.whyLabelRow}>
            <Ionicons name="bulb-outline" size={12} color={TextColors.muted} />
            <Text style={styles.whyLabel}>Why this matters</Text>
          </View>
          <Text style={styles.whyText}>{area.whyImportant}</Text>
        </View>

        {!area.isConfigured ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              area.onAction();
            }}
            style={styles.actionButton}
          >
            <Text style={styles.actionButtonText}>{area.actionLabel}</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.dark.buttonText} />
          </Pressable>
        ) : (
          <View style={styles.configuredBadge}>
            <Ionicons name="checkmark-circle" size={16} color={FunctionColors.success} />
            <Text style={styles.configuredText}>Configured</Text>
          </View>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
}

export function SettingsWalkthroughModal({
  visible,
  onClose,
  areas,
}: SettingsWalkthroughModalProps) {
  const configuredCount = areas.filter((a) => a.isConfigured).length;
  const totalCount = areas.length;
  const progress = totalCount > 0 ? configuredCount / totalCount : 0;

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
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconContainer}>
                <Ionicons name="settings" size={20} color={GlowColors.primary} />
              </View>
              <View>
                <Text style={styles.sheetTitle}>Academy Setup Guide</Text>
                <Text style={styles.progressText}>
                  {configuredCount}/{totalCount} configured
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={TextColors.secondary} />
            </Pressable>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarTrack}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progress * 100}%`,
                    backgroundColor:
                      configuredCount === totalCount
                        ? FunctionColors.success
                        : GlowColors.primary,
                  },
                ]}
              />
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {areas.map((area, index) => (
              <AreaCard key={area.id} area={area} index={index} />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    height: SCREEN_HEIGHT * 0.8,
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
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${GlowColors.primary}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetTitle: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  progressText: {
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
  progressBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: Backgrounds.surface,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
    gap: Spacing.md,
  },
  areaCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: Spacing.lg,
  },
  areaCardConfigured: {
    borderColor: `${FunctionColors.success}30`,
    opacity: 0.85,
  },
  areaCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  areaCardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    flex: 1,
  },
  areaIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${GlowColors.primary}15`,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  areaIconConfigured: {
    backgroundColor: FunctionColors.success,
  },
  areaTextContainer: {
    flex: 1,
  },
  areaTitle: {
    ...Typography.h4,
    color: TextColors.primary,
    marginBottom: 4,
  },
  areaTitleConfigured: {
    color: TextColors.secondary,
  },
  areaDescription: {
    ...Typography.small,
    color: TextColors.muted,
    lineHeight: 20,
  },
  whySection: {
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  whyLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  whyLabel: {
    ...Typography.caption,
    color: TextColors.muted,
    fontWeight: "600",
  },
  whyText: {
    ...Typography.caption,
    color: TextColors.secondary,
    lineHeight: 18,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
  },
  actionButtonText: {
    ...Typography.small,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  configuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
  },
  configuredText: {
    ...Typography.caption,
    color: FunctionColors.success,
    fontWeight: "600",
  },
});

export default SettingsWalkthroughModal;
