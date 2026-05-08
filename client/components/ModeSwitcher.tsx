import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAppMode, AppMode } from "@/context/AppModeContext";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import { useSupervisorMode } from "@/context/SupervisorModeContext";
import { useAuth } from "@/coach/context/AuthContext";

interface ModeSwitcherProps {
  compact?: boolean;
}

const modeConfig: Record<AppMode, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  platform: { icon: "globe", label: "Platform", color: "#9B59B6" },
  academy_owner: { icon: "business", label: "Academy", color: Colors.dark.gold },
  admin: { icon: "settings", label: "Admin", color: Colors.dark.orange },
  coach: { icon: "tennisball", label: "Coach", color: Colors.dark.primary },
  player: { icon: "person", label: "Player", color: Colors.dark.xpCyan },
  service_provider: { icon: "construct", label: "Provider", color: Colors.dark.orange },
  diagnostic: { icon: "layers", label: "Player V1", color: "#E74C3C" },
};

export default function ModeSwitcher({ compact = false }: ModeSwitcherProps) {
  const { mode, setMode, availableModes } = useAppMode();
  const { setShowCoachPicker, setSupervisorCoach } = useSupervisorMode();
  const { user } = useAuth();

  if (availableModes.length <= 1) {
    return null;
  }

  const handleModeChange = (newMode: AppMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Academy owners get a coach picker instead of directly switching to coach mode
    if (newMode === "coach" && (user?.role === "academy_owner" || user?.role === "owner" || user?.role === "platform_owner")) {
      setSupervisorCoach(null);
      setShowCoachPicker(true);
      return;
    }
    setMode(newMode);
  };

  const _currentConfig = modeConfig[mode];

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        {availableModes.map((m) => {
          const config = modeConfig[m];
          const isActive = mode === m;
          return (
            <Pressable
              key={m}
              style={[
                styles.compactButton,
                isActive && { backgroundColor: config.color },
              ]}
              onPress={() => handleModeChange(m)}
            >
              <Ionicons
                name={config.icon}
                size={18}
                color={isActive ? Colors.dark.backgroundRoot : Colors.dark.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {availableModes.map((m) => {
        const config = modeConfig[m];
        const isActive = mode === m;
        return (
          <Pressable
            key={m}
            style={[
              styles.button,
              isActive && { backgroundColor: config.color },
            ]}
            onPress={() => handleModeChange(m)}
          >
            <Ionicons
              name={config.icon}
              size={16}
              color={isActive ? Colors.dark.backgroundRoot : Colors.dark.text}
            />
            <Text
              style={[
                styles.buttonText,
                isActive && styles.buttonTextActive,
              ]}
            >
              {config.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  buttonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  buttonTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  compactContainer: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    padding: 4,
    gap: 4,
  },
  compactButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
}));
