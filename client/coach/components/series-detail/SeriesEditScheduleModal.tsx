import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";

const FULL_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface ScheduleChangeProposal {
  oldDayOfWeek: number;
  newDayOfWeek: number;
  oldStartTime: string;
  newStartTime: string;
  oldDuration: number;
  newDuration: number;
  oldIsFlexible: boolean;
  newIsFlexible: boolean;
  movedCount: number;
  customizedSkippedCount: number;
  notifiedCount: number;
  pastUntouchedCount: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  proposal: ScheduleChangeProposal | null;
  bottomInset: number;
  saving: boolean;
  onConfirm: () => void;
}

export function SeriesEditScheduleModal({
  visible,
  onClose,
  proposal,
  bottomInset,
  saving,
  onConfirm,
}: Props) {
  if (!proposal) return null;

  const dayChanged =
    proposal.oldIsFlexible !== proposal.newIsFlexible ||
    (!proposal.oldIsFlexible &&
      !proposal.newIsFlexible &&
      proposal.oldDayOfWeek !== proposal.newDayOfWeek);
  const timeChanged = proposal.oldStartTime !== proposal.newStartTime;
  const durationChanged = proposal.oldDuration !== proposal.newDuration;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.restoreModalContent,
            { paddingBottom: bottomInset + Spacing.lg, maxHeight: "92%" },
          ]}
        >
          <LinearGradient
            colors={[Colors.dark.accentCyan + "15", "transparent"]}
            style={styles.restoreModalGlow}
          />

          <View style={styles.restoreModalHeader}>
            <View style={styles.restoreModalTitleRow}>
              <Ionicons
                name="calendar-outline"
                size={28}
                color={Colors.dark.accentCyan}
              />
              <Text style={styles.restoreModalTitle}>Confirm changes</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.restoreCloseButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              disabled={saving}
            >
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: 520 }}
            contentContainerStyle={{ paddingBottom: Spacing.md }}
          >
            <View style={styles.restoreSessionContent}>
              <Text style={editStyles.confirmHeading}>
                Apply these changes to all upcoming sessions?
              </Text>
              <Text style={editStyles.confirmSubtext}>
                Past and cancelled sessions are unchanged.
              </Text>

              <View style={editStyles.diffBlock}>
                <DiffRow
                  label="Day"
                  oldValue={
                    proposal.oldIsFlexible
                      ? "Flexible"
                      : FULL_DAY_NAMES[proposal.oldDayOfWeek]
                  }
                  newValue={
                    proposal.newIsFlexible
                      ? "Flexible"
                      : FULL_DAY_NAMES[proposal.newDayOfWeek]
                  }
                  changed={dayChanged}
                />
                <DiffRow
                  label="Time"
                  oldValue={proposal.oldStartTime}
                  newValue={proposal.newStartTime}
                  changed={timeChanged}
                />
                <DiffRow
                  label="Duration"
                  oldValue={`${proposal.oldDuration} min`}
                  newValue={`${proposal.newDuration} min`}
                  changed={durationChanged}
                />
              </View>

              <View style={editStyles.summaryBox}>
                <Ionicons
                  name="swap-horizontal-outline"
                  size={18}
                  color={Colors.dark.accentCyan}
                />
                <Text style={editStyles.summaryText}>
                  {proposal.movedCount === 1
                    ? "Move 1 upcoming session to "
                    : `Move ${proposal.movedCount} upcoming sessions to `}
                  {proposal.newIsFlexible
                    ? "flexible day"
                    : `${FULL_DAY_NAMES[proposal.newDayOfWeek]}s`}
                  {" at "}
                  {proposal.newStartTime}
                  {" for "}
                  {proposal.newDuration} min.
                </Text>
              </View>

              {proposal.customizedSkippedCount > 0 ? (
                <View style={editStyles.summaryBox}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={Colors.dark.gold}
                  />
                  <Text style={editStyles.summaryText}>
                    {proposal.customizedSkippedCount} session
                    {proposal.customizedSkippedCount === 1 ? "" : "s"} will
                    keep their custom time (previously rescheduled).
                  </Text>
                </View>
              ) : null}

              {proposal.notifiedCount > 0 ? (
                <View style={editStyles.summaryBox}>
                  <Ionicons
                    name="notifications-outline"
                    size={18}
                    color={Colors.dark.accentCyan}
                  />
                  <Text style={editStyles.summaryText}>
                    {proposal.notifiedCount} enrolled player
                    {proposal.notifiedCount === 1 ? "" : "s"} will be notified.
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.restoreButton,
                  pressed && styles.restoreButtonPressed,
                  saving && styles.restoreButtonDisabled,
                  { marginTop: Spacing.xl },
                ]}
                onPress={onConfirm}
                disabled={saving}
              >
                <LinearGradient
                  colors={[Colors.dark.accentCyan, Colors.dark.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.restoreButtonGradient}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={Colors.dark.text}
                      />
                      <Text style={styles.restoreButtonText}>
                        Confirm and notify
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable
                style={editStyles.cancelButton}
                onPress={onClose}
                disabled={saving}
              >
                <Text style={editStyles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DiffRow({
  label,
  oldValue,
  newValue,
  changed,
}: {
  label: string;
  oldValue: string;
  newValue: string;
  changed: boolean;
}) {
  return (
    <View style={editStyles.diffRow}>
      <Text style={editStyles.diffLabel}>{label}</Text>
      <View style={editStyles.diffValues}>
        {changed ? (
          <>
            <Text style={editStyles.diffOld}>{oldValue}</Text>
            <Ionicons
              name="arrow-forward"
              size={14}
              color={Colors.dark.textMuted}
            />
            <Text style={editStyles.diffNew}>{newValue}</Text>
          </>
        ) : (
          <Text style={editStyles.diffUnchanged}>{newValue}</Text>
        )}
      </View>
    </View>
  );
}

const editStyles = StyleSheet.create({
  confirmHeading: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  confirmSubtext: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    marginBottom: Spacing.md,
  },
  diffBlock: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: Spacing.md,
    gap: 10,
    marginBottom: Spacing.md,
  },
  diffRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diffLabel: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  diffValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  diffOld: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    textDecorationLine: "line-through",
  },
  diffNew: {
    color: Colors.dark.accentCyan,
    fontSize: 14,
    fontWeight: "700",
  },
  diffUnchanged: {
    color: Colors.dark.text,
    fontSize: 14,
  },
  summaryBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(0, 200, 255, 0.08)",
    marginTop: Spacing.sm,
  },
  summaryText: {
    color: Colors.dark.text,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  cancelButtonText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
  },
});
