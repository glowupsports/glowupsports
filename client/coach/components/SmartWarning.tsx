import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

type WarningLevel = "info" | "warning" | "critical";

interface SmartWarningProps {
  message: string;
  level: WarningLevel;
  visible: boolean;
  onDismiss: () => void;
  autoDismiss?: boolean;
  duration?: number;
}

const LEVEL_CONFIG = {
  info: {
    icon: "information-circle" as const,
    color: Colors.dark.xpCyan,
    bgColor: "rgba(0, 212, 255, 0.15)",
  },
  warning: {
    icon: "warning" as const,
    color: Colors.dark.orange,
    bgColor: "rgba(255, 133, 27, 0.15)",
  },
  critical: {
    icon: "alert-circle" as const,
    color: Colors.dark.error,
    bgColor: "rgba(255, 68, 68, 0.15)",
  },
};

export function SmartWarning({
  message,
  level,
  visible,
  onDismiss,
  autoDismiss = true,
  duration = 4000,
}: SmartWarningProps) {
  const [opacity] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(-20));

  useEffect(() => {
    if (visible) {
      if (Platform.OS !== "web") {
        if (level === "critical") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (level === "warning") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (autoDismiss && level !== "critical") {
        const timer = setTimeout(() => {
          handleDismiss();
        }, duration);
        return () => clearTimeout(timer);
      }
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -20,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -20,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  const config = LEVEL_CONFIG[level];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: config.bgColor,
          borderColor: config.color,
        },
      ]}
    >
      <Ionicons name={config.icon} size={20} color={config.color} />
      <Text style={[styles.message, { color: config.color }]}>{message}</Text>
      <Pressable onPress={handleDismiss} style={styles.dismissButton}>
        <Ionicons name="close" size={18} color={config.color} />
      </Pressable>
    </Animated.View>
  );
}

interface WarningState {
  message: string;
  level: WarningLevel;
  id: string;
}

interface UseSmartWarningsReturn {
  warnings: WarningState[];
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  showCritical: (message: string) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

export function useSmartWarnings(): UseSmartWarningsReturn {
  const [warnings, setWarnings] = useState<WarningState[]>([]);

  const addWarning = (message: string, level: WarningLevel) => {
    const id = `${Date.now()}-${Math.random()}`;
    setWarnings((prev) => [...prev, { message, level, id }]);
    return id;
  };

  const showInfo = (message: string) => addWarning(message, "info");
  const showWarning = (message: string) => addWarning(message, "warning");
  const showCritical = (message: string) => addWarning(message, "critical");

  const dismiss = (id: string) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  };

  const dismissAll = () => {
    setWarnings([]);
  };

  return { warnings, showInfo, showWarning, showCritical, dismiss, dismissAll };
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  message: {
    flex: 1,
    ...Typography.body,
  },
  dismissButton: {
    padding: Spacing.xs,
  },
});

export default SmartWarning;
