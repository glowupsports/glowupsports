import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { DrillItem } from "@/player/screens/PlayerDrillsScreen";

interface Props {
  drill: DrillItem;
  onClose: () => void;
  onLogged: (xpAwarded: number) => void;
}

const DURATIONS = [5, 10, 15, 20, 30, 45, 60];

export function DrillLogModal({ drill, onClose, onLogged }: Props) {
  const insets = useSafeAreaInsets();
  const [duration, setDuration] = useState<number>(drill.durationMinutes ?? 15);
  const [rating, setRating] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [xpEarned, setXpEarned] = useState<number | null>(null);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert("Rate your session", "Please give yourself a rating before logging.");
      return;
    }
    setIsLogging(true);
    try {
      const { getApiUrl, getAuthHeaders } = await import("@/lib/query-client");
      const url = new URL(`/api/player/me/drills/${drill.id}/log`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ durationDone: duration, rating, notes: notes.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed to log drill");
      const data = await res.json();
      setXpEarned(data.xpAwarded ?? 0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", "Could not save your drill log. Please try again.");
    } finally {
      setIsLogging(false);
    }
  };

  // XP earned celebration view
  if (xpEarned !== null) {
    return (
      <Modal visible animationType="fade" transparent presentationStyle="overFullScreen" onRequestClose={() => onLogged(xpEarned)}>
        <View style={s.overlay}>
          <View style={s.celebration}>
            <View style={s.celebrationIcon}>
              <Ionicons name="checkmark-circle" size={64} color={GlowColors.primary} />
            </View>
            <Text style={s.celebrationTitle}>Drill Logged!</Text>
            <Text style={s.celebrationSub}>{drill.name}</Text>
            {xpEarned > 0 ? (
              <View style={s.xpRow}>
                <Ionicons name="flash" size={18} color="#FFD700" />
                <Text style={s.xpText}>+{xpEarned} XP earned</Text>
              </View>
            ) : (
              <Text style={s.xpTextMuted}>Practice logged to your Journey</Text>
            )}
            <Pressable style={s.doneBtn} onPress={() => onLogged(xpEarned)}>
              <Text style={s.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.handle} />

          <View style={s.header}>
            <View style={s.headerLeft}>
              <Text style={s.headerLabel}>LOG DRILL</Text>
              <Text style={s.headerDrillName} numberOfLines={1}>{drill.name}</Text>
            </View>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {/* Duration */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Duration</Text>
              <View style={s.durationRow}>
                {DURATIONS.map(d => (
                  <Pressable
                    key={d}
                    style={[s.durationChip, duration === d && s.durationChipActive]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDuration(d); }}
                  >
                    <Text style={[s.durationChipText, duration === d && s.durationChipTextActive]}>
                      {d}m
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Rating */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>How did it go?</Text>
              <View style={s.starsRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <Pressable
                    key={star}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRating(star); }}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={rating >= star ? "star" : "star-outline"}
                      size={36}
                      color={rating >= star ? "#FFD700" : Colors.dark.chipBackgroundStrong}
                    />
                  </Pressable>
                ))}
              </View>
              {rating > 0 ? (
                <Text style={s.ratingLabel}>
                  {["", "Tough session", "Getting there", "Solid work", "Great session", "Perfect drill!"][rating]}
                </Text>
              ) : null}
            </View>

            {/* Notes */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={s.notesInput}
                placeholder="What worked? What to improve?"
                placeholderTextColor={Colors.dark.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </KeyboardAwareScrollViewCompat>

          <Pressable
            style={({ pressed }) => [s.submitBtn, pressed && s.submitBtnPressed, isLogging && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isLogging}
          >
            {isLogging ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={s.submitBtnText}>Save Log</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingTop: 12,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flex: 1, gap: 3 },
  headerLabel: { fontSize: 10, fontWeight: "800", color: GlowColors.primary, letterSpacing: 1.5 },
  headerDrillName: { fontSize: 16, fontWeight: "800", color: Colors.dark.text },

  fieldGroup: { gap: Spacing.sm, marginBottom: Spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },

  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.chipBackground,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
  },
  durationChipActive: { backgroundColor: GlowColors.primary + "22", borderColor: GlowColors.primary },
  durationChipText: { fontSize: 13, fontWeight: "600", color: Colors.dark.textMuted },
  durationChipTextActive: { color: GlowColors.primary, fontWeight: "800" },

  starsRow: { flexDirection: "row", gap: Spacing.md, alignItems: "center" },
  ratingLabel: { fontSize: 13, color: Colors.dark.textSubtle, fontStyle: "italic" },

  notesInput: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.chipBorder,
    padding: Spacing.md,
    fontSize: 14,
    color: Colors.dark.text,
    minHeight: 80,
  },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
  },
  submitBtnPressed: { opacity: 0.8 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: "800", color: "#000" },

  // Celebration
  celebration: {
    backgroundColor: Colors.dark.backgroundDefault,
    margin: Spacing.xl,
    borderRadius: 24,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  celebrationIcon: { marginBottom: Spacing.sm },
  celebrationTitle: { fontSize: 26, fontWeight: "900", color: Colors.dark.text },
  celebrationSub: { fontSize: 15, color: Colors.dark.textSubtle, textAlign: "center" },
  xpRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  xpText: { fontSize: 20, fontWeight: "800", color: "#FFD700" },
  xpTextMuted: { fontSize: 14, color: Colors.dark.textMuted },
  doneBtn: {
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xxl,
    marginTop: Spacing.sm,
  },
  doneBtnText: { fontSize: 16, fontWeight: "800", color: "#000" },
});
