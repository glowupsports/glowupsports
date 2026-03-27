import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Colors } from "@/constants/theme";
import { styles } from "./coachingStyles";
import type { TabProps } from "./types";
import { useFeedbackTab } from "./feedback/useFeedbackTab";
import { FeedbackDetailView } from "./feedback/FeedbackDetailView";
import { SessionListView } from "./feedback/SessionListView";

export function TodayFeedbackTab({ insets: _insets, tabBarHeight }: TabProps) {
  const state = useFeedbackTab(tabBarHeight);

  if (state.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  if (state.selectedSession) {
    return <FeedbackDetailView {...state} />;
  }

  return <SessionListView {...state} />;
}
