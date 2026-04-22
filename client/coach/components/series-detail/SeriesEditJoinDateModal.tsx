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
  editJoinDate: Date;
  setEditJoinDate: (d: Date) => void;
  onConfirm: () => void;
  savingJoinDate: boolean;
  bottomInset: number;
}

export function SeriesEditJoinDateModal({ visible, onClose, editJoinDate, setEditJoinDate, onConfirm, savingJoinDate, bottomInset }: Props) {
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
            <Text style={styles.modalTitle}>Edit Join Date</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          <Text style={styles.modalSubtitle}>
            Change when this player joined the class. This affects which sessions they appear in for attendance.
          </Text>

          <View style={styles.dateField}>
            <Text style={styles.fieldLabel}>Join Date</Text>
            {Platform.OS === "web" ? (
              <WebCalendarPicker value={editJoinDate} onChange={setEditJoinDate} />
            ) : (
              <DateTimePicker
                value={editJoinDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "calendar"}
                onChange={(_, date) => {
                  if (date) setEditJoinDate(date);
                }}
              />
            )}
          </View>

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.confirmButton}
              onPress={onConfirm}
              disabled={savingJoinDate}
            >
              {savingJoinDate ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.confirmButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
