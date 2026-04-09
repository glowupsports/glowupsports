import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, GlowColors } from "@/constants/theme";
import { formatTimeInTimezone, formatDateObjectInTimezone, parseUTCTimestamp } from "@/lib/dateUtils";
import { dragModalStyles } from "./calendarStyles";

type Court = { id: string; name: string };
type Session = { startTime: string; endTime: string; type?: string; courtId?: string };

interface PendingDrag {
  session: Session;
  newStart: Date;
  newCourtName?: string;
  isPastSession?: boolean;
}

interface CalendarDragModalProps {
  pendingDrag: PendingDrag | null;
  onCancel: () => void;
  onConfirm: () => void;
  courts: Court[];
}

export function CalendarDragModal({ pendingDrag, onCancel, onConfirm, courts }: CalendarDragModalProps) {
  return (
    <Modal visible={!!pendingDrag} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={dragModalStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={dragModalStyles.container}>
          <Animated.View entering={FadeIn.duration(200)} style={dragModalStyles.card}>
            {/* Header */}
            <View style={dragModalStyles.header}>
              <View style={dragModalStyles.iconContainer}>
                <Ionicons name="move" size={28} color={GlowColors.primary} />
              </View>
              <Text style={dragModalStyles.title}>Move Session</Text>
              {pendingDrag?.isPastSession ? (
                <View style={dragModalStyles.warningBadge}>
                  <Ionicons name="warning" size={14} color="#FF6B35" />
                  <Text style={dragModalStyles.warningText}>Past Time</Text>
                </View>
              ) : null}
            </View>

            {/* Session Info */}
            <View style={dragModalStyles.sessionInfo}>
              <Text style={dragModalStyles.sessionName} numberOfLines={1}>
                {pendingDrag?.session?.type === "private"
                  ? "PRIVATE"
                  : pendingDrag?.session?.type === "group"
                  ? "GROUP"
                  : pendingDrag?.session?.type?.toUpperCase() || "SESSION"}
              </Text>
            </View>

            {/* Changes Preview */}
            <View style={dragModalStyles.changesContainer}>
              {/* Time Change */}
              <View style={dragModalStyles.changeRow}>
                <Ionicons name="time-outline" size={20} color="#8E8E93" />
                <View style={dragModalStyles.changeContent}>
                  <Text style={dragModalStyles.changeLabel}>Time</Text>
                  <View style={dragModalStyles.changeValues}>
                    <Text style={dragModalStyles.oldValue}>
                      {pendingDrag?.session ? formatTimeInTimezone(parseUTCTimestamp(pendingDrag.session.startTime)) : ""}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={GlowColors.primary} />
                    <Text style={dragModalStyles.newValue}>
                      {pendingDrag?.newStart ? formatTimeInTimezone(pendingDrag.newStart) : ""}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Date Change (if different) */}
              {pendingDrag?.session && pendingDrag?.newStart &&
               parseUTCTimestamp(pendingDrag.session.startTime).toDateString() !== pendingDrag.newStart.toDateString() ? (
                <View style={dragModalStyles.changeRow}>
                  <Ionicons name="calendar-outline" size={20} color="#8E8E93" />
                  <View style={dragModalStyles.changeContent}>
                    <Text style={dragModalStyles.changeLabel}>Date</Text>
                    <View style={dragModalStyles.changeValues}>
                      <Text style={dragModalStyles.oldValue}>
                        {formatDateObjectInTimezone(parseUTCTimestamp(pendingDrag.session.startTime), "EEE, MMM d")}
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color={GlowColors.primary} />
                      <Text style={dragModalStyles.newValue}>
                        {formatDateObjectInTimezone(pendingDrag.newStart, "EEE, MMM d")}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Court Change */}
              {pendingDrag?.newCourtName ? (
                <View style={dragModalStyles.changeRow}>
                  <Ionicons name="tennisball-outline" size={20} color="#8E8E93" />
                  <View style={dragModalStyles.changeContent}>
                    <Text style={dragModalStyles.changeLabel}>Court</Text>
                    <View style={dragModalStyles.changeValues}>
                      <Text style={dragModalStyles.oldValue}>
                        {courts.find((c) => c.id === pendingDrag?.session?.courtId)?.name || "Unassigned"}
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color={GlowColors.primary} />
                      <Text style={dragModalStyles.newValue}>{pendingDrag.newCourtName}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Actions */}
            <View style={dragModalStyles.actions}>
              <Pressable style={dragModalStyles.cancelButton} onPress={onCancel}>
                <Text style={dragModalStyles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={dragModalStyles.confirmButton} onPress={onConfirm}>
                <LinearGradient
                  colors={[GlowColors.primary, GlowColors.primaryDark || "#9ACC2C"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={dragModalStyles.confirmGradient}
                >
                  <Ionicons name="checkmark" size={20} color={Colors.dark.buttonText} />
                  <Text style={dragModalStyles.confirmButtonText}>Confirm Move</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}
