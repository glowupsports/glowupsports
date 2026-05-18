import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  FadeInDown,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface TaskAlert {
  id: string;
  type: "no_show" | "late" | "payment" | "session" | "urgent";
  title: string;
  description: string;
  actionLabel?: string;
}

interface AlertGroup {
  type: TaskAlert["type"];
  count: number;
  alerts: TaskAlert[];
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  label: string;
  actionLabel: string;
  navHint: string;
  nav: "schedule" | "players" | "payments" | "coaches";
}

interface OutstandingAlertsCardProps {
  alerts: TaskAlert[];
  onAlertPress?: (id: string) => void;
  onAction?: (id: string, type: string) => void;
  onNavigate?: (destination: "schedule" | "players" | "payments" | "coaches") => void;
}

const TYPE_CONFIG: Record<
  TaskAlert["type"],
  {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    color: string;
    label: string;
    actionLabel: string;
    navHint: string;
    nav: "schedule" | "players" | "payments" | "coaches";
  }
> = {
  urgent:   { icon: "alert-circle",  color: Colors.dark.error,   label: "Urgent",   actionLabel: "Resolve", navHint: "Go to Schedule",  nav: "schedule" },
  no_show:  { icon: "person-remove", color: Colors.dark.orange,  label: "No-shows", actionLabel: "Contact", navHint: "Go to Players",   nav: "players" },
  payment:  { icon: "card",          color: Colors.dark.xpCyan,  label: "Payments", actionLabel: "Review",  navHint: "Go to Payments",  nav: "payments" },
  late:     { icon: "time",          color: Colors.dark.gold,    label: "Late",     actionLabel: "Notify",  navHint: "Go to Schedule",  nav: "schedule" },
  session:  { icon: "calendar",      color: Colors.dark.primary, label: "Sessions", actionLabel: "Manage",  navHint: "Go to Schedule",  nav: "schedule" },
};

function groupAlerts(alerts: TaskAlert[]): AlertGroup[] {
  const groups: Record<string, AlertGroup> = {};

  for (const alert of alerts) {
    const cfg = TYPE_CONFIG[alert.type];
    if (!groups[alert.type]) {
      groups[alert.type] = { type: alert.type, count: 0, alerts: [], ...cfg };
    }
    groups[alert.type].count++;
    groups[alert.type].alerts.push(alert);
  }

  const order: TaskAlert["type"][] = ["urgent", "no_show", "payment", "late", "session"];
  return order.filter(t => groups[t]).map(t => groups[t]);
}

function AlertGroupRow({
  group,
  index,
  onAction,
  onAlertPress,
  onNavigate,
}: {
  group: AlertGroup;
  index: number;
  onAction?: (id: string, type: string) => void;
  onAlertPress?: (id: string) => void;
  onNavigate?: (destination: "schedule" | "players" | "payments" | "coaches") => void;
}) {
  const translateY = useSharedValue(16);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 80;
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 200 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 250 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const firstAlert = group.alerts[0];

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={[styles.groupRow, { borderLeftColor: group.color }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onAlertPress?.(firstAlert.id);
        }}
      >
        <View style={[styles.groupIconWrap, { backgroundColor: group.color + "15" }]}>
          <Ionicons name={group.icon} size={18} color={group.color} />
        </View>

        <View style={styles.groupContent}>
          <View style={styles.groupTitleRow}>
            <View style={[styles.countBadge, { backgroundColor: group.color + "20" }]}>
              <Text style={[styles.countBadgeText, { color: group.color }]}>{group.count}</Text>
            </View>
            <Text style={styles.groupLabel}>{group.label}</Text>
          </View>
          <Text style={styles.groupDesc} numberOfLines={1}>
            {group.alerts.map(a => a.title).join(", ")}
          </Text>
          <Text style={[styles.navHint, { color: group.color + "90" }]}>{group.navHint}</Text>
        </View>

        <Pressable
          style={[styles.actionBtn, { backgroundColor: group.color + "18", borderColor: group.color + "35" }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAction?.(firstAlert.id, group.type);
            onNavigate?.(group.nav);
          }}
        >
          <Text style={[styles.actionBtnText, { color: group.color }]}>{group.actionLabel}</Text>
          <Ionicons name="chevron-forward" size={11} color={group.color} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export function OutstandingAlertsCard({
  alerts,
  onAlertPress,
  onAction,
  onNavigate,
}: OutstandingAlertsCardProps) {
  const groups = groupAlerts(alerts);
  const urgentCount = alerts.filter(a => a.type === "urgent").length;
  const totalCount = alerts.length;

  if (totalCount === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.allClearContent}>
          <Ionicons name="shield-checkmark" size={32} color={Colors.dark.primary} />
          <Text style={styles.allClearTitle}>All Clear</Text>
          <Text style={styles.allClearSub}>No outstanding items need attention</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={urgentCount > 0 ? [`${Colors.dark.error}10`, "transparent"] : [`${Colors.dark.orange}08`, "transparent"]}
        style={styles.gradientOverlay}
      />

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.iconBg, { backgroundColor: urgentCount > 0 ? Colors.dark.error + "20" : Colors.dark.orange + "20" }]}>
            <Ionicons
              name={urgentCount > 0 ? "alert-circle" : "notifications"}
              size={16}
              color={urgentCount > 0 ? Colors.dark.error : Colors.dark.orange}
            />
          </View>
          <Text style={styles.title}>Outstanding Alerts</Text>
        </View>

        <View style={styles.headerRight}>
          {urgentCount > 0 && (
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.urgentPill, { backgroundColor: Colors.dark.error + "20" }]}>
              <View style={[styles.urgentDot, { backgroundColor: Colors.dark.error }]} />
              <Text style={[styles.urgentPillText, { color: Colors.dark.error }]}>{urgentCount} urgent</Text>
            </Animated.View>
          )}
          <View style={[styles.totalPill, { backgroundColor: Colors.dark.backgroundRoot }]}>
            <Text style={styles.totalPillText}>{totalCount} total</Text>
          </View>
        </View>
      </View>

      <View style={styles.groupsList}>
        {groups.map((group, i) => (
          <AlertGroupRow
            key={group.type}
            group={group}
            index={i}
            onAction={onAction}
            onAlertPress={onAlertPress}
            onNavigate={onNavigate}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    borderRadius: BorderRadius.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  urgentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  urgentDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  urgentPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  totalPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  totalPillText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  groupsList: {
    gap: Spacing.sm,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    gap: Spacing.sm,
  },
  groupIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  groupContent: {
    flex: 1,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 2,
  },
  countBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  groupLabel: {
    ...Typography.small,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  groupDesc: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  navHint: {
    fontSize: 9,
    marginTop: 2,
    fontWeight: "500",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexShrink: 0,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  allClearContent: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  allClearTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  allClearSub: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
});
