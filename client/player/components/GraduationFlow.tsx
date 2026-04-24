// Family G — Account Graduation 3-step flow (Task #1138).
//
// Step 1: PIN gate — verify the caller's own PIN to mint an elevation token.
//         (We accept the caller's own PIN; for a parent graduating a child,
//         the parent's PIN is fine — the server also accepts the graduate's
//         current PIN inline as a fallback.)
// Step 2: Email — graduate enters their own email address. Validation is
//         shape-only client-side; server enforces uniqueness.
// Step 3: New PIN — graduate (or whoever is driving the flow) sets the new
//         4-digit PIN that replaces the old one.
//
// Final POST to /api/family/graduate/:playerId is atomic on the server:
// users.email update + accountPins.pinHash replace + account_graduation row
// + audit log all happen in one transaction (audit log is best-effort).
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { PinPadModal } from "@/components/PinPadModal";

type Step = "intro" | "pin" | "email" | "newPin" | "done";

interface GraduationFlowProps {
  visible: boolean;
  targetPlayerId: string | null;
  targetName: string | null;
  currentEmail: string | null;
  daysUntilEighteen: number | null;
  onClose: () => void;
  onComplete: () => void;
}

function parseApiError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const colonIdx = raw.indexOf(":");
  if (colonIdx !== -1) {
    try {
      const parsed = JSON.parse(raw.substring(colonIdx + 1).trim());
      if (parsed?.error && typeof parsed.error === "string") return parsed.error;
    } catch {}
  }
  return raw || fallback;
}

