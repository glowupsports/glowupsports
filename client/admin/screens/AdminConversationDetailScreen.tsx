import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AdminStackParamList } from "@/admin/navigation/AdminNavigator";
import { getApiUrl } from "@/lib/query-client";

const PAGE_SIZE = 50;

interface AdminMessage {
  id: string;
  body: string;
  messageType: string | null;
  senderType: string | null;
  senderCoachId: string | null;
  senderPlayerId: string | null;
  senderName: string | null;
  senderPhoto: string | null;
  createdAt: string | null;
}

interface MessagesPage {
  messages: AdminMessage[];
  hasMore: boolean;
}

type DetailRouteProp = RouteProp<AdminStackParamList, "AdminConversationDetail">;
type AdminNavProp = NativeStackNavigationProp<AdminStackParamList>;

function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AvatarInitial({ name, size = 30 }: { name: string | null; size?: number }) {
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

async function fetchMessagesPage(conversationId: string, offset: number): Promise<MessagesPage> {
  const url = new URL(
    `/api/admin/conversations/${conversationId}/messages`,
    getApiUrl(),
  );
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json() as Promise<MessagesPage>;
}

export default function AdminConversationDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AdminNavProp>();
  const route = useRoute<DetailRouteProp>();
  const listRef = useRef<FlatList<AdminMessage>>(null);

  const { conversationId, coachName, playerName } = route.params;

  const [allMessages, setAllMessages] = useState<AdminMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: firstPage, isLoading } = useQuery<MessagesPage>({
    queryKey: [`/api/admin/conversations/${conversationId}/messages`, 0],
    queryFn: () => fetchMessagesPage(conversationId, 0),
  });

  useEffect(() => {
    if (firstPage) {
      setAllMessages(firstPage.messages);
      setHasMore(firstPage.hasMore);
    }
  }, [firstPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchMessagesPage(conversationId, allMessages.length);
      setAllMessages((prev) => [...prev, ...data.messages]);
      setHasMore(data.hasMore);
    } catch {
      // silently ignore — user can scroll up again to retry
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, conversationId, allMessages.length]);

  const renderItem = useCallback(({ item }: { item: AdminMessage }) => {
    const isCoach = item.senderType === "coach";
    const bubbleAlign = isCoach ? "flex-end" : "flex-start";
    const bubbleColor = isCoach ? Colors.dark.primary : Colors.dark.surface;
    const textColor = isCoach ? "#000000" : Colors.dark.text;

    return (
      <View style={[styles.messageRow, { alignItems: bubbleAlign }]}>
        {!isCoach ? (
          <View style={styles.messageWithAvatar}>
            <AvatarInitial name={item.senderName} size={28} />
            <View style={styles.bubbleColumn}>
              <Text style={styles.senderLabel}>{item.senderName || "Player"}</Text>
              <View style={[styles.bubble, { backgroundColor: bubbleColor }]}>
                <Text style={[styles.bubbleText, { color: textColor }]}>{item.body}</Text>
              </View>
              <Text style={styles.timeLabel}>{formatMessageTime(item.createdAt)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.messageWithAvatarRight}>
            <View style={styles.bubbleColumnRight}>
              <Text style={[styles.senderLabel, { textAlign: "right" }]}>
                {item.senderName || "Coach"}
              </Text>
              <View style={[styles.bubble, { backgroundColor: bubbleColor }]}>
                <Text style={[styles.bubbleText, { color: textColor }]}>{item.body}</Text>
              </View>
              <Text style={[styles.timeLabel, { textAlign: "right" }]}>
                {formatMessageTime(item.createdAt)}
              </Text>
            </View>
            <AvatarInitial name={item.senderName} size={28} />
          </View>
        )}
      </View>
    );
  }, []);

  const ListFooter = loadingMore ? (
    <ActivityIndicator style={styles.footerSpinner} color={Colors.dark.primary} />
  ) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {coachName || "Coach"} &amp; {playerName || "Player"}
          </Text>
          <View style={styles.readOnlyBadge}>
            <Ionicons name="eye-outline" size={11} color={Colors.dark.primary} />
            <Text style={styles.readOnlyText}>Read-only — oversight view</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <TennisBallSpinner color={Colors.dark.primary} />
        </View>
      ) : allMessages.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>This conversation has no messages</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={allMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          ListFooterComponent={ListFooter}
          showsVerticalScrollIndicator={false}
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  headerCenter: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  readOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readOnlyText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontSize: 11,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.headline,
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  messageRow: {
    marginBottom: Spacing.sm,
  },
  messageWithAvatar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.xs,
    maxWidth: "80%",
  },
  messageWithAvatarRight: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.xs,
    maxWidth: "80%",
  },
  bubbleColumn: {
    flex: 1,
    gap: 2,
  },
  bubbleColumnRight: {
    flex: 1,
    gap: 2,
    alignItems: "flex-end",
  },
  senderLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  bubble: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  bubbleText: {
    ...Typography.body,
    lineHeight: 20,
  },
  timeLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  avatar: {
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: Colors.dark.text,
    fontWeight: "700",
  },
  footerSpinner: {
    marginVertical: Spacing.md,
  },
});
