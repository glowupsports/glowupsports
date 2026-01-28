import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  Spacing,
  Typography,
  BorderRadius,
  Backgrounds,
  GlowColors,
  TextColors,
} from "@/constants/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;
type RouteProps = RouteProp<PlayerStackParamList, "TournamentDetail">;

type ViewMode = "draw" | "groups" | "schedule" | "participants";

interface Match {
  id: string;
  round: string;
  player1: { name: string; seed?: number } | null;
  player2: { name: string; seed?: number } | null;
  score: string | null;
  winner: 1 | 2 | null;
  court?: string;
  time?: string;
  isMyMatch?: boolean;
}

interface GroupStanding {
  position: number;
  playerName: string;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
}

interface ScheduleMatch {
  id: string;
  time: string;
  court: string;
  player1: string;
  player2: string;
  round: string;
  isMyMatch?: boolean;
}

const MOCK_TOURNAMENT = {
  id: "1",
  name: "Summer Singles Championship",
  type: "singles" as const,
  format: "knockout" as const,
  startDate: "2026-02-15",
  endDate: "2026-02-22",
  location: "Central Tennis Club",
  address: "123 Tennis Way, Sports City",
  entryFee: 25,
  spotsTotal: 32,
  spotsTaken: 32,
  isRegistered: true,
  description: "Annual championship open to all club members.",
};

const MOCK_DRAW: Match[][] = [
  [
    { id: "r32-1", round: "R32", player1: { name: "J. Smith", seed: 1 }, player2: { name: "M. Johnson" }, score: "6-3, 6-2", winner: 1 },
    { id: "r32-2", round: "R32", player1: { name: "A. Williams" }, player2: { name: "R. Brown" }, score: "7-5, 6-4", winner: 1 },
    { id: "r32-3", round: "R32", player1: { name: "T. Davis", seed: 4 }, player2: { name: "K. Miller" }, score: "6-1, 6-0", winner: 1 },
    { id: "r32-4", round: "R32", player1: { name: "You" }, player2: { name: "P. Wilson" }, score: "6-4, 7-6", winner: 1, isMyMatch: true },
  ],
  [
    { id: "r16-1", round: "R16", player1: { name: "J. Smith", seed: 1 }, player2: { name: "A. Williams" }, score: "6-4, 6-3", winner: 1 },
    { id: "r16-2", round: "R16", player1: { name: "T. Davis", seed: 4 }, player2: { name: "You" }, score: null, winner: null, isMyMatch: true, time: "14:00", court: "Court 1" },
  ],
  [
    { id: "qf-1", round: "QF", player1: { name: "J. Smith", seed: 1 }, player2: null, score: null, winner: null },
  ],
  [
    { id: "sf-1", round: "SF", player1: null, player2: null, score: null, winner: null },
  ],
  [
    { id: "f-1", round: "F", player1: null, player2: null, score: null, winner: null },
  ],
];

const MOCK_GROUPS: { name: string; standings: GroupStanding[] }[] = [
  {
    name: "Group A",
    standings: [
      { position: 1, playerName: "J. Smith", played: 3, won: 3, lost: 0, setsWon: 6, setsLost: 1, gamesWon: 38, gamesLost: 22 },
      { position: 2, playerName: "You", played: 3, won: 2, lost: 1, setsWon: 5, setsLost: 2, gamesWon: 35, gamesLost: 28 },
      { position: 3, playerName: "M. Johnson", played: 3, won: 1, lost: 2, setsWon: 3, setsLost: 4, gamesWon: 28, gamesLost: 32 },
      { position: 4, playerName: "A. Williams", played: 3, won: 0, lost: 3, setsWon: 0, setsLost: 6, gamesWon: 18, gamesLost: 36 },
    ],
  },
];

const MOCK_SCHEDULE: ScheduleMatch[] = [
  { id: "s1", time: "10:00", court: "Court 1", player1: "J. Smith", player2: "A. Williams", round: "R16" },
  { id: "s2", time: "12:00", court: "Court 1", player1: "E. White", player2: "S. Martin", round: "R16" },
  { id: "s3", time: "14:00", court: "Court 1", player1: "T. Davis", player2: "You", round: "R16", isMyMatch: true },
];

