import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
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

export function CheckInStream({
  checkIns,
  onConfirm,
  onViewPlayer,
}: CheckInStreamProps) {
  const getStatusStyle = (status: CheckIn["status"]) => {
    switch (status) {
      case "pending": return { bg: Colors.dark.orange + "20", color: Colors.dark.orange };
      case "confirmed": return { bg: Colors.dark.primary + "20", color: Colors.dark.primary };
      case "late": return { bg: Colors.dark.error + "20", color: Colors.dark.error };
    }
  };

  const pending = checkIns.filter(c => c.status === "pending");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBg}>
            <Ionicons name="log-in" size={18} color={Colors.dark.xpCyan} />
          </View>
          <Text style={styles.title}>Check-in Stream</Text>
          {pending.length > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{pending.length} pending</Text>
            </View>
          )}
        </View>
      </View>

      {checkIns.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={32} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No check-ins waiting</Text>
          <Text style={styles.emptySubtext}>Players will appear here when they arrive</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {checkIns.slice(0, 5).map((checkIn, index) => {
            const statusStyle = getStatusStyle(checkIn.status);
            return (
              <Pressable 
                key={checkIn.id}
                style={[styles.checkInRow, index === 0 && styles.firstRow]}
                onPress={() => onViewPlayer?.(checkIn.id)}
              >
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{checkIn.time}</Text>
                </View>
                
                <View style={styles.infoColumn}>
                  <Text style={styles.playerName} numberOfLines={1}>{checkIn.playerName}</Text>
                  <Text style={styles.sessionName} numberOfLines={1}>{checkIn.sessionTitle}</Text>
                </View>
                
                <View style={styles.actionColumn}>
                  {checkIn.status === "pending" ? (
                    <Pressable 
                      style={styles.confirmBtn}
                      onPress={() => onConfirm?.(checkIn.id)}
                    >
                      <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                    </Pressable>
                  ) : (
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                      <Ionicons 
                        name={checkIn.status === "confirmed" ? "checkmark" : "time"} 
                        size={12} 
                        color={statusStyle.color} 
                      />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
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
    width: 32,
    height: 32,
    borderRadius: 10,
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
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  scrollView: {
    maxHeight: 200,
  },
  checkInRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  firstRow: {
    borderTopWidth: 0,
  },
  timeColumn: {
    width: 50,
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
  },
  sessionName: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  actionColumn: {
    width: 40,
    alignItems: "center",
  },
  confirmBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
