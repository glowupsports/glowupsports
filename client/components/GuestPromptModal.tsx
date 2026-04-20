import React from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds } from "@/constants/theme";
import { useAuth } from "@/coach/context/AuthContext";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface GuestPromptModalProps {
  visible: boolean;
  onClose: () => void;
  message?: string;
}

export function GuestPromptModal({ visible, onClose, message }: GuestPromptModalProps) {
  const { logout } = useAuth();

  const handleSignIn = async () => {
    onClose();
    await logout();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed" size={32} color={Colors.dark.primary} />
          </View>

          <Text style={styles.title}>Create an Account</Text>
          <Text style={styles.message}>
            {message || "Sign up to unlock this feature and get the full experience."}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.8 : 1 }]}
            onPress={handleSignIn}
          >
            <Ionicons name="person-add-outline" size={18} color={Colors.dark.buttonText} />
            <Text style={styles.primaryButtonText}>Sign Up / Sign In</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={onClose}
          >
            <Text style={styles.secondaryButtonText}>Continue Browsing</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function useGuestGuard() {
  const { isGuest } = useAuth();
  const [showPrompt, setShowPrompt] = React.useState(false);

  const guardAction = React.useCallback(
    (action: () => void, customMessage?: string) => {
      if (isGuest) {
        setShowPrompt(true);
        return;
      }
      action();
    },
    [isGuest]
  );

  const promptProps = {
    visible: showPrompt,
    onClose: () => setShowPrompt(false),
  };

  return { isGuest, guardAction, showPrompt, setShowPrompt, promptProps };
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  container: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.dark.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.title,
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  message: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    width: "100%",
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  primaryButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: Spacing.sm,
  },
  secondaryButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
}));
