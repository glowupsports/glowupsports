import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface TaskAlert {
  id: string;
  type: "no_show" | "late" | "payment" | "session" | "urgent";
  title: string;
  description: string;
  time?: string;
  actionLabel?: string;
}

interface TaskAlertsListProps {
  alerts: TaskAlert[];
  onAlertPress?: (id: string) => void;
  onAction?: (id: string) => void;
}

const ALERT_CONFIGS: Record<TaskAlert["type"], { bg: string; border: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }> = {
  urgent:  { bg: Colors.dark.error + "15",   border: Colors.dark.error,   icon: "warning",       color: Colors.dark.error },
  no_show: { bg: Colors.dark.orange + "15",  border: Colors.dark.orange,  icon: "person-remove", color: Colors.dark.orange },
  late:    { bg: Colors.dark.gold + "15",    border: Colors.dark.gold,    icon: "time",          color: Colors.dark.gold },
  payment: { bg: Colors.dark.xpCyan + "15",  border: Colors.dark.xpCyan,  icon: "cash",          color: Colors.dark.xpCyan },
  session: { bg: Colors.dark.primary + "15", border: Colors.dark.primary, icon: "calendar",      color: Colors.dark.primary },
};

function AlertRow({ alert, index, onAlertPress, onAction }: {
  alert: TaskAlert;
  index: number;
  onAlertPress?: (id: string) => void;
  onAction?: (id: string) => void;
}) {
  const cfg = ALERT_CONFIGS[alert.type];
  const translateY = useSharedValue(12);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 60;
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 200 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 250 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={[styles.alertRow, { borderLeftColor: cfg.border }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onAlertPress?.(alert.id);
        }}
      >
        <View style={[styles.alertIcon, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={16} color={cfg.color} />
        </View>

        <View style={styles.alertContent}>
          <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
          <Text style={styles.alertDesc} numberOfLines={1}>{alert.description}</Text>
        </View>

        {alert.actionLabel ? (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: cfg.bg }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAction?.(alert.id);
            }}
          >
            <Text style={[styles.actionText, { color: cfg.color }]}>{alert.actionLabel}</Text>
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
        )}
      </Pressable>
    </Animated.View>
  );
}

export function TaskAlertsList({
  alerts,
  onAlertPress,
  onAction,
}: TaskAlertsListProps) {
  const urgentAlerts = alerts.filter(a => a.type === "urgent");
  const otherAlerts = alerts.filter(a => a.type !== "urgent");
  const sortedAlerts = [...urgentAlerts, ...otherAlerts];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="alert-circle" size={16} color={Colors.dark.orange} />
          </View>
          <Text style={styles.title}>Needs Attention</Text>
          {urgentAlerts.length > 0 && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentText}>{urgentAlerts.length} urgent</Text>
            </View>
          )}
        </View>
      </View>

      {sortedAlerts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="thumbs-up-outline" size={30} color={Colors.dark.primary} />
          <Text style={styles.emptyText}>All caught up!</Text>
          <Text style={styles.emptySubtext}>No tasks need your attention right now</Text>
        </View>
      ) : (
        <View style={styles.alertsList}>
          {sortedAlerts.slice(0, 5).map((alert, index) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              index={index}
              onAlertPress={onAlertPress}
              onAction={onAction}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconBg: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Colors.dark.orange + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  urgentBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.error + "20",
    borderRadius: BorderRadius.full,
  },
  urgentText: {
    ...Typography.small,
    color: Colors.dark.error,
    fontWeight: "600",
    fontSize: 11,
  },
  emptyState: {
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  alertsList: {
    gap: Spacing.sm,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    gap: Spacing.sm,
  },
  alertIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
    fontSize: 13,
  },
  alertDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  actionBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  actionText: {
    ...Typography.small,
    fontWeight: "600",
    fontSize: 11,
  },
});
