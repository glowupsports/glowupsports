import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import {
  Spacing,
  Typography,
  BorderRadius,
  GlowColors,
  TextColors,
 Backgrounds, Colors } from "@/constants/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;
type RouteProps = RouteProp<PlayerStackParamList, "TournamentDetail">;

type ViewMode = "draw" | "groups" | "schedule" | "participants" | "standings";

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
  categories?: string[];
  isPublic?: boolean;
}

interface AmericanoStanding {
  playerId: string;
  name: string;
  points: number;
  played: number;
}

interface AmericanoData {
  standings: AmericanoStanding[];
  matches: any[];
  status: string;
}

interface MatchReadinessResult {
  readinessScore: number;
  topStrength: string;
  biggestGap: string;
  tacticalTips: string[];
  rationale: string;
  generatedAt: string;
}

const ROUND_LABELS: Record<string, string> = {
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  F: "Final",
};

function ScoreRing({ score }: { score: number }) {
  const size = 72;
  const strokeWidth = 6;
  const color = score >= 75 ? "#00E676" : score >= 50 ? "#FFB020" : "#FF4D4D";

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth, borderColor: Colors.dark.chipBackgroundStrong }} />
      <View style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: color,
        borderTopColor: "transparent",
        borderRightColor: score > 25 ? color : "transparent",
        borderBottomColor: score > 50 ? color : "transparent",
        borderLeftColor: score > 75 ? color : "transparent",
        transform: [{ rotate: "-90deg" }],
      }} />
      <Text style={{ fontSize: 18, fontWeight: "800", color }}>
        {score}%
      </Text>
    </View>
  );
}

