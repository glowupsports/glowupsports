import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds } from "@/constants/theme";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { SuccessToast } from "@/components/SuccessToast";

const MAX_LEN = 280;

class ReminderError extends Error {
  status: number;
  serverMessage?: string;
  constructor(message: string, status: number, serverMessage?: string) {
    super(message);
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
  seriesId: string;
  seriesName: string;
  activePlayerCount: number;
  lessonSessionId?: string;
}

export default function SendGroupReminderModal({
  visible,
  onClose,
  seriesId,
  seriesName,
  activePlayerCount,
  lessonSessionId,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [throttleError, setThrottleError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const remaining = MAX_LEN - message.length;
  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_LEN && activePlayerCount > 0;

  const presets = useMemo(
    () => [
      { key: "court", label: t("coach.reminder.chipCourtBooking", "Court booking"), text: t("coach.reminder.templateCourtBooking") },
      { key: "rackets", label: t("coach.reminder.chipRackets", "Bring rackets"), text: t("coach.reminder.templateRackets") },
      { key: "weather", label: t("coach.reminder.chipWeather", "Weather / location"), text: t("coach.reminder.templateWeather") },
      { key: "confirm", label: t("coach.reminder.chipConfirm", "Confirm attendance"), text: t("coach.reminder.templateConfirm") },
    ],
    [t],
  );

  const reset = () => {
    setMessage("");
    setThrottleError(null);
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    reset();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const url = new URL(
        `/api/coach/series/${seriesId}/reminder`,
        getApiUrl(),
      );
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({ message: trimmed, lessonSessionId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        failed?: number;
      };
      if (!res.ok) {
        const err = new ReminderError(
          data?.error || "Failed to send reminder",
          res.status,
          data?.error,
        );
        throw err;
      }
      return { sent: data.sent ?? 0, failed: data.failed ?? 0 };
    },
    onSuccess: (data) => {
      setToastMessage(
        t("coach.reminder.successToast", { count: data.sent }) as string,
      );
      setToastVisible(true);
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      const re = err instanceof ReminderError ? err : null;
      if (re?.status === 429) {
        setThrottleError(
          re.serverMessage || (t("coach.reminder.throttleError") as string),
        );
        return;
      }
      Alert.alert(
        t("common.error", "Error") as string,
        re?.serverMessage ||
          (t("coach.reminder.genericError") as string),
      );
    },
  });

  const handlePreset = (text: string) => {
    setThrottleError(null);
    setMessage(text.slice(0, MAX_LEN));
  };

  const handleSend = () => {
    if (!canSend) return;
    setThrottleError(null);
    mutation.mutate();
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={handleClose} />
          <View style={[styles.card, { marginBottom: insets.bottom + Spacing.lg }]}>
            <KeyboardAwareScrollViewCompat>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {t("coach.reminder.modalTitle", { name: seriesName })}
                  </Text>
                </View>
                <Pressable
                  onPress={handleClose}
                  style={styles.closeBtn}
                  hitSlop={8}
                  disabled={mutation.isPending}
                >
                  <Ionicons name="close" size={22} color={Colors.dark.text} />
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {presets.map((p) => (
                  <Pressable
                    key={p.key}
                    style={({ pressed }) => [
                      styles.chip,
                      message === p.text && styles.chipActive,
                      pressed && styles.chipPressed,
                    ]}
                    onPress={() => handlePreset(p.text)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        message === p.text && styles.chipTextActive,
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                style={styles.input}
                placeholder={t("coach.reminder.placeholder") as string}
                placeholderTextColor={Colors.dark.textMuted}
                value={message}
                onChangeText={(v) => {
                  setThrottleError(null);
                  setMessage(v.slice(0, MAX_LEN));
                }}
                multiline
                maxLength={MAX_LEN}
                editable={!mutation.isPending}
                textAlignVertical="top"
              />

              <Text style={styles.counter}>
                {t("coach.reminder.charsLeft", { count: remaining })}
              </Text>

              {throttleError ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={16} color={Colors.dark.error} />
                  <Text style={styles.errorText}>{throttleError}</Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={handleClose}
                  style={styles.cancelBtn}
                  disabled={mutation.isPending}
                >
                  <Text style={styles.cancelText}>
                    {t("common.cancel", "Cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSend}
                  style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
                  disabled={!canSend || mutation.isPending}
                >
                  {mutation.isPending ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <>
                      <Ionicons
                        name="paper-plane"
                        size={16}
                        color={Colors.dark.buttonText}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.sendText} numberOfLines={1}>
                        {t("coach.reminder.sendButton", { count: activePlayerCount })}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      <SuccessToast
        visible={toastVisible}
        message={toastMessage}
        variant="success"
        onHide={() => setToastVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  card: {
    backgroundColor: Colors.dark.card,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Backgrounds.elevated,
  },
  chipsRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  chipActive: {
    backgroundColor: Colors.dark.accentCyan + "22",
    borderColor: Colors.dark.accentCyan,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
  },
  chipTextActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  input: {
    minHeight: 110,
    maxHeight: 180,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    lineHeight: 21,
  },
  counter: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "right",
    marginTop: 6,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error + "15",
  },
  errorText: {
    ...Typography.small,
    color: Colors.dark.error,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  cancelBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  cancelText: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.accentCyan,
    minWidth: 160,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
