import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface GuestBrowsingBannerProps {
  onSignIn: () => void;
}

export function GuestBrowsingBanner({ onSignIn }: GuestBrowsingBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={60} tint="dark" style={styles.blur}>
        <Pressable
          style={styles.content}
          onPress={onSignIn}
          android_ripple={{ color: "rgba(200,255,61,0.1)" }}
        >
          <Ionicons name="person-circle-outline" size={18} color={Colors.dark.primary} />
          <Text style={styles.label} numberOfLines={1}>
            Browsing as guest{" "}
            <Text style={styles.link}>— Sign in to join</Text>
          </Text>
        </Pressable>
        <Pressable
          style={styles.dismissButton}
          onPress={() => setDismissed(true)}
          hitSlop={8}
        >
          <Ionicons name="close" size={16} color={Colors.dark.textSecondary} />
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  blur: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "rgba(200,255,61,0.06)",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  link: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  dismissButton: {
    paddingLeft: Spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
});
