import React from "react";
import { View, Text, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { SeriesDetail } from "./types";

interface SeriesPlanTabProps {
  series: SeriesDetail | undefined;
}

export function SeriesPlanTab({ series }: SeriesPlanTabProps) {
  const upcomingSessions = series?.sessions?.filter((s) => {
    const sessionDate = new Date(s.startTime);
    return sessionDate >= new Date() && s.status !== "completed" && s.status !== "cancelled";
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) || [];

  return (
    <View style={styles.planTabContainer}>
      <View style={styles.planHeader}>
        <Ionicons name="clipboard" size={24} color={Colors.dark.gold} />
        <Text style={styles.planHeaderTitle}>Session Plans</Text>
      </View>
      <Text style={styles.planHeaderSubtitle}>
        Generate and manage lesson plans for upcoming sessions
      </Text>

      {upcomingSessions.length === 0 ? (
        <View style={styles.planEmptyState}>
          <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.planEmptyTitle}>No Upcoming Sessions</Text>
          <Text style={styles.planEmptySubtitle}>
            Schedule sessions to generate lesson plans
          </Text>
        </View>
      ) : (
        <View style={styles.planSessionsList}>
          <Text style={styles.planSectionTitle}>Upcoming Sessions ({upcomingSessions.length})</Text>
          {upcomingSessions.slice(0, 5).map((session: any) => {
            const sessionDate = new Date(session.startTime);
            const hasPlan = session.sessionPlan?.blocks?.length > 0;

            return (
              <Pressable
                key={session.id}
                style={styles.planSessionCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={styles.planSessionInfo}>
                  <Text style={styles.planSessionDate}>
                    {sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                  <Text style={styles.planSessionTime}>
                    {sessionDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </Text>
                </View>
                <View style={styles.planSessionStatus}>
                  {hasPlan ? (
                    <View style={styles.planReadyBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.dark.successNeon} />
                      <Text style={styles.planReadyText}>Plan Ready</Text>
                    </View>
                  ) : (
                    <View style={styles.planNeededBadge}>
                      <Ionicons name="add-circle" size={16} color={Colors.dark.gold} />
                      <Text style={styles.planNeededText}>Generate Plan</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}

          {upcomingSessions.length > 5 ? (
            <Text style={styles.planMoreText}>
              +{upcomingSessions.length - 5} more sessions
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.planTemplatesSection}>
        <Text style={styles.planSectionTitle}>Quick Actions</Text>
        <Pressable
          style={styles.planActionButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <Ionicons name="document-text-outline" size={20} color={Colors.dark.gold} />
          <Text style={styles.planActionText}>Browse Lesson Templates</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
        </Pressable>
        <Pressable
          style={styles.planActionButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <Ionicons name="flash-outline" size={20} color={Colors.dark.gold} />
          <Text style={styles.planActionText}>Auto-Generate All Plans</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}
