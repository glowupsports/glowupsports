import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  FadeInLeft,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface CheckIn {
  id: string;
  playerName: string;
  sessionTitle: string;
  time: string;
  status: "pending" | "confirmed" | "late";
}

interface CheckInStreamProps {
  checkIns: CheckIn[];
  onConfirm?: (id: string) => void;
  onViewPlayer?: (id: string) => void;
}

function CheckInRow({
  checkIn,
  index,
  onConfirm,
  onViewPlayer,
  optimisticConfirmed,
}: {
  checkIn: CheckIn;
  index: number;
  onConfirm?: (id: string) => void;
  onViewPlayer?: (id: string) => void;
  optimisticConfirmed: boolean;
}) {
  const translateX = useSharedValue(-20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 60;
    translateX.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 200 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 280 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const effectiveStatus = optimisticConfirmed ? "confirmed" : checkIn.status;

  const statusStyle = effectiveStatus === "pending"
    ? { bg: Colors.dark.orange + "20", color: Colors.dark.orange }
    : effectiveStatus === "confirmed"
    ? { bg: Colors.dark.primary + "20", color: Colors.dark.primary }
    : { bg: Colors.dark.error + "20", color: Colors.dark.error };

  return (
    <Animated.View style={[styles.checkInRow, index === 0 && styles.firstRow, animStyle]}>
      <Pressable style={styles.rowInner} onPress={() => onViewPlayer?.(checkIn.id)}>
        <View style={styles.timeColumn}>
          <Text style={styles.timeText}>{checkIn.time}</Text>
        </View>

        <View style={styles.infoColumn}>
          <Text style={styles.playerName} numberOfLines={1}>{checkIn.playerName}</Text>
          <Text style={styles.sessionName} numberOfLines={1}>{checkIn.sessionTitle}</Text>
        </View>

        <View style={styles.actionColumn}>
          {effectiveStatus === "pending" ? (
            <Pressable
              style={styles.confirmBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onConfirm?.(checkIn.id);
              }}
            >
              <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
            </Pressable>
          ) : (
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Ionicons
                name={effectiveStatus === "confirmed" ? "checkmark" : "time"}
                size={12}
                color={statusStyle.color}
              />
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function CheckInStream({
  checkIns,
  onConfirm,
  onViewPlayer,
}: CheckInStreamProps) {
  const [optimisticConfirmed, setOptimisticConfirmed] = useState<Set<string>>(new Set());

  const handleConfirm = (id: string) => {
    setOptimisticConfirmed(prev => new Set([...prev, id]));
    onConfirm?.(id);
  };

  const pending = checkIns.filter(c => c.status === "pending" && !optimisticConfirmed.has(c.id));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="log-in" size={16} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.title}>Check-in Stream</Text>
          {pending.length > 0 && (
            <Animated.View entering={FadeInLeft.duration(300)} style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{pending.length} pending</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {checkIns.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={30} color={Colors.dark.primary} />
          <Text style={styles.emptyText}>All checked in</Text>
          <Text style={styles.emptySubtext}>Players will appear here when they arrive</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {checkIns.slice(0, 6).map((checkIn, index) => (
            <CheckInRow
              key={checkIn.id}
              checkIn={checkIn}
              index={index}
              onConfirm={handleConfirm}
              onViewPlayer={onViewPlayer}
              optimisticConfirmed={optimisticConfirmed.has(checkIn.id)}
            />
          ))}
        </ScrollView>
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
    backgroundColor: Colors.dark.xpCyan + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
  },
  pendingBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.dark.orange + "20",
    borderRadius: BorderRadius.full,
  },
  pendingText: {
    ...Typography.small,
    color: Colors.dark.orange,
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
  scrollView: {
    maxHeight: 220,
  },
  checkInRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  firstRow: {
    borderTopWidth: 0,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  timeColumn: {
    width: 48,
  },
  timeText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  infoColumn: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
    fontSize: 13,
  },
  sessionName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  actionColumn: {
    width: 38,
    alignItems: "center",
  },
  confirmBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  statusBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
