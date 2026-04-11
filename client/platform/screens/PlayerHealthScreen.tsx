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
  Modal,
  Platform,
  SafeAreaView,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import Feather from "@expo/vector-icons/Feather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
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

const BALL_LEVEL_ORDER = ["blue", "red", "orange", "green", "yellow", "glow"];

const BALL_CONFIG: Record<string, { color: string; label: string }> = {
  blue: { color: BallLevelColors.blue, label: "Blue" },
  red: { color: BallLevelColors.red, label: "Red" },
  orange: { color: BallLevelColors.orange, label: "Orange" },
  green: { color: BallLevelColors.green, label: "Green" },
  yellow: { color: BallLevelColors.yellow, label: "Yellow" },
  glow: { color: BallLevelColors.glow, label: "Glow" },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  active: { color: "#00E676", label: "Active" },
  inactive: { color: Colors.dark.error, label: "Inactive" },
  pending_payment: { color: Colors.dark.gold, label: "Pending" },
};

type FilterStatus = "all" | "active" | "inactive" | "pending";
type SortBy = "name_az" | "name_za" | "academy" | "ball_level" | "most_sessions";

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "name_az", label: "Name A–Z" },
  { key: "name_za", label: "Name Z–A" },
  { key: "academy", label: "Academy" },
  { key: "ball_level", label: "Ball Level" },
  { key: "most_sessions", label: "Most Sessions" },
];

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

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "Today";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface Academy {
  id: string;
  name: string;
}

