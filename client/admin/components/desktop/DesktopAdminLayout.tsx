import React, { useState, useCallback } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useDesktop } from "@/hooks/useDesktop";
import DesktopAdminSidebar, { type DesktopAdminRoute } from "./DesktopAdminSidebar";
import { Colors } from "@/constants/theme";

interface Props {
  children: React.ReactNode;
  activeRoute?: DesktopAdminRoute;
  onNavigate?: (route: DesktopAdminRoute) => void;
  academyName?: string;
}

export default function DesktopAdminLayout({
  children,
  activeRoute = "AdminDashboard",
  onNavigate,
  academyName,
}: Props) {
  const isDesktop = useDesktop();

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <View style={styles.root}>
      <DesktopAdminSidebar
        activeRoute={activeRoute}
        onNavigate={onNavigate ?? (() => {})}
        academyName={academyName}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    flex: 1,
    overflow: "scroll",
  },
});
