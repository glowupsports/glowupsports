import React, { useState, type ComponentProps } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type FeatherName = ComponentProps<typeof Feather>["name"];

interface TrophyPin {
  id: string;
  trophyType: string;
  label: string;
  description: string;
  earnedAt: string;
  pinnedAt: string;
  accentColor?: string;
}

interface HofEntry {
  id: string;
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
  achievement: string;
  season: string;
  inductedAt: string;
}

interface TrophyRoomData {
  pins: TrophyPin[];
  hallOfFame: HofEntry[];
  stats: {
    totalWins: number;
    totalBattles: number;
    winRate: number;
    highestMmr: number;
    longestStreak: number;
    seasonsPlayed: number;
  };
}

const TROPHY_ICONS: Record<string, FeatherName> = {
  season_champion:  "award",
  win_streak:       "zap",
  first_win:        "star",
  ranked_win:       "shield",
  tournament_win:   "target",
  legendary_pull:   "feather",
  bounty_claimed:   "crosshair",
  academy_clash:    "users",
  default:          "circle",
};

const TROPHY_COLORS: Record<string, string> = {
  season_champion:  "#FFB300",
  win_streak:       "#7C4DFF",
  first_win:        GlowColors.primary,
  ranked_win:       "#00B0FF",
  tournament_win:   "#FF6D00",
  legendary_pull:   "#E91E63",
  bounty_claimed:   "#F44336",
  academy_clash:    "#4CAF50",
  default:          Colors.dark.textSecondary,
};

