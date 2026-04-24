import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, FontSizes, BorderRadius } from "@/constants/theme";

interface PinPadModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Called with the typed 4-digit PIN once complete. Return string error message to show + shake. */
  onSubmit: (pin: string) => Promise<string | null>;
  onClose: () => void;
  onForgotPin?: () => void;
  /** Show a "Cancel" button alongside the keypad. Defaults to true. */
  cancellable?: boolean;
  /** External error message (e.g. from server, lockout). */
  errorMessage?: string | null;
  /** When true, ignore the user input for now (e.g. lockout state). */
  disabled?: boolean;
}

const PIN_LENGTH = 4;

export function PinPadModal({
  visible,
  title,
  subtitle,
  onSubmit,
  onClose,
  onForgotPin,
  cancellable = true,
  errorMessage,
  disabled,
}: PinPadModalProps) {
  const [digits, setDigits] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setDigits("");
      setLocalError(null);
    }
  }, [visible]);

  const showError = errorMessage || localError;

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleDigit = async (d: string) => {
    if (disabled || submitting) return;
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    setLocalError(null);
    if (next.length === PIN_LENGTH) {
      setSubmitting(true);
      const err = await onSubmit(next);
      setSubmitting(false);
      if (err) {
        setLocalError(err);
        triggerShake();
        setDigits("");
      }
    }
  };

  const handleBackspace = () => {
    if (disabled || submitting) return;
    setDigits((d) => d.slice(0, -1));
    setLocalError(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < digits.length && styles.dotFilled]}
              />
            ))}
          </View>

          {showError ? <Text style={styles.errorText}>{showError}</Text> : <View style={styles.errorPlaceholder} />}

          <View style={styles.padGrid}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <PadKey key={n} label={String(n)} onPress={() => handleDigit(String(n))} disabled={disabled || submitting} />
            ))}
            <View style={styles.padCell} />
            <PadKey label="0" onPress={() => handleDigit("0")} disabled={disabled || submitting} />
            <PadKeyIcon onPress={handleBackspace} disabled={disabled || submitting} />
          </View>

          {submitting ? (
            <View style={styles.spinnerRow}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : null}

          <View style={styles.footerRow}>
            {cancellable ? (
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={styles.footerLink}>Cancel</Text>
              </Pressable>
            ) : <View />}
            {onForgotPin ? (
              <Pressable onPress={onForgotPin} hitSlop={10}>
                <Text style={styles.footerLink}>Forgot PIN?</Text>
              </Pressable>
            ) : <View />}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface PadKeyProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}
function PadKey({ label, onPress, disabled }: PadKeyProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.padKey,
        pressed && !disabled && styles.padKeyPressed,
        disabled && styles.padKeyDisabled,
      ]}
    >
      <Text style={styles.padKeyLabel}>{label}</Text>
    </Pressable>
  );
}
function PadKeyIcon({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.padKey,
        pressed && !disabled && styles.padKeyPressed,
        disabled && styles.padKeyDisabled,
      ]}
    >
      <Feather name="delete" size={24} color={Colors.textPrimary} />
    </Pressable>
  );
}

const KEY_SIZE = Platform.OS === "web" ? 64 : 70;
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
    maxWidth: 360,
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
    marginTop: Spacing.xs,
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  dotsRow: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.dark.borderSubtle,
  },
  dotFilled: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  errorText: {
    marginTop: Spacing.md,
    color: "#ef4444",
    textAlign: "center",
    fontSize: FontSizes.sm,
    minHeight: 20,
  },
  errorPlaceholder: { minHeight: 20, marginTop: Spacing.md },
  padGrid: {
    marginTop: Spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  padCell: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  padKey: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  padKeyPressed: { backgroundColor: Colors.dark.borderSubtle },
  padKeyDisabled: { opacity: 0.4 },
  padKeyLabel: {
    fontSize: 26,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  spinnerRow: { marginTop: Spacing.md, alignItems: "center" },
  footerRow: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLink: {
    color: Colors.dark.primary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
});
