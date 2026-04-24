import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, FontSizes } from "@/constants/theme";

type SubTab = "submissions" | "leaderboard";

interface ChallengeSummary {
  id: string;
  title: string;
  description: string;
  hashtag: string;
  weekStart: string;
}

interface SubmissionPost {
  id: string;
  authorId: string;
  caption: string | null;
  mediaUrls: string[] | null;
  mediaTypes: string[] | null;
  createdAt: string;
  cheerCount: number | null;
  commentCount: number | null;
  authorName: string | null;
  authorPhotoUrl: string | null;
}

interface SubmissionsResponse {
  challenge: ChallengeSummary | null;
  submissions: SubmissionPost[];
}

function fmtRange(weekStart: string): string {
  try {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  } catch {
    return "";
  }
}

export default function SkillChallengeSubmissionsScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SubTab>("submissions");
  const { data, isLoading, refetch, isRefetching } = useQuery<SubmissionsResponse>({
    queryKey: ["/api/leaderboards/skill-challenge/submissions"],
    staleTime: 60_000,
  });

  const challenge = data?.challenge ?? null;
  const submissions = data?.submissions ?? [];

  const sortedByCheers = [...submissions].sort(
    (a, b) => (b.cheerCount ?? 0) - (a.cheerCount ?? 0)
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
      {challenge ? (
        <View style={styles.header}>
          <Text style={styles.eyebrow}>WEEKLY SKILL CHALLENGE</Text>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.range}>
            {fmtRange(challenge.weekStart)} · #{challenge.hashtag}
          </Text>
        </View>
      ) : null}

      <View style={styles.tabs}>
        {(["submissions", "leaderboard"] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            testID={`tab-skill-challenge-${t}`}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "submissions" ? "All submissions" : "Top performers"}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.dark.tint} />
        </View>
      ) : !challenge ? (
        <View style={styles.empty}>
          <Ionicons name="ribbon" size={36} color={Colors.dark.accentText} />
          <Text style={styles.emptyText}>No active challenge this week.</Text>
        </View>
      ) : tab === "submissions" ? (
        <FlatList
          data={submissions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.tint} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cloud-upload" size={36} color={Colors.dark.accentText} />
              <Text style={styles.emptyText}>
                Be the first to post with #{challenge.hashtag}.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const firstMedia = item.mediaUrls?.[0] ?? null;
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  {item.authorPhotoUrl ? (
                    <Image source={{ uri: item.authorPhotoUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Ionicons name="person" size={16} color={Colors.dark.text} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authorName}>{item.authorName ?? "Player"}</Text>
                    <Text style={styles.timestamp}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.cheerPill}>
                    <Ionicons name="heart" size={12} color="#EF4444" />
                    <Text style={styles.cheerCount}>{item.cheerCount ?? 0}</Text>
                  </View>
                </View>
                {item.caption ? (
                  <Text style={styles.caption} numberOfLines={3}>
                    {item.caption}
                  </Text>
                ) : null}
                {firstMedia ? (
                  <Image source={{ uri: firstMedia }} style={styles.media} />
                ) : null}
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={sortedByCheers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.dark.tint} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="trophy" size={36} color={Colors.dark.accentText} />
              <Text style={styles.emptyText}>No submissions yet — be the first!</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.rankRow}>
              <Text style={styles.rankNumber}>{index + 1}</Text>
              {item.authorPhotoUrl ? (
                <Image source={{ uri: item.authorPhotoUrl }} style={styles.rankAvatar} />
              ) : (
                <View style={[styles.rankAvatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={14} color={Colors.dark.text} />
                </View>
              )}
              <Text style={styles.rankName} numberOfLines={1}>
                {item.authorName ?? "Player"}
              </Text>
              <View style={styles.cheerPill}>
                <Ionicons name="heart" size={12} color="#EF4444" />
                <Text style={styles.cheerCount}>{item.cheerCount ?? 0}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  eyebrow: {
    color: "#FFD700",
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  title: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    marginTop: 4,
  },
  range: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.xs,
    marginTop: 4,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.cardBackground,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "rgba(255,215,0,0.15)",
    borderColor: "#FFD700",
  },
  tabLabel: {
    color: Colors.dark.text,
    opacity: 0.7,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#FFD700",
    opacity: 1,
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.dark.accentText,
    fontSize: FontSizes.sm,
    textAlign: "center",
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.cardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    backgroundColor: Colors.dark.cardBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  authorName: { color: Colors.dark.text, fontSize: FontSizes.sm, fontWeight: "700" },
  timestamp: { color: Colors.dark.accentText, fontSize: FontSizes.xs },
  cheerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cheerCount: { color: Colors.dark.text, fontSize: FontSizes.xs, fontWeight: "600" },
  caption: { color: Colors.dark.text, fontSize: FontSizes.sm, lineHeight: 19 },
  media: { width: "100%", aspectRatio: 1, borderRadius: BorderRadius.md },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.cardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
    marginBottom: 6,
  },
  rankNumber: {
    color: "#FFD700",
    fontSize: FontSizes.md,
    fontWeight: "800",
    width: 28,
  },
  rankAvatar: { width: 28, height: 28, borderRadius: 14 },
  rankName: { color: Colors.dark.text, fontSize: FontSizes.sm, fontWeight: "600", flex: 1 },
});
