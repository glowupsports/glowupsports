import React, { useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";

interface Match {
  id: string;
  opponent: string;
  opponentAvatar: string;
  opponentLevel: number;
  date: string;
  result: "win" | "loss" | "upcoming";
  score?: string;
  xpEarned?: number;
}

const INITIAL_MATCHES: Match[] = [
  { id: "1", opponent: "Mike Ace", opponentAvatar: "player", opponentLevel: 8, date: "Today, 3:00 PM", result: "upcoming" },
  { id: "2", opponent: "Sarah Rally", opponentAvatar: "star", opponentLevel: 6, date: "Yesterday", result: "win", score: "6-4, 7-5", xpEarned: 200 },
  { id: "3", opponent: "Tom Serve", opponentAvatar: "trophy", opponentLevel: 9, date: "Dec 18", result: "loss", score: "3-6, 4-6", xpEarned: 75 },
  { id: "4", opponent: "Lisa Net", opponentAvatar: "flame", opponentLevel: 7, date: "Dec 15", result: "win", score: "6-2, 6-3", xpEarned: 220 },
];

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { earnXP, earnCurrency, updateSkill } = usePlayer();
  const [matches, setMatches] = useState(INITIAL_MATCHES);

  const handlePlayMatch = async (match: Match) => {
    if (match.result !== "upcoming") return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const isWin = Math.random() > 0.4;
    const xpReward = isWin ? 200 + Math.floor(Math.random() * 100) : 50 + Math.floor(Math.random() * 50);
    const coinsReward = isWin ? 75 : 25;
    const scores = isWin 
      ? `${6}-${Math.floor(Math.random() * 4)}, ${6}-${Math.floor(Math.random() * 4)}` 
      : `${Math.floor(Math.random() * 4)}-6, ${Math.floor(Math.random() * 4)}-6`;
    
    setMatches(prev => prev.map(m => 
      m.id === match.id 
        ? { ...m, result: isWin ? "win" : "loss", score: scores, xpEarned: xpReward, date: "Just now" } 
        : m
    ));
    
    await updateSkill("physical", 5);
    await updateSkill("tactical", 3);
    await earnCurrency(0, coinsReward);
    await earnXP(xpReward);
    
    Alert.alert(
      isWin ? "Victory!" : "Good Effort!", 
      `You ${isWin ? "won" : "lost"} against ${match.opponent}!\nEarned: +${xpReward} XP, +${coinsReward} coins`
    );
  };

  const renderMatch = ({ item }: { item: Match }) => {
    const isUpcoming = item.result === "upcoming";
    const isWin = item.result === "win";

    return (
      <Card style={styles.matchCard} onPress={isUpcoming ? () => handlePlayMatch(item) : undefined}>
        <View style={styles.matchHeader}>
          <PlayerAvatar avatar={item.opponentAvatar} size={48} level={item.opponentLevel} showLevel />
          <View style={styles.matchInfo}>
            <ThemedText style={styles.opponentName}>{item.opponent}</ThemedText>
            <ThemedText style={styles.matchDate}>{item.date}</ThemedText>
          </View>
          {isUpcoming ? (
            <View style={styles.upcomingBadge}>
              <Ionicons name="time-outline" size={14} color={Colors.dark.orange} />
              <ThemedText style={styles.upcomingText}>Play</ThemedText>
            </View>
          ) : (
            <View style={[styles.resultBadge, isWin ? styles.winBadge : styles.lossBadge]}>
              <ThemedText style={styles.resultText}>{isWin ? "WIN" : "LOSS"}</ThemedText>
            </View>
          )}
        </View>
        {!isUpcoming ? (
          <View style={styles.matchDetails}>
            <View style={styles.scoreContainer}>
              <ThemedText style={styles.scoreLabel}>Score</ThemedText>
              <ThemedText style={styles.scoreValue}>{item.score}</ThemedText>
            </View>
            <View style={styles.xpContainer}>
              <Ionicons name="flash-outline" size={16} color={Colors.dark.xpCyan} />
              <ThemedText style={styles.xpValue}>+{item.xpEarned} XP</ThemedText>
            </View>
          </View>
        ) : (
          <View style={styles.prepareButton}>
            <Ionicons name="play-outline" size={16} color={Colors.dark.buttonText} />
            <ThemedText style={styles.prepareText}>Tap to Play Match</ThemedText>
          </View>
        )}
      </Card>
    );
  };

  const handleAddMatch = () => {
    const newMatch: Match = {
      id: `${Date.now()}`,
      opponent: ["Emma Champion", "Jake Pro", "Lisa Winner", "Tom Ace"][Math.floor(Math.random() * 4)],
      opponentAvatar: ["trophy", "crown", "star", "flame"][Math.floor(Math.random() * 4)],
      opponentLevel: 5 + Math.floor(Math.random() * 10),
      date: "Scheduled",
      result: "upcoming",
    };
    setMatches(prev => [newMatch, ...prev]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        renderItem={renderMatch}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl + 80,
          paddingHorizontal: Spacing.lg,
          gap: Spacing.md,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ListHeaderComponent={
          <ThemedText style={styles.headerText}>Tap upcoming matches to play</ThemedText>
        }
      />
      <Pressable 
        onPress={handleAddMatch}
        style={[styles.fab, { bottom: insets.bottom + Spacing.xl }]}
      >
        <Ionicons name="add-outline" size={24} color={Colors.dark.buttonText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.6,
    marginBottom: Spacing.sm,
  },
  matchCard: {
    padding: Spacing.lg,
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  matchInfo: {
    flex: 1,
  },
  opponentName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  matchDate: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  upcomingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 133, 27, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  upcomingText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.orange,
  },
  resultBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  winBadge: {
    backgroundColor: Colors.dark.successNeon,
  },
  lossBadge: {
    backgroundColor: Colors.dark.error,
  },
  resultText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  matchDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  scoreLabel: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.6,
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  xpContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
  },
  prepareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
  },
  prepareText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      },
    }),
  },
});
