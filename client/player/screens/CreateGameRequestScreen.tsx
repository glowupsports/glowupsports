import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const SPORTS = [
  { key: "tennis", label: "Tennis", icon: "tennisball-outline" },
  { key: "padel", label: "Padel", icon: "golf-outline" },
  { key: "squash", label: "Squash", icon: "football-outline" },
  { key: "pickleball", label: "Pickleball", icon: "baseball-outline" },
  { key: "badminton", label: "Badminton", icon: "barbell-outline" },
] as const;

type SportKey = typeof SPORTS[number]["key"];

export default function CreateGameRequestScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const playerId = user?.playerId;
  const headerHeight = useHeaderHeight();

  const [sport, setSport] = useState<SportKey>("tennis");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [spotsTotal, setSpotsTotal] = useState(3);
  const [levelMin, setLevelMin] = useState<number | null>(null);
  const [levelMax, setLevelMax] = useState<number | null>(null);

  const now = new Date();
  const defaultDate = new Date(now.getTime() + 60 * 60 * 1000);
  const [scheduledAt, setScheduledAt] = useState(defaultDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!playerId) throw new Error("Not authenticated");
      if (!location.trim()) throw new Error("Location is required");

      const expiresAt = new Date(scheduledAt);
      const res = await apiRequest("POST", `/api/play-partner/requests?playerId=${playerId}`, {
        sport,
        scheduledAt: scheduledAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        location: location.trim(),
        spotsTotal,
        levelMin: levelMin || undefined,
        levelMax: levelMax || undefined,
        notes: notes.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Game Posted!",
        "Your game request is live. Other players can now find and join your game.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).includes("/api/play-partner") });
    },
    onError: (err: Error) => {
      const msg = err.message.includes(": ") ? err.message.split(": ").slice(1).join(": ") : err.message;
      Alert.alert("Error", msg || "Could not post game request");
    },
  });

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Sport</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sportRow} contentContainerStyle={styles.sportRowContent}>
          {SPORTS.map(s => (
            <Pressable
              key={s.key}
              style={[styles.sportChip, sport === s.key && styles.sportChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSport(s.key);
              }}
            >
              <Ionicons name={s.icon as any} size={16} color={sport === s.key ? Colors.dark.backgroundRoot : Colors.dark.textMuted} />
              <Text style={[styles.sportChipText, sport === s.key && styles.sportChipTextActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>Date & Time</Text>
        <View style={styles.row}>
          <Pressable style={styles.dateBtn} onPress={() => {
            setShowTimePicker(false);
            setShowDatePicker(true);
          }}>
            <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.dateBtnText}>{formatDate(scheduledAt)}</Text>
          </Pressable>
          <Pressable style={styles.dateBtn} onPress={() => {
            setShowDatePicker(false);
            setShowTimePicker(true);
          }}>
            <Ionicons name="time-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.dateBtnText}>{formatTime(scheduledAt)}</Text>
          </Pressable>
        </View>

        {showDatePicker ? (
          <DateTimePicker
            value={scheduledAt}
            mode="date"
            minimumDate={new Date()}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_e, d) => {
              if (d) {
                const updated = new Date(scheduledAt);
                updated.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                setScheduledAt(updated);
              }
              if (Platform.OS !== "ios") setShowDatePicker(false);
            }}
          />
        ) : null}
        {showTimePicker ? (
          <DateTimePicker
            value={scheduledAt}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_e, d) => {
              if (d) {
                const updated = new Date(scheduledAt);
                updated.setHours(d.getHours(), d.getMinutes());
                setScheduledAt(updated);
              }
              if (Platform.OS !== "ios") setShowTimePicker(false);
            }}
          />
        ) : null}

        <Text style={styles.sectionLabel}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Where are you playing? (court name, club...)"
          placeholderTextColor={Colors.dark.textMuted}
          value={location}
          onChangeText={setLocation}
        />

        <Text style={styles.sectionLabel}>Players Needed</Text>
        <View style={styles.row}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <Pressable
              key={n}
              style={[styles.numberChip, spotsTotal === n && styles.numberChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSpotsTotal(n);
              }}
            >
              <Text style={[styles.numberChipText, spotsTotal === n && styles.numberChipTextActive]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>How many more players do you need?</Text>

        <Text style={styles.sectionLabel}>Level Range (optional)</Text>
        <View style={styles.levelRow}>
          <View style={styles.levelField}>
            <Text style={styles.levelLabel}>Min Level</Text>
            <View style={styles.levelStepper}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setLevelMin(prev => prev !== null ? Math.max(1, prev - 1) : null)}
              >
                <Ionicons name="remove" size={16} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.levelValue}>{levelMin ?? "—"}</Text>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setLevelMin(prev => (prev === null ? 1 : Math.min(10, prev + 1)))}
              >
                <Ionicons name="add" size={16} color={Colors.dark.text} />
              </Pressable>
            </View>
          </View>
          <View style={styles.levelField}>
            <Text style={styles.levelLabel}>Max Level</Text>
            <View style={styles.levelStepper}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setLevelMax(prev => prev !== null ? Math.max(1, prev - 1) : null)}
              >
                <Ionicons name="remove" size={16} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.levelValue}>{levelMax ?? "—"}</Text>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setLevelMax(prev => (prev === null ? 10 : Math.min(10, prev + 1)))}
              >
                <Ionicons name="add" size={16} color={Colors.dark.text} />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Additional Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Any details? (skill level, casual/competitive, etc.)"
          placeholderTextColor={Colors.dark.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Pressable
          style={[styles.submitBtn, mutation.isPending && styles.submitDisabled]}
          onPress={() => {
            if (!mutation.isPending) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              mutation.mutate();
            }
          }}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            {mutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="megaphone-outline" size={18} color={Colors.dark.buttonText} />
                <Text style={styles.submitText}>Post Game Request</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scroll: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
  },
  sportRow: {
    flexGrow: 0,
  },
  sportRowContent: {
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  sportChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sportChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  sportChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textMuted,
  },
  sportChipTextActive: {
    color: Colors.dark.buttonText,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dateBtnText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    padding: 12,
    fontSize: 14,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 80,
  },
  numberChip: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  numberChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  numberChipText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  numberChipTextActive: {
    color: Colors.dark.buttonText,
  },
  hint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: -4,
  },
  levelRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  levelField: {
    flex: 1,
    gap: 6,
  },
  levelLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  levelStepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  stepBtn: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  levelValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  submitBtn: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginTop: Spacing.md,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 15,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
}));
