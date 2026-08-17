import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, DeviceEventEmitter } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAppMode, AppMode } from "@/context/AppModeContext";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { useSupervisorMode } from "@/context/SupervisorModeContext";
import { useAuth } from "@/coach/context/AuthContext";

const HOME_VERSION_KEY = "player:home:version";

const PANEL_WIDTH = 200;

const modeConfig: Record<AppMode, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  platform: { icon: "globe", label: "Platform", color: "#9B59B6" },
  academy_owner: { icon: "business", label: "Academy", color: Colors.dark.gold },
  admin: { icon: "settings", label: "Admin", color: Colors.dark.orange },
  coach: { icon: "tennisball", label: "Coach", color: Colors.dark.primary },
  player: { icon: "person", label: "Player", color: Colors.dark.xpCyan },
  service_provider: { icon: "construct", label: "Provider", color: Colors.dark.orange },
  diagnostic: { icon: "layers", label: "Player V1", color: "#E74C3C" },
};

export default function CollapsibleModeSwitcher() {
  const insets = useSafeAreaInsets();
  const { mode, setMode, availableModes } = useAppMode();
  const { setShowCoachPicker, setSupervisorCoach } = useSupervisorMode();
  const { user } = useAuth();
  const [showBackdrop, setShowBackdrop] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [homeVersion, setHomeVersion] = useState<"v2" | "v3">("v2");
  const slideX = useSharedValue(-PANEL_WIDTH);

  // Track the stored home-version so we can show V3 as active
  useEffect(() => {
    AsyncStorage.getItem(HOME_VERSION_KEY)
      .then((v) => setHomeVersion(v === "v3" ? "v3" : "v2"))
      .catch(() => {});
  }, [isOpen]); // re-read each time the panel opens

  // Task #1313 — Hooks must run unconditionally; hoist useAnimatedStyle above
  // the early return below.
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
  }));

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

  const closeAndRun = (fn?: () => void) => {
    setIsOpen(false);
    slideX.value = withSpring(-PANEL_WIDTH, { damping: 20, stiffness: 200 }, () => {
      runOnJS(setShowBackdrop)(false);
      if (fn) runOnJS(fn)();
    });
  };

  const handleModeChange = (newMode: AppMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Academy owners get a coach picker instead of directly switching to coach mode
    if (newMode === "coach" && (user?.role === "academy_owner" || user?.role === "owner" || user?.role === "platform_owner")) {
      setSupervisorCoach(null);
      closeAndRun(() => setShowCoachPicker(true));
      return;
    }
    // When switching to Player (classic), reset home version to v2
    if (newMode === "player") {
      AsyncStorage.setItem(HOME_VERSION_KEY, "v2").catch(() => {});
      setHomeVersion("v2");
      DeviceEventEmitter.emit("home:version:changed");
    }
    setMode(newMode);
    closeAndRun();
  };

  const handleSwitchToV3 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    AsyncStorage.setItem(HOME_VERSION_KEY, "v3").catch(() => {});
    setHomeVersion("v3");
    // Ensure we're in player mode first
    setMode("player");
    DeviceEventEmitter.emit("home:version:changed");
    closeAndRun();
  };

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
              // "player" shows as active only when in v2 mode; v3 has its own row
              const isActive = mode === m && !(m === "player" && homeVersion === "v3");
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

            {/* Player V3 — new neon design, only visible when player mode is available */}
            {availableModes.includes("player") && (
              <>
                <View style={styles.v3Divider} />
                <Pressable
                  style={[
                    styles.modeButton,
                    mode === "player" && homeVersion === "v3" && { backgroundColor: "#9B5CFF" },
                  ]}
                  onPress={handleSwitchToV3}
                >
                  <Ionicons
                    name="sparkles"
                    size={16}
                    color={mode === "player" && homeVersion === "v3" ? Colors.dark.backgroundRoot : "#9B5CFF"}
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      mode === "player" && homeVersion === "v3" && styles.modeLabelActive,
                    ]}
                  >
                    Player V3
                  </Text>
                  {mode === "player" && homeVersion === "v3" ? (
                    <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                  ) : (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </View>
                  )}
                </Pressable>
              </>
            )}
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
  v3Divider: {
    height: 1,
    backgroundColor: "rgba(155,92,255,0.20)",
    marginVertical: 4,
  },
  newBadge: {
    backgroundColor: "rgba(155,92,255,0.18)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: "800" as const,
    color: "#9B5CFF",
    letterSpacing: 0.5,
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