export function GraduationFlow({
  visible,
  targetPlayerId,
  targetName,
  currentEmail,
  daysUntilEighteen,
  onClose,
  onComplete,
}: GraduationFlowProps) {
  const [step, setStep] = useState<Step>("intro");
  const [elevationToken, setElevationToken] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultEmail, setResultEmail] = useState<string | null>(null);

  // Reset whenever the modal re-opens.
  useEffect(() => {
    if (visible) {
      setStep("intro");
      setElevationToken(null);
      setNewEmail("");
      setEmailError(null);
      setSubmitting(false);
      setSubmitError(null);
      setResultEmail(null);
    }
  }, [visible, targetPlayerId]);

  const introBlurb = useMemo(() => {
    const name = targetName || "this account";
    if (daysUntilEighteen !== null && daysUntilEighteen <= 30 && daysUntilEighteen >= 0) {
      return `${name} becomes 18 in ${daysUntilEighteen} day${daysUntilEighteen === 1 ? "" : "s"}. Graduating turns this profile into a fully independent account: a personal email, a new PIN, and full ownership of their settings. ${name} stays in the family — they can leave any time later.`;
    }
    return `Graduating turns ${name}'s profile into a fully independent account: a personal email, a new PIN, and full ownership of their settings. ${name} stays in the family — they can leave any time later.`;
  }, [targetName, daysUntilEighteen]);

  // Step 1 — PIN pad submits the caller's own 4-digit PIN to /elevate-pin.
  const handlePinSubmit = async (pin: string): Promise<string | null> => {
    try {
      const res = await apiRequest("POST", "/api/family/elevate-pin", { pin });
      const data = (await res.json()) as { elevationToken: string };
      if (!data?.elevationToken) {
        return "Could not verify PIN. Please try again.";
      }
      setElevationToken(data.elevationToken);
      // Pre-fill email field with current email so the user can edit, not retype.
      if (!newEmail && currentEmail) setNewEmail(currentEmail);
      setStep("email");
      return null;
    } catch (error: unknown) {
      const msg = parseApiError(error, "Incorrect PIN. Try again.");
      return msg;
    }
  };

  const validateEmail = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return "That doesn't look like a valid email address.";
    }
    return null;
  };

  const handleEmailContinue = () => {
    const err = validateEmail(newEmail);
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("newPin");
  };

  // Step 3 — final POST. Replaces the old PIN with this fresh 4-digit code.
  const handleNewPinSubmit = async (pin: string): Promise<string | null> => {
    if (!targetPlayerId) return "Missing target account.";
    if (!elevationToken) return "PIN elevation expired. Start over.";
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiRequest("POST", `/api/family/graduate/${targetPlayerId}`, {
        newEmail: newEmail.trim(),
        newPin: pin,
        currentPinElevationToken: elevationToken,
      });
      const data = (await res.json()) as { newEmail?: string };
      setResultEmail(data?.newEmail ?? newEmail.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("done");
      return null;
    } catch (error: unknown) {
      const msg = parseApiError(error, "Could not complete graduation. Please try again.");
      setSubmitError(msg);
      return msg;
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  // Step 1 + 3 reuse PinPadModal; intro / email / done use a simple sheet.
  if (step === "pin") {
    return (
      <PinPadModal
        visible
        title="Confirm your PIN"
        subtitle="Enter your 4-digit Family PIN to start graduation."
        onSubmit={handlePinSubmit}
        onClose={() => {
          onClose();
        }}
        cancellable
      />
    );
  }
  if (step === "newPin") {
    return (
      <PinPadModal
        visible
        title={`Set a new PIN for ${targetName || "this account"}`}
        subtitle="This replaces the old PIN. Pick something only the graduate knows."
        onSubmit={handleNewPinSubmit}
        onClose={() => {
          if (!submitting) onClose();
        }}
        errorMessage={submitError}
        disabled={submitting}
        cancellable={!submitting}
      />
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Ionicons
                name={step === "done" ? "checkmark-circle" : "school-outline"}
                size={24}
                color={step === "done" ? "#00E676" : Colors.dark.primary}
              />
              <Text style={styles.title}>
                {step === "done"
                  ? "Graduated!"
                  : step === "email"
                    ? "Step 2 of 3 — Email"
                    : `Graduate ${targetName || "Account"}`}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close graduation flow"
              hitSlop={10}
            >
              <Ionicons name="close-circle" size={28} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          {step === "intro" ? (
            <>
              <Text style={styles.body}>{introBlurb}</Text>
              <View style={styles.bullets}>
                <BulletRow text="Step 1: Confirm your 4-digit PIN" />
                <BulletRow text={`Step 2: Enter ${targetName || "the graduate"}'s own email address`} />
                <BulletRow text="Step 3: Set a fresh PIN that replaces the old one" />
              </View>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setStep("pin");
                }}
                accessibilityRole="button"
                accessibilityLabel="Start graduation"
              >
                <Text style={styles.primaryBtnText}>Start Graduation</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={onClose} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Not now</Text>
              </Pressable>
            </>
          ) : null}

          {step === "email" ? (
            <>
              <Text style={styles.body}>
                Enter the email address that should belong to {targetName || "this account"} from
                now on. The current address on file is{" "}
                <Text style={styles.bold}>{currentEmail || "(none)"}</Text>.
              </Text>
              <TextInput
                style={styles.input}
                value={newEmail}
                onChangeText={(t) => {
                  setNewEmail(t);
                  if (emailError) setEmailError(null);
                }}
                placeholder="own.email@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="New email address"
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
              <Pressable
                style={[
                  styles.primaryBtn,
                  !newEmail.trim() ? styles.primaryBtnDisabled : null,
                ]}
                onPress={handleEmailContinue}
                disabled={!newEmail.trim()}
                accessibilityRole="button"
                accessibilityLabel="Continue to set new PIN"
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setStep("intro")}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </Pressable>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <Text style={styles.body}>
                {targetName || "This account"} now owns{" "}
                <Text style={styles.bold}>{resultEmail}</Text>. The new PIN replaces the old one
                immediately. They stay in the family — they can leave at any time from settings.
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => {
                  onComplete();
                }}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.primaryBtnText}>Done</Text>
              </Pressable>
            </>
          ) : null}

          {submitting ? (
            <View style={styles.spinner}>
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function BulletRow({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name="ellipse" size={6} color={Colors.dark.primary} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: Colors.dark.panel,
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    padding: Spacing.xl,
    gap: Spacing.md,
    ...(Platform.OS === "web" ? { maxWidth: 520, alignSelf: "center", width: "100%", borderRadius: BorderRadius.large, marginBottom: Spacing.xl } : null),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    flexShrink: 1,
  },
  body: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.md,
    lineHeight: 20,
  },
  bold: {
    color: Colors.dark.textPrimary,
    fontWeight: "600",
  },
  bullets: {
    gap: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bulletText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.md,
    flex: 1,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.panelBorder,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.dark.textPrimary,
    fontSize: FontSizes.md,
  },
  errorText: {
    color: "#FF5252",
    fontSize: FontSizes.sm,
  },
  primaryBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: Colors.dark.buttonText,
    fontWeight: "700",
    fontSize: FontSizes.md,
  },
  secondaryBtn: {
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: Colors.dark.textMuted,
    fontSize: FontSizes.md,
    fontWeight: "500",
  },
  spinner: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
});

export default GraduationFlow;