const MOCK_PARTICIPANTS = [
  { id: "1", name: "J. Smith", seed: 1 },
  { id: "2", name: "E. White", seed: 2 },
  { id: "3", name: "T. Davis", seed: 4 },
  { id: "9", name: "You", isMe: true },
];

const ROUND_LABELS: Record<string, string> = {
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  F: "Final",
};

function DrawBracket({ matches }: { matches: Match[][] }) {
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.bracketScroll}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.bracketVertical}>
        <View style={styles.bracketContainer}>
          {matches.map((round, roundIndex) => (
            <View key={roundIndex} style={styles.roundColumn}>
              <View style={styles.roundHeader}>
                <Text style={styles.roundLabel}>
                  {ROUND_LABELS[round[0]?.round] || round[0]?.round}
                </Text>
              </View>
              <View style={styles.matchesColumn}>
                {round.map((match) => {
                  const spacing = Math.pow(2, roundIndex) * 8;
                  return (
                    <View
                      key={match.id}
                      style={[
                        styles.matchCard,
                        match.isMyMatch && styles.myMatchCard,
                        { marginTop: roundIndex > 0 ? spacing : 0 },
                      ]}
                    >
                      <View style={[styles.playerSlot, match.winner === 1 && styles.winnerSlot]}>
                        <View style={styles.playerInfo}>
                          {match.player1?.seed && (
                            <View style={styles.seedBadge}>
                              <Text style={styles.seedText}>{match.player1.seed}</Text>
                            </View>
                          )}
                          <Text
                            style={[
                              styles.playerName,
                              match.winner === 1 && styles.winnerName,
                              match.player1?.name === "You" && styles.myName,
                            ]}
                            numberOfLines={1}
                          >
                            {match.player1?.name || "TBD"}
                          </Text>
                        </View>
                        {match.score && (
                          <Text style={[styles.scoreText, match.winner === 1 && styles.winnerScore]}>
                            {match.score.split(",")[0]}
                          </Text>
                        )}
                      </View>
                      <View style={styles.matchDivider} />
                      <View style={[styles.playerSlot, match.winner === 2 && styles.winnerSlot]}>
                        <View style={styles.playerInfo}>
                          {match.player2?.seed && (
                            <View style={styles.seedBadge}>
                              <Text style={styles.seedText}>{match.player2.seed}</Text>
                            </View>
                          )}
                          <Text
                            style={[
                              styles.playerName,
                              match.winner === 2 && styles.winnerName,
                              match.player2?.name === "You" && styles.myName,
                            ]}
                            numberOfLines={1}
                          >
                            {match.player2?.name || "TBD"}
                          </Text>
                        </View>
                        {match.score && (
                          <Text style={[styles.scoreText, match.winner === 2 && styles.winnerScore]}>
                            {match.score.split(",")[1]?.trim() || ""}
                          </Text>
                        )}
                      </View>
                      {!match.score && match.time && (
                        <View style={styles.liveIndicator}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveText}>{match.time}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

function GroupTable({ group }: { group: { name: string; standings: GroupStanding[] } }) {
  return (
    <View style={styles.groupContainer}>
      <View style={styles.groupHeader}>
        <Ionicons name="grid" size={14} color={GlowColors.primary} />
        <Text style={styles.groupName}>{group.name}</Text>
      </View>
      <View style={styles.tableWrapper}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.posCol]}>#</Text>
          <Text style={[styles.tableHeaderText, styles.playerCol]}>Player</Text>
          <Text style={[styles.tableHeaderText, styles.statCol]}>W</Text>
          <Text style={[styles.tableHeaderText, styles.statCol]}>L</Text>
          <Text style={[styles.tableHeaderText, styles.setsCol]}>Sets</Text>
        </View>
        {group.standings.map((standing, index) => (
          <View
            key={standing.playerName}
            style={[
              styles.tableRow,
              standing.playerName === "You" && styles.myRow,
              index === group.standings.length - 1 && styles.lastRow,
            ]}
          >
            <View style={[styles.posCol, styles.posWrapper]}>
              <Text style={[styles.tableCell, standing.position <= 2 && styles.qualifyPos]}>
                {standing.position}
              </Text>
              {standing.position <= 2 && <View style={styles.qualifyDot} />}
            </View>
            <Text
              style={[styles.tableCell, styles.playerCol, standing.playerName === "You" && styles.myNameCell]}
              numberOfLines={1}
            >
              {standing.playerName}
            </Text>
            <Text style={[styles.tableCell, styles.statCol, styles.wonCell]}>{standing.won}</Text>
            <Text style={[styles.tableCell, styles.statCol, styles.lostCell]}>{standing.lost}</Text>
            <Text style={[styles.tableCell, styles.setsCol]}>
              {standing.setsWon}-{standing.setsLost}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScheduleList({ schedule }: { schedule: ScheduleMatch[] }) {
  return (
    <View style={styles.scheduleContainer}>
      {schedule.map((match) => (
        <Pressable key={match.id} style={[styles.scheduleCard, match.isMyMatch && styles.myScheduleCard]}>
          <View style={styles.scheduleTimeBlock}>
            <Text style={styles.scheduleTime}>{match.time}</Text>
            <View style={styles.scheduleBadge}>
              <Text style={styles.scheduleBadgeText}>{match.round}</Text>
            </View>
          </View>
          <View style={styles.scheduleMatchInfo}>
            <Text style={[styles.schedulePlayer, match.player1 === "You" && styles.myScheduleName]}>
              {match.player1}
            </Text>
            <View style={styles.vsContainer}>
              <View style={styles.vsLine} />
              <Text style={styles.vsText}>VS</Text>
              <View style={styles.vsLine} />
            </View>
            <Text style={[styles.schedulePlayer, match.player2 === "You" && styles.myScheduleName]}>
              {match.player2}
            </Text>
          </View>
          <View style={styles.scheduleCourtBlock}>
            <Ionicons name="location" size={12} color={TextColors.muted} />
            <Text style={styles.scheduleCourtText}>{match.court}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ParticipantsList({ participants }: { participants: typeof MOCK_PARTICIPANTS }) {
  return (
    <View style={styles.participantsGrid}>
      {participants.map((player) => (
        <View key={player.id} style={[styles.participantCard, player.isMe && styles.myParticipantCard]}>
          <LinearGradient
            colors={player.isMe ? [GlowColors.primary + "30", "transparent"] : ["transparent", "transparent"]}
            style={styles.participantGradient}
          >
            <View style={[styles.participantAvatar, player.isMe && styles.myAvatar]}>
              <Text style={styles.participantInitial}>{player.name.charAt(0)}</Text>
            </View>
            <Text style={[styles.participantName, player.isMe && styles.myParticipantName]} numberOfLines={1}>
              {player.name}
            </Text>
            {player.seed && (
              <View style={styles.participantSeedBadge}>
                <Text style={styles.participantSeedText}>#{player.seed}</Text>
              </View>
            )}
          </LinearGradient>
        </View>
      ))}
    </View>
  );
}

export default function TournamentDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("draw");

  const tournament = MOCK_TOURNAMENT;
  const isKnockout = tournament.format === "knockout";

  const tabs = [
    { key: "draw" as ViewMode, label: "Draw", icon: "git-network-outline" as const, show: isKnockout },
    { key: "groups" as ViewMode, label: "Groups", icon: "grid-outline" as const, show: !isKnockout },
    { key: "schedule" as ViewMode, label: "Schedule", icon: "time-outline" as const, show: true },
    { key: "participants" as ViewMode, label: "Players", icon: "people-outline" as const, show: true },
  ].filter(t => t.show);

  const handleTabPress = (key: ViewMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(key);
  };

  const renderContent = () => {
    switch (viewMode) {
      case "draw":
        return <DrawBracket matches={MOCK_DRAW} />;
      case "groups":
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPadding}>
            {MOCK_GROUPS.map((group) => <GroupTable key={group.name} group={group} />)}
          </ScrollView>
        );
      case "schedule":
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPadding}>
            <ScheduleList schedule={MOCK_SCHEDULE} />
          </ScrollView>
        );
      case "participants":
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPadding}>
            <ParticipantsList participants={MOCK_PARTICIPANTS} />
          </ScrollView>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={GlowColors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tournament.name}</Text>
          <Text style={styles.headerSubtitle}>
            {new Date(tournament.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {new Date(tournament.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Ionicons name="trophy" size={16} color={GlowColors.primary} />
          <Text style={styles.statLabel}>Format</Text>
          <Text style={styles.statValue}>Knockout</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="people" size={16} color="#00D4FF" />
          <Text style={styles.statLabel}>Entries</Text>
          <Text style={styles.statValue}>{tournament.spotsTaken}/{tournament.spotsTotal}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="cash" size={16} color="#FFB020" />
          <Text style={styles.statLabel}>Fee</Text>
          <Text style={styles.statValue}>${tournament.entryFee}</Text>
        </View>
      </View>

      {tournament.isRegistered && (
        <View style={styles.nextMatchCard}>
          <LinearGradient
            colors={[GlowColors.primary + "25", GlowColors.primary + "08"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nextMatchGradient}
          >
            <View style={styles.nextMatchLeft}>
              <View style={styles.nextMatchLabel}>
                <Ionicons name="flash" size={12} color={GlowColors.primary} />
                <Text style={styles.nextMatchLabelText}>NEXT MATCH</Text>
              </View>
              <Text style={styles.nextMatchOpponent}>vs T. Davis [4]</Text>
              <View style={styles.nextMatchMeta}>
                <Ionicons name="time-outline" size={12} color={TextColors.secondary} />
                <Text style={styles.nextMatchMetaText}>Today 14:00</Text>
                <Ionicons name="location-outline" size={12} color={TextColors.secondary} style={{ marginLeft: 8 }} />
                <Text style={styles.nextMatchMetaText}>Court 1</Text>
              </View>
            </View>
            <View style={styles.nextMatchRound}>
              <Text style={styles.nextMatchRoundText}>R16</Text>
            </View>
          </LinearGradient>
        </View>
      )}

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, viewMode === tab.key && styles.tabActive]}
            onPress={() => handleTabPress(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={viewMode === tab.key ? GlowColors.primary : TextColors.muted}
            />
            <Text style={[styles.tabText, viewMode === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: TextColors.muted,
    marginTop: 2,
  },
  headerRight: {
    width: 36,
  },
  statsBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: 10,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    color: TextColors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "700",
    color: TextColors.primary,
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 4,
  },
  nextMatchCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GlowColors.primary + "30",
  },
  nextMatchGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  nextMatchLeft: {
    flex: 1,
  },
  nextMatchLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  nextMatchLabelText: {
    fontSize: 9,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 1,
  },
  nextMatchOpponent: {
    fontSize: 16,
    fontWeight: "700",
    color: TextColors.primary,
  },
  nextMatchMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  nextMatchMetaText: {
    fontSize: 11,
    color: TextColors.secondary,
    marginLeft: 4,
  },
  nextMatchRound: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  nextMatchRoundText: {
    fontSize: 12,
    fontWeight: "800",
    color: Backgrounds.root,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary + "40",
  },
  tabText: {
    fontSize: 11,
    fontWeight: "600",
    color: TextColors.muted,
  },
  tabTextActive: {
    color: GlowColors.primary,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  bracketScroll: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  bracketVertical: {
    paddingVertical: Spacing.sm,
  },
  bracketContainer: {
    flexDirection: "row",
    gap: 12,
  },
  roundColumn: {
    minWidth: 120,
  },
  roundHeader: {
    marginBottom: 8,
  },
  roundLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: TextColors.muted,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  matchesColumn: {
    gap: 8,
  },
  matchCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  myMatchCard: {
    borderColor: GlowColors.primary + "50",
    backgroundColor: GlowColors.primary + "10",
  },
  playerSlot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  winnerSlot: {
    backgroundColor: "rgba(0, 230, 118, 0.12)",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  seedBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  seedText: {
    fontSize: 8,
    fontWeight: "700",
    color: TextColors.muted,
  },
  playerName: {
    fontSize: 11,
    color: TextColors.secondary,
    flex: 1,
  },
  winnerName: {
    color: TextColors.primary,
    fontWeight: "600",
  },
  myName: {
    color: GlowColors.primary,
    fontWeight: "700",
  },
  scoreText: {
    fontSize: 10,
    color: TextColors.muted,
    fontWeight: "600",
  },
  winnerScore: {
    color: "#00E676",
  },
  matchDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
    backgroundColor: GlowColors.primary + "15",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GlowColors.primary,
  },
  liveText: {
    fontSize: 9,
    fontWeight: "700",
    color: GlowColors.primary,
  },
  groupContainer: {
    marginBottom: Spacing.lg,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  groupName: {
    fontSize: 14,
    fontWeight: "700",
    color: TextColors.primary,
  },
  tableWrapper: {
    backgroundColor: Backgrounds.card,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Backgrounds.elevated,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    color: TextColors.muted,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
  },
  myRow: {
    backgroundColor: GlowColors.primary + "12",
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  tableCell: {
    fontSize: 12,
    color: TextColors.secondary,
  },
  posCol: {
    width: 28,
  },
  posWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  qualifyPos: {
    color: "#00E676",
    fontWeight: "700",
  },
  qualifyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#00E676",
  },
  playerCol: {
    flex: 1,
  },
  myNameCell: {
    color: GlowColors.primary,
    fontWeight: "700",
  },
  statCol: {
    width: 32,
    textAlign: "center",
  },
  wonCell: {
    color: "#00E676",
    fontWeight: "600",
  },
  lostCell: {
    color: "#FF4D4D",
    fontWeight: "600",
  },
  setsCol: {
    width: 50,
    textAlign: "right",
  },
  scheduleContainer: {
    gap: 10,
  },
  scheduleCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: 10,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  myScheduleCard: {
    borderColor: GlowColors.primary + "40",
    backgroundColor: GlowColors.primary + "10",
  },
  scheduleTimeBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  scheduleTime: {
    fontSize: 20,
    fontWeight: "800",
    color: GlowColors.primary,
  },
  scheduleBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  scheduleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: TextColors.secondary,
  },
  scheduleMatchInfo: {
    alignItems: "center",
    marginBottom: 8,
  },
  schedulePlayer: {
    fontSize: 14,
    fontWeight: "600",
    color: TextColors.primary,
  },
  myScheduleName: {
    color: GlowColors.primary,
    fontWeight: "700",
  },
  vsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  vsLine: {
    width: 20,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  vsText: {
    fontSize: 10,
    fontWeight: "700",
    color: TextColors.muted,
  },
  scheduleCourtBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  scheduleCourtText: {
    fontSize: 11,
    color: TextColors.muted,
  },
  participantsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  participantCard: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - 10) / 2,
    backgroundColor: Backgrounds.card,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  myParticipantCard: {
    borderColor: GlowColors.primary + "40",
  },
  participantGradient: {
    padding: Spacing.md,
    alignItems: "center",
    gap: 8,
  },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  myAvatar: {
    borderWidth: 2,
    borderColor: GlowColors.primary,
  },
  participantInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  participantName: {
    fontSize: 12,
    fontWeight: "600",
    color: TextColors.primary,
    textAlign: "center",
  },
  myParticipantName: {
    color: GlowColors.primary,
  },
  participantSeedBadge: {
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  participantSeedText: {
    fontSize: 10,
    fontWeight: "700",
    color: GlowColors.primary,
  },
});
