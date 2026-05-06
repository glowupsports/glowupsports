import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AdminStackParamList } from "@/admin/navigation/AdminNavigator";
import { getApiUrl } from "@/lib/query-client";

const PAGE_SIZE = 50;

interface AdminConversation {
  id: string;
  type: string;
  coachId: string | null;
  coachName: string | null;
  coachPhoto: string | null;
  playerId: string | null;
  playerName: string | null;
  playerPhoto: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

interface ConversationsPage {
  conversations: AdminConversation[];
  hasMore: boolean;
}

interface CoachSection {
  coachName: string;
  data: AdminConversation[];
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function AvatarInitial({ name, size = 42 }: { name: string | null; size?: number }) {
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
}

async function fetchConversationsPage(offset: number): Promise<ConversationsPage> {
  const url = new URL("/api/admin/conversations", getApiUrl());
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json() as Promise<ConversationsPage>;
}

type AdminNavProp = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminConversationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<AdminNavProp>();
  const [search, setSearch] = useState("");
  const [allConversations, setAllConversations] = useState<AdminConversation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: firstPage, isLoading, refetch } = useQuery<ConversationsPage>({
    queryKey: ["/api/admin/conversations", 0],
    queryFn: () => fetchConversationsPage(0),
  });

  useEffect(() => {
    if (firstPage) {
      setAllConversations(firstPage.conversations);
      setHasMore(firstPage.hasMore);
    }
  }, [firstPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchConversationsPage(allConversations.length);
      setAllConversations((prev) => [...prev, ...data.conversations]);
      setHasMore(data.hasMore);
    } catch {
      // silently ignore — pull-to-refresh available
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, allConversations.length]);

  const handleRefresh = useCallback(async () => {
    const data = await fetchConversationsPage(0);
    setAllConversations(data.conversations);
    setHasMore(data.hasMore);
    refetch();
  }, [refetch]);

  const sections: CoachSection[] = useMemo(() => {
    const filtered = search.trim()
      ? allConversations.filter((c) => {
          const q = search.toLowerCase();
          return (
            (c.coachName || "").toLowerCase().includes(q) ||
            (c.playerName || "").toLowerCase().includes(q)
          );
        })
      : allConversations;

    const groupMap = new Map<string, AdminConversation[]>();
    for (const conv of filtered) {
      const key = conv.coachName || "Unknown Coach";
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(conv);
    }

    return Array.from(groupMap.entries()).map(([coachName, data]) => ({
      coachName,
      data,
    }));
  }, [allConversations, search]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: CoachSection }) => (
      <View style={styles.sectionHeader}>
        <AvatarInitial name={section.coachName} size={22} />
        <Text style={styles.sectionHeaderText}>{section.coachName}</Text>
      </View>
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminConversation }) => (
      <Pressable
        style={styles.row}
        onPress={() =>
          navigation.navigate("AdminConversationDetail", {
            conversationId: item.id,
            coachName: item.coachName,
            playerName: item.playerName,
          })
        }
      >
        <AvatarInitial name={item.playerName} size={40} />

        <View style={styles.rowContent}>
          <View style={styles.rowHeader}>
            <Text style={styles.participantsText} numberOfLines={1}>
              {item.playerName || "Player"}
            </Text>
            <Text style={styles.timeText}>{formatTime(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.rowMeta}>
            <View style={styles.typeBadge}>
              <Ionicons name="eye-outline" size={10} color={Colors.dark.textMuted} />
              <Text style={styles.typeText}>
                {item.type === "coach_parent" ? "Coach / Parent" : "Coach / Player"}
              </Text>
            </View>
          </View>
          {item.lastMessagePreview ? (
            <Text style={styles.previewText} numberOfLines={1}>
              {item.lastMessagePreview}
            </Text>
          ) : (
            <Text style={styles.previewEmpty}>No messages yet</Text>
          )}
        </View>

        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
      </Pressable>
    ),
    [navigation],
  );

  const ListFooter = loadingMore ? (
    <ActivityIndicator style={styles.footerSpinner} color={Colors.dark.primary} />
  ) : null;

  const totalCount = sections.reduce((acc, s) => acc + s.data.length, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <Text style={styles.headerSubtitle}>Coach-player chat oversight — read only</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.dark.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by coach or player name..."
          placeholderTextColor={Colors.dark.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <TennisBallSpinner color={Colors.dark.primary} />
        </View>
      ) : totalCount === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={48} color={Colors.dark.textMuted} />
          <Text style={styles.emptyTitle}>
            {search ? "No results found" : "No conversations yet"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {search
              ? "Try a different search term"
              : "Coach-player conversations will appear here"}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          onRefresh={handleRefresh}
          refreshing={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          ListFooterComponent={ListFooter}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          stickySectionHeadersEnabled={false}
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
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.title2,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  headerSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    paddingVertical: 4,
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  sectionHeaderText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  rowContent: {
    flex: 1,
    gap: 2,
    marginLeft: Spacing.md,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  participantsText: {
    ...Typography.headline,
    color: Colors.dark.text,
    fontWeight: "600",
    flex: 1,
    marginRight: Spacing.sm,
  },
  timeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.dark.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontSize: 10,
  },
  previewText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  previewEmpty: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.dark.border,
    marginLeft: Spacing.lg + 40 + Spacing.md,
  },
  avatar: {
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "700",
    fontSize: 15,
  },
  footerSpinner: {
    marginVertical: Spacing.md,
  },
});
