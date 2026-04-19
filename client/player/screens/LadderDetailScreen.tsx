import React, { useState } from "react";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
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
  playerId: string;
  position: number;
  name: string;
  photoUrl: string | null;
  wins: number;
  losses: number;
  isMe: boolean;
  canChallenge: boolean;
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
  positionChange?: { player: string; from: number; to: number } | null;
}

interface LadderDetailData {
  ladder: {
    id: string;
    name: string;
    type: string;
    description: string;
    challengeRange: number;
    challengeWindowDays: number;
    rules: string[];
    status: string;
  };
  players: LadderPlayer[];
  myChallenges: Challenge[];
  recentResults: RecentResult[];
  myPosition: number | null;
  playerCount: number;
}

function ChallengeModal({
  visible,
  onClose,
  player,
  onConfirm,
  isLoading,
}: {
  visible: boolean;
  onClose: () => void;
  player: LadderPlayer | null;
  onConfirm: () => void;
  isLoading?: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!player) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <Pressable style={modalStyles.backdrop} onPress={onClose} />
        <View style={[modalStyles.content, { paddingBottom: insets.bottom + 20 }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{t("player.tournaments.challenge")}</Text>
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
                <Text style={modalStyles.playerPosition}>{t("player.tournaments.position")} #{player.position}</Text>
                <Text style={modalStyles.playerRecord}>
                  {t("player.tournaments.wins")}: {player.wins} - {t("player.tournaments.losses")}: {player.losses}
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
              style={[modalStyles.confirmButton, isLoading ? { opacity: 0.6 } : null]}
              disabled={isLoading}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onConfirm();
              }}
            >
              {isLoading ? (
                <ActivityIndicator color="rgba(255, 255, 255, 0.06)" />
              ) : (
                <Text style={modalStyles.confirmButtonText}>{t("player.tournaments.challenge")}</Text>
              )}
            </Pressable>

            <Pressable style={modalStyles.cancelButton} onPress={onClose}>
              <Text style={modalStyles.cancelButtonText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function LadderDetailScreen() {
  const { t } = useTranslation();
  const track = useTrackFeature();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedPlayer, setSelectedPlayer] = useState<LadderPlayer | null>(null);
  const [showRules, setShowRules] = useState(false);

  const ladderId = route.params.ladderId;

  const { data, isLoading, refetch } = useQuery<LadderDetailData>({
    queryKey: ["/api/player/ladders", ladderId],
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const challengeMutation = useMutation({
    mutationFn: (playerId: string) =>
      apiRequest("POST", `/api/player/ladders/${ladderId}/challenge`, { challengedPlayerId: playerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/ladders", ladderId] });
      setSelectedPlayer(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const respondMutation = useMutation({
    mutationFn: ({ challengeId, action }: { challengeId: string; action: "accept" | "decline" }) =>
      apiRequest("POST", `/api/player/ladders/challenges/${challengeId}/respond`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/ladders", ladderId] });
    },
  });

  if (isLoading || !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={GlowColors.primary} />
      </View>
    );
  }

  const ladder = data.ladder;
  const players = data.players || [];
  const myChallenges = data.myChallenges || [];
  const recentResults = data.recentResults || [];
  const myPosition = data.myPosition || 0;

  const handleChallenge = (player: LadderPlayer) => {
    track("ladder:challenge");
    setSelectedPlayer(player);
  };

  const handleConfirmChallenge = () => {
    if (selectedPlayer) {
      challengeMutation.mutate(selectedPlayer.playerId);
    }
  };

  const renderPlayerItem = ({ item }: { item: LadderPlayer }) => (
    <View style={[styles.playerCard, item.isMe ? styles.myPlayerCard : null]}>
      <View style={[styles.positionBadge, item.position <= 3 ? styles.topPosition : null]}>
        <Text style={[styles.positionText, item.position <= 3 ? styles.topPositionText : null]}>
          {item.position}
        </Text>
      </View>
      <View style={styles.playerAvatar}>
        <Text style={styles.playerInitial}>{item.name.charAt(0)}</Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={[styles.playerName, item.isMe ? styles.myName : null]}>{item.name}</Text>
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
          <Text style={styles.challengeButtonText}>{t("player.tournaments.challenge")}</Text>
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
          <Text style={styles.headerSubtitle}>{data.playerCount} players</Text>
        </View>
        <Pressable style={styles.rulesButton} onPress={() => setShowRules(!showRules)}>
          <Ionicons name="help-circle-outline" size={24} color={TextColors.secondary} />
        </Pressable>
      </View>

      {showRules ? (
        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>{t("player.tournaments.rules")}</Text>
          {(ladder.rules || []).map((rule, index) => (
            <View key={index} style={styles.ruleRow}>
              <View style={styles.ruleBullet} />
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {myPosition ? (
        <View style={styles.myPositionCard}>
          <View style={styles.myPositionLeft}>
            <Ionicons name="podium" size={32} color={GlowColors.primary} />
            <View>
              <Text style={styles.myPositionLabel}>{t("player.tournaments.position")}</Text>
              <Text style={styles.myPositionValue}>#{myPosition}</Text>
            </View>
          </View>
          <View style={styles.myPositionRight}>
            <Text style={styles.challengeRangeLabel}>Can challenge</Text>
            <Text style={styles.challengeRangeValue}>
              #{Math.max(1, myPosition - ladder.challengeRange)} - #{myPosition - 1}
            </Text>
          </View>
        </View>
      ) : null}

      {myChallenges.length > 0 ? (
        <View style={styles.challengesSection}>
          <Text style={styles.sectionTitle}>{t("player.tournaments.activeChallenges")}</Text>
          {myChallenges.map((challenge) => (
            <View key={challenge.id} style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <View style={styles.challengeStatus}>
                  <View
                    style={[
                      styles.statusDot,
                      challenge.status === "pending" ? styles.statusPending : null,
                      challenge.status === "accepted" ? styles.statusAccepted : null,
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {challenge.status.charAt(0).toUpperCase() + challenge.status.slice(1)}
                  </Text>
                </View>
                {challenge.deadline ? (
                  <View style={styles.deadlineRow}>
                    <Ionicons name="time-outline" size={12} color={TextColors.muted} />
                    <Text style={styles.deadlineText}>Due: {challenge.deadline}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.challengeMatch}>
                <View style={styles.challengePlayer}>
                  <Text
                    style={[
                      styles.challengePlayerName,
                      challenge.challenger === "You" ? styles.myChallengeName : null,
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
                      challenge.challenged === "You" ? styles.myChallengeName : null,
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
      ) : null}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GlowColors.primary}
          />
        }
      >
        <Text style={styles.sectionTitle}>{t("player.tournaments.position")}</Text>
        {players.map((player) => renderPlayerItem({ item: player }))}

        <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>{t("player.tournaments.recentResults")}</Text>
        {recentResults.map((result) => (
          <View key={result.id} style={styles.resultCard}>
            <View style={styles.resultMatch}>
              <Text
                style={[styles.resultWinner, result.winner === "You" ? styles.myResultName : null]}
              >
                {result.winner}
              </Text>
              <Text style={styles.resultDef}>def.</Text>
              <Text
                style={[styles.resultLoser, result.loser === "You" ? styles.myResultName : null]}
              >
                {result.loser}
              </Text>
            </View>
            <View style={styles.resultDetails}>
              <Text style={styles.resultScore}>{result.score}</Text>
              <Text style={styles.resultDate}>{result.date}</Text>
            </View>
            {result.positionChange ? (
              <View style={styles.positionChangeRow}>
                <Ionicons name="arrow-up" size={14} color="#00E676" />
                <Text style={styles.positionChangeText}>
                  {result.positionChange.player}: #{result.positionChange.from} → #
                  {result.positionChange.to}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <ChallengeModal
        visible={!!selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        player={selectedPlayer}
        onConfirm={handleConfirmChallenge}
        isLoading={challengeMutation.isPending}
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
