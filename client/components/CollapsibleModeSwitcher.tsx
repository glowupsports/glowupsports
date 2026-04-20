import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAppMode, AppMode } from "@/context/AppModeContext";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const PANEL_WIDTH = 200;

const modeConfig: Record<AppMode, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  platform: { icon: "globe", label: "Platform", color: "#9B59B6" },
  academy_owner: { icon: "business", label: "Academy", color: Colors.dark.gold },
  admin: { icon: "settings", label: "Admin", color: Colors.dark.orange },
  coach: { icon: "tennisball", label: "Coach", color: Colors.dark.primary },
  player: { icon: "person", label: "Player", color: Colors.dark.xpCyan },
  service_provider: { icon: "construct", label: "Provider", color: Colors.dark.orange },
};

export default function CollapsibleModeSwitcher() {
  const insets = useSafeAreaInsets();
  const { mode, setMode, availableModes } = useAppMode();
  const [showBackdrop, setShowBackdrop] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const slideX = useSharedValue(-PANEL_WIDTH);

  if (availableModes.length <= 1) {
    return null;
  }

  const openPanel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowBackdrop(true);
    setIsOpen(true);
    slideX.value = withSpring(0, {
      damping: 20,
      stiffness: 200,
    });
  };

  const closePanel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsOpen(false);
    slideX.value = withSpring(-PANEL_WIDTH, {
      damping: 20,
      stiffness: 200,
    }, () => {
      runOnJS(setShowBackdrop)(false);
    });
  };

  const togglePanel = () => {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  };

  const handleModeChange = (newMode: AppMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode(newMode);
    setIsOpen(false);
    slideX.value = withSpring(-PANEL_WIDTH, {
      damping: 20,
      stiffness: 200,
    }, () => {
      runOnJS(setShowBackdrop)(false);
    });
  };

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

  const currentConfig = modeConfig[mode];

  return (
    <>
      {showBackdrop ? (
        <Pressable style={styles.backdrop} onPress={closePanel} />
      ) : null}

      <Animated.View style={[styles.panel, { top: insets.top + Spacing.md }, panelStyle]}>
        <View style={styles.panelContent}>
          <View style={styles.panelHeader}>
            <Ionicons name="apps" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.panelTitle}>Switch Mode</Text>
          </View>
          <View style={styles.modeList}>
            {availableModes.map((m) => {
              const config = modeConfig[m];
              const isActive = mode === m;
              return (
                <Pressable
                  key={m}
                  style={[
                    styles.modeButton,
                    isActive && { backgroundColor: config.color },
                  ]}
                  onPress={() => handleModeChange(m)}
                >
                  <Ionicons
                    name={config.icon}
                    size={16}
                    color={isActive ? Colors.dark.backgroundRoot : config.color}
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      isActive && styles.modeLabelActive,
                    ]}
                  >
                    {config.label}
                  </Text>
                  {isActive ? (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={Colors.dark.buttonText}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>

      <Pressable
        style={[styles.toggleButton, { top: insets.top + Spacing.md }]}
        onPress={togglePanel}
      >
        <View style={[styles.toggleButtonInner, { backgroundColor: currentConfig.color + "40" }]}>
          <Ionicons
            name={isOpen ? "chevron-back" : "chevron-forward"}
            size={16}
            color={currentConfig.color}
          />
        </View>
      </Pressable>
    </>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  panel: {
    position: "absolute",
    left: 0,
    width: PANEL_WIDTH,
    zIndex: 1001,
  },
  panelContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopRightRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: Colors.dark.headerBorder,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  panelTitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  modeList: {
    gap: Spacing.xs,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  modeLabel: {
    ...Typography.body,
    flex: 1,
    color: Colors.dark.text,
  },
  modeLabelActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  toggleButton: {
    position: "absolute",
    left: 0,
    zIndex: 1002,
  },
  toggleButtonInner: {
    width: 28,
    height: 44,
    borderTopRightRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
}));
