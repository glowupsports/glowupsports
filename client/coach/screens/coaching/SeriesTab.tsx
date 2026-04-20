import React, { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";
import { CoachingSeriesSection } from "@/coach/components/CoachingSeriesSection";
import SeriesDetailDrawer from "@/coach/components/SeriesDetailDrawer";
import CreateSessionWizard from "@/coach/components/CreateSessionWizard";
import type { TabProps } from "./types";
import { useCoachingScroll } from "./CoachingScrollContext";

export function SeriesTab({ insets: _insets, tabBarHeight }: TabProps) {
  const onScroll = useCoachingScroll();
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [showSeriesDetail, setShowSeriesDetail] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);

  const handleSeriesPress = (series: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSeriesId(series.id);
    setShowSeriesDetail(true);
  };

  const handleCreatePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowCreateWizard(true);
  };

  const handleCloseDetail = () => {
    setShowSeriesDetail(false);
    setSelectedSeriesId(null);
  };

  return (
    <>
      <ScrollView
        style={seriesStyles.scrollView}
        contentContainerStyle={[
          seriesStyles.scrollContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <CoachingSeriesSection
          onSeriesPress={handleSeriesPress}
          onCreatePress={handleCreatePress}
        />
      </ScrollView>
      <SeriesDetailDrawer
        visible={showSeriesDetail}
        seriesId={selectedSeriesId}
        onClose={handleCloseDetail}
      />
      <CreateSessionWizard
        visible={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        createSeriesMode={true}
      />
    </>
  );
}

const seriesStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
});
