import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import type { ProgressData } from "./types";

interface SeriesProgressTabProps {
  progressLoading: boolean;
  progressData: ProgressData | undefined;
  onAssessPlayer: (player: { id: string; name: string; ballLevel?: string | null }) => void;
}

export function SeriesProgressTab({ progressLoading, progressData, onAssessPlayer }: SeriesProgressTabProps) {
  if (progressLoading) {
    return (
      <View style={styles.tabContent}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
      </View>
    );
  }

  if (!progressData || progressData.players.length === 0) {
    return (
      <View style={styles.tabContent}>
        <View style={styles.emptyState}>
          <Ionicons name="trending-up-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyText}>No progress data yet</Text>
          <Text style={styles.emptySubtext}>
            Complete sessions to track player XP gains
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <View style={styles.progressSummary}>
        <View style={styles.progressStat}>
          <Text style={styles.progressStatValue}>{progressData.totalXp.toLocaleString()}</Text>
          <Text style={styles.progressStatLabel}>Total XP Earned</Text>
        </View>
        <View style={styles.progressStat}>
          <Text style={styles.progressStatValue}>{progressData.sessionsCompleted}/{progressData.totalSessions}</Text>
          <Text style={styles.progressStatLabel}>Sessions Complete</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Player Leaderboard</Text>
      {progressData.players.map((player, index) => (
        <View key={player.id} style={styles.playerProgressCard}>
          <View style={styles.playerRank}>
            <Text style={styles.rankNumber}>{index + 1}</Text>
          </View>
          <View style={styles.playerProgressInfo}>
            <Text style={styles.playerProgressName}>{player.name}</Text>
            <Text style={styles.playerProgressSessions}>{player.sessionsAttended} sessions</Text>
          </View>
          <Pressable
            style={styles.assessButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAssessPlayer({ id: player.id, name: player.name, ballLevel: null });
            }}
          >
            <Ionicons name="clipboard-outline" size={14} color={Colors.dark.xpCyan} />
            <Text style={styles.assessButtonText}>Assess</Text>
          </Pressable>
          <View style={styles.playerXpBadge}>
            <Ionicons name="star" size={14} color={Colors.dark.gold} />
            <Text style={styles.playerXpValue}>{player.xpEarned.toLocaleString()}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
