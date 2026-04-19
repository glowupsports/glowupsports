import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
interface PlayerLayoutProps {
  children: React.ReactNode;
  useSafeArea?: boolean;
  style?: any;
}

export default function PlayerLayout({
  children,
  useSafeArea = true,
  style,
}: PlayerLayoutProps) {
  const insets = useSafeAreaInsets();
  // Subscribe to the player theme so this root re-renders when the player
  // toggles Light/Dark; the inline `Colors.dark.backgroundRoot` is then re-read
  // post-mutation and reflects the new scheme.
  useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: Colors.dark.backgroundRoot },
        useSafeArea && { paddingTop: insets.top },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
  },
}));
