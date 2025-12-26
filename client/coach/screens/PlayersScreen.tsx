import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface Player {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ballLevel: string | null;
  skillLevel: string | null;
  status: string | null;
  medicalNotes: string | null;
  lastLessonDate: string | null;
  createdAt: string;
}

export default function PlayersScreen() {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const filteredPlayers = useMemo(() => {
    let result = players;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.email && p.email.toLowerCase().includes(query))
      );
    }
    if (filterLevel) {
      result = result.filter((p) => p.ballLevel === filterLevel);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [players, searchQuery, filterLevel]);

  const ballLevels = ["red", "orange", "green", "yellow", "glow"];

  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red":
        return "#FF4444";
      case "orange":
        return "#FF851B";
      case "green":
        return "#2ECC40";
      case "yellow":
        return "#FFDC00";
      case "glow":
        return "#00D4FF";
      default:
        return Colors.dark.disabled;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "holiday":
        return { color: Colors.dark.xpCyan, icon: "airplane" as const, label: "Holiday" };
      case "injured":
        return { color: Colors.dark.error, icon: "bandage" as const, label: "Injured" };
      case "new":
        return { color: Colors.dark.primary, icon: "sparkles" as const, label: "Nieuw" };
      default:
        return null;
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Geen lessen";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Vandaag";
    if (days === 1) return "Gisteren";
    if (days < 7) return `${days} dagen geleden`;
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  };

  const handleSelectPlayer = (player: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayer(player);
  };

  if (selectedPlayer) {
    return (
      <PlayerDetailView
        player={selectedPlayer}
        onBack={() => setSelectedPlayer(null)}
        insets={insets}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Spelers</Text>
        <Text style={styles.subtitle}>{players.length} spelers</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color={Colors.dark.tabIconDefault} />
          <TextInput
            style={styles.searchInput}
            placeholder="Zoek speler..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color={Colors.dark.tabIconDefault} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[styles.filterChip, !filterLevel && styles.filterChipActive]}
            onPress={() => setFilterLevel(null)}
          >
            <Text style={[styles.filterChipText, !filterLevel && styles.filterChipTextActive]}>
              Alle
            </Text>
          </Pressable>
          {ballLevels.map((level) => (
            <Pressable
              key={level}
              style={[
                styles.filterChip,
                filterLevel === level && { backgroundColor: getLevelColor(level) + "30" },
              ]}
              onPress={() => setFilterLevel(filterLevel === level ? null : level)}
            >
              <View style={[styles.levelDot, { backgroundColor: getLevelColor(level) }]} />
              <Text
                style={[
                  styles.filterChipText,
                  filterLevel === level && { color: getLevelColor(level) },
                ]}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : filteredPlayers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={Colors.dark.disabled} />
          <Text style={styles.emptyText}>
            {searchQuery ? "Geen spelers gevonden" : "Geen spelers"}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.playerList} showsVerticalScrollIndicator={false}>
          {filteredPlayers.map((player) => {
            const statusBadge = getStatusBadge(player.status);
            return (
              <Pressable
                key={player.id}
                style={styles.playerCard}
                onPress={() => handleSelectPlayer(player)}
              >
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerInitial}>
                    {player.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.playerInfo}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    {statusBadge ? (
                      <View style={[styles.statusBadge, { backgroundColor: statusBadge.color + "20" }]}>
                        <Ionicons name={statusBadge.icon} size={12} color={statusBadge.color} />
                        <Text style={[styles.statusText, { color: statusBadge.color }]}>
                          {statusBadge.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.playerDetails}>
                    {player.ballLevel ? (
                      <View style={styles.levelBadge}>
                        <View
                          style={[styles.levelDot, { backgroundColor: getLevelColor(player.ballLevel) }]}
                        />
                        <Text style={styles.levelText}>
                          {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.lastLesson}>{formatDate(player.lastLessonDate)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
              </Pressable>
            );
          })}
          <View style={{ height: insets.bottom + Spacing.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

function PlayerDetailView({
  player,
  onBack,
  insets,
}: {
  player: Player;
  onBack: () => void;
  insets: { top: number; bottom: number };
}) {
  const getLevelColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "red":
        return "#FF4444";
      case "orange":
        return "#FF851B";
      case "green":
        return "#2ECC40";
      case "yellow":
        return "#FFDC00";
      case "glow":
        return "#00D4FF";
      default:
        return Colors.dark.disabled;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.detailHeader}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.detailTitle}>Speler Profiel</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.detailContent}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <View style={styles.largeAvatar}>
            <Text style={styles.largeInitial}>{player.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileName}>{player.name}</Text>
          {player.ballLevel ? (
            <View style={styles.profileLevel}>
              <View style={[styles.levelDot, { backgroundColor: getLevelColor(player.ballLevel) }]} />
              <Text style={styles.profileLevelText}>
                {player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1)} Ball
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Basisinfo</Text>
          <View style={styles.infoCard}>
            {player.email ? (
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>{player.email}</Text>
              </View>
            ) : null}
            {player.phone ? (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>{player.phone}</Text>
              </View>
            ) : null}
            {player.skillLevel ? (
              <View style={styles.infoRow}>
                <Ionicons name="trophy-outline" size={20} color={Colors.dark.tabIconDefault} />
                <Text style={styles.infoText}>Skill Level: {player.skillLevel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {player.medicalNotes ? (
          <View style={styles.infoSection}>
            <Text style={styles.sectionLabel}>Medische notities</Text>
            <View style={[styles.infoCard, styles.warningCard]}>
              <Ionicons name="medical-outline" size={20} color={Colors.dark.error} />
              <Text style={styles.medicalText}>{player.medicalNotes}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Attendance Patroon</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>-</Text>
              <Text style={styles.statLabel}>Totaal lessen</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>-</Text>
              <Text style={styles.statLabel}>Aanwezig %</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>-</Text>
              <Text style={styles.statLabel}>Te laat</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionLabel}>Coach Notes</Text>
          <View style={styles.notesCard}>
            <Text style={styles.noNotesText}>Geen notities</Text>
            <Pressable style={styles.addNoteButton}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.dark.primary} />
              <Text style={styles.addNoteText}>Notitie toevoegen</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  filterContainer: {
    paddingLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginRight: Spacing.sm,
    gap: Spacing.xs,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  filterChipText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  filterChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  levelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  playerList: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitial: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  playerInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  playerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "500",
  },
  playerDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: 4,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  levelText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  lastLesson: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  detailTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  detailContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  largeInitial: {
    fontSize: 32,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  profileName: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  profileLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  profileLevelText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  infoSection: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  warningCard: {
    flexDirection: "row",
    gap: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.error,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  infoText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  medicalText: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  statValue: {
    fontSize: Typography.h2.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
  },
  notesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.md,
  },
  noNotesText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.tabIconDefault,
  },
  addNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  addNoteText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.primary,
  },
});
