import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { Colors, GlowColors, Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import KeyboardAwareScrollViewCompat from "@/components/KeyboardAwareScrollViewCompat";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const APPLE_HANDLE_RE = /^apple_[a-f0-9]+$/i;
const VALID_RE = /^[a-z0-9_]+$/;

type Status = {
  checking: boolean;
  available: boolean | null;
  error: string | null;
};

export default function ChooseUsernameModal() {
  const { user, refreshAuth } = useAuth();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>({
    checking: false,
    available: null,
    error: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open whenever an authenticated user still has the auto-generated
  // `apple_<hex>` handle. Closes itself once they've picked a real one.
  useEffect(() => {
    const username = user?.username || "";
    const needsRename = !!user && APPLE_HANDLE_RE.test(username);
    if (needsRename && !visible && !submitting) {
      setVisible(true);
      setValue("");
      setStatus({ checking: false, available: null, error: null });
      setServerError(null);
    } else if (!needsRename && visible && !submitting) {
      setVisible(false);
    }
  }, [user?.username, visible, submitting]);

  useEffect(() => {
    return () => {
      if (checkTimeout.current) clearTimeout(checkTimeout.current);
    };
  }, []);

  const checkAvailability = (raw: string) => {
    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    const normalized = raw.toLowerCase().trim();
    if (normalized.length < 3) {
      setStatus({ checking: false, available: null, error: null });
      return;
    }
    if (!VALID_RE.test(normalized)) {
      setStatus({
        checking: false,
        available: false,
        error: "Only letters, numbers, and underscores allowed",
      });
      return;
    }
    if (APPLE_HANDLE_RE.test(normalized)) {
      setStatus({
        checking: false,
        available: false,
        error: "Please pick a friendlier username",
      });
      return;
    }
    setStatus({ checking: true, available: null, error: null });
    checkTimeout.current = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/auth/check-username/${normalized}`);
        const data = await res.json();
        setStatus({
          checking: false,
          available: !!data.available,
          error: data.available ? null : data.error || "Username already taken",
        });
      } catch {
        setStatus({ checking: false, available: null, error: null });
      }
    }, 450);
  };

  const handleChange = (raw: string) => {
    setValue(raw);
    setServerError(null);
    checkAvailability(raw);
  };

  const normalized = value.toLowerCase().trim();
  const validFormat =
    normalized.length >= 3 && VALID_RE.test(normalized) && !APPLE_HANDLE_RE.test(normalized);
  const submitDisabled =
    !validFormat || status.checking || status.available === false || submitting;

  const handleSubmit = async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setServerError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await apiRequest("POST", "/auth/apple/choose-username", {
        username: normalized,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setServerError(data?.error || "Could not save that username. Please try another.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      try {
        await refreshAuth();
      } catch {}
      // The visibility effect will close us once the user object refreshes.
      setVisible(false);
    } catch (err: any) {
      setServerError(err?.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {
        // Intentionally non-dismissible — user must pick a username.
      }}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="at" size={28} color={Colors.dark.accentText} />
            </View>
            <Text style={styles.title}>Pick your username</Text>
            <Text style={styles.subtitle}>
              Your friends, coaches, and leaderboards will see this name. Choose
              something you like — you can always change it later in Settings.
            </Text>

            <View style={styles.inputWrap}>
              <Ionicons
                name="at-outline"
                size={18}
                color={Colors.dark.textMuted}
                style={{ marginRight: 8 }}
              />
              <TextInput
                value={value}
                onChangeText={handleChange}
                placeholder="e.g. ace_serena"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username-new"
                maxLength={30}
                style={styles.input}
                editable={!submitting}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              {status.checking ? (
                <ActivityIndicator size="small" color={Colors.dark.textMuted} />
              ) : status.available === true ? (
                <Ionicons name="checkmark-circle" size={20} color={Colors.dark.success} />
              ) : status.available === false ? (
                <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
              ) : null}
            </View>

            {status.error ? (
              <Text style={styles.helperError}>{status.error}</Text>
            ) : (
              <Text style={styles.helper}>
                3+ characters · letters, numbers, underscores
              </Text>
            )}

            {serverError ? <Text style={styles.helperError}>{serverError}</Text> : null}

            <Pressable
              style={[styles.cta, submitDisabled ? styles.ctaDisabled : null]}
              onPress={handleSubmit}
              disabled={submitDisabled}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={styles.ctaLabel}>CONTINUE</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}33`,
    alignItems: "stretch",
  },
  iconCircle: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${GlowColors.primary}1A`,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}55`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: Spacing.xs,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
  },
  input: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 16,
  },
  helper: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  helperError: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.dark.error,
  },
  cta: {
    marginTop: Spacing.lg,
    backgroundColor: GlowColors.primary,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaLabel: {
    color: Colors.dark.buttonText,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1,
  },
}));