function MatchReadinessCard({
  tournamentId,
  isRegistered,
}: {
  tournamentId: string;
  isRegistered: boolean;
}) {
  const [matchPrep, setMatchPrep] = useState<MatchReadinessResult | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/match-prep`);
      return res.json() as Promise<MatchReadinessResult>;
    },
    onSuccess: (data) => {
      setMatchPrep(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  if (!isRegistered) return null;

  return (
    <View style={readinessStyles.card}>
      <View style={readinessStyles.cardHeader}>
        <View style={readinessStyles.headerLeft}>
          <Ionicons name="flash" size={14} color={Colors.dark.accentText} />
          <Text style={readinessStyles.headerTitle}>Match Readiness</Text>
        </View>
        {matchPrep ? (
          <Text style={readinessStyles.generatedAt}>
            {new Date(matchPrep.generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </Text>
        ) : null}
      </View>

      {matchPrep ? (
        <View style={readinessStyles.resultContainer}>
          <View style={readinessStyles.scoreRow}>
            <ScoreRing score={matchPrep.readinessScore} />
            <View style={readinessStyles.scoreLabels}>
              <Text style={readinessStyles.rationale}>{matchPrep.rationale}</Text>
            </View>
          </View>

          <View style={readinessStyles.insightRow}>
            <View style={[readinessStyles.insightCard, readinessStyles.strengthCard]}>
              <View style={readinessStyles.insightHeader}>
                <Ionicons name="trending-up" size={12} color="#00E676" />
                <Text style={[readinessStyles.insightLabel, { color: "#00E676" }]}>Top Strength</Text>
              </View>
              <Text style={readinessStyles.insightText}>{matchPrep.topStrength}</Text>
            </View>
            <View style={[readinessStyles.insightCard, readinessStyles.gapCard]}>
              <View style={readinessStyles.insightHeader}>
                <Ionicons name="alert-circle-outline" size={12} color="#FFB020" />
                <Text style={[readinessStyles.insightLabel, { color: "#FFB020" }]}>Focus Area</Text>
              </View>
              <Text style={readinessStyles.insightText}>{matchPrep.biggestGap}</Text>
            </View>
          </View>

          <View style={readinessStyles.tipsSection}>
            <Text style={readinessStyles.tipsTitle}>Tactical Tips</Text>
            {matchPrep.tacticalTips.map((tip, i) => (
              <View key={i} style={readinessStyles.tipRow}>
                <View style={readinessStyles.tipNumber}>
                  <Text style={readinessStyles.tipNumberText}>{i + 1}</Text>
                </View>
                <Text style={readinessStyles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={readinessStyles.ctaContainer}>
          <Text style={readinessStyles.ctaDescription}>
            Get personalised tactical advice, your readiness score, and tips for your upcoming match.
          </Text>
          <Pressable
            style={[readinessStyles.ctaButton, mutation.isPending ? readinessStyles.ctaButtonLoading : null]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="flash" size={14} color="#fff" />
                <Text style={readinessStyles.ctaButtonText}>Get match prep</Text>
              </>
            )}
          </Pressable>
          {mutation.isError ? (
            <Text style={readinessStyles.errorMsg}>Could not generate prep. Please try again.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function DrawBracket({ matches }: { matches: DrawMatch[][] }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.bracketScroll, { paddingBottom: insets.bottom + 100 }]}
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
        <Ionicons name="grid" size={14} color={Colors.dark.accentText} />
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
      <ActivityIndicator size="large" color={Colors.dark.accentText} />
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
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("draw");
  const [viewModeInitialized, setViewModeInitialized] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [showRegForm, setShowRegForm] = useState(false);
  const [regPhone, setRegPhone] = useState("");
  const [regPartner, setRegPartner] = useState("");
  const [regCategory, setRegCategory] = useState("");

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

  const { data: americanoData, isLoading: americanoLoading } = useQuery<AmericanoData>({
    queryKey: ["/api/player/tournaments", tournamentId, "americano-standings"],
    enabled: tournament?.format === "americano" && (viewMode === "standings" || viewMode === "schedule"),
  });

  const { data: profileData } = useQuery<{ player: { name: string } | null }>({
    queryKey: ["/api/player/me/profile"],
    enabled: showRegForm,
  });
  const currentPlayerName = profileData?.player?.name;

  const registerMutation = useMutation({
    mutationFn: (payload: { category?: string; phone?: string; partner?: string }) =>
      apiRequest("POST", `/api/player/tournaments/${tournamentId}/register`, payload),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRegForm(false);
      setRegisterSuccess(true);
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message || "Could not register for this tournament.");
    },
  });

  const handleRegister = () => {
    if (!tournament) return;
    if (tournament.isPublic) {
      // Public tournament: show full registration form (phone, partner, category)
      setRegPhone("");
      setRegPartner("");
      setRegCategory(tournament.categories?.[0] || "");
      setShowRegForm(true);
    } else {
      // Academy-internal tournament: existing simple flow
      if (tournament.categories && tournament.categories.length > 0) {
        Alert.alert(
          "Select Category",
          "Choose your registration category:",
          [
            ...tournament.categories.map((cat: string) => ({
              text: cat,
              onPress: () => registerMutation.mutate({ category: cat }),
            })),
            { text: t("common.cancel"), style: "cancel" as const },
          ]
        );
      } else {
        registerMutation.mutate({});
      }
    }
  };

  const handleSubmitRegistration = () => {
    if (!tournament) return;
    if (!regPhone.trim()) {
      Alert.alert("Phone Required", "Please enter your phone number so the academy can contact you.");
      return;
    }
    const isDoubles = tournament.type === "doubles" || tournament.type === "mixed_doubles";
    if (isDoubles && !regPartner.trim()) {
      Alert.alert("Partner Required", "Please enter your partner's name for this doubles tournament.");
      return;
    }
    const payload: { category?: string; phone?: string; partner?: string } = {
      phone: regPhone.trim(),
    };
    if (isDoubles && regPartner.trim()) payload.partner = regPartner.trim();
    if (regCategory) payload.category = regCategory;
    registerMutation.mutate(payload);
  };

  useEffect(() => {
    if (tournament && !viewModeInitialized) {
      setViewModeInitialized(true);
      if (tournament.format === "americano") {
        setViewMode("standings");
      } else if (tournament.format !== "knockout") {
        setViewMode("groups");
      } else {
        setViewMode("draw");
      }
    }
  }, [tournament, viewModeInitialized]);

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
            <Ionicons name="chevron-back" size={22} color={Colors.dark.accentText} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t("player.tournaments.title")}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
        <ErrorView message={t("common.error")} />
      </View>
    );
  }

  const isKnockout = tournament.format === "knockout";
  const isAmericano = tournament.format === "americano";

  const drawRounds: DrawMatch[][] = drawData
    ? Object.keys(drawData).map((round) => drawData[round])
    : [];

  const groups = groupsData
    ? Object.entries(groupsData).map(([name, standings]) => ({ name, standings }))
    : [];

  const tabs = [
    { key: "draw" as ViewMode, label: t("player.tournaments.draw"), icon: "git-network-outline" as const, show: isKnockout },
    { key: "groups" as ViewMode, label: t("player.tournaments.groups"), icon: "grid-outline" as const, show: !isKnockout && !isAmericano },
    { key: "standings" as ViewMode, label: "Standings", icon: "trophy-outline" as const, show: isAmericano },
    { key: "schedule" as ViewMode, label: t("player.tournaments.schedule"), icon: "time-outline" as const, show: true },
    { key: "participants" as ViewMode, label: t("player.tournaments.participants"), icon: "people-outline" as const, show: true },
  ].filter(tab => tab.show);

  const handleTabPress = (key: ViewMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(key);
  };

  const nextMatch = tournament.nextMatch;

  const renderAmericanoStandings = () => {
    if (americanoLoading) return <LoadingView />;
    const standings = americanoData?.standings || [];
    if (standings.length === 0) return <ErrorView message="Standings not available yet" />;
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 100 }]}>
        <View style={styles.americanoStandingsHeader}>
          <Text style={styles.americanoStandingsCol}>#</Text>
          <Text style={[styles.americanoStandingsCol, { flex: 1 }]}>Player</Text>
          <Text style={styles.americanoStandingsCol}>Played</Text>
          <Text style={styles.americanoStandingsCol}>Points</Text>
        </View>
        {standings.map((entry, idx) => (
          <View key={entry.playerId} style={[styles.americanoRow, idx % 2 === 0 ? styles.americanoRowAlt : null]}>
            <Text style={[styles.americanoPos, idx < 3 ? { color: ["#FFB020", "#C0C0C0", "#CD7F32"][idx] } : null]}>{idx + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.americanoName} numberOfLines={1}>{entry.name}</Text>
            </View>
            <Text style={styles.americanoStat}>{entry.played}</Text>
            <Text style={[styles.americanoStat, styles.americanoPoints]}>{entry.points}</Text>
          </View>
        ))}
        {standings.length > 0 ? (
          <View style={styles.americanoPodium}>
            <Ionicons name="information-circle-outline" size={13} color={TextColors.muted} />
            <Text style={styles.americanoInfoText}>Top 3 earn XP: 300 / 200 / 100</Text>
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const renderAmericanoSchedule = () => {
    if (americanoLoading) return <LoadingView />;
    const matches = americanoData?.matches || [];
    if (matches.length === 0) return <ErrorView message="Schedule not generated yet" />;

    const byRound: Record<string, typeof matches> = {};
    for (const m of matches) {
      if (!byRound[m.round]) byRound[m.round] = [];
      byRound[m.round].push(m);
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 100 }]}>
        {Object.entries(byRound).map(([round, roundMatches]) => (
          <View key={round} style={styles.americanoRound}>
            <View style={styles.americanoRoundHeader}>
              <Ionicons name="sync-outline" size={14} color={Colors.dark.accentText} />
              <Text style={styles.americanoRoundTitle}>{round}</Text>
            </View>
            {roundMatches.map((match: any) => {
              const partnersStr = match.score || "";
              const isCompleted = match.status === "completed";
              let score = isCompleted ? match.score : null;
              return (
                <View key={match.id} style={[styles.americanoCourtCard, isCompleted ? styles.americanoCourtDone : null]}>
                  <View style={styles.americanoCourtBadge}>
                    <Text style={styles.americanoCourtText}>Court {match.matchOrder}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {isCompleted ? (
                      <Text style={styles.americanoScore}>{score}</Text>
                    ) : (
                      <Text style={styles.americanoCourtStatus}>Scheduled</Text>
                    )}
                  </View>
                  {isCompleted ? (
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  ) : (
                    <Ionicons name="time-outline" size={16} color={TextColors.muted} />
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (viewMode) {
      case "standings":
        return renderAmericanoStandings();
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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 100 }]}>
            {groups.map((group) => <GroupTable key={group.name} group={group} />)}
          </ScrollView>
        ) : (
          <ErrorView message="Group standings not available yet" />
        );
      case "schedule":
        if (isAmericano) return renderAmericanoSchedule();
        return scheduleLoading ? (
          <LoadingView />
        ) : scheduleData && scheduleData.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 100 }]}>
            <ScheduleList schedule={scheduleData} />
          </ScrollView>
        ) : (
          <ErrorView message="Schedule not available yet" />
        );
      case "participants":
        return participantsLoading ? (
          <LoadingView />
        ) : participantsData && participantsData.length > 0 ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.contentPadding, { paddingBottom: insets.bottom + 100 }]}>
            <ParticipantsList participants={participantsData} />
          </ScrollView>
        ) : (
          <ErrorView message="No participants yet" />
        );
    }
  };

  const formatLabel = tournament.format === "knockout"
    ? t("player.tournaments.knockout")
    : tournament.format === "round_robin"
    ? t("player.tournaments.roundRobin")
    : tournament.format === "americano"
    ? "Americano"
    : tournament.format;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.accentText} />
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
          <Ionicons name="trophy" size={16} color={Colors.dark.accentText} />
          <Text style={styles.statLabel}>{t("player.tournaments.format")}</Text>
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
          <Text style={styles.statLabel}>{t("player.tournaments.entryFee")}</Text>
          <Text style={styles.statValue}>{tournament.entryFee ? `$${tournament.entryFee}` : t("common.free")}</Text>
        </View>
      </View>

      <MatchReadinessCard
        tournamentId={tournamentId}
        isRegistered={tournament.isRegistered}
      />

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
                <Ionicons name="flash" size={12} color={Colors.dark.accentText} />
                <Text style={styles.nextMatchLabelText}>{t("player.tournaments.nextMatch")}</Text>
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

      {!tournament.isRegistered && ["upcoming", "registration_open"].includes(tournament.status) ? (
        <View style={detailRegStyles.registerSection}>
          {registerSuccess ? (
            <View style={detailRegStyles.successBox}>
              <Ionicons name="checkmark-circle" size={20} color="#00C853" />
              <View style={{ flex: 1 }}>
                <Text style={detailRegStyles.successTitle}>Registered!</Text>
                {tournament.entryFee && Number(tournament.entryFee) > 0 ? (
                  <Text style={detailRegStyles.successNote}>
                    Entry fee of AED {Number(tournament.entryFee)} will be collected by the hosting academy.
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <Pressable
              style={[detailRegStyles.registerBtn, registerMutation.isPending ? detailRegStyles.registerBtnDisabled : null]}
              onPress={handleRegister}
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="trophy-outline" size={16} color="#fff" />
                  <Text style={detailRegStyles.registerBtnText}>
                    {tournament.entryFee && Number(tournament.entryFee) > 0
                      ? `Register — AED ${Number(tournament.entryFee)} (pay at academy)`
                      : "Register Now (Free)"}
                  </Text>
                </>
              )}
            </Pressable>
          )}
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

      <Modal
        visible={showRegForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRegForm(false)}
      >
        <View style={detailRegStyles.formModalContainer}>
          <View style={detailRegStyles.formModalHeader}>
            <Text style={detailRegStyles.formModalTitle} numberOfLines={2}>
              Register: {tournament.name}
            </Text>
            <Pressable onPress={() => setShowRegForm(false)} style={detailRegStyles.formCloseBtn}>
              <Ionicons name="close" size={22} color={TextColors.secondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={detailRegStyles.formModalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {tournament.entryFee && Number(tournament.entryFee) > 0 ? (
              <View style={detailRegStyles.paymentNote}>
                <Ionicons name="information-circle-outline" size={16} color="#FBBF24" />
                <Text style={detailRegStyles.paymentNoteText}>
                  Entry fee of AED {Number(tournament.entryFee)} will be collected by the hosting academy. Your spot will be held as &quot;pending payment.&quot;
                </Text>
              </View>
            ) : null}

            {currentPlayerName ? (
              <>
                <Text style={detailRegStyles.fieldLabel}>Your name</Text>
                <View style={detailRegStyles.fieldReadOnly}>
                  <Text style={detailRegStyles.fieldReadOnlyText}>{currentPlayerName}</Text>
                </View>
              </>
            ) : null}

            <Text style={detailRegStyles.fieldLabel}>Phone number *</Text>
            <TextInput
              style={detailRegStyles.field}
              value={regPhone}
              onChangeText={setRegPhone}
              placeholder="+971 50 000 0000"
              placeholderTextColor={TextColors.muted}
              keyboardType="phone-pad"
              returnKeyType="next"
            />

            {(tournament.type === "doubles" || tournament.type === "mixed_doubles") ? (
              <>
                <Text style={detailRegStyles.fieldLabel}>Partner&apos;s name *</Text>
                <TextInput
                  style={detailRegStyles.field}
                  value={regPartner}
                  onChangeText={setRegPartner}
                  placeholder="Partner's full name"
                  placeholderTextColor={TextColors.muted}
                  returnKeyType="done"
                />
              </>
            ) : null}

            {tournament.categories && tournament.categories.length > 0 ? (
              <>
                <Text style={detailRegStyles.fieldLabel}>Category</Text>
                <View style={detailRegStyles.categoryRow}>
                  {tournament.categories.map((cat: string) => (
                    <Pressable
                      key={cat}
                      style={[
                        detailRegStyles.categoryChip,
                        regCategory === cat ? detailRegStyles.categoryChipActive : null,
                      ]}
                      onPress={() => setRegCategory(cat)}
                    >
                      <Text
                        style={[
                          detailRegStyles.categoryChipText,
                          regCategory === cat ? detailRegStyles.categoryChipTextActive : null,
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Pressable
              style={[
                detailRegStyles.submitBtn,
                registerMutation.isPending ? detailRegStyles.submitBtnDisabled : null,
              ]}
              onPress={handleSubmitRegistration}
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={detailRegStyles.submitBtnText}>
                  {tournament.entryFee && Number(tournament.entryFee) > 0
                    ? `Register — Pay AED ${Number(tournament.entryFee)} at academy`
                    : "Register Now (Free)"}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
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
    borderColor: Colors.dark.chipBackgroundStrong,
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
    borderColor: Colors.dark.chipBackground,
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
    backgroundColor: Colors.dark.chipBackgroundStrong,
    marginVertical: 4,
  },
  nextMatchCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.accentTextBorder,
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
    color: Colors.dark.accentText,
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
    color: Colors.dark.onAccent,
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
    borderColor: Colors.dark.chipBackground,
  },
  tabActive: {
    backgroundColor: GlowColors.primary + "20",
    borderColor: Colors.dark.accentTextBorder,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "600",
    color: TextColors.muted,
  },
  tabTextActive: {
    color: Colors.dark.accentText,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: Spacing.md,
  },
  bracketScroll: {
    paddingHorizontal: Spacing.md,
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
    borderColor: Colors.dark.chipBackground,
    overflow: "hidden",
  },
  myMatchCard: {
    borderColor: Colors.dark.accentTextBorder,
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
    backgroundColor: Colors.dark.chipBackgroundStrong,
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
    color: Colors.dark.accentText,
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
    backgroundColor: Colors.dark.chipBackground,
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
    color: Colors.dark.accentText,
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
    borderColor: Colors.dark.chipBackground,
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
    borderBottomColor: Colors.dark.chipBackground,
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
    color: Colors.dark.accentText,
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
    borderColor: Colors.dark.chipBackground,
  },
  myScheduleCard: {
    borderColor: Colors.dark.accentTextBorder,
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
    color: Colors.dark.accentText,
  },
  scheduleBadge: {
    backgroundColor: Colors.dark.chipBackgroundStrong,
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
    color: Colors.dark.accentText,
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
    borderColor: Colors.dark.chipBackground,
  },
  myParticipantCard: {
    borderColor: Colors.dark.accentTextBorder,
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
    borderColor: Colors.dark.accentText,
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
    color: Colors.dark.accentText,
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
    color: Colors.dark.accentText,
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
  americanoStandingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 8,
    marginBottom: 4,
    gap: 8,
  },
  americanoStandingsCol: {
    fontSize: 11,
    fontWeight: "700",
    color: TextColors.muted,
    textAlign: "center",
    width: 50,
    textTransform: "uppercase",
  },
  americanoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  americanoRowAlt: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  americanoPos: {
    fontSize: 14,
    fontWeight: "700",
    color: TextColors.muted,
    width: 24,
    textAlign: "center",
  },
  americanoName: {
    fontSize: 14,
    fontWeight: "600",
    color: TextColors.primary,
  },
  americanoStat: {
    fontSize: 13,
    color: TextColors.secondary,
    width: 50,
    textAlign: "center",
  },
  americanoPoints: {
    color: Colors.dark.accentText,
    fontWeight: "700",
    fontSize: 15,
  },
  americanoPodium: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  americanoInfoText: {
    fontSize: 12,
    color: TextColors.muted,
  },
  americanoRound: {
    marginBottom: Spacing.md,
  },
  americanoRoundHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  americanoRoundTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.accentText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  americanoCourtCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    marginBottom: 6,
  },
  americanoCourtDone: {
    opacity: 0.75,
    borderColor: "rgba(16,185,129,0.2)",
  },
  americanoCourtBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: GlowColors.primary + "20",
  },
  americanoCourtText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
  americanoScore: {
    fontSize: 13,
    fontWeight: "700",
    color: "#10B981",
  },
  americanoCourtStatus: {
    fontSize: 12,
    color: TextColors.muted,
  },
}));

const readinessStyles = makeReactiveStyles(() => StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextBorder,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.primary,
    letterSpacing: 0.3,
  },
  generatedAt: {
    fontSize: 10,
    color: TextColors.muted,
  },
  ctaContainer: {
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  ctaDescription: {
    fontSize: 12,
    color: TextColors.secondary,
    textAlign: "center",
    lineHeight: 18,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ctaButtonLoading: {
    opacity: 0.7,
  },
  ctaButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  errorMsg: {
    fontSize: 11,
    color: "#FF4D4D",
    textAlign: "center",
  },
  resultContainer: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  scoreLabels: {
    flex: 1,
  },
  rationale: {
    fontSize: 12,
    color: TextColors.secondary,
    lineHeight: 18,
  },
  insightRow: {
    flexDirection: "row",
    gap: 8,
  },
  insightCard: {
    flex: 1,
    borderRadius: 8,
    padding: Spacing.sm,
    gap: 4,
    borderWidth: 1,
  },
  strengthCard: {
    backgroundColor: "rgba(0, 230, 118, 0.08)",
    borderColor: "rgba(0, 230, 118, 0.2)",
  },
  gapCard: {
    backgroundColor: "rgba(255, 176, 32, 0.08)",
    borderColor: "rgba(255, 176, 32, 0.2)",
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  insightLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightText: {
    fontSize: 11,
    color: TextColors.secondary,
    lineHeight: 16,
  },
  tipsSection: {
    gap: 8,
  },
  tipsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: TextColors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  tipNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GlowColors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  tipNumberText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.accentText,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: TextColors.secondary,
    lineHeight: 18,
  },
}));

const detailRegStyles = makeReactiveStyles(() => StyleSheet.create({
  registerSection: {
    marginHorizontal: Spacing.md,
    marginBottom: 8,
  },
  registerBtn: {
    backgroundColor: "#00C853",
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  registerBtnDisabled: {
    opacity: 0.6,
  },
  registerBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0, 200, 83, 0.1)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 200, 83, 0.25)",
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00C853",
  },
  successNote: {
    fontSize: 12,
    color: TextColors.secondary,
    marginTop: 3,
    lineHeight: 16,
  },
  formModalContainer: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  formModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: Spacing.md,
    paddingTop: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.chipBackground,
    gap: 10,
  },
  formModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: TextColors.primary,
  },
  formCloseBtn: {
    padding: 4,
  },
  formModalContent: {
    padding: Spacing.md,
    gap: 0,
  },
  paymentNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.25)",
    marginBottom: 16,
  },
  paymentNoteText: {
    flex: 1,
    fontSize: 12,
    color: "#FCD34D",
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TextColors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
  },
  field: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TextColors.primary,
  },
  fieldReadOnly: {
    backgroundColor: Colors.dark.chipBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldReadOnlyText: {
    fontSize: 14,
    color: TextColors.secondary,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: Colors.dark.chipBackgroundStrong,
  },
  categoryChipActive: {
    backgroundColor: GlowColors.primary + "33",
    borderColor: Colors.dark.accentText,
  },
  categoryChipText: {
    fontSize: 13,
    color: TextColors.secondary,
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: Colors.dark.accentText,
    fontWeight: "700",
  },
  submitBtn: {
    backgroundColor: "#00C853",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
}));
