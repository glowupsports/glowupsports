import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Colors, Backgrounds, Spacing, Typography, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

interface PinEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
}

export default function PinEntryModal({
  visible,
  onClose,
  onSuccess,
  title = "Enter PIN",
}: PinEntryModalProps) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState(["", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChangePin, setShowChangePin] = useState(false);
  const [newPin, setNewPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [changeStep, setChangeStep] = useState<"new" | "confirm">("new");
  
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const newPinRefs = useRef<(TextInput | null)[]>([]);
  const confirmPinRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (visible) {
      setPin(["", "", "", ""]);
      setNewPin(["", "", "", ""]);
      setConfirmPin(["", "", "", ""]);
      setError(null);
      setShowChangePin(false);
      setChangeStep("new");
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [visible]);

  const handlePinChange = (index: number, value: string, refs: React.MutableRefObject<(TextInput | null)[]>, pinState: string[], setPinState: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (!/^\d*$/.test(value)) return;
    
    const newPinArray = [...pinState];
    newPinArray[index] = value.slice(-1);
    setPinState(newPinArray);
    
    if (value && index < 3) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string, refs: React.MutableRefObject<(TextInput | null)[]>, pinState: string[], setPinState: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (key === "Backspace" && !pinState[index] && index > 0) {
      refs.current[index - 1]?.focus();
      const newPinArray = [...pinState];
      newPinArray[index - 1] = "";
      setPinState(newPinArray);
    }
  };

  const verifyPin = async () => {
    const pinString = pin.join("");
    if (pinString.length !== 4) {
      setError("Please enter 4 digits");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const response = await apiRequest("POST", "/api/coach/pin/verify", { pin: pinString });
      const data = await response.json();

      if (data.valid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (data.requiresChange) {
          setShowChangePin(true);
          setTimeout(() => {
            newPinRefs.current[0]?.focus();
          }, 100);
        } else {
          onSuccess();
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError("Incorrect PIN");
        setPin(["", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorMessage = err?.message || "";
      const statusMatch = errorMessage.match(/^(\d{3}):/);
      const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;

      if (httpStatus === 401) {
        setError("Session expired - please log in again");
      } else if (httpStatus >= 400 && httpStatus < 500) {
        setError("Incorrect PIN");
      } else if (httpStatus >= 500) {
        setError("Server error - please try again");
      } else if (err?.name === "TypeError" || errorMessage.toLowerCase().includes("network")) {
        setError("No connection - check your internet");
      } else {
        setError("Connection error - tap to retry");
      }
      setPin(["", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  const changePin = async () => {
    const newPinString = newPin.join("");
    const confirmPinString = confirmPin.join("");

    if (newPinString.length !== 4) {
      setError("Please enter 4 digits for new PIN");
      return;
    }

    if (newPinString !== confirmPinString) {
      setError("PINs do not match");
      setConfirmPin(["", "", "", ""]);
      confirmPinRefs.current[0]?.focus();
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const response = await apiRequest("POST", "/api/coach/pin/change", {
        currentPin: pin.join(""),
        newPin: newPinString,
      });
      const data = await response.json();

      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (Platform.OS === "web") {
          window.alert("PIN changed successfully!");
        } else {
          Alert.alert("Success", "PIN changed successfully!");
        }
        onSuccess();
      } else {
        setError(data.error || "Failed to change PIN");
      }
    } catch (err) {
      setError("Failed to change PIN");
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    const currentPin = pin.join("");
    if (currentPin.length === 4 && !showChangePin) {
      verifyPin();
    }
  }, [pin]);

  useEffect(() => {
    if (showChangePin && changeStep === "new") {
      const currentNewPin = newPin.join("");
      if (currentNewPin.length === 4) {
        setChangeStep("confirm");
        setTimeout(() => {
          confirmPinRefs.current[0]?.focus();
        }, 100);
      }
    }
  }, [newPin, showChangePin, changeStep]);

  useEffect(() => {
    if (showChangePin && changeStep === "confirm") {
      const currentConfirmPin = confirmPin.join("");
      if (currentConfirmPin.length === 4) {
        changePin();
      }
    }
  }, [confirmPin, showChangePin, changeStep]);

  const renderPinInput = (
    pinState: string[],
    setPinState: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(TextInput | null)[]>
  ) => (
    <View style={styles.pinContainer}>
      {pinState.map((digit, index) => (
        <TextInput
          key={index}
          ref={(ref) => { refs.current[index] = ref; }}
          style={[styles.pinInput, error ? styles.pinInputError : null]}
          value={digit}
          onChangeText={(value) => handlePinChange(index, value, refs, pinState, setPinState)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key, refs, pinState, setPinState)}
          keyboardType="number-pad"
          maxLength={1}
          secureTextEntry
          selectTextOnFocus
        />
      ))}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { marginTop: insets.top }]}>
          <Pressable style={styles.closeButton} hitSlop={12} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
          </Pressable>

          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed" size={40} color={Colors.dark.xpCyan} />
          </View>

          {!showChangePin ? (
            <>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                Enter your 4-digit PIN to access the Parent Dashboard
              </Text>

              {renderPinInput(pin, setPin, inputRefs)}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {isVerifying ? (
                <ActivityIndicator size="small" color={Colors.dark.xpCyan} style={styles.loading} />
              ) : null}

              <Text style={styles.hint}>
                Default PIN is 1234
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {changeStep === "new" ? "Create New PIN" : "Confirm New PIN"}
              </Text>
              <Text style={styles.subtitle}>
                {changeStep === "new"
                  ? "Please create a new 4-digit PIN for security"
                  : "Enter your new PIN again to confirm"}
              </Text>

              {changeStep === "new" ? (
                renderPinInput(newPin, setNewPin, newPinRefs)
              ) : (
                renderPinInput(confirmPin, setConfirmPin, confirmPinRefs)
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {isVerifying ? (
                <ActivityIndicator size="small" color={Colors.dark.xpCyan} style={styles.loading} />
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modal: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  closeButton: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.xs,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  pinContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pinInput: {
    width: 56,
    height: 64,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.04)",
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    fontSize: 24,
  },
  pinInputError: {
    borderColor: Colors.dark.error,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  loading: {
    marginVertical: Spacing.md,
  },
  hint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
}));
