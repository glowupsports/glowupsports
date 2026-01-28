import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  Colors,
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
  description: "Annual championship open to all club members. Best of 3 sets with tiebreaks at 6-6.",
  rules: [
    "Best of 3 sets",
    "Tiebreak at 6-6",
    "No coaching during matches",
    "Players provide balls",
  ],
};

const MOCK_DRAW: Match[][] = [
  [
    { id: "r32-1", round: "R32", player1: { name: "J. Smith", seed: 1 }, player2: { name: "M. Johnson" }, score: "6-3, 6-2", winner: 1 },
    { id: "r32-2", round: "R32", player1: { name: "A. Williams" }, player2: { name: "R. Brown" }, score: "7-5, 6-4", winner: 1 },
    { id: "r32-3", round: "R32", player1: { name: "T. Davis", seed: 4 }, player2: { name: "K. Miller" }, score: "6-1, 6-0", winner: 1 },
    { id: "r32-4", round: "R32", player1: { name: "You" }, player2: { name: "P. Wilson" }, score: "6-4, 7-6", winner: 1, isMyMatch: true },
    { id: "r32-5", round: "R32", player1: { name: "C. Taylor", seed: 3 }, player2: { name: "L. Anderson" }, score: "6-2, 6-3", winner: 1 },
    { id: "r32-6", round: "R32", player1: { name: "H. Thomas" }, player2: { name: "N. Jackson" }, score: "4-6, 6-3, 6-4", winner: 2 },
    { id: "r32-7", round: "R32", player1: { name: "E. White", seed: 2 }, player2: { name: "D. Harris" }, score: "6-0, 6-1", winner: 1 },
    { id: "r32-8", round: "R32", player1: { name: "S. Martin" }, player2: { name: "B. Garcia" }, score: "6-3, 3-6, 7-5", winner: 1 },
  ],
  [
    { id: "r16-1", round: "R16", player1: { name: "J. Smith", seed: 1 }, player2: { name: "A. Williams" }, score: "6-4, 6-3", winner: 1 },
    { id: "r16-2", round: "R16", player1: { name: "T. Davis", seed: 4 }, player2: { name: "You" }, score: null, winner: null, isMyMatch: true, time: "14:00", court: "Court 1" },
    { id: "r16-3", round: "R16", player1: { name: "C. Taylor", seed: 3 }, player2: { name: "N. Jackson" }, score: "6-2, 6-4", winner: 1 },
    { id: "r16-4", round: "R16", player1: { name: "E. White", seed: 2 }, player2: { name: "S. Martin" }, score: "6-1, 6-2", winner: 1 },
  ],
  [
    { id: "qf-1", round: "QF", player1: { name: "J. Smith", seed: 1 }, player2: null, score: null, winner: null },
    { id: "qf-2", round: "QF", player1: { name: "C. Taylor", seed: 3 }, player2: { name: "E. White", seed: 2 }, score: null, winner: null },
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
  {
    name: "Group B",
    standings: [
      { position: 1, playerName: "T. Davis", played: 3, won: 3, lost: 0, setsWon: 6, setsLost: 0, gamesWon: 36, gamesLost: 15 },
      { position: 2, playerName: "C. Taylor", played: 3, won: 2, lost: 1, setsWon: 4, setsLost: 3, gamesWon: 32, gamesLost: 27 },
      { position: 3, playerName: "E. White", played: 3, won: 1, lost: 2, setsWon: 2, setsLost: 4, gamesWon: 25, gamesLost: 31 },
      { position: 4, playerName: "S. Martin", played: 3, won: 0, lost: 3, setsWon: 0, setsLost: 6, gamesWon: 16, gamesLost: 36 },
    ],
  },
];

const MOCK_SCHEDULE: ScheduleMatch[] = [
  { id: "s1", time: "10:00", court: "Court 1", player1: "J. Smith", player2: "A. Williams", round: "R16" },
  { id: "s2", time: "10:00", court: "Court 2", player1: "C. Taylor", player2: "N. Jackson", round: "R16" },
  { id: "s3", time: "12:00", court: "Court 1", player1: "E. White", player2: "S. Martin", round: "R16" },
  { id: "s4", time: "14:00", court: "Court 1", player1: "T. Davis", player2: "You", round: "R16", isMyMatch: true },
  { id: "s5", time: "16:00", court: "Court 1", player1: "TBD", player2: "TBD", round: "QF" },
];

const MOCK_PARTICIPANTS = [
  { id: "1", name: "J. Smith", seed: 1 },
  { id: "2", name: "E. White", seed: 2 },
  { id: "3", name: "C. Taylor", seed: 3 },
  { id: "4", name: "T. Davis", seed: 4 },
  { id: "5", name: "M. Johnson" },
  { id: "6", name: "A. Williams" },
  { id: "7", name: "R. Brown" },
  { id: "8", name: "K. Miller" },
  { id: "9", name: "You", isMe: true },
  { id: "10", name: "P. Wilson" },
  { id: "11", name: "L. Anderson" },
  { id: "12", name: "H. Thomas" },
];

const ROUND_LABELS: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter Finals",
  SF: "Semi Finals",
  F: "Final",
};

