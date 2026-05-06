import React from "react";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { WEB_DESKTOP_BREAKPOINT } from "@/components/WebContainer";

interface DesktopContentWrapperProps {
  children: React.ReactNode;
  maxWidth?: number;
  paddingHorizontal?: number;
}

export function DesktopContentWrapper({
  children,
  maxWidth = 1400,
  paddingHorizontal = 24,
}: DesktopContentWrapperProps) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= WEB_DESKTOP_BREAKPOINT;

  if (!isDesktop) {
    return <View style={styles.native}>{children}</View>;
  }

  return (
    <View style={styles.outer}>
      <View style={[styles.inner, { maxWidth, paddingHorizontal }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  native: {
    flex: 1,
  },
  outer: {
    flex: 1,
    alignItems: "center",
  },
  inner: {
    flex: 1,
    width: "100%",
  },
});
