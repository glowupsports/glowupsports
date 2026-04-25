import React, { useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/coach/context/AuthContext";
import { Spacing, Backgrounds, GlowColors, Colors, BorderRadius, TextColors } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { getStaticAssetsUrl } from "@/lib/query-client";

import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
import { useCategoryAccent } from "@/player/theme/useCategoryAccent";
import { AWARD_GOLD, AWARD_GOLD_WARM } from "@/player/theme/categoryAccent";
interface SpotlightNominee {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
  level: number;
  ballLevel: string | null;
  totalVotes: number;
  reasons: string[];
}

interface WeeklyWinner {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
  level: number;
  ballLevel: string | null;
  totalVotes: number;
  topReason: string | null;
  weekStart: string;
}

interface CurrentWeekData {
  weekStart: string;
  nominations: SpotlightNominee[];
  myNomination: { nominatedPlayerId: string; reason: string } | null;
  daysRemaining: number;
  totalVotes: number;
}

interface MonthlyData {
  winner: {
    playerId: string;
    playerName: string;
    profilePhotoUrl: string | null;
    totalVotesAllWeeks: number;
    totalWeeklyWins: number;
  } | null;
  leaderboard: any[];
}

interface FriendSpotlightData {
  topFriend: {
    playerId: string;
    playerName: string;
    profilePhotoUrl: string | null;
    ballLevel: string | null;
    weeklyXp: number;
  } | null;
}

interface SpotlightCardProps {
  onNominate: () => void;
  onViewDetails: () => void;
  onShareWinner?: (winner: WeeklyWinner) => void;
  mode?: "academy" | "friends";
}

function PlayerAvatar({ photoUrl, size = 56, borderColor = "#FFD700" }: { photoUrl?: string | null; size?: number; borderColor?: string }) {
  const baseUrl = getStaticAssetsUrl();
  const fullUrl = photoUrl ? (photoUrl.startsWith("http") ? photoUrl : `${baseUrl}${photoUrl}`) : null;
  
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor, overflow: "hidden", backgroundColor: Backgrounds.surface }]}>
      {fullUrl ? (
        <Image source={{ uri: fullUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="person" size={size * 0.45} color={TextColors.muted} />
        </View>
      )}
    </View>
  );
}

function GoldStar({ size = 16 }: { size?: number }) {
  return <Ionicons name="star" size={size} color="#FFD700" />;
}

function CountdownBadge({ daysRemaining }: { daysRemaining: number }) {
  const label = daysRemaining === 0 ? "Ends today!" : daysRemaining === 1 ? "1 day left" : `${daysRemaining} days left`;
  return (
    <View style={countdownStyles.badge}>
      <Ionicons name="time-outline" size={12} color="#FFD700" />
      <Text style={countdownStyles.text}>{label}</Text>
    </View>
  );
}

const countdownStyles = makeReactiveStyles(() => StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFD700",
  },
}));

