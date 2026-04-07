import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeInRight, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";

interface Friend {
  id: string;
  name: string;
  photoUrl: string | null;
  level: number;
  ballLevel: string | null;
}

interface FriendSelectorProps {
  selectedFriends: Friend[];
  onSelectionChange: (friends: Friend[]) => void;
  maxSelection?: number;
  excludePlayerIds?: string[];
}

function getBallColor(ball: string | null): string {
  switch (ball?.toLowerCase()) {
    case "green": return "#2ECC40";
    case "yellow": return "#FFDC00";
    case "orange": return "#FF851B";
    case "red": return "#FF4136";
    default: return Colors.dark.textMuted;
  }
}

export default function FriendSelector({
  selectedFriends,
  onSelectionChange,
  maxSelection = 3,
  excludePlayerIds = [],
}: FriendSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: connectionsData, isLoading } = useQuery<{
    friends: { player: Friend }[];
  }>({
    queryKey: ["/api/player/connections"],
  });

  const friends = useMemo(() => {
    if (!connectionsData?.friends) return [];
    return connectionsData.friends
      .filter((c) => c.player && !excludePlayerIds.includes(c.player.id))
      .map((c) => c.player)
      .filter((f): f is Friend => f !== null);
  }, [connectionsData, excludePlayerIds]);

  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const query = searchQuery.toLowerCase();
    return friends.filter((f) => f.name.toLowerCase().includes(query));
  }, [friends, searchQuery]);

  const isSelected = (friendId: string) => {
    return selectedFriends.some((f) => f.id === friendId);
  };

  const toggleFriend = (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSelected(friend.id)) {
      onSelectionChange(selectedFriends.filter((f) => f.id !== friend.id));
    } else {
      if (selectedFriends.length < maxSelection) {
        onSelectionChange([...selectedFriends, friend]);
      }
    }
  };

  const renderSelectedFriend = ({ item }: { item: Friend }) => (
    <Animated.View entering={ZoomIn.springify()} style={styles.selectedChip}>
      <View style={styles.selectedChipAvatar}>
        {item.photoUrl ? (
          <Image
            source={{ uri: buildPhotoUrl(item.photoUrl)! }}
            style={styles.chipAvatarImage}
          />
        ) : (
          <Ionicons name="person" size={14} color={Colors.dark.text} />
        )}
      </View>
      <ThemedText style={styles.selectedChipName} numberOfLines={1}>
        {item.name.split(" ")[0]}
      </ThemedText>
      <Pressable
        style={styles.removeButton}
        onPress={() => toggleFriend(item)}
        hitSlop={8}
      >
        <Ionicons name="close" size={14} color={Colors.dark.textMuted} />
      </Pressable>
    </Animated.View>
  );

  const renderFriend = ({ item, index }: { item: Friend; index: number }) => {
    const selected = isSelected(item.id);
    const canSelect = selectedFriends.length < maxSelection || selected;

    return (
      <Animated.View entering={FadeInRight.delay(index * 50)}>
        <Pressable
          style={[
            styles.friendRow,
            selected && styles.friendRowSelected,
            !canSelect && styles.friendRowDisabled,
          ]}
          onPress={() => canSelect && toggleFriend(item)}
          disabled={!canSelect}
        >
          <View style={styles.friendAvatar}>
            {item.photoUrl ? (
              <Image
                source={{ uri: buildPhotoUrl(item.photoUrl)! }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={20} color={Colors.dark.textMuted} />
              </View>
            )}
          </View>
          
          <View style={styles.friendInfo}>
            <ThemedText style={styles.friendName}>{item.name}</ThemedText>
            <View style={styles.friendMeta}>
              <View style={styles.levelBadge}>
                <ThemedText style={styles.levelText}>Lvl {item.level}</ThemedText>
              </View>
              {item.ballLevel ? (
                <View style={[styles.ballBadge, { backgroundColor: getBallColor(item.ballLevel) + "30" }]}>
                  <Ionicons name="tennisball" size={10} color={getBallColor(item.ballLevel)} />
                </View>
              ) : null}
            </View>
          </View>
          
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected ? (
              <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="people" size={20} color={Colors.dark.xpCyan} />
        <ThemedText style={styles.headerTitle}>Invite Friends</ThemedText>
        <ThemedText style={styles.headerCount}>
          {selectedFriends.length}/{maxSelection}
        </ThemedText>
      </View>

      {selectedFriends.length > 0 ? (
        <Animated.View entering={FadeIn} style={styles.selectedContainer}>
          <FlatList
            data={selectedFriends}
            renderItem={renderSelectedFriend}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedList}
          />
        </Animated.View>
      ) : null}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends..."
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.dark.xpCyan} />
          <ThemedText style={styles.loadingText}>Loading friends...</ThemedText>
        </View>
      ) : filteredFriends.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={Colors.dark.textMuted} />
          <ThemedText style={styles.emptyText}>
            {searchQuery ? "No friends found" : "No friends yet"}
          </ThemedText>
          <ThemedText style={styles.emptyHint}>
            {searchQuery ? "Try a different search" : "Add friends from the community to invite them"}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredFriends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.friendsList}
          style={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
    flex: 1,
  },
  headerCount: {
    fontSize: FontSizes.sm,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  selectedContainer: {
    marginBottom: Spacing.md,
  },
  selectedList: {
    gap: Spacing.sm,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.xpCyan + "20",
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  selectedChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  chipAvatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  selectedChipName: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
    maxWidth: 80,
  },
  removeButton: {
    padding: 2,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    padding: 0,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  emptyHint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  list: {
    flex: 1,
    maxHeight: 250,
  },
  friendsList: {
    gap: Spacing.xs,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  friendRowSelected: {
    backgroundColor: Colors.dark.xpCyan + "15",
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  friendRowDisabled: {
    opacity: 0.5,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundRoot,
    alignItems: "center",
    justifyContent: "center",
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: FontSizes.md,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  friendMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 2,
  },
  levelBadge: {
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  levelText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  ballBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.dark.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.dark.xpCyan,
    borderColor: Colors.dark.xpCyan,
  },
});
