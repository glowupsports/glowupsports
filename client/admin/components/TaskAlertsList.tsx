import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
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

export function TaskAlertsList({
  alerts,
  onAlertPress,
  onAction,
}: TaskAlertsListProps) {
  const getAlertStyle = (type: TaskAlert["type"]) => {
    switch (type) {
      case "urgent": return { 
        bg: Colors.dark.error + "15", 
        border: Colors.dark.error,
        icon: "warning" as const,
        color: Colors.dark.error 
      };
      case "no_show": return { 
        bg: Colors.dark.orange + "15", 
        border: Colors.dark.orange,
        icon: "person-remove" as const,
        color: Colors.dark.orange 
      };
      case "late": return { 
        bg: Colors.dark.gold + "15", 
        border: Colors.dark.gold,
        icon: "time" as const,
        color: Colors.dark.gold 
      };
      case "payment": return { 
        bg: Colors.dark.xpCyan + "15", 
        border: Colors.dark.xpCyan,
        icon: "cash" as const,
        color: Colors.dark.xpCyan 
      };
      case "session": return { 
        bg: Colors.dark.primary + "15", 
        border: Colors.dark.primary,
        icon: "calendar" as const,
        color: Colors.dark.primary 
      };
    }
  };

  const urgentAlerts = alerts.filter(a => a.type === "urgent");
  const otherAlerts = alerts.filter(a => a.type !== "urgent");
  const sortedAlerts = [...urgentAlerts, ...otherAlerts];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="alert-circle" size={18} color={Colors.dark.orange} />
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
          <Ionicons name="thumbs-up-outline" size={32} color={Colors.dark.primary} />
          <Text style={styles.emptyText}>All caught up!</Text>
          <Text style={styles.emptySubtext}>No tasks need your attention right now</Text>
        </View>
      ) : (
        <View style={styles.alertsList}>
          {sortedAlerts.slice(0, 4).map((alert) => {
            const style = getAlertStyle(alert.type);
            return (
              <Pressable 
                key={alert.id}
                style={[styles.alertRow, { borderLeftColor: style.border }]}
                onPress={() => onAlertPress?.(alert.id)}
              >
                <View style={[styles.alertIcon, { backgroundColor: style.bg }]}>
                  <Ionicons name={style.icon} size={16} color={style.color} />
                </View>
                
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
                  <Text style={styles.alertDesc} numberOfLines={1}>{alert.description}</Text>
                </View>
                
                {alert.actionLabel ? (
                  <Pressable 
                    style={[styles.actionBtn, { backgroundColor: style.bg }]}
                    onPress={() => onAction?.(alert.id)}
                  >
                    <Text style={[styles.actionText, { color: style.color }]}>{alert.actionLabel}</Text>
                  </Pressable>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
                )}
              </Pressable>
            );
          })}
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
    width: 32,
    height: 32,
    borderRadius: 10,
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
