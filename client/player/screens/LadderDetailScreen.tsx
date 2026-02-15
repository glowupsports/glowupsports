import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Modal,
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
  GlowColors,
  TextColors,
 Backgrounds, } from "@/constants/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { PlayerStackParamList } from "@/player/navigation/PlayerNavigator";

type NavigationProp = NativeStackNavigationProp<PlayerStackParamList>;
type RouteProps = RouteProp<PlayerStackParamList, "LadderDetail">;

interface LadderPlayer {
  id: string;
  position: number;
  name: string;
  photo?: string;
  wins: number;
  losses: number;
  isMe?: boolean;
  canChallenge?: boolean;
}

interface Challenge {
  id: string;
  challenger: string;
  challenged: string;
  challengerPosition: number;
  challengedPosition: number;
  status: "pending" | "accepted" | "declined" | "completed";
  deadline?: string;
  result?: string;
  isMyChallenge?: boolean;
}

interface RecentResult {
  id: string;
  winner: string;
  loser: string;
  score: string;
  date: string;
  positionChange?: { player: string; from: number; to: number };
}

const MOCK_LADDER = {
  id: "l1",
  name: "Academy Singles Ladder",
  type: "singles" as const,
  playerCount: 45,
  challengeWindow: "Mon-Sun",
  challengeRange: 3,
  description:
    "Challenge players up to 3 positions above you. Win to take their position. All players below shift down.",
  rules: [
    "Challenge up to 3 positions above",
    "7 days to complete match",
    "Best of 3 sets",
    "Winner reports score",
    "No-show = forfeit",
  ],
};

const MOCK_PLAYERS: LadderPlayer[] = [
  { id: "1", position: 1, name: "J. Smith", wins: 12, losses: 2 },
  { id: "2", position: 2, name: "T. Davis", wins: 10, losses: 3 },
  { id: "3", position: 3, name: "E. White", wins: 9, losses: 4 },
  { id: "4", position: 4, name: "C. Taylor", wins: 8, losses: 4 },
  { id: "5", position: 5, name: "M. Johnson", wins: 8, losses: 5 },
  { id: "6", position: 6, name: "A. Williams", wins: 7, losses: 5 },
  { id: "7", position: 7, name: "R. Brown", wins: 7, losses: 6 },
  { id: "8", position: 8, name: "K. Miller", wins: 6, losses: 6 },
  { id: "9", position: 9, name: "You", wins: 6, losses: 7, isMe: true },
  { id: "10", position: 10, name: "P. Wilson", wins: 5, losses: 7 },
  { id: "11", position: 11, name: "L. Anderson", wins: 5, losses: 8 },
  { id: "12", position: 12, name: "H. Thomas", wins: 4, losses: 8 },
  { id: "13", position: 13, name: "N. Jackson", wins: 4, losses: 9 },
  { id: "14", position: 14, name: "D. Harris", wins: 3, losses: 9 },
  { id: "15", position: 15, name: "S. Martin", wins: 2, losses: 10 },
];

const MOCK_CHALLENGES: Challenge[] = [
  {
    id: "c1",
    challenger: "You",
    challenged: "K. Miller",
    challengerPosition: 9,
    challengedPosition: 8,
    status: "pending",
    deadline: "Feb 5, 2026",
    isMyChallenge: true,
  },
  {
    id: "c2",
    challenger: "P. Wilson",
    challenged: "You",
    challengerPosition: 10,
    challengedPosition: 9,
    status: "pending",
    deadline: "Feb 6, 2026",
    isMyChallenge: true,
  },
  {
    id: "c3",
    challenger: "L. Anderson",
    challenged: "P. Wilson",
    challengerPosition: 11,
    challengedPosition: 10,
    status: "accepted",
    deadline: "Feb 4, 2026",
  },
];

const MOCK_RESULTS: RecentResult[] = [
  {
    id: "r1",
    winner: "J. Smith",
    loser: "T. Davis",
    score: "6-4, 7-5",
    date: "Jan 28, 2026",
    positionChange: { player: "J. Smith", from: 2, to: 1 },
  },
  {
    id: "r2",
    winner: "C. Taylor",
    loser: "M. Johnson",
    score: "6-3, 6-2",
    date: "Jan 27, 2026",
    positionChange: { player: "C. Taylor", from: 5, to: 4 },
  },
  {
    id: "r3",
    winner: "You",
    loser: "P. Wilson",
    score: "7-6, 6-4",
    date: "Jan 25, 2026",
    positionChange: { player: "You", from: 10, to: 9 },
  },
  {
    id: "r4",
    winner: "R. Brown",
    loser: "A. Williams",
    score: "6-2, 3-6, 6-4",
    date: "Jan 24, 2026",
  },
];

