import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import {
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  TextColors,
 Backgrounds, } from "@/constants/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;
type RouteProps = RouteProp<PlayerStackParamList, "TournamentDetail">;

type ViewMode = "draw" | "groups" | "schedule" | "participants";

interface PlayerRef {
  id: string;
  name: string;
}

interface DrawMatch {
  id: string;
  round: string;
  matchOrder: number;
  player1Id: string | null;
  player2Id: string | null;
  player1: PlayerRef | null;
  player2: PlayerRef | null;
  winner: PlayerRef | null;
  winnerId: string | null;
  score: string | null;
  court: string | null;
  scheduledTime: string | null;
  status: string;
  isMyMatch?: boolean;
}

interface GroupStanding {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
}

interface ScheduleMatch {
  id: string;
  round: string;
  matchOrder: number;
  player1Id: string | null;
  player2Id: string | null;
  player1: PlayerRef | null;
  player2: PlayerRef | null;
  score: string | null;
  winnerId: string | null;
  court: string | null;
  scheduledTime: string | null;
  status: string;
}

interface ParticipantEntry {
  participant: {
    id: string;
    tournamentId: string;
    playerId: string;
    seed: number | null;
  };
  player: {
    id: string;
    name: string;
    photoUrl: string | null;
  };
}

interface TournamentDetail {
  id: string;
  name: string;
  type: string;
  format: string;
  startDate: string;
  endDate: string;
  location: string;
  address: string | null;
  description: string | null;
  entryFee: string | null;
  spotsTotal: number;
  spotsTaken: number;
  isRegistered: boolean;
  status: string;
  nextMatch: any | null;
  participants: ParticipantEntry[];
  matches: any[];
}

const ROUND_LABELS: Record<string, string> = {
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  F: "Final",
};

