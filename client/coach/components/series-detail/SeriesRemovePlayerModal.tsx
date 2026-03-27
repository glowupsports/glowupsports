import React from "react";
import { View, Text, Modal, Pressable, ActivityIndicator, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Spacing } from "@/constants/theme";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { styles } from "./seriesDetailStyles";

interface Props {
  visible: boolean;
  onClose: () => void;
  removeDate: Date;
  setRemoveDate: (d: Date) => void;
  showRemoveDatePicker: boolean;
  setShowRemoveDatePicker: (v: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  bottomInset: number;
}

export function SeriesRemovePlayerModal({ visible, onClose, removeDate, setRemoveDate, showRemoveDatePicker, setShowRemoveDatePicker, onConfirm, isPending, bottomInset }: Props) {
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
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Remove Player</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          <Text style={styles.modalSubtitle}>
            This will mark the player as a former player from the selected date
          </Text>

          <View style={styles.dateField}>
            <Text style={styles.fieldLabel}>Effective Date</Text>
            {Platform.OS === "web" ? (
              <WebCalendarPicker value={removeDate} onChange={setRemoveDate} />
            ) : (
              <>
                <Pressable
                  style={styles.dateButton}
                  onPress={() => setShowRemoveDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.dark.error} />
                  <Text style={styles.dateButtonText}>
                    {removeDate.toLocaleDateString()}
                  </Text>
                </Pressable>
                {showRemoveDatePicker ? (
                  <DateTimePicker
                    value={removeDate}
                    mode="date"
                    display="default"
                    onChange={(e, date) => {
                      setShowRemoveDatePicker(false);
                      if (date) setRemoveDate(date);
                    }}
                  />
                ) : null}
              </>
            )}
          </View>

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, styles.removeConfirmButton]}
              onPress={onConfirm}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.text} />
              ) : (
                <Text style={styles.confirmButtonText}>Remove Player</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
