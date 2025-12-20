import React, { useState } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { usePlayer } from "@/context/PlayerContext";

interface RankedPlayer {
  id: string;
  name: string;
  avatar: string;
  level: number;
  glowScore: number;
  rank: number;
  isCurrentUser?: boolean;
}

const BASE_PLAYERS: RankedPlayer[] = [
  { id: "1", name: "Emma Champion", avatar: "trophy", level: 15, glowScore: 1250, rank: 1 },
  { id: "2", name: "Jake Pro", avatar: "crown", level: 14, glowScore: 1180, rank: 2 },
  { id: "3", name: "Lisa Winner", avatar: "star", level: 12, glowScore: 1050, rank: 3 },
  { id: "4", name: "Tom Ace", avatar: "flame", level: 10, glowScore: 980, rank: 4 },
  { id: "5", name: "Sarah Rally", avatar: "lightning", level: 9, glowScore: 920, rank: 5 },
];

const FILTERS = ["Overall", "Tactical", "Mental", "Technical", "Physical", "Social"];

export default function RankingScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { player } = usePlayer();
  const [activeFilter, setActiveFilter] = useState("Overall");

  const currentUser: RankedPlayer = {
    id: "current",
    name: "You",
    avatar: player.avatar,
    level: player.level,
    glowScore: player.totalGlowScore,
    rank: 0,
    isCurrentUser: true,
  };

  const allPlayers = [...BASE_PLAYERS, currentUser]
    .sort((a, b) => b.glowScore - a.glowScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return Colors.dark.gold;
      case 2: return Colors.dark.diamondSilver;
      case 3: return Colors.dark.bronzeCoin;
      default: return Colors.dark.text;
    }
  };

  const renderPlayer = ({ item }: { item: RankedPlayer }) => (
    <Pressable
      style={[styles.playerRow, item.isCurrentUser && styles.currentUserRow]}
    >
      <View style={styles.rankContainer}>
        {item.rank <= 3 ? (
          <Feather name="award" size={24} color={getRankColor(item.rank)} />
        ) : (
          <ThemedText style={[styles.rankText, { color: getRankColor(item.rank) }]}>
            #{item.rank}
          </ThemedText>
        )}
      </View>
      <PlayerAvatar avatar={item.avatar} size={44} level={item.level} showLevel />
      <View style={styles.playerInfo}>
        <ThemedText style={[styles.playerName, item.isCurrentUser && styles.currentUserName]}>
          {item.isCurrentUser ? "You" : item.name}
        </ThemedText>
        <ThemedText style={styles.playerLevel}>Level {item.level}</ThemedText>
      </View>
      <View style={styles.scoreContainer}>
        <Feather name="sun" size={16} color={Colors.dark.successNeon} />
        <ThemedText style={styles.scoreValue}>{item.glowScore}</ThemedText>
      </View>
    </Pressable>
  );

  const FilterChip = ({ filter }: { filter: string }) => (
    <Pressable
      onPress={() => setActiveFilter(filter)}
      style={[styles.filterChip, activeFilter === filter && styles.activeFilterChip]}
    >
      <ThemedText style={[styles.filterText, activeFilter === filter && styles.activeFilterText]}>
        {filter}
      </ThemedText>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={allPlayers}
        keyExtractor={(item) => item.id}
        renderItem={renderPlayer}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ListHeaderComponent={
          <View style={styles.header}>
            <FlatList
              horizontal
              data={FILTERS}
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => <FilterChip filter={item} />}
              contentContainerStyle={styles.filterList}
              style={styles.filterContainer}
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  filterContainer: {
    marginHorizontal: -Spacing.lg,
  },
  filterList: {
    paddingHorizontal: Spacing.lg,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  activeFilterChip: {
    backgroundColor: Colors.dark.primary,
  },
  filterText: {
    fontSize: 13,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  activeFilterText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
    opacity: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
  },
  currentUserRow: {
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  rankContainer: {
    width: 40,
    alignItems: "center",
  },
  rankText: {
    fontSize: 16,
    fontWeight: "700",
  },
  playerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  currentUserName: {
    color: Colors.dark.primary,
  },
  playerLevel: {
    fontSize: 12,
    color: Colors.dark.text,
    opacity: 0.6,
    marginTop: 2,
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  separator: {
    height: Spacing.sm,
  },
});
