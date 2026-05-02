import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Spacing, Colors, BorderRadius, GlowColors, TextColors } from "@/constants/theme";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { makeReactiveStyles, useThemeReactivity } from "@/hooks/useThemedStyles";
import { AWARD_GOLD, AWARD_GOLD_WARM } from "@/player/theme/categoryAccent";

interface SpotlightNomineeMini {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
  totalVotes: number;
}

interface SpotlightCurrentWeekMini {
  weekStart: string;
  nominations: SpotlightNomineeMini[];
  myNomination: { nominatedPlayerId: string; reason: string } | null;
  daysRemaining: number;
  totalVotes: number;
}

interface SpotlightWeeklyWinnerMini {
  playerId: string;
  playerName: string;
  profilePhotoUrl: string | null;
}

interface PlayerOfTheWeekCardProps {
  currentWeek: SpotlightCurrentWeekMini | null;
  weeklyWinner: { winner: SpotlightWeeklyWinnerMini | null };
  onNominate: () => void;
  onViewDetails: () => void;
}

function LargeAvatar({
  photoUrl,
  size = 88,
}: {
  photoUrl?: string | null;
  size?: number;
}) {
  const baseUrl = getStaticAssetsUrl();
  const fullUrl = photoUrl
    ? photoUrl.startsWith("http")
      ? photoUrl
      : `${baseUrl}${photoUrl}`
    : null;

  return (
    <View style={[avatarStyles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }]}>
      <LinearGradient
        colors={[AWARD_GOLD, AWARD_GOLD_WARM, "#FFC200"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[avatarStyles.ringGradient, { borderRadius: (size + 8) / 2 }]}
      >
        <View
          style={[
            avatarStyles.avatarWrap,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        >
          {fullUrl ? (
            <Image
              source={{ uri: fullUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <View style={avatarStyles.avatarFallback}>
              <Ionicons name="person" size={size * 0.42} color={Colors.dark.textMuted} />
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  ring: {
    padding: 3,
  },
  ringGradient: {
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.chipBackground,
  },
});

export function PlayerOfTheWeekCard({
  currentWeek,
  weeklyWinner,
  onNominate,
  onViewDetails,
}: PlayerOfTheWeekCardProps) {
  useThemeReactivity();

  const hasVoted = !!currentWeek?.myNomination;
  const topNominee = currentWeek?.nominations?.[0] ?? null;
  const lastWinner = weeklyWinner?.winner ?? null;
  const daysRemaining = currentWeek?.daysRemaining;

  const chipText =
    daysRemaining === undefined
      ? null
      : daysRemaining <= 0
      ? "Ends today"
      : `${daysRemaining}d left`;

  const stateA = !!topNominee && !hasVoted;
  const stateB = hasVoted;
  const stateC = !stateA && !stateB;

  const featuredPlayer: { profilePhotoUrl: string | null; playerName: string; totalVotes?: number } | null =
    stateA && topNominee
      ? topNominee
      : stateB && topNominee
      ? topNominee
      : stateC && lastWinner
      ? lastWinner
      : null;

  const badgeLabel = stateB
    ? "You voted this week"
    : stateC && lastWinner
    ? "Last week's winner"
    : stateA && topNominee
    ? `${topNominee.totalVotes} vote${topNominee.totalVotes !== 1 ? "s" : ""}`
    : null;

  const ctaLabel = stateA ? "Vote" : stateB ? "View Results" : stateC && !lastWinner ? "Nominate" : "View";

  const handleCTA = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (stateA || (stateC && !lastWinner)) {
      onNominate();
    } else {
      onViewDetails();
    }
  };

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(550)} style={s.outerWrap}>
      <LinearGradient
        colors={["rgba(255,215,0,0.22)", "rgba(255,160,0,0.08)", "rgba(0,0,0,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.gradientBorder}
      >
        <View style={s.card}>
          <View style={s.topBar}>
            <View style={s.topBarLeft}>
              <View style={s.trophyBadge}>
                <Ionicons name="trophy" size={13} color={AWARD_GOLD} />
              </View>
              <View>
                <Text style={s.sectionLabel}>PLAYER OF THE WEEK</Text>
                <Text style={s.sectionSub}>Spotlight</Text>
              </View>
            </View>
            {chipText ? (
              <View style={s.daysChip}>
                <Ionicons name="time-outline" size={11} color={AWARD_GOLD} />
                <Text style={s.daysChipText}>{chipText}</Text>
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={onViewDetails}
            style={({ pressed }) => [s.heroSection, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View spotlight details"
          >
            <View style={s.avatarArea}>
              <LargeAvatar photoUrl={featuredPlayer?.profilePhotoUrl} size={88} />
              <View style={s.trophyOverlay}>
                <Ionicons name="ribbon" size={18} color={AWARD_GOLD} />
              </View>
            </View>

            <View style={s.heroInfo}>
              {featuredPlayer ? (
                <>
                  <Text style={s.playerName} numberOfLines={1}>
                    {featuredPlayer.playerName}
                  </Text>
                  {badgeLabel ? (
                    <View style={s.badgePill}>
                      <Ionicons name="star" size={10} color={AWARD_GOLD} />
                      <Text style={s.badgeText} numberOfLines={1}>
                        {badgeLabel}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={s.emptyName}>Be the first</Text>
                  <Text style={s.emptySub}>No nominations yet this week</Text>
                </>
              )}
            </View>
          </Pressable>

          <View style={s.ctaRow}>
            {stateB ? (
              <Pressable
                onPress={handleCTA}
                style={s.ghostCTA}
                accessibilityRole="button"
                accessibilityLabel="View results"
              >
                <Ionicons name="checkmark-circle" size={16} color={GlowColors.primary} />
                <Text style={s.ghostCTAText}>View Results</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
              </Pressable>
            ) : (
              <Pressable
                onPress={handleCTA}
                style={s.primaryCTA}
                accessibilityRole="button"
                accessibilityLabel={ctaLabel}
              >
                <LinearGradient
                  colors={[AWARD_GOLD, AWARD_GOLD_WARM]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.primaryCTAGradient}
                >
                  <Ionicons name={stateA ? "star" : "podium"} size={15} color="#000" />
                  <Text style={s.primaryCTAText}>{ctaLabel}</Text>
                </LinearGradient>
              </Pressable>
            )}
            <Pressable
              onPress={onViewDetails}
              style={s.leaderboardBtn}
              accessibilityRole="button"
              accessibilityLabel="View leaderboard"
            >
              <Ionicons name="podium-outline" size={18} color={AWARD_GOLD} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const s = makeReactiveStyles(() =>
  StyleSheet.create({
    outerWrap: {
      marginHorizontal: Spacing.lg,
      borderRadius: BorderRadius.lg + 2,
      overflow: "hidden",
    },
    gradientBorder: {
      padding: 1.5,
      borderRadius: BorderRadius.lg + 2,
    },
    card: {
      backgroundColor: Colors.dark.backgroundDefault,
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
      padding: Spacing.md,
      gap: Spacing.md,
    },
    pressed: {
      opacity: 0.82,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topBarLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    trophyBadge: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: "rgba(255,215,0,0.14)",
      alignItems: "center",
      justifyContent: "center",
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "800",
      color: AWARD_GOLD,
      letterSpacing: 1.8,
    },
    sectionSub: {
      fontSize: 11,
      fontWeight: "500",
      color: TextColors.secondary,
      marginTop: 1,
    },
    daysChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255,215,0,0.12)",
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,215,0,0.28)",
    },
    daysChipText: {
      fontSize: 11,
      fontWeight: "700",
      color: AWARD_GOLD,
    },
    heroSection: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    avatarArea: {
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    trophyOverlay: {
      position: "absolute",
      bottom: -2,
      right: -2,
      backgroundColor: Colors.dark.backgroundDefault,
      borderRadius: 12,
      padding: 3,
      borderWidth: 1.5,
      borderColor: "rgba(255,215,0,0.35)",
    },
    heroInfo: {
      flex: 1,
      gap: Spacing.xs,
      minWidth: 0,
    },
    playerName: {
      fontSize: 22,
      fontWeight: "800",
      color: TextColors.primary,
      letterSpacing: -0.3,
    },
    badgePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      backgroundColor: "rgba(255,215,0,0.12)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: "rgba(255,215,0,0.25)",
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: AWARD_GOLD,
    },
    emptyName: {
      fontSize: 18,
      fontWeight: "700",
      color: TextColors.muted,
    },
    emptySub: {
      fontSize: 12,
      color: TextColors.muted,
      fontStyle: "italic",
    },
    ctaRow: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    primaryCTA: {
      flex: 1,
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
    },
    primaryCTAGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: BorderRadius.lg,
    },
    primaryCTAText: {
      fontSize: 14,
      fontWeight: "800",
      color: "#000",
    },
    ghostCTA: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      backgroundColor: Colors.dark.accentTextSoft,
      borderRadius: BorderRadius.lg,
      paddingVertical: 12,
      paddingHorizontal: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.dark.accentTextBorder,
    },
    ghostCTAText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
      color: Colors.dark.accentText,
    },
    leaderboardBtn: {
      width: 46,
      height: 46,
      borderRadius: BorderRadius.lg,
      backgroundColor: "rgba(255,215,0,0.10)",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,215,0,0.22)",
    },
  })
);
