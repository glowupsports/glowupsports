import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Colors, Spacing, BorderRadius, Backgrounds, GlowColors } from "@/constants/theme";

interface Friend {
  id: string;
  name: string;
  avatar: string;
  level: number;
  status: "online" | "offline" | "playing";
  lastActive?: string;
}

const FRIENDS: Friend[] = [
  { id: "1", name: "Sarah Rally", avatar: "star", level: 9, status: "online" },
  { id: "2", name: "Mike Ace", avatar: "flame", level: 8, status: "playing" },
  { id: "3", name: "Tom Serve", avatar: "trophy", level: 10, status: "online" },
  { id: "4", name: "Lisa Net", avatar: "lightning", level: 7, status: "offline", lastActive: "2 hours ago" },
  { id: "5", name: "Jake Pro", avatar: "crown", level: 12, status: "offline", lastActive: "Yesterday" },
];

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const getStatusColor = (status: Friend["status"]) => {
    switch (status) {
      case "online": return Colors.dark.successNeon;
      case "playing": return Colors.dark.orange;
      case "offline": return Colors.dark.disabled;
    }
  };

  const getStatusText = (status: Friend["status"], lastActive?: string) => {
    switch (status) {
      case "online": return "Online";
      case "playing": return "In Match";
      case "offline": return lastActive || "Offline";
    }
  };

  const renderFriend = ({ item }: { item: Friend }) => (
    <Pressable style={styles.friendCard}>
      <View style={styles.avatarContainer}>
        <PlayerAvatar avatar={item.avatar} size={50} level={item.level} showLevel />
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
      </View>
      <View style={styles.friendInfo}>
        <ThemedText style={styles.friendName}>{item.name}</ThemedText>
        <ThemedText style={[styles.statusText, { color: getStatusColor(item.status) }]}>
          {getStatusText(item.status, item.lastActive)}
        </ThemedText>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.primary} />
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Ionicons name="play-outline" size={20} color={Colors.dark.orange} />
        </Pressable>
      </View>
    </Pressable>
  );

  const onlineFriends = FRIENDS.filter(f => f.status !== "offline");
  const offlineFriends = FRIENDS.filter(f => f.status === "offline");

  return (
    <View style={styles.container}>
      <FlatList
        data={[...onlineFriends, ...offlineFriends]}
        keyExtractor={(item) => item.id}
        renderItem={renderFriend}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl + 80,
          paddingHorizontal: Spacing.lg,
          gap: Spacing.md,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Friends ({FRIENDS.length})</ThemedText>
            <ThemedText style={styles.onlineCount}>
              {onlineFriends.length} online
            </ThemedText>
          </View>
        }
      />
      <Pressable style={[styles.fab, { bottom: insets.bottom + Spacing.xl }]}>
        <Ionicons name="person-add-outline" size={24} color={Colors.dark.buttonText} />
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
  onlineCount: {
    fontSize: 14,
    color: Colors.dark.successNeon,
    fontWeight: "500",
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  avatarContainer: {
    position: "relative",
  },
  statusDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundDefault,
  },
  friendInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  statusText: {
    fontSize: 13,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 4,
  },
});
