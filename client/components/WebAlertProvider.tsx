import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Alert as RNAlert, Platform, View, Text, Pressable, StyleSheet, Modal, Animated } from "react-native";
import { Colors } from "@/constants/theme";

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertState {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
}

const INITIAL_STATE: AlertState = {
  visible: false,
  title: "",
  message: "",
  buttons: [{ text: "OK" }],
};

const WebAlertContext = createContext<{
  show: (title: string, message: string, buttons?: AlertButton[]) => void;
} | null>(null);

export function WebAlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState>(INITIAL_STATE);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const confirmResolve = useRef<((value: boolean) => void) | null>(null);

  const show = useCallback((title: string, message: string, buttons?: AlertButton[]) => {
    setState({
      visible: true,
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }],
    });
  }, []);

  useEffect(() => {
    if (state.visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 20, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.92);
    }
  }, [state.visible]);

  const dismiss = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleButton = useCallback((btn: AlertButton) => {
    dismiss();
    if (btn.onPress) btn.onPress();
    if (confirmResolve.current) {
      confirmResolve.current(btn.style !== "cancel");
      confirmResolve.current = null;
    }
  }, [dismiss]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    const originalRNAlert = RNAlert.alert;

    window.alert = (msg?: any) => {
      show("", String(msg ?? ""), [{ text: "OK" }]);
    };

    window.confirm = (msg?: string): boolean => {
      show("", String(msg ?? "Are you sure?"), [
        { text: "Cancel", style: "cancel" },
        { text: "OK" },
      ]);
      return false;
    };

    RNAlert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
      show(title || "", message || "", buttons && buttons.length > 0 ? buttons : [{ text: "OK" }]);
    };

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
      RNAlert.alert = originalRNAlert;
    };
  }, [show]);

  const cancelBtn = state.buttons.find(b => b.style === "cancel");
  const primaryBtns = state.buttons.filter(b => b.style !== "cancel");

  const handleDismissOnBackdrop = useCallback(() => {
    if (cancelBtn) handleButton(cancelBtn);
    else if (state.buttons.length === 1) handleButton(state.buttons[0]);
  }, [cancelBtn, handleButton, state.buttons]);

  return (
    <WebAlertContext.Provider value={{ show }}>
      {children}
      {Platform.OS === "web" && (
        <Modal
          visible={state.visible}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={handleDismissOnBackdrop}
        >
          <View style={styles.overlay}>
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.backdropLayer, { opacity: fadeAnim }]}
              pointerEvents="auto"
            >
              <Pressable style={styles.backdrop} onPress={handleDismissOnBackdrop} />
            </Animated.View>
            <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
              {state.title ? (
                <Text style={styles.title}>{state.title}</Text>
              ) : null}
              {state.message ? (
                <Text style={[styles.message, !state.title && styles.messageOnly]}>
                  {state.message}
                </Text>
              ) : null}
              <View style={styles.buttons}>
                {cancelBtn && (
                  <Pressable
                    style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.btnPressed]}
                    onPress={() => handleButton(cancelBtn)}
                  >
                    <Text style={[styles.btnText, styles.btnTextCancel]}>{cancelBtn.text}</Text>
                  </Pressable>
                )}
                {primaryBtns.map((btn, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.btn,
                      btn.style === "destructive" ? styles.btnDestructive : styles.btnPrimary,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={() => handleButton(btn)}
                  >
                    <Text style={[
                      styles.btnText,
                      btn.style === "destructive" ? styles.btnTextDestructive : styles.btnTextPrimary,
                    ]}>
                      {btn.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </WebAlertContext.Provider>
  );
}

export function useWebAlert() {
  const ctx = useContext(WebAlertContext);
  if (!ctx) return { show: () => {} };
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // Ensure web alert always layers above any other Modal that may be open
    // (RN <Modal> on web renders in a portal; high z-index guards against
    // sibling-modal stacking when an alert is triggered from inside another modal).
    zIndex: 999999,
    elevation: 999999,
  },
  backdropLayer: {
    // Explicit z-index keeps the absolute-positioned backdrop BELOW the
    // flex-positioned card on web. Without this, CSS painting order puts
    // the positioned sibling on top and the backdrop swallows every click
    // on Cancel / OK / Sign Out.
    zIndex: 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  card: {
    // Lifted above the backdrop layer so button presses actually land.
    zIndex: 1,
    backgroundColor: "#1A2030",
    borderRadius: 16,
    padding: 24,
    minWidth: 300,
    maxWidth: 420,
    width: "90%" as any,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F0F4F8",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#8A95A3",
    lineHeight: 21,
    marginBottom: 20,
  },
  messageOnly: {
    color: "#C8D0DC",
    fontSize: 15,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 9,
    minWidth: 72,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#C8FF3D",
  },
  btnCancel: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  btnDestructive: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  btnPressed: {
    opacity: 0.75,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  btnTextPrimary: {
    color: Colors.dark.buttonText,
  },
  btnTextCancel: {
    color: "#C8D0DC",
  },
  btnTextDestructive: {
    color: "#F87171",
  },
});