function ChallengeModal({
  visible,
  onClose,
  player,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  player: LadderPlayer | null;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();

  if (!player) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Challenge Player</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={TextColors.muted} />
            </Pressable>
          </View>

          <View style={modalStyles.body}>
            <View style={modalStyles.playerCard}>
              <View style={modalStyles.playerAvatar}>
                <Text style={modalStyles.playerInitial}>{player.name.charAt(0)}</Text>
              </View>
              <View style={modalStyles.playerInfo}>
                <Text style={modalStyles.playerName}>{player.name}</Text>
                <Text style={modalStyles.playerPosition}>Position #{player.position}</Text>
                <Text style={modalStyles.playerRecord}>
                  Record: {player.wins}W - {player.losses}L
                </Text>
              </View>
            </View>

            <View style={modalStyles.challengeInfo}>
              <Ionicons name="information-circle-outline" size={20} color={GlowColors.primary} />
              <Text style={modalStyles.challengeInfoText}>
                If you win, you will take position #{player.position} and {player.name} will move
                to position #{player.position + 1}.
              </Text>
            </View>

            <View style={modalStyles.deadlineInfo}>
              <Ionicons name="time-outline" size={18} color={TextColors.secondary} />
              <Text style={modalStyles.deadlineText}>
                You have 7 days to complete this match
              </Text>
            </View>

            <Pressable
              style={modalStyles.confirmButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onConfirm();
                onClose();
              }}
            >
              <Text style={modalStyles.confirmButtonText}>Send Challenge</Text>
            </Pressable>

            <Pressable style={modalStyles.cancelButton} onPress={onClose}>
              <Text style={modalStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function LadderDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const [selectedPlayer, setSelectedPlayer] = useState<LadderPlayer | null>(null);
  const [showRules, setShowRules] = useState(false);

  const ladder = MOCK_LADDER;
  const myPosition = MOCK_PLAYERS.find((p) => p.isMe)?.position || 0;

  const playersWithChallenge = MOCK_PLAYERS.map((player) => ({
    ...player,
    canChallenge:
      !player.isMe &&
      player.position < myPosition &&
      player.position >= myPosition - ladder.challengeRange,
  }));

  const myChallenges = MOCK_CHALLENGES.filter((c) => c.isMyChallenge);

  const handleChallenge = (player: LadderPlayer) => {
    setSelectedPlayer(player);
  };

  const handleConfirmChallenge = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const renderPlayerItem = ({ item }: { item: LadderPlayer & { canChallenge?: boolean } }) => (
    <View style={[styles.playerCard, item.isMe && styles.myPlayerCard]}>
      <View style={[styles.positionBadge, item.position <= 3 && styles.topPosition]}>
        <Text style={[styles.positionText, item.position <= 3 && styles.topPositionText]}>
          {item.position}
        </Text>
      </View>
      <View style={styles.playerAvatar}>
        <Text style={styles.playerInitial}>{item.name.charAt(0)}</Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={[styles.playerName, item.isMe && styles.myName]}>{item.name}</Text>
        <View style={styles.recordRow}>
          <Text style={styles.recordLabel}>W</Text>
          <Text style={styles.recordWins}>{item.wins}</Text>
          <Text style={styles.recordSeparator}>-</Text>
          <Text style={styles.recordLabel}>L</Text>
          <Text style={styles.recordLosses}>{item.losses}</Text>
        </View>
      </View>
      {item.isMe ? (
        <View style={styles.meBadge}>
          <Text style={styles.meBadgeText}>You</Text>
        </View>
      ) : item.canChallenge ? (
        <Pressable
          style={styles.challengeButton}
          onPress={() => handleChallenge(item)}
        >
          <Ionicons name="flash" size={16} color={"rgba(255, 255, 255, 0.06)"} />
          <Text style={styles.challengeButtonText}>Challenge</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={GlowColors.primary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {ladder.name}
          </Text>
          <Text style={styles.headerSubtitle}>{ladder.playerCount} players</Text>
        </View>
        <Pressable style={styles.rulesButton} onPress={() => setShowRules(!showRules)}>
          <Ionicons name="help-circle-outline" size={24} color={TextColors.secondary} />
        </Pressable>
      </View>

      {showRules && (
        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Ladder Rules</Text>
          {ladder.rules.map((rule, index) => (
            <View key={index} style={styles.ruleRow}>
              <View style={styles.ruleBullet} />
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.myPositionCard}>
        <View style={styles.myPositionLeft}>
          <Ionicons name="podium" size={32} color={GlowColors.primary} />
          <View>
            <Text style={styles.myPositionLabel}>Your Position</Text>
            <Text style={styles.myPositionValue}>#{myPosition}</Text>
          </View>
        </View>
        <View style={styles.myPositionRight}>
          <Text style={styles.challengeRangeLabel}>Can challenge</Text>
          <Text style={styles.challengeRangeValue}>
            #{myPosition - ladder.challengeRange} - #{myPosition - 1}
          </Text>
        </View>
      </View>

      {myChallenges.length > 0 && (
        <View style={styles.challengesSection}>
          <Text style={styles.sectionTitle}>Active Challenges</Text>
          {myChallenges.map((challenge) => (
            <View key={challenge.id} style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <View style={styles.challengeStatus}>
                  <View
                    style={[
                      styles.statusDot,
                      challenge.status === "pending" && styles.statusPending,
                      challenge.status === "accepted" && styles.statusAccepted,
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {challenge.status.charAt(0).toUpperCase() + challenge.status.slice(1)}
                  </Text>
                </View>
                {challenge.deadline && (
                  <View style={styles.deadlineRow}>
                    <Ionicons name="time-outline" size={12} color={TextColors.muted} />
                    <Text style={styles.deadlineText}>Due: {challenge.deadline}</Text>
                  </View>
                )}
              </View>
              <View style={styles.challengeMatch}>
                <View style={styles.challengePlayer}>
                  <Text
                    style={[
                      styles.challengePlayerName,
                      challenge.challenger === "You" && styles.myChallengeName,
                    ]}
                  >
                    {challenge.challenger}
                  </Text>
                  <Text style={styles.challengePosition}>#{challenge.challengerPosition}</Text>
                </View>
                <View style={styles.vsContainer}>
                  <Ionicons name="flash" size={18} color={GlowColors.primary} />
                </View>
                <View style={styles.challengePlayer}>
                  <Text
                    style={[
                      styles.challengePlayerName,
                      challenge.challenged === "You" && styles.myChallengeName,
                    ]}
                  >
                    {challenge.challenged}
                  </Text>
                  <Text style={styles.challengePosition}>#{challenge.challengedPosition}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionTitle}>Rankings</Text>
        {playersWithChallenge.map((player) => renderPlayerItem({ item: player }))}

        <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Recent Results</Text>
        {MOCK_RESULTS.map((result) => (
          <View key={result.id} style={styles.resultCard}>
            <View style={styles.resultMatch}>
              <Text
                style={[styles.resultWinner, result.winner === "You" && styles.myResultName]}
              >
                {result.winner}
              </Text>
              <Text style={styles.resultDef}>def.</Text>
              <Text
                style={[styles.resultLoser, result.loser === "You" && styles.myResultName]}
              >
                {result.loser}
              </Text>
            </View>
            <View style={styles.resultDetails}>
              <Text style={styles.resultScore}>{result.score}</Text>
              <Text style={styles.resultDate}>{result.date}</Text>
            </View>
            {result.positionChange && (
              <View style={styles.positionChangeRow}>
                <Ionicons name="arrow-up" size={14} color="#00E676" />
                <Text style={styles.positionChangeText}>
                  {result.positionChange.player}: #{result.positionChange.from} → #
                  {result.positionChange.to}
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <ChallengeModal
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
        onConfirm={handleConfirmChallenge}
      />
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
  headerSubtitle: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  rulesButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  rulesCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  rulesTitle: {
    ...Typography.h4,
    color: TextColors.primary,
    marginBottom: Spacing.md,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  ruleBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GlowColors.primary,
    marginTop: 6,
  },
  ruleText: {
    ...Typography.small,
    color: TextColors.secondary,
    flex: 1,
  },
  myPositionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: GlowColors.primary + "15",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: GlowColors.primary + "30",
  },
  myPositionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  myPositionLabel: {
    ...Typography.caption,
    color: TextColors.secondary,
  },
  myPositionValue: {
    ...Typography.h1,
    color: GlowColors.primary,
  },
  myPositionRight: {
    alignItems: "flex-end",
  },
  challengeRangeLabel: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  challengeRangeValue: {
    ...Typography.h4,
    color: TextColors.primary,
  },
  challengesSection: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    color: TextColors.primary,
    marginBottom: Spacing.md,
  },
  challengeCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  challengeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  challengeStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TextColors.muted,
  },
  statusPending: {
    backgroundColor: "#FFB020",
  },
  statusAccepted: {
    backgroundColor: "#00E676",
  },
  statusText: {
    ...Typography.caption,
    color: TextColors.secondary,
    fontWeight: "500",
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deadlineText: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  challengeMatch: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  challengePlayer: {
    alignItems: "center",
    flex: 1,
  },
  challengePlayerName: {
    ...Typography.body,
    color: TextColors.primary,
    fontWeight: "500",
  },
  myChallengeName: {
    color: GlowColors.primary,
  },
  challengePosition: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  vsContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GlowColors.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: Spacing.md,
  },
  myPlayerCard: {
    borderColor: GlowColors.primary + "40",
    backgroundColor: GlowColors.primary + "10",
  },
  positionBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  topPosition: {
    backgroundColor: "#FFD700" + "30",
  },
  positionText: {
    ...Typography.caption,
    color: TextColors.secondary,
    fontWeight: "700",
  },
  topPositionText: {
    color: "#FFD700",
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitial: {
    ...Typography.h4,
    color: TextColors.primary,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.body,
    color: TextColors.primary,
    fontWeight: "500",
  },
  myName: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  recordLabel: {
    fontSize: 10,
    color: TextColors.muted,
  },
  recordWins: {
    ...Typography.caption,
    color: "#00E676",
    fontWeight: "600",
  },
  recordSeparator: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  recordLosses: {
    ...Typography.caption,
    color: "#FF4D4D",
    fontWeight: "600",
  },
  meBadge: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  meBadgeText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.06)",
    fontWeight: "700",
  },
  challengeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  challengeButtonText: {
    ...Typography.caption,
    color: "rgba(255, 255, 255, 0.06)",
    fontWeight: "700",
  },
  resultCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  resultMatch: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  resultWinner: {
    ...Typography.body,
    color: "#00E676",
    fontWeight: "600",
  },
  resultDef: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  resultLoser: {
    ...Typography.body,
    color: TextColors.secondary,
  },
  myResultName: {
    color: GlowColors.primary,
  },
  resultDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultScore: {
    ...Typography.caption,
    color: TextColors.primary,
    fontWeight: "500",
  },
  resultDate: {
    ...Typography.caption,
    color: TextColors.muted,
  },
  positionChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  positionChangeText: {
    ...Typography.caption,
    color: "#00E676",
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  content: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  body: {
    gap: Spacing.lg,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    gap: Spacing.lg,
  },
  playerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Backgrounds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitial: {
    ...Typography.h2,
    color: TextColors.primary,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    ...Typography.h3,
    color: TextColors.primary,
  },
  playerPosition: {
    ...Typography.small,
    color: GlowColors.primary,
    marginTop: 2,
  },
  playerRecord: {
    ...Typography.caption,
    color: TextColors.muted,
    marginTop: 2,
  },
  challengeInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: GlowColors.primary + "15",
    borderRadius: BorderRadius.sm,
  },
  challengeInfoText: {
    ...Typography.small,
    color: TextColors.secondary,
    flex: 1,
  },
  deadlineInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  deadlineText: {
    ...Typography.small,
    color: TextColors.secondary,
  },
  confirmButton: {
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  confirmButtonText: {
    ...Typography.body,
    color: "rgba(255, 255, 255, 0.06)",
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  cancelButtonText: {
    ...Typography.body,
    color: TextColors.muted,
  },
});