interface DirectoryPlayer {
  id: string;
  name: string;
  academy: string | null;
  academyId?: string | null;
  level: number;
  ballLevel: string;
  totalXp: number;
  streak: number;
  status: string | null;
  sessionsAttended: number;
  totalMatchesPlayed: number;
  lastSessionAt: string | null;
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  joinedAt: string | null;
  isActive: boolean;
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

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

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

function StatusChip({ status, isActive }: { status: string | null; isActive: boolean }) {
  const key = isActive ? "active" : (status ?? "inactive");
  const cfg = STATUS_CONFIG[key] ?? STATUS_CONFIG.inactive;
  return (
    <View style={[styles.statusChip, { backgroundColor: `${cfg.color}18`, borderColor: `${cfg.color}40` }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.statusChipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

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

function DirectoryRow({ item, onPress }: { item: DirectoryPlayer; onPress: () => void }) {
  const lastSeen = item.lastSessionAt || item.lastActiveAt || item.lastLoginAt;
  const sessions = Number(item.sessionsAttended) || 0;
  const matches = Number(item.totalMatchesPlayed) || 0;
  return (
    <Pressable style={({ pressed }) => [styles.directoryRow, pressed ? { opacity: 0.7 } : {}]} onPress={onPress}>
      <InitialsAvatar name={item.name} size={42} />
      <View style={styles.directoryInfo}>
        <View style={styles.directoryNameRow}>
          <Text style={[styles.playerName, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
          <StatusChip status={item.status} isActive={item.isActive} />
        </View>
        <View style={styles.directoryMeta}>
          {item.academy ? (
            <Text style={styles.playerAcademy} numberOfLines={1}>{item.academy}</Text>
          ) : (
            <View style={styles.freeChip}>
              <Text style={styles.freeChipText}>Free Player</Text>
            </View>
          )}
          <Text style={styles.lastSeen}>
            {relativeTime(lastSeen)}
          </Text>
        </View>
        <View style={styles.miniStats}>
          <View style={styles.miniStat}>
            <Feather name="calendar" size={10} color={Colors.dark.textMuted} />
            <Text style={styles.miniStatText}>{sessions} sess</Text>
          </View>
          <Text style={styles.miniStatSep}>·</Text>
          <View style={styles.miniStat}>
            <Feather name="award" size={10} color={Colors.dark.textMuted} />
            <Text style={styles.miniStatText}>{matches} matches</Text>
          </View>
        </View>
      </View>
      <View style={styles.directoryRight}>
        <BallBadge ballLevel={item.ballLevel} />
        <Feather name="chevron-right" size={14} color={Colors.dark.textMuted} style={{ marginTop: 4 }} />
      </View>
    </Pressable>
  );
}

function AcademyPickerModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (academyId: string, academyName: string) => void;
}) {
  const { data: academies = [], isLoading } = useQuery<Academy[]>({
    queryKey: ["/api/platform/academies"],
    staleTime: 60000,
  });

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "overFullScreen"}
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          <SafeAreaView>
            <View style={styles.sheetHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Academy</Text>
              <Pressable onPress={onClose} style={styles.sheetClose}>
                <Feather name="x" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
            {isLoading ? (
              <View style={styles.pickerLoading}>
                <ActivityIndicator color={NEON_GREEN} />
              </View>
            ) : (
              <FlatList
                data={academies}
                keyExtractor={(a) => a.id}
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [styles.academyRow, pressed ? { opacity: 0.7 } : {}]}
                    onPress={() => onSelect(item.id, item.name)}
                  >
                    <View style={styles.academyRowIcon}>
                      <Feather name="home" size={16} color={PLATFORM_PURPLE} />
                    </View>
                    <Text style={styles.academyRowName}>{item.name}</Text>
                    <Feather name="chevron-right" size={14} color={Colors.dark.textMuted} />
                  </Pressable>
                )}
                ItemSeparatorComponent={() => <View style={styles.divider} />}
                ListEmptyComponent={
                  <View style={styles.pickerEmpty}>
                    <Text style={styles.emptyText}>No academies found</Text>
                  </View>
                }
              />
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlayerDetailSheet({
  player,
  onClose,
  onPlayerUpdated,
}: {
  player: DirectoryPlayer;
  onClose: () => void;
  onPlayerUpdated: () => void;
}) {
  const lastSeen = player.lastSessionAt || player.lastActiveAt || player.lastLoginAt;
  const ballCfg = BALL_CONFIG[player.ballLevel?.toLowerCase()] ?? { color: Colors.dark.textMuted, label: player.ballLevel ?? "?" };
  const [showAcademyPicker, setShowAcademyPicker] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignedAcademy, setAssignedAcademy] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  async function handleAssignAcademy(academyId: string, academyName: string) {
    setShowAcademyPicker(false);
    setAssigning(true);
    setAssignError(null);
    try {
      await apiRequest("POST", "/api/admin/players/assign-academy", {
        playerIds: [player.id],
        academyId,
      });
      setAssignedAcademy(academyName);
      onPlayerUpdated();
    } catch {
      setAssignError("Failed to assign academy. Please try again.");
    } finally {
      setAssigning(false);
    }
  }

  const displayAcademy = assignedAcademy ?? player.academy;

  return (
    <>
      <Modal
        visible
        transparent
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "overFullScreen"}
      >
        <Pressable style={styles.sheetBackdrop} onPress={onClose}>
          <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
            <SafeAreaView>
              <View style={styles.sheetHandle} />

              {/* Header */}
              <View style={styles.sheetHeader}>
                <InitialsAvatar name={player.name} size={64} />
                <View style={styles.sheetHeaderInfo}>
                  <Text style={styles.sheetName}>{player.name}</Text>
                  <View style={styles.sheetBadgeRow}>
                    <View style={[styles.ballBadge, { backgroundColor: `${ballCfg.color}20`, borderColor: `${ballCfg.color}50` }]}>
                      <View style={[styles.ballDot, { backgroundColor: ballCfg.color }]} />
                      <Text style={[styles.ballBadgeText, { color: ballCfg.color }]}>{ballCfg.label}</Text>
                    </View>
                    <StatusChip status={player.status} isActive={player.isActive} />
                  </View>
                  {displayAcademy ? (
                    <Text style={styles.sheetAcademy}>{displayAcademy}</Text>
                  ) : (
                    <Text style={[styles.sheetAcademy, { color: Colors.dark.textMuted }]}>No Academy</Text>
                  )}
                </View>
                <Pressable onPress={onClose} style={styles.sheetClose}>
                  <Feather name="x" size={18} color={Colors.dark.textMuted} />
                </Pressable>
              </View>

              {/* Stats grid — all 5 stats */}
              <View style={styles.sheetStatsGrid}>
                <View style={[styles.sheetStatCard, CardStyles.elevated]}>
                  <Feather name="calendar" size={16} color={Colors.dark.xpCyan} />
                  <Text style={[styles.sheetStatNum, { color: Colors.dark.xpCyan }]}>{Number(player.sessionsAttended) || 0}</Text>
                  <Text style={styles.sheetStatLabel}>Sessions</Text>
                </View>
                <View style={[styles.sheetStatCard, CardStyles.elevated]}>
                  <Feather name="award" size={16} color={Colors.dark.gold} />
                  <Text style={[styles.sheetStatNum, { color: Colors.dark.gold }]}>{Number(player.totalMatchesPlayed) || 0}</Text>
                  <Text style={styles.sheetStatLabel}>Matches</Text>
                </View>
                <View style={[styles.sheetStatCard, CardStyles.elevated]}>
                  <Feather name="zap" size={16} color={Colors.dark.xpCyan} />
                  <Text style={[styles.sheetStatNum, { color: Colors.dark.xpCyan }]}>{(Number(player.totalXp) || 0).toLocaleString()}</Text>
                  <Text style={styles.sheetStatLabel}>XP</Text>
                </View>
                <View style={[styles.sheetStatCard, CardStyles.elevated]}>
                  <Feather name="activity" size={16} color={Colors.dark.orange} />
                  <Text style={[styles.sheetStatNum, { color: Colors.dark.orange }]}>{Number(player.streak) || 0}</Text>
                  <Text style={styles.sheetStatLabel}>Streak</Text>
                </View>
                <View style={[styles.sheetStatCard, CardStyles.elevated]}>
                  <Feather name="star" size={16} color={NEON_GREEN} />
                  <Text style={[styles.sheetStatNum, { color: NEON_GREEN }]}>{Number(player.level) || 1}</Text>
                  <Text style={styles.sheetStatLabel}>Level</Text>
                </View>
              </View>

              {/* Timeline */}
              <View style={[styles.sheetTimeline, CardStyles.elevated]}>
                <Text style={styles.sheetTimelineTitle}>Activity</Text>
                <View style={styles.timelineRow}>
                  <Feather name="user-plus" size={14} color={Colors.dark.textMuted} />
                  <Text style={styles.timelineLabel}>Joined</Text>
                  <Text style={styles.timelineValue}>{formatDate(player.joinedAt)}</Text>
                </View>
                <View style={styles.timelineDivider} />
                <View style={styles.timelineRow}>
                  <Feather name="calendar" size={14} color={Colors.dark.textMuted} />
                  <Text style={styles.timelineLabel}>Last Session</Text>
                  <Text style={styles.timelineValue}>{formatDate(player.lastSessionAt)}</Text>
                </View>
                <View style={styles.timelineDivider} />
                <View style={styles.timelineRow}>
                  <Feather name="clock" size={14} color={Colors.dark.textMuted} />
                  <Text style={styles.timelineLabel}>Last Active</Text>
                  <Text style={styles.timelineValue}>
                    {lastSeen ? `${formatDate(lastSeen)} · ${relativeTime(lastSeen)}` : "Never"}
                  </Text>
                </View>
                {player.lastLoginAt ? (
                  <>
                    <View style={styles.timelineDivider} />
                    <View style={styles.timelineRow}>
                      <Feather name="log-in" size={14} color={Colors.dark.textMuted} />
                      <Text style={styles.timelineLabel}>Last Login</Text>
                      <Text style={styles.timelineValue}>{relativeTime(player.lastLoginAt)}</Text>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Assign to Academy */}
              {assignedAcademy ? (
                <View style={styles.assignSuccess}>
                  <Feather name="check-circle" size={16} color={NEON_GREEN} />
                  <Text style={styles.assignSuccessText}>Assigned to {assignedAcademy}</Text>
                </View>
              ) : null}
              {assignError ? (
                <Text style={styles.assignError}>{assignError}</Text>
              ) : null}
              <Pressable
                style={[styles.assignButton, assigning ? { opacity: 0.6 } : {}]}
                onPress={() => setShowAcademyPicker(true)}
                disabled={assigning}
              >
                {assigning ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Feather name="home" size={15} color="#000" />
                    <Text style={styles.assignButtonText}>
                      {displayAcademy ? "Change Academy" : "Assign to Academy"}
                    </Text>
                  </>
                )}
              </Pressable>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>

      {showAcademyPicker ? (
        <AcademyPickerModal
          onClose={() => setShowAcademyPicker(false)}
          onSelect={handleAssignAcademy}
        />
      ) : null}
    </>
  );
}

export default function PlayerHealthScreen() {
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"health" | "directory">("health");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<DirectoryPlayer | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name_az");
  const [showSortMenu, setShowSortMenu] = useState(false);

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
    let list = allPlayers;

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.academy ?? "").toLowerCase().includes(q)
      );
    }