function DrawBracket({ matches }: { matches: Match[][] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.bracketContainer}>
        {matches.map((round, roundIndex) => (
          <View key={roundIndex} style={styles.roundColumn}>
            <Text style={styles.roundLabel}>
              {ROUND_LABELS[round[0]?.round] || round[0]?.round}
            </Text>
            <View style={styles.matchesColumn}>
              {round.map((match, matchIndex) => (
                <View
                  key={match.id}
                  style={[
                    styles.matchCard,
                    match.isMyMatch && styles.myMatchCard,
                    { marginTop: roundIndex > 0 ? Math.pow(2, roundIndex) * 30 : 0 },
                  ]}
                >
                  <View style={[styles.playerRow, match.winner === 1 && styles.winnerRow]}>
                    <View style={styles.playerInfo}>
                      {match.player1?.seed && (
                        <Text style={styles.seed}>[{match.player1.seed}]</Text>
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
                      <Text style={[styles.score, match.winner === 1 && styles.winnerScore]}>
                        {match.score.split(",")[0]}
                      </Text>
                    )}
                  </View>
                  <View style={styles.matchDivider} />
                  <View style={[styles.playerRow, match.winner === 2 && styles.winnerRow]}>
                    <View style={styles.playerInfo}>
                      {match.player2?.seed && (
                        <Text style={styles.seed}>[{match.player2.seed}]</Text>
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
                      <Text style={[styles.score, match.winner === 2 && styles.winnerScore]}>
                        {match.score.split(",")[1]?.trim() || ""}
                      </Text>
                    )}
                  </View>
                  {!match.score && match.time && (
                    <View style={styles.matchTime}>
                      <Text style={styles.matchTimeText}>{match.time}</Text>
                      <Text style={styles.matchCourtText}>{match.court}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function GroupTable({ group }: { group: { name: string; standings: GroupStanding[] } }) {
  return (
    <View style={styles.groupContainer}>
      <Text style={styles.groupName}>{group.name}</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderText, styles.posCol]}>#</Text>
        <Text style={[styles.tableHeaderText, styles.playerCol]}>Player</Text>
        <Text style={[styles.tableHeaderText, styles.statCol]}>P</Text>
        <Text style={[styles.tableHeaderText, styles.statCol]}>W</Text>
        <Text style={[styles.tableHeaderText, styles.statCol]}>L</Text>
        <Text style={[styles.tableHeaderText, styles.setsCol]}>Sets</Text>
        <Text style={[styles.tableHeaderText, styles.gamesCol]}>Games</Text>
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
          <Text style={[styles.tableCell, styles.posCol, standing.position <= 2 && styles.qualifyPos]}>
            {standing.position}
          </Text>
          <Text
            style={[
              styles.tableCell,
              styles.playerCol,
              standing.playerName === "You" && styles.myNameCell,
            ]}
            numberOfLines={1}
          >
            {standing.playerName}
          </Text>
          <Text style={[styles.tableCell, styles.statCol]}>{standing.played}</Text>
          <Text style={[styles.tableCell, styles.statCol, styles.wonCell]}>{standing.won}</Text>
          <Text style={[styles.tableCell, styles.statCol, styles.lostCell]}>{standing.lost}</Text>
          <Text style={[styles.tableCell, styles.setsCol]}>
            {standing.setsWon}-{standing.setsLost}
          </Text>
          <Text style={[styles.tableCell, styles.gamesCol]}>
            {standing.gamesWon}-{standing.gamesLost}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ScheduleList({ schedule }: { schedule: ScheduleMatch[] }) {
  return (
    <View style={styles.scheduleContainer}>
      {schedule.map((match) => (
        <View
          key={match.id}
          style={[styles.scheduleCard, match.isMyMatch && styles.myScheduleCard]}
        >
          <View style={styles.scheduleTime}>
            <Ionicons name="time-outline" size={16} color={GlowColors.primary} />
            <Text style={styles.scheduleTimeText}>{match.time}</Text>
          </View>
          <View style={styles.scheduleMatch}>
            <Text
              style={[styles.schedulePlayer, match.player1 === "You" && styles.myScheduleName]}
            >
              {match.player1}
            </Text>
            <Text style={styles.scheduleVs}>vs</Text>
            <Text
              style={[styles.schedulePlayer, match.player2 === "You" && styles.myScheduleName]}
            >
              {match.player2}
            </Text>
          </View>
          <View style={styles.scheduleInfo}>
            <View style={styles.scheduleBadge}>
              <Text style={styles.scheduleBadgeText}>{match.round}</Text>
            </View>
            <View style={styles.scheduleCourt}>
              <Ionicons name="location-outline" size={12} color={TextColors.muted} />
              <Text style={styles.scheduleCourtText}>{match.court}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function ParticipantsList({ participants }: { participants: typeof MOCK_PARTICIPANTS }) {
  return (
    <View style={styles.participantsContainer}>
      {participants.map((player, index) => (
        <View
          key={player.id}
          style={[styles.participantCard, player.isMe && styles.myParticipantCard]}
        >
          <View style={styles.participantAvatar}>
            <Text style={styles.participantInitial}>{player.name.charAt(0)}</Text>
          </View>
          <View style={styles.participantInfo}>
            <Text style={[styles.participantName, player.isMe && styles.myParticipantName]}>
              {player.name}
            </Text>
            {player.seed && (
              <Text style={styles.participantSeed}>Seed #{player.seed}</Text>
            )}
          </View>
          {player.isMe && (
            <View style={styles.meBadge}>
              <Text style={styles.meBadgeText}>You</Text>
            </View>
          )}
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

  const renderViewToggle = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.viewToggleScroll}
      contentContainerStyle={styles.viewToggleContainer}
    >
      {isKnockout ? (
        <Pressable
          style={[styles.viewToggleButton, viewMode === "draw" && styles.viewToggleActive]}
          onPress={() => setViewMode("draw")}
        >
          <Ionicons
            name="git-network-outline"
            size={18}
            color={viewMode === "draw" ? GlowColors.primary : TextColors.muted}
          />
          <Text style={[styles.viewToggleText, viewMode === "draw" && styles.viewToggleTextActive]}>
            Draw
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.viewToggleButton, viewMode === "groups" && styles.viewToggleActive]}
          onPress={() => setViewMode("groups")}
        >
          <Ionicons
            name="grid-outline"
            size={18}
            color={viewMode === "groups" ? GlowColors.primary : TextColors.muted}
          />
          <Text style={[styles.viewToggleText, viewMode === "groups" && styles.viewToggleTextActive]}>
            Groups
          </Text>
        </Pressable>
      )}
      <Pressable
        style={[styles.viewToggleButton, viewMode === "schedule" && styles.viewToggleActive]}
        onPress={() => setViewMode("schedule")}
      >
        <Ionicons
          name="calendar-outline"
          size={18}
          color={viewMode === "schedule" ? GlowColors.primary : TextColors.muted}
        />
        <Text style={[styles.viewToggleText, viewMode === "schedule" && styles.viewToggleTextActive]}>
          Schedule
        </Text>
      </Pressable>
      <Pressable
        style={[styles.viewToggleButton, viewMode === "participants" && styles.viewToggleActive]}
        onPress={() => setViewMode("participants")}
      >
        <Ionicons
          name="people-outline"
          size={18}
          color={viewMode === "participants" ? GlowColors.primary : TextColors.muted}
        />
        <Text
          style={[styles.viewToggleText, viewMode === "participants" && styles.viewToggleTextActive]}
        >
          Players
        </Text>
      </Pressable>
    </ScrollView>
  );

  const renderContent = () => {
    switch (viewMode) {
      case "draw":
        return <DrawBracket matches={MOCK_DRAW} />;
      case "groups":
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.groupsContent}>
            {MOCK_GROUPS.map((group) => (
              <GroupTable key={group.name} group={group} />
            ))}
          </ScrollView>
        );
      case "schedule":
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scheduleContent}>
            <ScheduleList schedule={MOCK_SCHEDULE} />
          </ScrollView>
        );
      case "participants":
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.participantsContent}>
            <ParticipantsList participants={MOCK_PARTICIPANTS} />
          </ScrollView>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={GlowColors.primary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tournament.name}
          </Text>
          <View style={styles.headerMeta}>
            <Ionicons name="calendar-outline" size={14} color={TextColors.secondary} />
            <Text style={styles.headerMetaText}>
              {new Date(tournament.startDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}{" "}
              -{" "}
              {new Date(tournament.endDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="trophy-outline" size={20} color={GlowColors.primary} />
            <View>
              <Text style={styles.infoLabel}>Format</Text>
              <Text style={styles.infoValue}>
                {tournament.format === "knockout"
                  ? "Knock-out"
                  : tournament.format === "round_robin"
                  ? "Round Robin"
                  : "Box League"}
              </Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={20} color="#00D4FF" />
            <View>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {tournament.location}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="people-outline" size={20} color="#E040FB" />
            <View>
              <Text style={styles.infoLabel}>Entries</Text>
              <Text style={styles.infoValue}>
                {tournament.spotsTaken}/{tournament.spotsTotal}
              </Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="ticket-outline" size={20} color="#FFB020" />
            <View>
              <Text style={styles.infoLabel}>Entry Fee</Text>
              <Text style={styles.infoValue}>
                {tournament.entryFee ? `$${tournament.entryFee}` : "Free"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {tournament.isRegistered && (
        <View style={styles.myMatchSection}>
          <View style={styles.myMatchHeader}>
            <Ionicons name="flash" size={18} color={GlowColors.primary} />
            <Text style={styles.myMatchTitle}>Your Next Match</Text>
          </View>
          <View style={styles.myMatchCard}>
            <View style={styles.myMatchDetails}>
              <Text style={styles.myMatchVs}>vs T. Davis [4]</Text>
              <View style={styles.myMatchTime}>
                <Ionicons name="time-outline" size={14} color={TextColors.secondary} />
                <Text style={styles.myMatchTimeText}>Today at 14:00</Text>
              </View>
              <View style={styles.myMatchCourt}>
                <Ionicons name="location-outline" size={14} color={TextColors.secondary} />
                <Text style={styles.myMatchCourtText}>Court 1</Text>
              </View>
            </View>
            <View style={styles.myMatchRound}>
              <Text style={styles.myMatchRoundText}>R16</Text>
            </View>
          </View>
        </View>
      )}

      {renderViewToggle()}

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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 2,
  },
  headerMetaText: {
    ...Typography.caption,
    color: TextColors.secondary,
  },
  infoCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  infoLabel: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  infoValue: {
    ...Typography.small,
    color: TextColors.primary,
    fontWeight: "600",
  },
  myMatchSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  myMatchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  myMatchTitle: {
    ...Typography.h4,
    color: GlowColors.primary,
  },
  myMatchCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: GlowColors.primary + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: GlowColors.primary + "30",
  },
  myMatchDetails: {
    gap: Spacing.xs,
  },
  myMatchVs: {
    ...Typography.h3,
    color: TextColors.primary,
  },
  myMatchTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  myMatchTimeText: {
    ...Typography.caption,
    color: TextColors.secondary,
  },
  myMatchCourt: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  myMatchCourtText: {
    ...Typography.caption,
    color: TextColors.secondary,
  },
  myMatchRound: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  myMatchRoundText: {
    ...Typography.caption,
    color: Backgrounds.root,
    fontWeight: "700",
  },
  viewToggleScroll: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  viewToggleContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  viewToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  viewToggleActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: GlowColors.primary + "40",
  },
  viewToggleText: {
    ...Typography.caption,
    color: TextColors.muted,
    fontWeight: "500",
  },
  viewToggleTextActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  bracketContainer: {
    flexDirection: "row",
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  roundColumn: {
    marginRight: Spacing.xl,
    minWidth: 140,
  },
  roundLabel: {
    ...Typography.caption,
    color: TextColors.muted,
    textAlign: "center",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  matchesColumn: {
    gap: Spacing.md,
  },
  matchCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  myMatchCard: {
    borderColor: GlowColors.primary + "40",
    backgroundColor: GlowColors.primary + "10",
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  winnerRow: {
    backgroundColor: "rgba(0, 230, 118, 0.1)",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  seed: {
    fontSize: 10,
    color: TextColors.muted,
  },
  playerName: {
    ...Typography.caption,
    color: TextColors.secondary,
  },
  winnerName: {
    color: TextColors.primary,
    fontWeight: "600",
  },
  myName: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  score: {
    fontSize: 11,
    color: TextColors.muted,
    fontWeight: "500",
  },
  winnerScore: {
    color: "#00E676",
  },
  matchDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  matchTime: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: 4,
    backgroundColor: "rgba(200, 255, 61, 0.1)",
  },
  matchTimeText: {
    fontSize: 10,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  matchCourtText: {
    fontSize: 10,
    color: GlowColors.primary,
  },
  groupsContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  groupContainer: {
    marginBottom: Spacing.xl,
  },
  groupName: {
    ...Typography.h3,
    color: TextColors.primary,
    marginBottom: Spacing.md,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  tableHeaderText: {
    ...Typography.caption,
    color: TextColors.muted,
    fontWeight: "600",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  myRow: {
    backgroundColor: GlowColors.primary + "15",
    borderLeftWidth: 2,
    borderLeftColor: GlowColors.primary,
  },
  lastRow: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: BorderRadius.sm,
    borderBottomRightRadius: BorderRadius.sm,
  },
  tableCell: {
    ...Typography.caption,
    color: TextColors.secondary,
  },
  posCol: {
    width: 24,
    textAlign: "center",
  },
  qualifyPos: {
    color: "#00E676",
    fontWeight: "600",
  },
  playerCol: {
    flex: 1,
  },
  myNameCell: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  statCol: {
    width: 28,
    textAlign: "center",
  },
  wonCell: {
    color: "#00E676",
  },
  lostCell: {
    color: "#FF4D4D",
  },
  setsCol: {
    width: 45,
    textAlign: "center",
  },
  gamesCol: {
    width: 55,
    textAlign: "center",
  },
  scheduleContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  scheduleContainer: {
    gap: Spacing.md,
  },
  scheduleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: Spacing.md,
  },
  myScheduleCard: {
    borderColor: GlowColors.primary + "40",
    backgroundColor: GlowColors.primary + "10",
  },
  scheduleTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minWidth: 70,
  },
  scheduleTimeText: {
    ...Typography.body,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  scheduleMatch: {
    flex: 1,
    alignItems: "center",
  },
  schedulePlayer: {
    ...Typography.small,
    color: TextColors.primary,
    fontWeight: "500",
  },
  myScheduleName: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  scheduleVs: {
    ...Typography.caption,
    color: TextColors.muted,
    marginVertical: 2,
  },
  scheduleInfo: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  scheduleBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  scheduleBadgeText: {
    fontSize: 10,
    color: TextColors.secondary,
    fontWeight: "600",
  },
  scheduleCourt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scheduleCourtText: {
    fontSize: 11,
    color: TextColors.muted,
  },
  participantsContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  participantsContainer: {
    gap: Spacing.sm,
  },
  participantCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: Spacing.md,
  },
  myParticipantCard: {
    borderColor: GlowColors.primary + "40",
    backgroundColor: GlowColors.primary + "10",
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  participantInitial: {
    ...Typography.h4,
    color: TextColors.primary,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    ...Typography.body,
    color: TextColors.primary,
    fontWeight: "500",
  },
  myParticipantName: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  participantSeed: {
    ...Typography.caption,
    color: GlowColors.primary,
  },
  meBadge: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  meBadgeText: {
    fontSize: 10,
    color: Backgrounds.root,
    fontWeight: "700",
  },
});
