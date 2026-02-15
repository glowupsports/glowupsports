import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Colors, Spacing, BorderRadius, GlowColors } from "@/constants/theme";

interface GameSession {
  id: string;
  host: string;
  hostAvatar: string;
  hostLevel: number;
  gameType: string;
  players: number;
  maxPlayers: number;
  status: "waiting" | "starting" | "full";
}

const SESSIONS: GameSession[] = [
  { id: "1", host: "Emma Champion", hostAvatar: "trophy", hostLevel: 15, gameType: "Doubles Match", players: 3, maxPlayers: 4, status: "waiting" },
  { id: "2", host: "Jake Pro", hostAvatar: "crown", hostLevel: 14, gameType: "Practice Rally", players: 1, maxPlayers: 2, status: "waiting" },
  { id: "3", host: "Sarah Rally", hostAvatar: "star", hostLevel: 9, gameType: "Tournament", players: 8, maxPlayers: 8, status: "full" },
  { id: "4", host: "Mike Ace", hostAvatar: "flame", hostLevel: 8, gameType: "Quick Match", players: 1, maxPlayers: 2, status: "starting" },
];

export default function GameLobbyScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const getStatusStyle = (status: GameSession["status"]) => {
    switch (status) {
      case "waiting": return { bg: Colors.dark.primary, text: "Join" };
      case "starting": return { bg: Colors.dark.orange, text: "Starting..." };
      case "full": return { bg: Colors.dark.disabled, text: "Full" };
    }
  };

  const renderSession = ({ item }: { item: GameSession }) => {
    const statusStyle = getStatusStyle(item.status);
    const canJoin = item.status === "waiting";

    return (
      <Card style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <PlayerAvatar avatar={item.hostAvatar} size={44} level={item.hostLevel} showLevel />
          <View style={styles.sessionInfo}>
            <ThemedText style={styles.hostName}>{item.host}</ThemedText>
            <ThemedText style={styles.gameType}>{item.gameType}</ThemedText>
          </View>
        </View>
        <View style={styles.sessionFooter}>
          <View style={styles.playerCount}>
            <Ionicons name="people-outline" size={16} color={Colors.dark.text} />
            <ThemedText style={styles.countText}>
              {item.players}/{item.maxPlayers} Players
            </ThemedText>
          </View>
          <Pressable
            disabled={!canJoin}
            style={[styles.joinButton, { backgroundColor: statusStyle.bg }]}
          >
            <ThemedText style={styles.joinText}>{statusStyle.text}</ThemedText>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={SESSIONS}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl + 80,
          paddingHorizontal: Spacing.lg,
          gap: Spacing.md,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Active Games</ThemedText>
            <View style={styles.refreshButton}>
              <Ionicons name="refresh-outline" size={18} color={Colors.dark.primary} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="grid-outline" size={48} color={Colors.dark.textMuted} />
            <ThemedText style={styles.emptyText}>No active games</ThemedText>
          </View>
        }
      />
      <Pressable style={[styles.fab, { bottom: insets.bottom + Spacing.xl }]}>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionCard: {
    padding: Spacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  sessionInfo: {
    flex: 1,
  },
  hostName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  gameType: {
    fontSize: 14,
    color: Colors.dark.primary,
    marginTop: 2,
  },
  sessionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundSecondary,
  },
  playerCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  countText: {
    fontSize: 14,
    color: Colors.dark.text,
    opacity: 0.7,
  },
  joinButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  joinText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["3xl"],
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.dark.textMuted,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 4,
  },
});
