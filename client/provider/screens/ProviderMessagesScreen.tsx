import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing } from "@/constants/theme";

interface Conversation {
  id: string;
  orderId: string | null;
  playerId: string | null;
  playerName: string | null;
  playerPhoto: string | null;
  orderNumber: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  hasUnread: boolean;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ProviderMessagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/provider/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/provider/conversations");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const renderConversation = useCallback(({ item }: { item: Conversation }) => {
    return (
      <Pressable
        style={styles.convRow}
        onPress={() => {
          if (item.orderId) {
            navigation.navigate("ProviderChat", { orderId: item.orderId });
          }
        }}
      >
        <View style={styles.avatarContainer}>
          {item.playerPhoto ? (
            <Image source={{ uri: item.playerPhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={22} color={Colors.dark.textSecondary} />
            </View>
          )}
          {item.hasUnread ? <View style={styles.unreadDot} /> : null}
        </View>

        <View style={styles.convInfo}>
          <View style={styles.convTop}>
            <Text style={[styles.convName, item.hasUnread && styles.convNameBold]}>
              {item.playerName ?? "Player"}
            </Text>
            <Text style={styles.convTime}>{formatRelativeTime(item.lastMessageAt)}</Text>
          </View>
          {item.orderNumber ? (
            <Text style={styles.convOrder}>Booking #{item.orderNumber}</Text>
          ) : null}
          {item.lastMessagePreview ? (
            <Text style={[styles.convPreview, item.hasUnread && styles.convPreviewBold]} numberOfLines={1}>
              {item.lastMessagePreview}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textTertiary} />
      </Pressable>
    );
  }, [navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={52} color={Colors.dark.textSecondary} />
              <Text style={styles.emptyTitle}>No Conversations Yet</Text>
              <Text style={styles.emptySubText}>
                When you confirm a booking, a chat thread will appear here.
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },
  convInfo: {
    flex: 1,
    gap: 3,
  },
  convTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  convName: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  convNameBold: {
    fontWeight: "700",
  },
  convTime: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
  },
  convOrder: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: "500",
  },
  convPreview: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  convPreviewBold: {
    color: Colors.dark.text,
    fontWeight: "500",
  },
  separator: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginLeft: Spacing.lg + 48 + Spacing.md,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  emptySubText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
