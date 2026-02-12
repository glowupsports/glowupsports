import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/coach/context/AuthContext";
import { Colors, Typography, Spacing } from "@/constants/theme";

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedAcademyName, stopImpersonation } = useAuth();
  const insets = useSafeAreaInsets();

  if (!isImpersonating) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4 }]}>
      <View style={styles.content}>
        <Ionicons name="eye" size={16} color="#fff" />
        <Text style={styles.text} numberOfLines={1}>
          Viewing: {impersonatedAcademyName}
        </Text>
        <Pressable style={styles.exitButton} onPress={stopImpersonation}>
          <Text style={styles.exitText}>Back to Platform</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#9B59B6",
    paddingBottom: 6,
    zIndex: 9999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  text: {
    ...Typography.caption,
    color: "#fff",
    fontWeight: "700",
    flex: 1,
  },
  exitButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  exitText: {
    ...Typography.caption,
    color: "#fff",
    fontWeight: "600",
    fontSize: 11,
  },
});
