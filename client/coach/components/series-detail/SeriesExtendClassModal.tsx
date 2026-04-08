import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";

interface Props {
  visible: boolean;
  onClose: () => void;
  weeksToExtend: number;
  setWeeksToExtend: (n: number) => void;
  weekOptions: number[];
  onConfirm: () => void;
}

export function SeriesExtendClassModal({ visible, onClose, weeksToExtend, setWeeksToExtend, weekOptions, onConfirm }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.extendModalOverlay}>
        <View style={styles.extendModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </View>
        <View style={styles.extendModalContent}>
          <View style={styles.extendModalHeader}>
            <Ionicons name="calendar-outline" size={32} color={Colors.dark.accent} />
            <Text style={styles.extendModalTitle}>Extend Class</Text>
            <Text style={styles.extendModalSubtitle}>
              Add more weeks to this class series
            </Text>
          </View>

          <Text style={styles.extendModalLabel}>How many weeks?</Text>
          <View style={styles.weekOptionsGrid}>
            {weekOptions.map((weeks) => (
              <Pressable
                key={weeks}
                style={[
                  styles.weekOption,
                  weeksToExtend === weeks && styles.weekOptionSelected,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setWeeksToExtend(weeks);
                }}
              >
                <Text style={[
                  styles.weekOptionText,
                  weeksToExtend === weeks && styles.weekOptionTextSelected,
                ]}>
                  {weeks}
                </Text>
                <Text style={[
                  styles.weekOptionSubtext,
                  weeksToExtend === weeks && styles.weekOptionSubtextSelected,
                ]}>
                  weeks
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.extendModalFooter}>
            <Pressable style={styles.extendCancelButton} onPress={onClose}>
              <Text style={styles.extendCancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.extendConfirmButton} onPress={onConfirm}>
              <LinearGradient
                colors={[Colors.dark.accent, Colors.dark.accentGreen]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.extendConfirmGradient}
              >
                <Ionicons name="add-circle" size={20} color={Colors.dark.buttonText} />
                <Text style={styles.extendConfirmButtonText}>
                  Add {weeksToExtend} Weeks
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
