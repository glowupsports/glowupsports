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

interface SpotlightCardProps {
  onNominate: () => void;
  onViewDetails: () => void;
  onShareWinner?: (winner: WeeklyWinner) => void;
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

const countdownStyles = StyleSheet.create({
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
});

export function SpotlightCard({ onNominate, onViewDetails, onShareWinner }: SpotlightCardProps) {
  const { user } = useAuth();
  const glowStyle = {};

  const { data: currentWeek } = useQuery<CurrentWeekData>({
    queryKey: ["/api/player/spotlight/current-week"],
    enabled: !!user?.playerId,
  });

  const { data: weeklyWinner } = useQuery<{ winner: WeeklyWinner | null }>({
    queryKey: ["/api/player/spotlight/weekly-winner"],
    enabled: !!user?.playerId,
  });

  const { data: monthlyData } = useQuery<MonthlyData>({
    queryKey: ["/api/player/spotlight/monthly"],
    enabled: !!user?.playerId,
  });

  const hasVoted = !!currentWeek?.myNomination;
  const topNominee = currentWeek?.nominations?.[0];
  const lastWeekWinner = weeklyWinner?.winner;
  const monthWinner = monthlyData?.winner;

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(600)} style={[styles.outerContainer, glowStyle]}>
      <View style={styles.accentLine} />
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.03)", "rgba(17, 20, 26, 0.95)"]}
        style={styles.gradient}
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
                  <Text style={styles.winnerLabel}>LAST WEEK'S WINNER</Text>
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
                <Text style={styles.reasonText} numberOfLines={2}>"{lastWeekWinner.topReason}"</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        {monthWinner ? (
          <Pressable onPress={onViewDetails} style={styles.monthSection}>
            <LinearGradient
              colors={["rgba(200, 255, 61, 0.08)", "rgba(200, 255, 61, 0.02)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.monthBanner}
            >
              <Ionicons name="medal" size={20} color={GlowColors.primary} />
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
                <Ionicons name="checkmark-circle" size={18} color={GlowColors.primary} />
                <Text style={styles.votedText}>You voted! View results</Text>
                <Ionicons name="chevron-forward" size={16} color={TextColors.muted} />
              </Pressable>
            ) : (
              <Pressable onPress={onNominate} style={styles.nominateButton}>
                <LinearGradient
                  colors={["#FFD700", "#FFA500"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.nominateGradient}
                >
                  <Ionicons name="star" size={16} color="#000" />
                  <Text style={styles.nominateText}>Nominate a Player</Text>
                </LinearGradient>
              </Pressable>
            )}
            <Pressable onPress={onViewDetails} style={styles.leaderboardBtn}>
              <Ionicons name="podium-outline" size={18} color="#FFD700" />
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.card,
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
    color: "#FFFFFF",
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
    color: GlowColors.primary,
    letterSpacing: 1.5,
  },
  monthName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  monthStats: {
    alignItems: "center",
  },
  monthStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: GlowColors.primary,
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
    color: "#000",
  },
  votedButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(200, 255, 61, 0.08)",
    borderRadius: BorderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
  },
  votedText: {
    fontSize: 13,
    fontWeight: "700",
    color: GlowColors.primary,
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
});