export function FriendSpotlightCard({ onAddFriends }: { onAddFriends: () => void }) {
  useThemeReactivity();
  const { user } = useAuth();

  const { data: friendSpotlight } = useQuery<FriendSpotlightData>({
    queryKey: ["/api/player/spotlight/friends"],
    enabled: !!user?.playerId,
  });

  const topFriend = friendSpotlight?.topFriend;

  return (
    <Animated.View entering={FadeInDown.delay(250).duration(600)} style={[styles.outerContainer]}>
      <View style={[styles.accentLine, { backgroundColor: GlowColors.primary }]} />
      <View style={[styles.gradient, { backgroundColor: Colors.dark.backgroundDefault }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={[styles.trophyContainer, { backgroundColor: Colors.dark.accentTextSoft }]}>
              <Ionicons name="people" size={14} color={Colors.dark.accentText} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: Colors.dark.accentText }]}>FRIEND SPOTLIGHT</Text>
              <Text style={styles.headerSubtitle}>Most active this week</Text>
            </View>
          </View>
        </View>

        {topFriend ? (
          <View style={friendSpotStyles.friendRow}>
            <PlayerAvatar photoUrl={topFriend.profilePhotoUrl} size={52} borderColor={GlowColors.primary} />
            <View style={friendSpotStyles.friendInfo}>
              <Text style={friendSpotStyles.friendLabel}>TOP FRIEND THIS WEEK</Text>
              <Text style={friendSpotStyles.friendName} numberOfLines={1}>{topFriend.playerName}</Text>
              <View style={friendSpotStyles.xpBadge}>
                <Ionicons name="flash" size={12} color={Colors.dark.accentText} />
                <Text style={friendSpotStyles.xpText}>{topFriend.weeklyXp} XP this week</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={friendSpotStyles.emptyState}>
            <Ionicons name="people-outline" size={32} color={TextColors.muted} />
            <Text style={friendSpotStyles.emptyText}>Add friends to see their progress</Text>
            <Pressable style={friendSpotStyles.addBtn} onPress={onAddFriends}>
              <Text style={friendSpotStyles.addBtnText}>Add friends</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.dark.accentText} />
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export function SpotlightCard({ onNominate, onViewDetails, onShareWinner, mode = "academy" }: SpotlightCardProps) {
  useThemeReactivity();
  const { user } = useAuth();
  const spotlightTint = useCategoryAccent("spotlight", AWARD_GOLD);
  const glowStyle = {};

  const { data: currentWeek } = useQuery<CurrentWeekData>({
    queryKey: ["/api/player/spotlight/current-week"],
    enabled: !!user?.playerId && mode === "academy",
  });

  const { data: weeklyWinner } = useQuery<{ winner: WeeklyWinner | null }>({
    queryKey: ["/api/player/spotlight/weekly-winner"],
    enabled: !!user?.playerId && mode === "academy",
  });

  const { data: monthlyData } = useQuery<MonthlyData>({
    queryKey: ["/api/player/spotlight/monthly"],
    enabled: !!user?.playerId && mode === "academy",
  });

  const hasVoted = !!currentWeek?.myNomination;
  const topNominee = currentWeek?.nominations?.[0];
  const lastWeekWinner = weeklyWinner?.winner;
  const monthWinner = monthlyData?.winner;

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(600)} style={[styles.outerContainer, glowStyle]}>
      <View style={[styles.accentLine, { backgroundColor: spotlightTint, opacity: 0.45 }]} />
      <View
        style={[styles.gradient, { backgroundColor: Colors.dark.backgroundDefault }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.trophyContainer}>
              <Ionicons name="trophy" size={14} color="#FFD700" />
            </View>
            <View>
              <Text style={styles.headerTitle}>SPOTLIGHT</Text>
              <Text style={styles.headerSubtitle}>Player of the Week</Text>
            </View>
          </View>
          {currentWeek ? <CountdownBadge daysRemaining={currentWeek.daysRemaining} /> : null}
        </View>

        {lastWeekWinner ? (
          <Pressable onPress={onViewDetails} style={styles.winnerSection}>
            <View style={styles.winnerBanner}>
              <LinearGradient
                colors={["rgba(255, 215, 0, 0.15)", "rgba(255, 215, 0, 0.05)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.winnerBannerGradient}
              >
                <View style={styles.crownContainer}>
                  <Text style={styles.crownEmoji}>
                    <Ionicons name="ribbon" size={20} color="#FFD700" />
                  </Text>
                </View>
                <PlayerAvatar photoUrl={lastWeekWinner.profilePhotoUrl} size={52} borderColor="#FFD700" />
                <View style={styles.winnerInfo}>
                  <Text style={styles.winnerLabel}>LAST WEEK&apos;S WINNER</Text>
                  <Text style={styles.winnerName} numberOfLines={1}>{lastWeekWinner.playerName}</Text>
                  <View style={styles.winnerStats}>
                    <View style={styles.voteBadge}>
                      <GoldStar size={12} />
                      <Text style={styles.voteCount}>{lastWeekWinner.totalVotes} votes</Text>
                    </View>
                  </View>
                </View>
                {onShareWinner ? (
                  <Pressable onPress={() => onShareWinner(lastWeekWinner)} style={styles.shareBtn}>
                    <Ionicons name="share-social-outline" size={20} color="#FFD700" />
                  </Pressable>
                ) : null}
              </LinearGradient>
            </View>
            {lastWeekWinner.topReason ? (
              <View style={styles.reasonContainer}>
                <Ionicons name="chatbubble-outline" size={12} color={TextColors.muted} />
                <Text style={styles.reasonText} numberOfLines={2}>&quot;{lastWeekWinner.topReason}&quot;</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        {monthWinner ? (
          <Pressable onPress={onViewDetails} style={styles.monthSection}>
            <LinearGradient
              colors={[Colors.dark.accentTextSoft, "rgba(200, 255, 61, 0.02)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.monthBanner}
            >
              <Ionicons name="medal" size={20} color={Colors.dark.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.monthLabel}>PLAYER OF THE MONTH</Text>
                <Text style={styles.monthName} numberOfLines={1}>{monthWinner.playerName}</Text>
              </View>
              <View style={styles.monthStats}>
                <Text style={styles.monthStatValue}>{monthWinner.totalWeeklyWins}x</Text>
                <Text style={styles.monthStatLabel}>weeks won</Text>
              </View>
            </LinearGradient>
          </Pressable>
        ) : null}

        <View style={styles.currentWeekSection}>
          {topNominee && !hasVoted ? (
            <View style={styles.leadingRow}>
              <Text style={styles.leadingLabel}>Currently leading:</Text>
              <PlayerAvatar photoUrl={topNominee.profilePhotoUrl} size={28} borderColor="rgba(255, 215, 0, 0.5)" />
              <Text style={styles.leadingName} numberOfLines={1}>{topNominee.playerName}</Text>
              <View style={styles.miniVoteBadge}>
                <GoldStar size={10} />
                <Text style={styles.miniVoteText}>{topNominee.totalVotes}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            {hasVoted ? (
              <Pressable onPress={onViewDetails} style={styles.votedButton}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.dark.accentText} />
                <Text style={styles.votedText}>You voted! View results</Text>
                <Ionicons name="chevron-forward" size={16} color={TextColors.muted} />
              </Pressable>
            ) : (
              <Pressable onPress={onNominate} style={styles.nominateButton}>
                <LinearGradient
                  colors={
                    spotlightTint === AWARD_GOLD
                      ? [AWARD_GOLD, AWARD_GOLD_WARM]
                      : [spotlightTint, spotlightTint]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nominateGradient}
                >
                  <Ionicons name="star" size={16} color={Colors.dark.buttonText} />
                  <Text style={styles.nominateText}>Nominate a Player</Text>
                </LinearGradient>
              </Pressable>
            )}
            <Pressable onPress={onViewDetails} style={styles.leaderboardBtn}>
              <Ionicons name="podium-outline" size={18} color="#FFD700" />
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  outerContainer: {
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.chipBackground,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  accentLine: {
    height: 2,
    backgroundColor: "#FFD700",
    opacity: 0.2,
  },
  gradient: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  trophyContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: TextColors.secondary,
    marginTop: 1,
  },
  winnerSection: {
    gap: Spacing.xs,
  },
  winnerBanner: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  winnerBannerGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  crownContainer: {
    position: "absolute",
    top: 6,
    left: 6,
  },
  crownEmoji: {
    fontSize: 18,
  },
  winnerInfo: {
    flex: 1,
    gap: 2,
  },
  winnerLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: 1.5,
  },
  winnerName: {
    fontSize: 15,
    fontWeight: "800",
    color: TextColors.primary,
  },
  winnerStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  voteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  voteCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  reasonContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  reasonText: {
    fontSize: 12,
    fontStyle: "italic",
    color: TextColors.muted,
    flex: 1,
  },
  monthSection: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  monthBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  monthLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.accentText,
    letterSpacing: 1.5,
  },
  monthName: {
    fontSize: 15,
    fontWeight: "700",
    color: TextColors.primary,
  },
  monthStats: {
    alignItems: "center",
  },
  monthStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.accentText,
  },
  monthStatLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: TextColors.muted,
  },
  currentWeekSection: {
    gap: Spacing.sm,
  },
  leadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  leadingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TextColors.muted,
  },
  leadingName: {
    fontSize: 13,
    fontWeight: "700",
    color: TextColors.primary,
    flex: 1,
  },
  miniVoteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  miniVoteText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFD700",
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  nominateButton: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  nominateGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
  },
  nominateText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  votedButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accentTextSoft,
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
  },
  votedText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.accentText,
    flex: 1,
  },
  leaderboardBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
}));

const friendSpotStyles = makeReactiveStyles(() => StyleSheet.create({
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.accentTextSoft,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.accentTextSoft,
  },
  friendInfo: {
    flex: 1,
    gap: 3,
  },
  friendLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.accentText,
    letterSpacing: 1.5,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "800",
    color: TextColors.primary,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  xpText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.accentText,
  },
  emptyState: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  emptyText: {
    fontSize: 13,
    color: TextColors.muted,
    textAlign: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(200, 255, 61, 0.1)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
    marginTop: Spacing.xs,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.accentText,
  },
}));
