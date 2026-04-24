import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Colors, Spacing, FontSizes, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface PinRecoveryModalProps {
  visible: boolean;
  /** Optional player whose PIN we're recovering. If omitted, the server uses the authenticated caller. */
  targetPlayerId?: string;
  /** Pre-fill email field. */
  defaultEmail?: string;
  onClose: () => void;
}

export function PinRecoveryModal({
  visible,
  targetPlayerId,
  defaultEmail,
  onClose,
}: PinRecoveryModalProps) {
  const [email, setEmail] = useState<string>(defaultEmail || "");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setEmail(defaultEmail || "");
      setSent(false);
      setError(null);
    }
  }, [visible, defaultEmail]);

  const handleSend = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const url = new URL("/api/account/pin/recover", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          playerId: targetPlayerId,
        }),
      });
      // For privacy reasons the server may return 200 even when the email is
      // unknown. We surface a generic success message either way.
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Could not send recovery email");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Reset PIN</Text>
          {sent ? (
            <>
              <Text style={styles.subtitle}>
                If an account exists for that email, a reset link is on its way. The
                link expires in 15 minutes.
              </Text>
              <Pressable onPress={onClose} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Enter the email on the account. We'll send a one-time link to set a new PIN.
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <View style={styles.row}>
                <Pressable onPress={onClose} style={styles.ghostBtn} disabled={submitting}>
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSend} style={styles.primaryBtn} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send link</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.borderSubtle,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  subtitle: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.md,
  },
  errorText: {
    marginTop: Spacing.sm,
    color: "#ef4444",
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
  row: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    gap: Spacing.md,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: Spacing.lg,
  },
  primaryBtnText: { color: "#000", fontWeight: "700", fontSize: FontSizes.md },
  ghostBtn: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.borderSubtle,
  },
  ghostBtnText: { color: Colors.dark.text, fontWeight: "600", fontSize: FontSizes.md },
});