function DrawBracket({ matches }: { matches: DrawMatch[][] }) {
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
                  const isPlayer1Winner = match.winnerId != null && match.player1 != null && match.winnerId === match.player1.id;
                  const isPlayer2Winner = match.winnerId != null && match.player2 != null && match.winnerId === match.player2.id;
                  return (
                    <View
                      key={match.id}
                      style={[
                        styles.matchCard,
                        match.isMyMatch ? styles.myMatchCard : null,
                        { marginTop: roundIndex > 0 ? spacing : 0 },
                      ]}
                    >
                      <View style={[styles.playerSlot, isPlayer1Winner ? styles.winnerSlot : null]}>
                        <View style={styles.playerInfo}>
                          {match.player1?.name === "You" ? null : null}
                          <Text
                            style={[
                              styles.playerName,
                              isPlayer1Winner ? styles.winnerName : null,
                              match.player1?.name === "You" ? styles.myName : null,
                            ]}
                            numberOfLines={1}
                          >
                            {match.player1?.name || "TBD"}
                          </Text>
                        </View>
                        {match.score ? (
                          <Text style={[styles.scoreText, isPlayer1Winner ? styles.winnerScore : null]}>
                            {match.score.split(",")[0]}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.matchDivider} />
                      <View style={[styles.playerSlot, isPlayer2Winner ? styles.winnerSlot : null]}>
                        <View style={styles.playerInfo}>
                          <Text
                            style={[
                              styles.playerName,
                              isPlayer2Winner ? styles.winnerName : null,
                              match.player2?.name === "You" ? styles.myName : null,
                            ]}
                            numberOfLines={1}
                          >
                            {match.player2?.name || "TBD"}
                          </Text>
                        </View>
                        {match.score ? (
                          <Text style={[styles.scoreText, isPlayer2Winner ? styles.winnerScore : null]}>
                            {match.score.split(",")[1]?.trim() || ""}
                          </Text>
                        ) : null}
                      </View>
                      {!match.score && match.scheduledTime ? (
                        <View style={styles.liveIndicator}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveText}>
                            {new Date(match.scheduledTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                      ) : null}
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
            key={standing.playerId}
            style={[
              styles.tableRow,
              index === group.standings.length - 1 ? styles.lastRow : null,
            ]}
          >
            <View style={[styles.posCol, styles.posWrapper]}>
              <Text style={[styles.tableCell, index < 2 ? styles.qualifyPos : null]}>
                {index + 1}
              </Text>
              {index < 2 ? <View style={styles.qualifyDot} /> : null}
            </View>
            <Text
              style={[styles.tableCell, styles.playerCol]}
              numberOfLines={1}
            >
              {standing.name}
            </Text>
            <Text style={[styles.tableCell, styles.statCol, styles.wonCell]}>{standing.wins}</Text>
            <Text style={[styles.tableCell, styles.statCol, styles.lostCell]}>{standing.losses}</Text>
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
        <Pressable key={match.id} style={[styles.scheduleCard]}>
          <View style={styles.scheduleTimeBlock}>
            <Text style={styles.scheduleTime}>
              {match.scheduledTime
                ? new Date(match.scheduledTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "--:--"}
            </Text>
            <View style={styles.scheduleBadge}>
              <Text style={styles.scheduleBadgeText}>{match.round}</Text>
            </View>
          </View>
          <View style={styles.scheduleMatchInfo}>
            <Text style={styles.schedulePlayer}>
              {match.player1?.name || "TBD"}
            </Text>
            <View style={styles.vsContainer}>
              <View style={styles.vsLine} />
              <Text style={styles.vsText}>VS</Text>
              <View style={styles.vsLine} />
            </View>
            <Text style={styles.schedulePlayer}>
              {match.player2?.name || "TBD"}
            </Text>
          </View>
          <View style={styles.scheduleCourtBlock}>
            <Ionicons name="location" size={12} color={TextColors.muted} />
            <Text style={styles.scheduleCourtText}>{match.court || "TBD"}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ParticipantsList({ participants }: { participants: ParticipantEntry[] }) {
  return (
    <View style={styles.participantsGrid}>
      {participants.map((entry) => (
        <View key={entry.player.id} style={[styles.participantCard]}>
          <LinearGradient
            colors={["transparent", "transparent"]}
            style={styles.participantGradient}
          >
            <View style={[styles.participantAvatar]}>
              <Text style={styles.participantInitial}>{entry.player.name.charAt(0)}</Text>
            </View>
            <Text style={[styles.participantName]} numberOfLines={1}>
              {entry.player.name}
            </Text>
            {entry.participant.seed ? (
              <View style={styles.participantSeedBadge}>
                <Text style={styles.participantSeedText}>#{entry.participant.seed}</Text>
              </View>
            ) : null}
          </LinearGradient>
        </View>
      ))}
    </View>
  );
}

function LoadingView() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={GlowColors.primary} />
    </View>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <View style={styles.loadingContainer}>
      <Ionicons name="warning-outline" size={32} color={TextColors.muted} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export default function TournamentDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("draw");

  const tournamentId = route.params.tournamentId;

  const { data: tournament, isLoading: tournamentLoading, error: tournamentError } = useQuery<TournamentDetail>({
    queryKey: ["/api/player/tournaments", tournamentId],
  });

  const { data: drawData, isLoading: drawLoading } = useQuery<Record<string, DrawMatch[]>>({
    queryKey: ["/api/player/tournaments", tournamentId, "draw"],
    enabled: viewMode === "draw" && tournament?.format === "knockout",
  });

  const { data: groupsData, isLoading: groupsLoading } = useQuery<Record<string, GroupStanding[]>>({
    queryKey: ["/api/player/tournaments", tournamentId, "groups"],
    enabled: viewMode === "groups" && tournament?.format !== "knockout",
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery<ScheduleMatch[]>({
    queryKey: ["/api/player/tournaments", tournamentId, "schedule"],
    enabled: viewMode === "schedule",
  });

  const { data: participantsData, isLoading: participantsLoading } = useQuery<ParticipantEntry[]>({
    queryKey: ["/api/player/tournaments", tournamentId, "participants"],
    enabled: viewMode === "participants",
  });

  if (tournamentLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LoadingView />
      </View>
    );
  }

  if (tournamentError || !tournament) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={GlowColors.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Tournament</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
        <ErrorView message="Failed to load tournament details" />
      </View>
    );
  }

  const isKnockout = tournament.format === "knockout";

  const drawRounds: DrawMatch[][] = drawData
    ? Object.keys(drawData).map((round) => drawData[round])
    : [];

  const groups = groupsData
    ? Object.entries(groupsData).map(([name, standings]) => ({ name, standings }))
    : [];

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

  const nextMatch = tournament.nextMatch;

  const renderContent = () => {
    switch (viewMode) {
      case "draw":
        return drawLoading ? (
          <LoadingView />
        ) : drawRounds.length > 0 ? (
          <DrawBracket matches={drawRounds} />
        ) : (
          <ErrorView message="Draw not available yet" />
        );
      case "groups":
        return groupsLoading ? (
          <LoadingView />
        ) : groups.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPadding}>
            {groups.map((group) => <GroupTable key={group.name} group={group} />)}
          </ScrollView>
        ) : (
          <ErrorView message="Group standings not available yet" />
        );
      case "schedule":
        return scheduleLoading ? (
          <LoadingView />
        ) : scheduleData && scheduleData.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPadding}>
            <ScheduleList schedule={scheduleData} />
          </ScrollView>
        ) : (
          <ErrorView message="Schedule not available yet" />
        );
      case "participants":
        return participantsLoading ? (
          <LoadingView />
        ) : participantsData && participantsData.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPadding}>
            <ParticipantsList participants={participantsData} />
          </ScrollView>
        ) : (
          <ErrorView message="No participants yet" />
        );
    }
  };

  const formatLabel = tournament.format === "knockout" ? "Knockout" : tournament.format === "round_robin" ? "Round Robin" : tournament.format;

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
          <Text style={styles.statValue}>{formatLabel}</Text>
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
          <Text style={styles.statValue}>{tournament.entryFee ? `$${tournament.entryFee}` : "Free"}</Text>
        </View>
      </View>

      {tournament.isRegistered && nextMatch ? (
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
              <Text style={styles.nextMatchOpponent}>
                vs {nextMatch.opponentName || "Opponent"}
              </Text>
              <View style={styles.nextMatchMeta}>
                <Ionicons name="time-outline" size={12} color={TextColors.secondary} />
                <Text style={styles.nextMatchMetaText}>
                  {nextMatch.scheduledTime
                    ? new Date(nextMatch.scheduledTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "TBD"}
                </Text>
                {nextMatch.court ? (
                  <>
                    <Ionicons name="location-outline" size={12} color={TextColors.secondary} style={{ marginLeft: 8 }} />
                    <Text style={styles.nextMatchMetaText}>{nextMatch.court}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <View style={styles.nextMatchRound}>
              <Text style={styles.nextMatchRoundText}>{nextMatch.round || ""}</Text>
            </View>
          </LinearGradient>
        </View>
      ) : null}

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, viewMode === tab.key ? styles.tabActive : null]}
            onPress={() => handleTabPress(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={viewMode === tab.key ? GlowColors.primary : TextColors.muted}
            />
            <Text style={[styles.tabText, viewMode === tab.key ? styles.tabTextActive : null]}>
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
    backgroundColor: Backgrounds.card,
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
    color: "rgba(255, 255, 255, 0.06)",
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: TextColors.muted,
    textAlign: "center",
    marginTop: 8,
  },
});
