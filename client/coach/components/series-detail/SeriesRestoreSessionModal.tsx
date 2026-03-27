import React from "react";
import { View, Text, Modal, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { SessionInstance, SeriesDetail } from "./types";

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedSession: SessionInstance | null;
  series: SeriesDetail | null;
  onRestore: () => void;
  restoringSession: boolean;
  bottomInset: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function SeriesRestoreSessionModal({ visible, onClose, selectedSession, series, onRestore, restoringSession, bottomInset }: Props) {
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
              <Ionicons name="refresh-circle" size={28} color={Colors.dark.accentCyan} />
              <Text style={styles.restoreModalTitle}>Restore Session</Text>
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
              <View style={styles.restoreSessionCard}>
                <LinearGradient
                  colors={[Colors.dark.accentCyan + "25", Colors.dark.accentCyan + "08"]}
                  style={styles.restoreSessionCardGradient}
                >
                  <View style={styles.restoreSessionIconContainer}>
                    <Ionicons name="calendar" size={36} color={Colors.dark.accentCyan} />
                  </View>
                  <Text style={styles.restoreSessionDate}>{formatDate(selectedSession.startTime)}</Text>
                  <Text style={styles.restoreSessionWeek}>
                    Week {selectedSession.weekNumber || ([...(series?.sessions || [])].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).findIndex(s => s.id === selectedSession.id) + 1)}
                  </Text>
                </LinearGradient>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.dark.accentCyan + "15", borderWidth: 1, borderColor: Colors.dark.accentCyan + "30" }}>
                <Ionicons name="shield-checkmark" size={18} color={Colors.dark.accentCyan} />
                <Text style={{ color: Colors.dark.accentCyan, fontSize: 13, fontWeight: "600" }}>
                  Credits Refunded - No charges applied
                </Text>
              </View>

              <Text style={styles.restoreSessionDescription}>
                Restore this cancelled session to mark attendance
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.restoreButton,
                  pressed && styles.restoreButtonPressed,
                  restoringSession && styles.restoreButtonDisabled,
                ]}
                onPress={onRestore}
                disabled={restoringSession}
              >
                <LinearGradient
                  colors={[Colors.dark.successNeon, Colors.dark.accentGreen]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.restoreButtonGradient}
                >
                  {restoringSession ? (
                    <ActivityIndicator size="small" color={Colors.dark.text} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.dark.text} />
                      <Text style={styles.restoreButtonText}>Restore Session</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
