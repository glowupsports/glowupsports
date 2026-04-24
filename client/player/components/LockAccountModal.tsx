import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, FontSizes, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { PinPadModal } from "@/components/PinPadModal";

type Preset = {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  computeUntil: () => Date;
};

function nextWeekdayMorning(hour: number): Date {
  const now = new Date();
  const out = new Date(now);
  out.setHours(hour, 0, 0, 0);
  if (out <= now) out.setDate(out.getDate() + 1);
  while (out.getDay() === 0 || out.getDay() === 6) {
    out.setDate(out.getDate() + 1);
  }
  return out;
}

function todayAtOrTomorrow(hour: number): Date {
  const now = new Date();
  const out = new Date(now);
  out.setHours(hour, 0, 0, 0);
  if (out <= now) out.setDate(out.getDate() + 1);
  return out;
}

const PRESETS: Preset[] = [
  {
    id: "school",
    label: "School day",
    description: "Until 3 pm Mon-Fri",
    icon: "school-outline",
    computeUntil: () => nextWeekdayMorning(15),
  },
  {
    id: "bedtime",
    label: "Bedtime",
    description: "Until 7 am tomorrow",
    icon: "moon-outline",
    computeUntil: () => todayAtOrTomorrow(7),
  },
  {
    id: "study-hour",
    label: "Study hour",
    description: "Locked for 1 hour",
    icon: "book-outline",
    computeUntil: () => new Date(Date.now() + 60 * 60 * 1000),
  },
  {
    id: "two-hours",
    label: "Quick break",
    description: "Locked for 2 hours",
    icon: "time-outline",
    computeUntil: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
  },
  {
    id: "tomorrow",
    label: "Until tomorrow",
    description: "Until 8 am tomorrow",
    icon: "sunny-outline",
    computeUntil: () => todayAtOrTomorrow(8),
  },
];

function formatLockUntil(date: Date): string {
  return date.toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface LockAccountModalProps {
  visible: boolean;
  targetPlayerId: string | null;
  targetName: string | null;
  onClose: () => void;
  onLocked?: () => void;
}

export function LockAccountModal({
  visible,
  targetPlayerId,
  targetName,
  onClose,
  onLocked,
}: LockAccountModalProps) {
  const qc = useQueryClient();
  const [chosenPreset, setChosenPreset] = useState<Preset | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const lockMutation = useMutation({
    mutationFn: async (args: { until: Date; pin: string; reason: string }) => {
      if (!targetPlayerId) throw new Error("No target");
      // Step 1 — exchange PIN for short-lived elevation token. The lock
      // endpoint requires it, mirroring Family B's elevation gate.
      const elevationRes = await apiRequest("POST", "/api/family/elevate-pin", {
        playerId: targetPlayerId,
        pin: args.pin,
      });
      if (!elevationRes.ok) {
        const data = await elevationRes.json().catch(() => ({}));
        const err: any = new Error(data?.error || "Incorrect PIN");
        err.status = elevationRes.status;
        err.attemptsLeft = data?.attemptsLeft;
        throw err;
      }
      const { elevationToken } = await elevationRes.json();
      // Step 2 — call the lock endpoint with the elevation token in the body.
      const res = await apiRequest("POST", `/api/family/lock/${targetPlayerId}`, {
        elevationToken,
        lockedUntil: args.until.toISOString(),
        reason: args.reason,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to lock account");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/family/locks"] });
      qc.invalidateQueries({ queryKey: ["/api/account/audit-log"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Account locked",
        `${targetName ?? "Account"} is now taking a break until ${
          chosenPreset ? formatLockUntil(chosenPreset.computeUntil()) : "the chosen time"
        }.`,
      );
      setPinModalOpen(false);
      setChosenPreset(null);
      onLocked?.();
      onClose();
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.status === 401 || error?.status === 403) {
        setPinError(
          typeof error?.attemptsLeft === "number"
            ? `Wrong PIN — ${error.attemptsLeft} attempts left.`
            : error?.message || "Wrong PIN",
        );
      } else {
        Alert.alert("Couldn't lock account", error?.message || "Please try again.");
      }
    },
  });

  const handlePreset = (preset: Preset) => {
    if (!targetPlayerId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const until = preset.computeUntil();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    if (until.getTime() - Date.now() > fourteenDaysMs) {
      Alert.alert("Too long", "Locks can be up to 14 days at a time.");
      return;
    }
    setChosenPreset(preset);
    setPinError(null);
    setPinModalOpen(true);
  };

  const handlePinSubmit = (pin: string) => {
    if (!chosenPreset) return;
    setPinError(null);
    lockMutation.mutate({
      until: chosenPreset.computeUntil(),
      pin,
      reason: chosenPreset.label,
    });
  };

  const presetLabels = useMemo(
    () =>
      PRESETS.map((p) => ({
        ...p,
        until: p.computeUntil(),
      })),
    [],
  );

  return (
    <>
      <Modal
        visible={visible && !pinModalOpen}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Ionicons name="lock-closed" size={22} color="#FF4136" />
                <Text style={styles.title}>Lock {targetName ?? "account"}</Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close lock dialog"
              >
                <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              While locked, this account can't open the app or join sessions. You'll need
              {Platform.OS === "ios" ? " their" : " its"} 4-digit PIN to confirm.
            </Text>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {presetLabels.map((preset) => (
                <Pressable
                  key={preset.id}
                  style={styles.presetRow}
                  onPress={() => handlePreset(preset)}
                  accessibilityRole="button"
                  accessibilityLabel={`Lock until ${formatLockUntil(preset.until)} — ${preset.label}`}
                >
                  <View style={styles.presetIcon}>
                    <Ionicons name={preset.icon} size={22} color={Colors.dark.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetLabel}>{preset.label}</Text>
                    <Text style={styles.presetDesc}>{preset.description}</Text>
                  </View>
                  <Text style={styles.presetUntil}>{formatLockUntil(preset.until)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PinPadModal
        visible={pinModalOpen}
        title={targetName ? `Enter ${targetName}'s PIN` : "Enter PIN"}
        subtitle={
          chosenPreset
            ? `Locking until ${formatLockUntil(chosenPreset.computeUntil())}`
            : "Confirm to lock this account."
        }
        onSubmit={handlePinSubmit}
        onClose={() => {
          setPinModalOpen(false);
          setChosenPreset(null);
          setPinError(null);
        }}
        errorMessage={pinError}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.dark.cardBackground,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: "75%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { color: Colors.dark.text, fontSize: FontSizes.lg, fontWeight: "700" },
  subtitle: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  list: { marginTop: Spacing.sm },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  presetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.dark.primary}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  presetLabel: { color: Colors.dark.text, fontSize: FontSizes.md, fontWeight: "600" },
  presetDesc: { color: Colors.dark.textMuted, fontSize: FontSizes.xs, marginTop: 2 },
  presetUntil: { color: Colors.dark.textMuted, fontSize: FontSizes.xs },
});
