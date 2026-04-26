// Task #1271 — Direct challenge composer (replaces the public-posting-only flow
// for the simple "I want to play with that person" case).
//
// 2-step modal:
//   1) When  — chip-grid of next 7 days × time slots (06:00..22:00).
//   2) Where — short text input for court / venue + optional message.
//
// Sends POST /api/matches/challenge?playerId=<me> with:
//   { opponentId, matchType, matchFormat, matchDate, matchTime,
//     courtName, customLocation, message,
//     courtBookingStatus: "external_pending" | "academy_court" }
//
// On success, dismisses with a success toast. The recipient gets the standard
// challenge notification + banner via the existing match_challenges flow.

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  Switch,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
} from "@/constants/theme";
import { apiRequest, buildPhotoUrl } from "@/lib/query-client";
import type { MatchCandidate } from "./PlayerMatchCard";

interface Props {
  visible: boolean;
  onClose: () => void;
  opponent: MatchCandidate | null;
  myPlayerId: string | null;
  defaultFormat?: "friendly" | "competitive" | "ranking";
  onSent?: (challengeId: string) => void;
}

const TIME_SLOTS = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
];

const FORMATS: { id: "friendly" | "competitive" | "ranking"; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "competitive", label: "Competitive" },
  { id: "ranking", label: "Ranking" },
];

function nextDays(n: number): { iso: string; label: string; sub: string }[] {
  const out: { iso: string; label: string; sub: string }[] = [];
  const wk = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : wk[d.getDay()];
    out.push({
      iso,
      label,
      sub: `${d.getDate()} ${d.toLocaleString(undefined, { month: "short" })}`,
    });
  }
  return out;
}

