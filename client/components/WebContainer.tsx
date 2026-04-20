import React from "react";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { Backgrounds } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const WEB_MAX_WIDTH = 480;
const WEB_PHONE_BREAKPOINT = 768;
export const WEB_DESKTOP_BREAKPOINT = 1024;

interface WebContainerProps {
  children: React.ReactNode;
}

export function WebContainer({ children }: WebContainerProps) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== "web") {
    return <View style={styles.nativeRoot}>{children}</View>;
  }

  const isWideScreen = width > WEB_PHONE_BREAKPOINT;
  const isDesktop = width >= WEB_DESKTOP_BREAKPOINT;

  if (!isWideScreen) {
    return <View style={styles.nativeRoot}>{children}</View>;
  }

  if (isDesktop) {
    return <View style={styles.desktopRoot}>{children}</View>;
  }

  return (
    <View style={styles.webRoot}>
      <View style={styles.webFrame}>
        <View style={styles.webNotch} />
        <View style={styles.webContent}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  nativeRoot: {
    flex: 1,
  },
  desktopRoot: {
    flex: 1,
    backgroundColor: "#0C1118",
  },
  webRoot: {
    flex: 1,
    backgroundColor: "#050608",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  webFrame: {
    width: WEB_MAX_WIDTH,
    maxWidth: WEB_MAX_WIDTH,
    height: "100%",
    maxHeight: 880,
    backgroundColor: Backgrounds.root,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.12)",
    overflow: "hidden",
    position: "relative",
  },
  webNotch: {
    width: 120,
    height: 28,
    backgroundColor: "#050608",
    borderRadius: 14,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: -8,
    zIndex: 100,
  },
  webContent: {
    flex: 1,
  },
}));