export default function TrophyRoomScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"Trophies" | "Hall of Fame" | "Stats">("Trophies");

  const { data, isLoading } = useQuery<TrophyRoomData>({
    queryKey: ["/api/arena/trophy-room"],
  });

  const pinMutation = useMutation({
    mutationFn: (trophyId: string) =>
      apiRequest("POST", "/api/arena/trophy-room/pin", { trophyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/arena/trophy-room"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
      </View>
    );
  }

  const stats = data?.stats;
  const pins = data?.pins ?? [];
  const hof = data?.hallOfFame ?? [];

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      {/* Tab bar */}
      <View style={styles.tabRow}>
        {(["Trophies", "Hall of Fame", "Stats"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => { setActiveTab(tab); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "Trophies" && (
          <>
            <Text style={styles.sectionTitle}>Trophy Case</Text>
            <Text style={styles.sectionSub}>Your pinned achievements and milestones</Text>
            {pins.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="award" size={40} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyText}>No trophies yet</Text>
                <Text style={styles.emptySub}>Win battles and complete challenges to earn trophies</Text>
              </View>
            ) : (
              pins.map((pin) => {
                const icon = TROPHY_ICONS[pin.trophyType] ?? TROPHY_ICONS.default;
                const color = pin.accentColor ?? TROPHY_COLORS[pin.trophyType] ?? TROPHY_COLORS.default;
                return (
                  <View key={pin.id} style={[styles.trophyCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
                    <View style={[styles.trophyIconBg, { backgroundColor: color + "22" }]}>
                      <Feather name={icon} size={22} color={color} />
                    </View>
                    <View style={styles.trophyInfo}>
                      <Text style={styles.trophyLabel}>{pin.label}</Text>
                      <Text style={styles.trophyDesc}>{pin.description}</Text>
                      <Text style={styles.trophyDate}>{new Date(pin.earnedAt).toLocaleDateString()}</Text>
                    </View>
                    <Feather name="anchor" size={16} color={color} />
                  </View>
                );
              })
            )}
          </>
        )}

        {activeTab === "Hall of Fame" && (
          <>
            <Text style={styles.sectionTitle}>Hall of Fame</Text>
            <Text style={styles.sectionSub}>Legends of the Arena</Text>
            {hof.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="star" size={40} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyText}>No inductees yet</Text>
                <Text style={styles.emptySub}>Season champions are inducted each season</Text>
              </View>
            ) : (
              hof.map((entry, i) => (
                <View key={entry.id} style={styles.hofCard}>
                  <View style={[styles.hofRank, { backgroundColor: i < 3 ? GlowColors.primary + "33" : Colors.dark.chipBackground }]}>
                    <Text style={[styles.hofRankText, { color: i < 3 ? GlowColors.primary : Colors.dark.textSecondary }]}>
                      {i + 1}
                    </Text>
                  </View>
                  <View style={styles.hofInfo}>
                    <Text style={styles.hofName}>{entry.playerName}</Text>
                    <Text style={styles.hofAchievement}>{entry.achievement}</Text>
                    <Text style={styles.hofSeason}>Season {entry.season}</Text>
                  </View>
                  <Feather name="award" size={20} color={i < 3 ? "#FFB300" : Colors.dark.textSecondary} />
                </View>
              ))
            )}
          </>
        )}

        {activeTab === "Stats" && stats && (
          <>
            <Text style={styles.sectionTitle}>Career Stats</Text>
            <Text style={styles.sectionSub}>Your arena journey at a glance</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Total Wins"      value={stats.totalWins.toString()}           color={GlowColors.primary} icon="check-circle" />
              <StatCard label="Battles"         value={stats.totalBattles.toString()}         color="#00B0FF"            icon="zap" />
              <StatCard label="Win Rate"        value={`${stats.winRate.toFixed(1)}%`}        color="#7C4DFF"            icon="percent" />
              <StatCard label="Peak MMR"        value={stats.highestMmr.toString()}           color="#FFB300"            icon="trending-up" />
              <StatCard label="Best Streak"     value={stats.longestStreak.toString()}        color="#FF6D00"            icon="activity" />
              <StatCard label="Seasons Played"  value={stats.seasonsPlayed.toString()}        color="#4CAF50"            icon="calendar" />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: FeatherName }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color, borderTopWidth: 2 }]}>
      <Feather name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  centered:         { justifyContent: "center", alignItems: "center" },
  tabRow:           { flexDirection: "row", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tab:              { flex: 1, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.dark.chipBackground, alignItems: "center" },
  tabActive:        { backgroundColor: GlowColors.primary },
  tabText:          { color: Colors.dark.textSecondary, fontWeight: "600", fontSize: 12 },
  tabTextActive:    { color: "#000" },
  content:          { padding: Spacing.md, gap: Spacing.sm },
  sectionTitle:     { color: Colors.dark.text, fontSize: 20, fontWeight: "700", marginBottom: 2 },
  sectionSub:       { color: Colors.dark.textSecondary, fontSize: 13, marginBottom: Spacing.sm },
  emptyState:       { alignItems: "center", paddingVertical: 48, gap: Spacing.sm },
  emptyText:        { color: Colors.dark.text, fontSize: 16, fontWeight: "600" },
  emptySub:         { color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" },
  trophyCard: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 12, padding: Spacing.md,
    flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 8,
  },
  trophyIconBg:     { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  trophyInfo:       { flex: 1 },
  trophyLabel:      { color: Colors.dark.text, fontWeight: "700", fontSize: 14 },
  trophyDesc:       { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
  trophyDate:       { color: Colors.dark.textSecondary, fontSize: 11, marginTop: 3 },
  hofCard: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 12, padding: Spacing.md,
    flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 8,
  },
  hofRank:          { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  hofRankText:      { fontWeight: "800", fontSize: 15 },
  hofInfo:          { flex: 1 },
  hofName:          { color: Colors.dark.text, fontWeight: "700", fontSize: 14 },
  hofAchievement:   { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
  hofSeason:        { color: GlowColors.primary, fontSize: 11, fontWeight: "600", marginTop: 2 },
  statsGrid:        { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  statCard: {
    backgroundColor: Colors.dark.backgroundCard, borderRadius: 12, padding: Spacing.md,
    alignItems: "center", width: "47%", gap: 4,
  },
  statValue:        { fontSize: 22, fontWeight: "800" },
  statLabel:        { color: Colors.dark.textSecondary, fontSize: 12, textAlign: "center" },
});
