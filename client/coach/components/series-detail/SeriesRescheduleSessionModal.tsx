import React from "react";
import { View, Text, Modal, Pressable, ActivityIndicator, TextInput, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { SessionInstance } from "./types";

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedSession: SessionInstance | null;
  rescheduleDate: Date;
  setRescheduleDate: (d: Date) => void;
  rescheduleTime: Date;
  setRescheduleTime: (d: Date) => void;
  showRescheduleDatePicker: boolean;
  setShowRescheduleDatePicker: (v: boolean) => void;
  showRescheduleTimePicker: boolean;
  setShowRescheduleTimePicker: (v: boolean) => void;
  onReschedule: () => void;
  reschedulingSession: boolean;
  onCancelSession: () => Promise<void>;
  cancellingSession: boolean;
  bottomInset: number;
}

export function SeriesRescheduleSessionModal({
  visible, onClose, selectedSession,
  rescheduleDate, setRescheduleDate,
  rescheduleTime, setRescheduleTime,
  showRescheduleDatePicker, setShowRescheduleDatePicker,
  showRescheduleTimePicker, setShowRescheduleTimePicker,
  onReschedule, reschedulingSession,
  onCancelSession, cancellingSession,
  bottomInset,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.restoreModalContent, { paddingBottom: bottomInset + Spacing.lg }]}>
          <LinearGradient
            colors={[Colors.dark.accentCyan + "15", "transparent"]}
            style={styles.restoreModalGlow}
          />

          <View style={styles.restoreModalHeader}>
            <View style={styles.restoreModalTitleRow}>
              <Ionicons name="calendar-outline" size={28} color={Colors.dark.accentCyan} />
              <Text style={styles.restoreModalTitle}>Reschedule Session</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.restoreCloseButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          {selectedSession ? (
            <View style={styles.restoreSessionContent}>
              <Text style={[styles.sectionLabel, { marginBottom: Spacing.sm }]}>NEW DATE</Text>

              {Platform.OS === "web" ? (
                <View style={styles.webTimePickerRow}>
                  <TextInput
                    style={styles.webTimeInput}
                    value={rescheduleDate.toISOString().split("T")[0]}
                    onChangeText={(text) => {
                      const parsed = new Date(text);
                      if (!isNaN(parsed.getTime())) setRescheduleDate(parsed);
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowRescheduleDatePicker(true)}
                    style={styles.timePickerButton}
                  >
                    <Ionicons name="calendar-outline" size={20} color={Colors.dark.accentCyan} />
                    <Text style={styles.timePickerText}>
                      {rescheduleDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                  {showRescheduleDatePicker && (
                    <DateTimePicker
                      value={rescheduleDate}
                      mode="date"
                      display="spinner"
                      onChange={(_, date) => {
                        setShowRescheduleDatePicker(false);
                        if (date) setRescheduleDate(date);
                      }}
                    />
                  )}
                </>
              )}

              <Text style={[styles.sectionLabel, { marginTop: Spacing.lg, marginBottom: Spacing.sm }]}>NEW TIME</Text>

              {Platform.OS === "web" ? (
                <View style={styles.webTimePickerRow}>
                  <TextInput
                    style={styles.webTimeInput}
                    value={`${String(rescheduleTime.getHours()).padStart(2, "0")}:${String(rescheduleTime.getMinutes()).padStart(2, "0")}`}
                    onChangeText={(text) => {
                      const [hours, minutes] = text.split(":").map(Number);
                      if (!isNaN(hours) && !isNaN(minutes)) {
                        const newTime = new Date(rescheduleTime);
                        newTime.setHours(hours, minutes, 0, 0);
                        setRescheduleTime(newTime);
                      }
                    }}
                    placeholder="HH:MM"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowRescheduleTimePicker(true)}
                    style={styles.timePickerButton}
                  >
                    <Ionicons name="time-outline" size={20} color={Colors.dark.accentCyan} />
                    <Text style={styles.timePickerText}>
                      {`${String(rescheduleTime.getHours()).padStart(2, "0")}:${String(rescheduleTime.getMinutes()).padStart(2, "0")}`}
                    </Text>
                  </Pressable>
                  {showRescheduleTimePicker && (
                    <DateTimePicker
                      value={rescheduleTime}
                      mode="time"
                      is24Hour={true}
                      display="spinner"
                      onChange={(_, date) => {
                        setShowRescheduleTimePicker(false);
                        if (date) setRescheduleTime(date);
                      }}
                    />
                  )}
                </>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.restoreButton,
                  pressed && styles.restoreButtonPressed,
                  reschedulingSession && styles.restoreButtonDisabled,
                  { marginTop: Spacing.xl },
                ]}
                onPress={onReschedule}
                disabled={reschedulingSession}
              >
                <LinearGradient
                  colors={[Colors.dark.accentCyan, Colors.dark.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.restoreButtonGradient}
                >
                  {reschedulingSession ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.dark.text} />
                      <Text style={styles.restoreButtonText}>Reschedule</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable
                style={styles.cancelSessionButton}
                onPress={onCancelSession}
                disabled={cancellingSession}
              >
                {cancellingSession ? (
                  <ActivityIndicator size="small" color={Colors.dark.error} />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={18} color={Colors.dark.error} />
                    <Text style={styles.cancelSessionButtonText}>Cancel This Session</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
