import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { useEffect } from "react";
import { Colors, Spacing } from "@/constants/theme";
import { useOfflineSync } from "@/lib/useOfflineSync";

const theme = Colors.dark;

export default function SyncStatusIndicator() {
  const {
    syncStatus,
    hasPendingSync,
    hasIssues,
    syncNow,
    retryAll,
    failedActions,
    conflicts,
  } = useOfflineSync();

  const rotation = useSharedValue(0);

  useEffect(() => {
    if (syncStatus.isSyncing) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000 }),
        -1,
        false
      );
    } else {
      rotation.value = 0;
    }
  }, [syncStatus.isSyncing]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handlePress = () => {
    if (hasIssues) {
      const failedCount = failedActions.length;
      const conflictCount = conflicts.length;
      
      Alert.alert(
        "Sync Issues",
        `${failedCount} failed action(s), ${conflictCount} conflict(s)`,
        [
          { text: "Dismiss", style: "cancel" },
          {
            text: "Retry All",
            onPress: async () => {
              await retryAll();
            },
          },
        ]
      );
    } else if (hasPendingSync) {
      syncNow();
    }
  };

  if (!hasPendingSync && !hasIssues && !syncStatus.isSyncing) {
    return null;
  }

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      {syncStatus.isSyncing ? (
        <Animated.View style={animatedStyle}>
          <Feather name="refresh-cw" size={16} color={theme.primary} />
        </Animated.View>
      ) : hasIssues ? (
        <View style={styles.errorBadge}>
          <Feather name="alert-triangle" size={14} color={theme.orange} />
          <Text style={styles.badgeText}>
            {failedActions.length + conflicts.length}
          </Text>
        </View>
      ) : hasPendingSync ? (
        <View style={styles.pendingBadge}>
          <Feather name="cloud-off" size={14} color={theme.tabIconDefault} />
          <Text style={styles.pendingText}>{syncStatus.pendingCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    marginRight: Spacing.sm,
  },
  errorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  badgeText: {
    color: theme.orange,
    fontSize: 12,
    fontWeight: "600",
  },
  pendingText: {
    color: theme.tabIconDefault,
    fontSize: 12,
  },
});
