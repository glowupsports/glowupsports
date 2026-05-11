import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { PlayerV2StackParamList } from "@/navigation/PlayerV2Navigator";

type RouteParams = RouteProp<PlayerV2StackParamList, "PromptPayQR">;

type PayStatus = "pending" | "paid" | "expired" | "failed";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function PromptPayQRScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PlayerV2StackParamList>>();
  const route = useRoute<RouteParams>();
  const { chargeId, qrCodeUrl, expiresAt, amountTHB, playerId } = route.params;

  const [status, setStatus] = useState<PayStatus>("pending");
  const [countdown, setCountdown] = useState<number>(
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );
  const [qrError, setQrError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiRequest("GET", `/api/player/promptpay/status/${chargeId}`);
      if (!res.ok) return;
      const data = await res.json() as { status: string; paid: boolean };
      if (data.paid) {
        setStatus("paid");
        stopPolling();
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setTimeout(() => {
          navigation.goBack();
        }, 2000);
      } else if (data.status === "expired" || data.status === "failed") {
        setStatus(data.status as PayStatus);
        stopPolling();
      }
    } catch (_err) {
    }
  }, [chargeId, navigation, stopPolling]);

  useEffect(() => {
    pollRef.current = setInterval(checkStatus, 4000);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) {
          setStatus((s) => (s === "pending" ? "expired" : s));
          stopPolling();
        }
        return next;
      });
    }, 1000);

    return stopPolling;
  }, [checkStatus, stopPolling]);

  const handleOpenBankApp = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      const promptpayUri = `promptpay://`;
      const supported = await Linking.canOpenURL(promptpayUri);
      if (supported) {
        await Linking.openURL(promptpayUri);
      } else {
        await Linking.openURL(`https://promptpay.io`);
      }
    } catch (_err) {
    }
  };

  const handleRetry = () => {
    navigation.goBack();
  };

  const isExpiredOrFailed = status === "expired" || status === "failed";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Pay with PromptPay</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {status === "paid" ? (
          <View style={styles.successState}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={80} color={Colors.dark.primary} />
            </View>
            <Text style={styles.successTitle}>Payment Successful</Text>
            <Text style={styles.successSubtitle}>Credits have been added to your account</Text>
          </View>
        ) : isExpiredOrFailed ? (
          <View style={styles.errorState}>
            <View style={styles.errorIcon}>
              <Ionicons name="close-circle" size={80} color={Colors.dark.error} />
            </View>
            <Text style={styles.errorTitle}>
              {status === "expired" ? "QR Code Expired" : "Payment Failed"}
            </Text>
            <Text style={styles.errorSubtitle}>
              {status === "expired"
                ? "This QR code has expired. Please generate a new one."
                : "Something went wrong. Please try again."}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              onPress={handleRetry}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>Amount Due</Text>
              <Text style={styles.amountValue}>
                ฿{amountTHB.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>

            <View style={styles.qrContainer}>
              {qrCodeUrl && !qrError ? (
                <Image
                  source={{ uri: qrCodeUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                  onError={() => setQrError(true)}
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Ionicons name="qr-code-outline" size={80} color={Colors.dark.textMuted} />
                  <Text style={styles.qrPlaceholderText}>
                    {qrError ? "QR unavailable — use bank app" : "Loading QR..."}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.timerRow}>
              <Ionicons name="time-outline" size={16} color={countdown < 60000 ? Colors.dark.error : Colors.dark.textMuted} />
              <Text style={[styles.timerText, countdown < 60000 && styles.timerWarning]}>
                Expires in {formatCountdown(countdown)}
              </Text>
            </View>

            <Text style={styles.instructions}>
              Open your bank app and scan the QR code above, or tap the button below.
            </Text>

            <Pressable
              style={({ pressed }) => [styles.bankAppButton, pressed && styles.pressed]}
              onPress={handleOpenBankApp}
            >
              <Ionicons name="phone-portrait-outline" size={20} color={Colors.dark.background} />
              <Text style={styles.bankAppButtonText}>Open Bank App</Text>
            </Pressable>

            <View style={styles.pollingIndicator}>
              <ActivityIndicator size="small" color={Colors.dark.primary} />
              <Text style={styles.pollingText}>Waiting for payment...</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  pressed: { opacity: 0.7 },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  amountCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    width: "100%",
  },
  amountLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  qrContainer: {
    width: 240,
    height: 240,
    backgroundColor: "#ffffff",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  qrPlaceholder: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  qrPlaceholderText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  timerText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  timerWarning: {
    color: Colors.dark.error,
    fontWeight: "700",
  },
  instructions: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  bankAppButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  bankAppButtonText: {
    color: Colors.dark.background,
    fontWeight: "700",
    fontSize: 16,
  },
  pollingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pollingText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  successState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  successIcon: {
    marginBottom: Spacing.md,
  },
  successTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  successSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  errorIcon: {
    marginBottom: Spacing.md,
  },
  errorTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  errorSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  retryButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  retryButtonText: {
    color: Colors.dark.background,
    fontWeight: "700",
    fontSize: 16,
  },
});
