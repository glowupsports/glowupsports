import { useCallback } from "react";
import { Alert, Platform, ViewStyle } from "react-native";
import { useNetwork } from "@/context/NetworkContext";

interface OfflineGuardOptions {
  screen: string;
  action: string;
  userId?: string;
  coachId?: string;
  onBlocked?: () => void;
}

export function showOfflineAlert() {
  if (Platform.OS === "web") {
    window.alert("You're currently offline. This action can't be saved.");
  } else {
    Alert.alert(
      "You're Offline",
      "You're currently offline. This action can't be saved. Please reconnect to the internet and try again.",
      [{ text: "OK", style: "default" }]
    );
  }
}

export function useOfflineGuard(context?: { userId?: string; coachId?: string }) {
  const { isOffline, logOfflineAttempt } = useNetwork();

  const guardAction = useCallback(
    async <T,>(
      options: OfflineGuardOptions,
      action: () => Promise<T>
    ): Promise<T | null> => {
      if (isOffline) {
        await logOfflineAttempt({
          userId: options.userId || context?.userId,
          coachId: options.coachId || context?.coachId,
          screen: options.screen,
          action: options.action,
        });
        
        showOfflineAlert();
        options.onBlocked?.();
        return null;
      }

      return action();
    },
    [isOffline, logOfflineAttempt, context]
  );

  const isActionDisabled = isOffline;

  const getDisabledStyle = useCallback(
    (baseOpacity = 1): ViewStyle => ({
      opacity: isOffline ? 0.5 : baseOpacity,
    }),
    [isOffline]
  );

  const getDisabledProps = useCallback(
    () => ({
      disabled: isOffline,
      style: getDisabledStyle(),
    }),
    [isOffline, getDisabledStyle]
  );

  return {
    isOffline,
    isActionDisabled,
    guardAction,
    showOfflineAlert,
    getDisabledStyle,
    getDisabledProps,
    logOfflineAttempt,
  };
}