export function ChallengeComposerModal({
  visible,
  onClose,
  opponent,
  myPlayerId,
  defaultFormat = "friendly",
  onSent,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [format, setFormat] = useState<"friendly" | "competitive" | "ranking">(
    defaultFormat,
  );
  const [court, setCourt] = useState("");
  const [message, setMessage] = useState("");
  // Task #1362 — "Also list as an open match" toggle. Defaults to ON so a
  // direct challenge automatically gets a public twin in the open-match feed
  // (with `invitedPlayerId` set to the challenged opponent so they keep
  // priority for 24h or until match start). The user's last preference is
  // remembered across opens via AsyncStorage.
  const [alsoListPublicly, setAlsoListPublicly] = useState(true);
  const days = useMemo(() => nextDays(7), []);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  useEffect(() => {
    if (visible) {
      setStep(1);
      setDate(days[0].iso);
      setTime(null);
      setFormat(defaultFormat);
      setCourt("");
      setMessage("");
      AsyncStorage.getItem("challenge.alsoListPublicly")
        .then((v) => setAlsoListPublicly(v === null ? true : v === "1"))
        .catch(() => setAlsoListPublicly(true));
    }
  }, [visible, days, defaultFormat]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!myPlayerId || !opponent || !date || !time) {
        throw new Error("Missing required fields");
      }
      const res = await apiRequest(
        "POST",
        `/api/matches/challenge?playerId=${myPlayerId}`,
        {
          opponentId: opponent.id,
          matchType: "singles",
          matchFormat: format,
          matchDate: date,
          matchTime: time,
          courtName: court.trim() || null,
          customLocation: court.trim() || null,
          message: message.trim() || null,
          courtBookingStatus: court.trim() ? "external_pending" : null,
          // Task #1362 — when ON, server publishes a linked open_match with
          // invitedPlayerId=opponent so other players can also claim the
          // slot during the priority window.
          alsoListPublicly,
        },
      );
      return (await res.json()) as { id: string };
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/matches/challenges"] });
      // Task #1362 — also refresh the open-match feed since a linked
      // open_match may have just been created.
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      // Persist toggle preference for next time the composer opens.
      AsyncStorage.setItem(
        "challenge.alsoListPublicly",
        alsoListPublicly ? "1" : "0",
      ).catch(() => {});
      onSent?.(data.id);
      if (Platform.OS === "web") {
        // Web alert is fine here — production handler is OS native modal.
      }
      onClose();
    },
    onError: (err: any) => {
      Alert.alert("Couldn't send challenge", err?.message || "Try again.");
    },
  });

  if (!opponent) return null;
  const photo = buildPhotoUrl(opponent.profilePhotoUrl);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.headerAvatar} />
              ) : (
                <View
                  style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}
                >
                  <Ionicons
                    name="person"
                    size={18}
                    color={Colors.dark.textMuted}
                  />
                </View>
              )}
              <View>
                <Text style={styles.headerEyebrow}>
                  Step {step} of 2 — challenge
                </Text>
                <Text style={styles.headerTitle}>
                  {opponent.name || "Player"}
                </Text>
              </View>
            </View>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons
                name="close"
                size={22}
                color={Colors.dark.textSecondary}
              />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: Spacing.xl }}
          >
            {step === 1 ? (
              <>
                <Text style={styles.label}>Pick a day</Text>
                <View style={styles.dayRow}>
                  {days.map((d) => {
                    const active = d.iso === date;
                    return (
                      <Pressable
                        key={d.iso}
                        style={[styles.dayChip, active && styles.chipActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setDate(d.iso);
                          setTime(null);
                        }}
                      >
                        <Text
                          style={[
                            styles.dayChipLabel,
                            active && styles.chipActiveText,
                          ]}
                        >
                          {d.label}
                        </Text>
                        <Text
                          style={[
                            styles.dayChipSub,
                            active && styles.chipActiveText,
                          ]}
                        >
                          {d.sub}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.label, { marginTop: Spacing.lg }]}>
                  Pick a time
                </Text>
                <View style={styles.timeGrid}>
                  {TIME_SLOTS.map((slot) => {
                    const active = slot === time;
                    return (
                      <Pressable
                        key={slot}
                        style={[styles.timeChip, active && styles.chipActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setTime(slot);
                        }}
                      >
                        <Text
                          style={[
                            styles.timeChipText,
                            active && styles.chipActiveText,
                          ]}
                        >
                          {slot}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.label, { marginTop: Spacing.lg }]}>
                  Match type
                </Text>
                <View style={styles.formatRow}>
                  {FORMATS.map((f) => {
                    const active = f.id === format;
                    return (
                      <Pressable
                        key={f.id}
                        style={[styles.fmtChip, active && styles.chipActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setFormat(f.id);
                        }}
                      >
                        <Text
                          style={[
                            styles.fmtText,
                            active && styles.chipActiveText,
                          ]}
                        >
                          {f.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Task #1362 — Also list as an open match. Default ON. */}
                <Pressable
                  style={styles.alsoRow}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAlsoListPublicly((v) => !v);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alsoTitle}>
                      {t("player.play.alsoListPublicly")}
                    </Text>
                    <Text style={styles.alsoSubtitle}>
                      {t("player.play.alsoListPubliclyHint")}
                    </Text>
                  </View>
                  <Switch
                    value={alsoListPublicly}
                    onValueChange={(v) => {
                      Haptics.selectionAsync();
                      setAlsoListPublicly(v);
                    }}
                    trackColor={{
                      false: Colors.dark.borderSubtle,
                      true: Colors.dark.primary,
                    }}
                    thumbColor="#0B0D10"
                  />
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>Where will you play?</Text>
                <TextInput
                  style={styles.input}
                  value={court}
                  onChangeText={setCourt}
                  placeholder="Court name or venue (optional)"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <Text style={[styles.label, { marginTop: Spacing.lg }]}>
                  Add a message (optional)
                </Text>
                <TextInput
                  style={[styles.input, { height: 96, textAlignVertical: "top" }]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Looking for a casual hit at 6pm..."
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                />
                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>Summary</Text>
                  <Text style={styles.summaryLine}>
                    {opponent.name} · {format} · {date} at {time}
                  </Text>
                  {court.trim() ? (
                    <Text style={styles.summaryLine}>{court.trim()}</Text>
                  ) : null}
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {step === 2 ? (
              <Pressable
                style={[styles.footerBtn, styles.footerBtnGhost]}
                onPress={() => setStep(1)}
              >
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={Colors.dark.textSecondary}
                />
                <Text style={styles.footerGhostText}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={step === 1 ? !date || !time : mutation.isPending}
              style={[
                styles.footerBtn,
                styles.footerBtnPrimary,
                ((step === 1 && (!date || !time)) || mutation.isPending) &&
                  styles.disabled,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (step === 1) setStep(2);
                else mutation.mutate();
              }}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#0B0D10" size="small" />
              ) : (
                <>
                  <Text style={styles.footerPrimaryText}>
                    {step === 1 ? "Continue" : "Send challenge"}
                  </Text>
                  <Ionicons
                    name={step === 1 ? "chevron-forward" : "send"}
                    size={16}
                    color="#0B0D10"
                  />
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    maxHeight: "90%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.borderSubtle,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  headerAvatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "700",
  },
  body: {
    flexShrink: 1,
  },
  label: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    minWidth: 70,
    alignItems: "center",
  },
  dayChipLabel: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  dayChipSub: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  timeChipText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  formatRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  fmtChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    alignItems: "center",
  },
  fmtText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  chipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  chipActiveText: {
    color: "#0B0D10",
  },
  input: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
  },
  summary: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 4,
  },
  summaryTitle: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  summaryLine: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
  },
  footerBtnPrimary: {
    flex: 1,
    backgroundColor: Colors.dark.primary,
  },
  footerBtnGhost: {
    paddingHorizontal: Spacing.lg,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  footerPrimaryText: {
    color: "#0B0D10",
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  footerGhostText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  alsoRow: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  alsoTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  alsoSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.xs,
    marginTop: 2,
    lineHeight: 16,
  },
});
