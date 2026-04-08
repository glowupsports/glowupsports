import React from "react";
import { View, Text, Modal, Pressable, ActivityIndicator, TextInput, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing } from "@/constants/theme";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { styles } from "./seriesDetailStyles";

interface Props {
  visible: boolean;
  onClose: () => void;
  pauseFromDate: Date;
  setPauseFromDate: (d: Date) => void;
  pauseUntilDate: Date;
  setPauseUntilDate: (d: Date) => void;
  showPauseFromPicker: boolean;
  setShowPauseFromPicker: (v: boolean) => void;
  showPauseUntilPicker: boolean;
  setShowPauseUntilPicker: (v: boolean) => void;
  pauseReason: string;
  setPauseReason: (s: string) => void;
  onConfirm: () => void;
  isPending: boolean;
  bottomInset: number;
}

export function SeriesPausePlayerModal({
  visible, onClose,
  pauseFromDate, setPauseFromDate,
  pauseUntilDate, setPauseUntilDate,
  showPauseFromPicker, setShowPauseFromPicker,
  showPauseUntilPicker, setShowPauseUntilPicker,
  pauseReason, setPauseReason,
  onConfirm, isPending, bottomInset,
}: Props) {
  const isInvalid = pauseUntilDate < pauseFromDate;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.modalContent, { paddingBottom: bottomInset + Spacing.lg, zIndex: 2 }]}>
          <KeyboardAwareScrollViewCompat>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pause Player</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Player will not appear in sessions during this period
            </Text>

            <View style={styles.dateFieldsRow}>
              <View style={styles.dateField}>
                <Text style={styles.fieldLabel}>From Date</Text>
                {Platform.OS === "web" ? (
                  <WebCalendarPicker
                    value={pauseFromDate}
                    onChange={(date) => {
                      setPauseFromDate(date);
                      if (pauseUntilDate < date) {
                        const newUntil = new Date(date);
                        newUntil.setDate(newUntil.getDate() + 7);
                        setPauseUntilDate(newUntil);
                      }
                    }}
                  />
                ) : (
                  <>
                    <Pressable
                      style={styles.dateButton}
                      onPress={() => setShowPauseFromPicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={18} color={Colors.dark.gold} />
                      <Text style={styles.dateButtonText}>
                        {pauseFromDate.toLocaleDateString()}
                      </Text>
                    </Pressable>
                    {showPauseFromPicker ? (
                      <DateTimePicker
                        value={pauseFromDate}
                        mode="date"
                        display="default"
                        onChange={(e, date) => {
                          setShowPauseFromPicker(false);
                          if (date) {
                            setPauseFromDate(date);
                            if (pauseUntilDate < date) {
                              const newUntil = new Date(date);
                              newUntil.setDate(newUntil.getDate() + 7);
                              setPauseUntilDate(newUntil);
                            }
                          }
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>

              <View style={styles.dateField}>
                <Text style={styles.fieldLabel}>Until Date</Text>
                {Platform.OS === "web" ? (
                  <WebCalendarPicker value={pauseUntilDate} onChange={setPauseUntilDate} />
                ) : (
                  <>
                    <Pressable
                      style={styles.dateButton}
                      onPress={() => setShowPauseUntilPicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={18} color={Colors.dark.gold} />
                      <Text style={styles.dateButtonText}>
                        {pauseUntilDate.toLocaleDateString()}
                      </Text>
                    </Pressable>
                    {showPauseUntilPicker ? (
                      <DateTimePicker
                        value={pauseUntilDate}
                        mode="date"
                        display="default"
                        minimumDate={pauseFromDate}
                        onChange={(e, date) => {
                          setShowPauseUntilPicker(false);
                          if (date) setPauseUntilDate(date);
                        }}
                      />
                    ) : null}
                  </>
                )}
              </View>
            </View>

            {isInvalid ? (
              <Text style={styles.dateValidationError}>
                Until date must be on or after from date
              </Text>
            ) : null}

            <View style={styles.reasonField}>
              <Text style={styles.fieldLabel}>Reason (optional)</Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="e.g., Family vacation, Injury..."
                placeholderTextColor={Colors.dark.textMuted}
                value={pauseReason}
                onChangeText={setPauseReason}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmButton,
                  styles.pauseConfirmButton,
                  isInvalid && styles.confirmButtonDisabled,
                ]}
                onPress={onConfirm}
                disabled={isPending || isInvalid}
              >
                {isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <Text style={styles.confirmButtonText}>Pause Player</Text>
                )}
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}
