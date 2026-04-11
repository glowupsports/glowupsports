import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  CardStyles,
  BallLevelColors,
  GlowColors,
  Backgrounds,
} from "@/constants/theme";

const NEON_GREEN = GlowColors.primary;
const PLATFORM_PURPLE = "#9B59B6";

const BALL_CONFIG: Record<string, { color: string; label: string }> = {
  blue: { color: BallLevelColors.blue, label: "Blue" },
  red: { color: BallLevelColors.red, label: "Red" },
  orange: { color: BallLevelColors.orange, label: "Orange" },
  green: { color: BallLevelColors.green, label: "Green" },
  yellow: { color: BallLevelColors.yellow, label: "Yellow" },
  glow: { color: BallLevelColors.glow, label: "Glow" },
};

function getInitialsColor(name: string): string {
  const palette = [
    "#4FC3F7", "#FF4D4D", "#FF851B", "#C8FF3D",
    "#FFD700", "#E040FB", "#00E676", "#4DA3FF",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface DirectoryPlayer {
  id: string;
  name: string;
  academy: string | null;
  level: number;
  ballLevel: string;
}

interface HealthPlayer {
  id: string;
  name: string;
  academy: string | null;
  level: number;
  ballLevel: string;
  xp: number;
  sessions: number;
  streak: number;
  engagement: "high" | "medium" | "low";
}

interface PlayerHealthData {
  healthStats: {
    totalPlayers: number;
    activeThisWeek: number;
    atRisk: number;
    avgLevel: number;
    avgXpPerPlayer: number;
    avgStreak: number;
  };
  ballLevelDistribution: { ballLevel: string; count: number }[];
  players: HealthPlayer[];
  allPlayers: DirectoryPlayer[];
}

function InitialsAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const color = getInitialsColor(name);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}22`,
          borderWidth: 1.5,
          borderColor: `${color}55`,
        },
      ]}
    >
      <Text style={[styles.avatarText, { color, fontSize: size * 0.35 }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

function BallBadge({ ballLevel }: { ballLevel: string }) {
  const cfg = BALL_CONFIG[ballLevel?.toLowerCase()] ?? { color: Colors.dark.textMuted, label: ballLevel ?? "?" };
  return (
    <View style={[styles.ballBadge, { backgroundColor: `${cfg.color}20`, borderColor: `${cfg.color}50` }]}>
      <View style={[styles.ballDot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.ballBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

function StatChip({ icon, value, label, color }: { icon: FeatherIconName; value: string | number; label: string; color: string }) {
  return (
    <View style={styles.chip}>
      <Feather name={icon} size={13} color={color} />
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

function BallDistribution({ distribution }: { distribution: { ballLevel: string; count: number }[] }) {
  const mostPopular = distribution.reduce((a, b) => (a.count >= b.count ? a : b), distribution[0]);

  return (
    <View style={[styles.sectionCard, CardStyles.elevated]}>
      <Text style={styles.sectionCardTitle}>Ball Level Distribution</Text>
      <View style={styles.ballRow}>
        {distribution.map((item) => {
          const cfg = BALL_CONFIG[item.ballLevel] ?? { color: Colors.dark.textMuted, label: item.ballLevel };
          const isTop = item.ballLevel === mostPopular?.ballLevel && item.count > 0;
          return (
            <View
              key={item.ballLevel}
              style={[
                styles.ballChip,
                {
                  backgroundColor: `${cfg.color}18`,
                  borderColor: isTop ? `${cfg.color}80` : `${cfg.color}30`,
                  ...(isTop ? { shadowColor: cfg.color, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 } : {}),
                },
              ]}
            >
              <View style={[styles.ballDotLarge, { backgroundColor: cfg.color }]} />
              <Text style={[styles.ballChipCount, { color: cfg.color }]}>{item.count}</Text>
              <Text style={[styles.ballChipLabel, { color: `${cfg.color}AA` }]}>{cfg.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HealthPlayerRow({ player, isTopPerformer }: { player: HealthPlayer; isTopPerformer: boolean }) {
  return (
    <View
      style={[
        styles.healthRow,
        isTopPerformer ? { borderLeftWidth: 3, borderLeftColor: NEON_GREEN } : {},
      ]}
    >
      <InitialsAvatar name={player.name} size={40} />
      <View style={styles.healthRowInfo}>
        <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
        {player.academy ? (
          <Text style={styles.playerAcademy} numberOfLines={1}>{player.academy}</Text>
        ) : (
          <View style={styles.freeChip}>
            <Text style={styles.freeChipText}>Free Player</Text>
          </View>
        )}
      </View>
      <BallBadge ballLevel={player.ballLevel} />
      <View style={styles.healthStats}>
        <View style={styles.healthStat}>
          <Text style={[styles.healthStatVal, { color: Colors.dark.xpCyan }]}>{player.xp.toLocaleString()}</Text>
          <Text style={styles.healthStatLbl}>XP</Text>
        </View>
        <View style={styles.healthStat}>
          <Text style={styles.healthStatVal}>{player.sessions}</Text>
          <Text style={styles.healthStatLbl}>Sess</Text>
        </View>
        <View style={styles.healthStat}>
          <Text style={[styles.healthStatVal, { color: Colors.dark.orange }]}>{player.streak}</Text>
          <Text style={styles.healthStatLbl}>Streak</Text>
        </View>
      </View>
    </View>
  );
}

function DirectoryRow({ item }: { item: DirectoryPlayer }) {
  return (
    <View style={styles.directoryRow}>
      <InitialsAvatar name={item.name} size={42} />
      <View style={styles.directoryInfo}>
        <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
        {item.academy ? (
          <Text style={styles.playerAcademy} numberOfLines={1}>{item.academy}</Text>
        ) : (
          <View style={styles.freeChip}>
            <Text style={styles.freeChipText}>Free Player</Text>
          </View>
        )}
      </View>
      <BallBadge ballLevel={item.ballLevel} />
    </View>
  );
}

export default function PlayerHealthScreen() {
  const headerHeight = useHeaderHeight();
  const [activeTab, setActiveTab] = useState<"health" | "directory">("health");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useQuery<PlayerHealthData>({
    queryKey: ["/api/platform/player-health"],
    staleTime: 0,
  });

  const healthStats = data?.healthStats ?? {
    totalPlayers: 0,
    activeThisWeek: 0,
    atRisk: 0,
    avgLevel: 0,
    avgXpPerPlayer: 0,
    avgStreak: 0,
  };

  const ballLevelDistribution = data?.ballLevelDistribution ?? [];
  const players = data?.players ?? [];
  const allPlayers = data?.allPlayers ?? [];

  const atRiskPlayers = players.filter((p) => p.engagement === "low");
  const topPerformers = players.filter((p) => p.engagement === "high");

  const filteredDirectory = useMemo(() => {
    if (!searchQuery.trim()) return allPlayers;
    const q = searchQuery.toLowerCase();
    return allPlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.academy ?? "").toLowerCase().includes(q)
    );
  }, [allPlayers, searchQuery]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: headerHeight }]}>
        <ActivityIndicator size="large" color={PLATFORM_PURPLE} />
        <Text style={styles.loadingText}>Loading player data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: headerHeight }]}>
        <Feather name="alert-circle" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load player data</Text>
      </View>
    );
  }

  const activeRate = healthStats.totalPlayers > 0
    ? Math.round((healthStats.activeThisWeek / healthStats.totalPlayers) * 100)
    : 0;
  const atRiskRate = healthStats.totalPlayers > 0
    ? Math.round((healthStats.atRisk / healthStats.totalPlayers) * 100)
    : 0;

  return (
    <View style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      {/* Stats Hero */}
      <View style={styles.heroRow}>
        <View style={[styles.heroCard, CardStyles.elevated]}>
          <Text style={[styles.heroNumber, { color: Colors.dark.xpCyan }]}>
            {healthStats.totalPlayers}
          </Text>
          <Text style={styles.heroLabel}>Total Players</Text>
          <Text style={styles.heroDelta}>all platforms</Text>
        </View>
        <View style={[styles.heroCard, CardStyles.elevated]}>
          <Text style={[styles.heroNumber, { color: NEON_GREEN }]}>
            {healthStats.activeThisWeek}
          </Text>
          <Text style={styles.heroLabel}>Active This Week</Text>
          <Text style={[styles.heroDelta, { color: NEON_GREEN }]}>+{activeRate}%</Text>
        </View>
        <View style={[styles.heroCard, CardStyles.elevated]}>
          <Text style={[styles.heroNumber, { color: Colors.dark.error }]}>
            {healthStats.atRisk}
          </Text>
          <Text style={styles.heroLabel}>At Risk</Text>
          <Text style={[styles.heroDelta, { color: Colors.dark.error }]}>{atRiskRate}%</Text>
        </View>
      </View>

      {/* Compact stat chips */}
      <View style={styles.chipsRow}>
        <StatChip icon="star" value={healthStats.avgLevel} label="Avg Level" color={Colors.dark.gold} />
        <StatChip icon="zap" value={healthStats.avgXpPerPlayer.toLocaleString()} label="Avg XP" color={Colors.dark.xpCyan} />
        <StatChip icon="activity" value={healthStats.avgStreak} label="Avg Streak" color={Colors.dark.orange} />
      </View>

      {/* Tab switcher */}
      <View style={styles.tabSwitcher}>
        <Pressable
          style={[styles.tabPill, activeTab === "health" ? styles.tabPillActive : {}]}
          onPress={() => setActiveTab("health")}
        >
          <Text style={[styles.tabPillText, activeTab === "health" ? styles.tabPillTextActive : {}]}>
            Health
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabPill, activeTab === "directory" ? styles.tabPillActive : {}]}
          onPress={() => setActiveTab("directory")}
        >
          <Text style={[styles.tabPillText, activeTab === "directory" ? styles.tabPillTextActive : {}]}>
            Directory
          </Text>
        </Pressable>
      </View>

      {activeTab === "health" ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Ball level distribution */}
          {ballLevelDistribution.length > 0 ? (
            <BallDistribution distribution={ballLevelDistribution} />
          ) : null}

          {/* At Risk */}
          {atRiskPlayers.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="alert-circle" size={16} color={Colors.dark.error} />
                <Text style={styles.sectionTitle}>At Risk</Text>
                <View style={[styles.countBadge, { backgroundColor: `${Colors.dark.error}25` }]}>
                  <Text style={[styles.countBadgeText, { color: Colors.dark.error }]}>
                    {atRiskPlayers.length}
                  </Text>
                </View>
              </View>
              <View style={[styles.sectionCard, CardStyles.elevated, { padding: 0, overflow: "hidden" }]}>
                {atRiskPlayers.map((player, i) => (
                  <View key={player.id ?? i}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    <HealthPlayerRow player={player} isTopPerformer={false} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Top Performers */}
          {topPerformers.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name="trending-up" size={16} color={NEON_GREEN} />
                <Text style={styles.sectionTitle}>Top Performers</Text>
                <View style={[styles.countBadge, { backgroundColor: `${NEON_GREEN}25` }]}>
                  <Text style={[styles.countBadgeText, { color: NEON_GREEN }]}>
                    {topPerformers.length}
                  </Text>
                </View>
              </View>
              <View style={[styles.sectionCard, CardStyles.elevated, { padding: 0, overflow: "hidden" }]}>
                {topPerformers.map((player, i) => (
                  <View key={player.id ?? i}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    <HealthPlayerRow player={player} isTopPerformer={true} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {players.length === 0 ? (
            <View style={[styles.emptyCard, CardStyles.elevated]}>
              <Feather name="users" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No player data available</Text>
              <Text style={styles.emptySubtext}>
                Player health data will appear once players are registered
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.directoryContainer}>
          {/* Search bar */}
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <Feather name="x" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Count */}
          <Text style={styles.directoryCount}>
            {filteredDirectory.length} {filteredDirectory.length === 1 ? "player" : "players"}
          </Text>

          <FlatList
            data={filteredDirectory}
            keyExtractor={(item, i) => item.id ?? String(i)}
            renderItem={({ item }) => <DirectoryRow item={item} />}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            contentContainerStyle={styles.directoryList}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Feather name={searchQuery.trim() ? "search" : "users"} size={40} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>{searchQuery.trim() ? "No players found" : "No players registered yet"}</Text>
                <Text style={styles.emptySubtext}>{searchQuery.trim() ? "Try a different search term" : "Players will appear here once they join"}</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },

  // Hero stats
  heroRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  heroCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  heroNumber: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  heroDelta: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    marginTop: 2,
  },

  // Chips
  chipsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chipValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  chipLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    flex: 1,
  },

  // Tab switcher
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    padding: 4,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabPill: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
  },
  tabPillActive: {
    backgroundColor: NEON_GREEN,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  tabPillTextActive: {
    color: "#000000",
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Section card
  sectionCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionCardTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },

  // Ball distribution
  ballRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ballChip: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minWidth: 56,
    gap: 3,
  },
  ballDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ballChipCount: {
    fontSize: 18,
    fontWeight: "700",
  },
  ballChipLabel: {
    fontSize: 10,
    fontWeight: "500",
  },

  // Section
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Health player row
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  healthRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  healthStats: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  healthStat: {
    alignItems: "center",
    minWidth: 36,
  },
  healthStatVal: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  healthStatLbl: {
    fontSize: 9,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },

  divider: {
    height: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },

  // Avatar
  avatar: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontWeight: "700",
  },

  // Ball badge
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  ballDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ballBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },

  // Player info
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerAcademy: {
    fontSize: 11,
    color: PLATFORM_PURPLE,
    marginTop: 1,
  },
  freeChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  freeChipText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },

  // Directory
  directoryContainer: {
    flex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    padding: 0,
  },
  directoryCount: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    fontWeight: "500",
  },
  directoryList: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingBottom: 100,
  },
  directoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  directoryInfo: {
    flex: 1,
    minWidth: 0,
  },

  // Empty
  emptyCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.text,
    marginTop: Spacing.md,
    fontWeight: "600",
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    textAlign: "center",
    fontSize: 12,
  },
});
