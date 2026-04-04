import { Platform, ScrollView, ScrollViewProps } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import React from "react";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const isWeb = Platform.OS === "web";

const useFallback = isExpoGo || isWeb;

const KeyboardAwareScrollView: React.ComponentType<ScrollViewProps & { children?: React.ReactNode }> = useFallback
  ? ScrollView
  : require("react-native-keyboard-controller").KeyboardAwareScrollView;

/**
 * KeyboardAwareScrollView that falls back to plain ScrollView on web and Expo Go.
 * Uses dynamic require to avoid loading react-native-keyboard-controller on Expo Go,
 * which would crash due to NativeEventEmitter incompatibility.
 */
export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: ScrollViewProps & { children?: React.ReactNode }) {
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
