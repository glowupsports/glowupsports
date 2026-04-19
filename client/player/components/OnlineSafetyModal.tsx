import React from "react";
import { View, Modal, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius, TextColors, Backgrounds } from "@/constants/theme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface OnlineSafetyModalProps {
  visible: boolean;
  onAccept: () => void;
}

let safetyReminderShown = false;

export function hasShownSafetyReminder(): boolean {
  return safetyReminderShown;
}

export function markSafetyReminderShown(): void {
  safetyReminderShown = true;
}

export function resetSafetyReminder(): void {
  safetyReminderShown = false;
}

export default function OnlineSafetyModal({ visible, onAccept }: OnlineSafetyModalProps) {
  const handleAccept = () => {
    markSafetyReminderShown();
    onAccept();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient
            colors={["#1a1a2e", "#16213e"]}
            style={styles.gradient}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={48} color="#00E676" />
            </View>
            
            <ThemedText style={styles.title}>Stay Safe Online</ThemedText>
            
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.tipRow}>
                <Ionicons name="person-circle-outline" size={24} color="#00BCD4" />
                <ThemedText style={styles.tipText}>
                  Only chat with people you know in real life, like your coach or teammates
                </ThemedText>
              </View>
              
              <View style={styles.tipRow}>
                <Ionicons name="lock-closed-outline" size={24} color="#00BCD4" />
                <ThemedText style={styles.tipText}>
                  Never share personal information like your address, phone number, or school name
                </ThemedText>
              </View>
              
              <View style={styles.tipRow}>
                <Ionicons name="image-outline" size={24} color="#00BCD4" />
                <ThemedText style={styles.tipText}>
                  Be careful about sharing photos or videos - once shared, they can be seen by others
                </ThemedText>
              </View>
              
              <View style={styles.tipRow}>
                <Ionicons name="alert-circle-outline" size={24} color="#00BCD4" />
                <ThemedText style={styles.tipText}>
                  If someone makes you feel uncomfortable, tell a parent or coach right away
                </ThemedText>
              </View>
              
              <View style={styles.tipRow}>
                <Ionicons name="heart-outline" size={24} color="#00BCD4" />
                <ThemedText style={styles.tipText}>
                  Be kind and respectful to everyone - treat others the way you want to be treated
                </ThemedText>
              </View>
            </ScrollView>
            
            <Pressable style={styles.acceptButton} onPress={handleAccept}>
              <ThemedText style={styles.acceptText}>I Understand</ThemedText>
            </Pressable>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  container: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  gradient: {
    padding: Spacing.xl,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: TextColors.primary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  content: {
    maxHeight: 300,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 20,
  },
  acceptButton: {
    backgroundColor: "#00E676",
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: "700",
    color: Backgrounds.root,
  },
}));