    // Apply status filter
    if (filterStatus !== "all") {
      list = list.filter((p) => {
        if (filterStatus === "active") return p.isActive;
        if (filterStatus === "inactive") return !p.isActive && p.status !== "pending_payment";
        if (filterStatus === "pending") return p.status === "pending_payment";
        return true;
      });
    }

    // Apply sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name_az":
          return a.name.localeCompare(b.name);
        case "name_za":
          return b.name.localeCompare(a.name);
        case "academy":
          return (a.academy ?? "").localeCompare(b.academy ?? "");
        case "ball_level": {
          const ai = BALL_LEVEL_ORDER.indexOf((a.ballLevel ?? "blue").toLowerCase());
          const bi = BALL_LEVEL_ORDER.indexOf((b.ballLevel ?? "blue").toLowerCase());
          return ai - bi;
        }
        case "most_sessions":
          return (Number(b.sessionsAttended) || 0) - (Number(a.sessionsAttended) || 0);
        default:
          return 0;
      }
    });

    return list;
  }, [allPlayers, searchQuery, filterStatus, sortBy]);

  function handlePlayerUpdated() {
    queryClient.invalidateQueries({ queryKey: ["/api/platform/player-health"] });
  }

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

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Sort";

  const FILTER_PILLS: { key: FilterStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
    { key: "pending", label: "Pending" },
  ];

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
          {ballLevelDistribution.length > 0 ? (
            <BallDistribution distribution={ballLevelDistribution} />
          ) : null}

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

          {/* Filter pills + Sort */}
          <View style={styles.filterSortRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
              {FILTER_PILLS.map((pill) => (
                <Pressable
                  key={pill.key}
                  style={[styles.filterPill, filterStatus === pill.key ? styles.filterPillActive : {}]}
                  onPress={() => setFilterStatus(pill.key)}
                >
                  <Text style={[styles.filterPillText, filterStatus === pill.key ? styles.filterPillTextActive : {}]}>
                    {pill.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.sortButton} onPress={() => setShowSortMenu(true)}>
              <Feather name="sliders" size={13} color={Colors.dark.textMuted} />
              <Text style={styles.sortButtonText} numberOfLines={1}>{currentSortLabel}</Text>
            </Pressable>
          </View>

          {/* Count */}
          <Text style={styles.directoryCount}>
            {filteredDirectory.length} {filteredDirectory.length === 1 ? "player" : "players"}
            {filterStatus !== "all" || searchQuery.trim() ? ` of ${allPlayers.length}` : ""}
          </Text>

          <FlatList
            data={filteredDirectory}
            keyExtractor={(item, i) => item.id ?? String(i)}
            renderItem={({ item }) => (
              <DirectoryRow item={item} onPress={() => setSelectedPlayer(item)} />
            )}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            contentContainerStyle={styles.directoryList}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Feather name={searchQuery.trim() ? "search" : "users"} size={40} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>{searchQuery.trim() ? "No players found" : filterStatus !== "all" ? `No ${filterStatus} players` : "No players registered yet"}</Text>
                <Text style={styles.emptySubtext}>{searchQuery.trim() ? "Try a different search term" : "Players will appear here once they join"}</Text>
              </View>
            }
          />
        </View>
      )}

      {selectedPlayer ? (
        <PlayerDetailSheet
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          onPlayerUpdated={handlePlayerUpdated}
        />
      ) : null}

      {/* Sort menu modal */}
      {showSortMenu ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setShowSortMenu(false)}
        >
          <Pressable style={styles.sortBackdrop} onPress={() => setShowSortMenu(false)}>
            <View style={styles.sortMenu}>
              <Text style={styles.sortMenuTitle}>Sort by</Text>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.sortOption, sortBy === opt.key ? styles.sortOptionActive : {}]}
                  onPress={() => { setSortBy(opt.key); setShowSortMenu(false); }}
                >
                  <Text style={[styles.sortOptionText, sortBy === opt.key ? styles.sortOptionTextActive : {}]}>
                    {opt.label}
                  </Text>
                  {sortBy === opt.key ? (
                    <Feather name="check" size={14} color={NEON_GREEN} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      ) : null}
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

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

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

  avatar: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontWeight: "700",
  },

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

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: "600",
  },

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

  filterSortRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterPills: {
    flexDirection: "row",
    gap: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  filterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterPillActive: {
    backgroundColor: `${NEON_GREEN}20`,
    borderColor: `${NEON_GREEN}60`,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  filterPillTextActive: {
    color: NEON_GREEN,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxWidth: 110,
  },
  sortButtonText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    fontWeight: "500",
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
  directoryNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  directoryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  lastSeen: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  miniStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 4,
  },
  miniStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  miniStatText: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  miniStatSep: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    paddingHorizontal: 2,
  },
  directoryRight: {
    alignItems: "center",
    gap: 4,
  },

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

  // Player detail sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sheetHeaderInfo: {
    flex: 1,
    gap: 4,
  },
  sheetName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sheetBadgeRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  sheetAcademy: {
    fontSize: 12,
    color: PLATFORM_PURPLE,
    fontWeight: "500",
  },
  sheetClose: {
    padding: Spacing.xs,
  },
  sheetStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  sheetStatCard: {
    flex: 1,
    minWidth: 60,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  sheetStatNum: {
    fontSize: 20,
    fontWeight: "700",
  },
  sheetStatLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  sheetTimeline: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  sheetTimelineTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  timelineLabel: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  timelineValue: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
    textAlign: "right",
    flexShrink: 1,
  },
  timelineDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: Spacing.xs,
  },

  // Assign to academy
  assignButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: NEON_GREEN,
    borderRadius: BorderRadius.md,
    paddingVertical: 13,
    marginTop: Spacing.xs,
  },
  assignButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  assignSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${NEON_GREEN}15`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: `${NEON_GREEN}30`,
  },
  assignSuccessText: {
    fontSize: 13,
    color: NEON_GREEN,
    fontWeight: "500",
  },
  assignError: {
    fontSize: 12,
    color: Colors.dark.error,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },

  // Academy picker
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xs,
  },
  pickerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  pickerLoading: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  pickerEmpty: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  academyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  academyRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${PLATFORM_PURPLE}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  academyRowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
  },

  // Sort menu
  sortBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sortMenu: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Spacing.lg,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sortMenuTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  sortOptionActive: {
    // highlighted by text + icon color
  },
  sortOptionText: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  sortOptionTextActive: {
    color: NEON_GREEN,
    fontWeight: "700",
  },
});
