import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

interface AdminDeletePlayerModalProps {
  visible: boolean;
  playerName: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DELETE_ITEMS = [
  { label: "Progress & XP Data", desc: "Skills, levels, XP transactions, assessments" },
  { label: "Feedback & Notes", desc: "Session feedback, coach notes" },
  { label: "Billing & Payments", desc: "Invoices, payments, packages, subscriptions" },
  { label: "Chat Messages", desc: "Conversations and message history" },
  { label: "Coach Reviews", desc: "Reviews given by the player" },
  { label: "Booking Requests", desc: "Pending and past booking requests" },
];

export function AdminDeletePlayerModal({
  visible,
  playerName,
  isPending,
  onClose,
  onConfirm,
}: AdminDeletePlayerModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="trash" size={32} color={Colors.dark.error} />
            </View>
            <Text style={styles.title}>Delete Player</Text>
            <Text style={styles.subtitle}>{playerName || "Player"}</Text>
          </View>

          <Text style={styles.optionsLabel}>This will permanently delete:</Text>

          <ScrollView style={styles.optionsContainer}>
            {DELETE_ITEMS.map((item) => (
              <View key={item.label} style={styles.optionRow}>
                <View style={styles.checkboxChecked}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  <Text style={styles.optionDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.warningInfo}>
            <Ionicons name="warning" size={16} color={Colors.dark.warning} />
            <Text style={styles.warningText}>This action cannot be undone</Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, isPending && styles.btnDisabled]}
              onPress={onConfirm}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.text} />
              ) : (
                <>
                  <Ionicons name="trash" size={16} color={Colors.dark.text} />
                  <Text style={styles.confirmBtnText}>Delete Player</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  content: {
    backgroundColor: "#1a1a2e",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.error + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.dark.error,
    fontWeight: "600",
  },
  optionsLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  optionsContainer: {
    maxHeight: 240,
    marginBottom: Spacing.md,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    gap: 12,
  },
  checkboxChecked: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  warningInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.warning + "15",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  warningText: {
    fontSize: 13,
    color: Colors.dark.warning,
    fontWeight: "600",
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: "600",
  },
});
