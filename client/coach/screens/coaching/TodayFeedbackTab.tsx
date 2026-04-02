import React, { useState } from "react";
import { View, ActivityIndicator, Pressable, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { TabProps } from "./types";
import { useFeedbackTab } from "./feedback/useFeedbackTab";
import { FeedbackDetailView } from "./feedback/FeedbackDetailView";
import { SessionListView } from "./feedback/SessionListView";
import { FeedbackCommandCenter } from "./feedback/FeedbackCommandCenter";

export function TodayFeedbackTab({ insets: _insets, tabBarHeight }: TabProps) {
  const [showSessionList, setShowSessionList] = useState(false);
  const state = useFeedbackTab(tabBarHeight);

  if (state.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (state.selectedSession) {
    return <FeedbackDetailView {...state} />;
  }

  if (showSessionList) {
    return (
      <View style={styles.flex}>
        <Pressable
          style={styles.backRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSessionList(false);
          }}
        >
          <Ionicons name="arrow-back" size={18} color={Colors.dark.primary} />
          <Text style={styles.backText}>Feedback Due</Text>
        </Pressable>
        <SessionListView {...state} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FeedbackCommandCenter
        tabBarHeight={tabBarHeight}
        onShowSessionList={() => setShowSessionList(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
});
