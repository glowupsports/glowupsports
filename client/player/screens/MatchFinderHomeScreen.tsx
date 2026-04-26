// Task #1271 — Match Finder home (players-first replacement of the old wizard).
//
// Layout:
//   - Top CTA card: "Post an open match" — Task #1362 promotes this from a
//     buried footer link to a first-class header pivot so a player who
//     landed here looking for opponents can also broadcast a slot.
//   - Sticky filter bar (level / scope) below the CTA.
//   - Vertical scroll of large player cards from
//     /api/social/discovery/players?intent=match.
//   - Footer: secondary "Invite a friend" outsider-invite button only; the
//     legacy "Post an open invite" link has moved into the header card.

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSizes,
} from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";
import { PlayerMatchCard, type MatchCandidate } from "@/player/components/match/PlayerMatchCard";
import { ChallengeComposerModal } from "@/player/components/match/ChallengeComposerModal";
import { OutsideInviteModal } from "@/player/components/match/OutsideInviteModal";

const LEVEL_FILTERS: { id: "all" | "green" | "yellow" | "orange" | "red"; label: string }[] = [
  { id: "all", label: "All levels" },
  { id: "green", label: "Green" },
  { id: "yellow", label: "Yellow" },
  { id: "orange", label: "Orange" },
  { id: "red", label: "Red" },
];

const SCOPE_FILTERS: { id: "academy" | "country" | "global"; label: string }[] = [
  { id: "academy", label: "My academy" },
  { id: "country", label: "My country" },
  { id: "global", label: "Everyone" },
];

interface DiscoveryResponse {
  players: MatchCandidate[];
  cursor?: string | null;
}

export default function MatchFinderHomeScreen() {
  const navigation = useNavigation<any>();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const { t } = useTranslation();
  const myPlayerId = user?.playerId || null;

  const [levelFilter, setLevelFilter] = useState<typeof LEVEL_FILTERS[number]["id"]>("all");
  const [scope, setScope] = useState<typeof SCOPE_FILTERS[number]["id"]>("country");
  const [composerOpen, setComposerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<MatchCandidate | null>(null);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("intent", "match");
    params.set("scope", scope);
    if (levelFilter !== "all") params.set("ballLevel", levelFilter);
    params.set("limit", "25");
    return `/api/social/discovery/players?${params.toString()}`;
  }, [scope, levelFilter]);

  const { data, isLoading, refetch, isRefetching } =
    useQuery<DiscoveryResponse>({
      queryKey: ["/api/social/discovery/players", "match", scope, levelFilter],
      queryFn: async () => {
        const res = await apiRequest("GET", queryPath);
        return (await res.json()) as DiscoveryResponse;
      },
    });

  const players = data?.players ?? [];

  const handleChallenge = useCallback((p: MatchCandidate) => {
    setSelected(p);
    setComposerOpen(true);
  }, []);

  const handleViewProfile = useCallback(
    (p: MatchCandidate) => {
      navigation.navigate("Player", {
        screen: "PlayerPublicProfile",
        params: { playerId: p.id },
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: MatchCandidate }) => (
      <PlayerMatchCard
        player={item}
        onChallenge={handleChallenge}
        onViewProfile={handleViewProfile}
      />
    ),
    [handleChallenge, handleViewProfile],
  );

  const ListHeader = (
    <View style={styles.filtersWrap}>
      {/* Task #1362 — Promote "Post an open match" to a top-of-screen CTA so
          players who landed in the Match Finder can pivot to broadcasting an
          open slot without hunting for the old footer link. */}
      <Pressable
        style={styles.headerCta}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          navigation.navigate("CreateMatch", { presetPartnerOption: "find" });
        }}
      >
        <View style={styles.headerCtaIcon}>
          <Ionicons name="megaphone" size={20} color="#0B0D10" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerCtaTitle}>{t("player.play.postOpenMatch")}</Text>
          <Text style={styles.headerCtaSubtitle}>
            {t("player.play.postOpenMatchDesc")}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={Colors.dark.textSecondary}
        />
      </Pressable>
      <View style={styles.filterRow}>
        {SCOPE_FILTERS.map((f) => {
          const active = f.id === scope;
          return (
            <Pressable
              key={f.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setScope(f.id);
              }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.filterRow, { marginTop: Spacing.sm }]}>
        {LEVEL_FILTERS.map((f) => {
          const active = f.id === levelFilter;
          return (
            <Pressable
              key={f.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setLevelFilter(f.id);
              }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const ListEmpty = !isLoading ? (
    <View style={styles.empty}>
      <Ionicons name="search" size={36} color={Colors.dark.textMuted} />
      <Text style={styles.emptyTitle}>No players match your filters</Text>
      <Text style={styles.emptyBody}>
        Loosen the level or scope, or invite a friend to join you.
      </Text>
      <Pressable
        style={[styles.footerBtn, { marginTop: Spacing.lg }]}
        onPress={() => setInviteOpen(true)}
      >
        <Ionicons
          name="person-add"
          size={16}
          color={Colors.dark.text}
        />
        <Text style={styles.footerBtnText}>Invite a friend</Text>
      </Pressable>
    </View>
  ) : null;

  const ListFooter = (
    <View style={styles.footerWrap}>
      <Pressable
        style={[styles.footerBtn, styles.footerBtnPrimary]}
        onPress={() => {
          Haptics.selectionAsync();
          setInviteOpen(true);
        }}
      >
        <Ionicons name="person-add" size={16} color="#0B0D10" />
        <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>
          Invite a friend
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing["3xl"],
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.dark.primary}
          />
        }
        ListHeaderComponentStyle={{ marginBottom: Spacing.lg }}
        ItemSeparatorComponent={null}
      />
      {isLoading ? (
        <View style={[styles.loadingOverlay, { top: headerHeight + 120 }]}>
          <ActivityIndicator color={Colors.dark.primary} />
        </View>
      ) : null}

      <ChallengeComposerModal
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        opponent={selected}
        myPlayerId={myPlayerId}
      />
      <OutsideInviteModal
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        inviterName={(user as any)?.firstName || (user as any)?.name || null}
        targetType="play"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  filtersWrap: {
    gap: Spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  chipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  chipText: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#0B0D10",
  },
  empty: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.lg,
    fontWeight: "700",
  },
  emptyBody: {
    color: Colors.dark.textSecondary,
    textAlign: "center",
    fontSize: FontSizes.sm,
    paddingHorizontal: Spacing.xl,
  },
  footerWrap: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
    alignItems: "center",
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    alignSelf: "stretch",
  },
  footerBtnPrimary: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  footerBtnText: {
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  footerBtnTextPrimary: {
    color: "#0B0D10",
  },
  headerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
  headerCtaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCtaTitle: {
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  headerCtaSubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
