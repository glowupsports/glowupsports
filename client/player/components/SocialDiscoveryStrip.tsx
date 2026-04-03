import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInRight, FadeIn } from "react-native-reanimated";
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, GlowColors, FunctionColors, Colors } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { GlowAvatar } from "./GlowAvatar";
import { NeonEdgeCard } from "./GlassCard";
import { buildPhotoUrl } from "@/lib/query-client";

export function SocialDiscoveryStrip() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const availablePlayers = state.nearbyPlayers.filter(p => p.status === "available");
  const topPlayers = availablePlayers.slice(0, 4);

  const handlePlayersPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerFinder");
  };

  const handleChallengePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayStack", { screen: "OpenMatches" });
  };

  const handleSessionsPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("LessonBooking");
  };

  const handleEventsPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Events");
  };

  const getAvatarSource = (player: typeof state.nearbyPlayers[0]) => {
    return buildPhotoUrl(player.profilePhotoUrl) || null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PLAY & MEET</Text>
        <View style={styles.badge}>
          <View style={styles.liveDot} />
          <Text style={styles.badgeText}>LIVE</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View entering={FadeInRight.delay(0).duration(400)}>
          <Pressable onPress={handlePlayersPress}>
            <NeonEdgeCard color={ProTennisColors.neonCyan} glowIntensity="medium" style={styles.playersCard}>
              <View style={styles.playersContent}>
                <View style={styles.playersHeader}>
                  <Text style={styles.playersTitle}>Players Near You</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{availablePlayers.length}</Text>
                  </View>
                </View>

                {topPlayers.length > 0 ? (
                  <View style={styles.avatarsRow}>
                    {topPlayers.map((player, index) => {
                      const distLabel = player.driveTimeText
                        ? player.driveTimeText
                        : player.distanceKm != null
                        ? `${player.distanceKm} km`
                        : null;
                      return (
                        <Animated.View
                          key={player.id}
                          entering={FadeIn.delay(100 + index * 50)}
                          style={[styles.avatarWrapper, { marginLeft: index > 0 ? -12 : 0, zIndex: 10 - index }]}
                        >
                          <GlowAvatar
                            source={getAvatarSource(player)}
                            name={player.name}
                            size="sm"
                            ballLevel={player.level}
                            showGlow={index === 0}
                            glowIntensity="low"
                            status={player.status}
                          />
                          {distLabel ? (
                            <Text style={styles.distanceLabel}>{distLabel}</Text>
                          ) : null}
                        </Animated.View>
                      );
                    })}
                    {availablePlayers.length > 4 && (
                      <View style={styles.moreCount}>
                        <Text style={styles.moreCountText}>+{availablePlayers.length - 4}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noPlayersText}>Check back soon</Text>
                )}

                {topPlayers[0] && (
                  <View style={styles.topPlayerInfo}>
                    <Text style={styles.topPlayerName}>{topPlayers[0].name}</Text>
                    <View style={styles.levelPill}>
                      <Text style={styles.levelPillText}>{topPlayers[0].level}</Text>
                    </View>
                  </View>
                )}
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(80).duration(400)}>
          <Pressable onPress={handleChallengePress}>
            <NeonEdgeCard color={FunctionColors.error} glowIntensity="medium" style={styles.actionCard}>
              <View style={styles.actionContent}>
                <View style={[styles.actionIcon, { borderColor: FunctionColors.error + "40" }]}>
                  <Feather name="zap" size={22} color={FunctionColors.error} />
                </View>
                <Text style={styles.actionTitle}>Challenge</Text>
                <Text style={styles.actionSubtitle}>1v1 Match</Text>
                <View style={styles.actionArrow}>
                  <Feather name="arrow-right" size={14} color={FunctionColors.error} />
                </View>
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(160).duration(400)}>
          <Pressable onPress={handleSessionsPress}>
            <NeonEdgeCard color={GlowColors.primary} glowIntensity="medium" style={styles.sessionCard}>
              <View style={styles.sessionContent}>
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionTitle}>Open Sessions</Text>
                  <View style={[styles.countBadge, { backgroundColor: `${GlowColors.primary}30` }]}>
                    <Text style={[styles.countText, { color: GlowColors.primary }]}>
                      {state.openSessions.length}
                    </Text>
                  </View>
                </View>

                {state.openSessions[0] ? (
                  <View style={styles.nextSession}>
                    <Text style={styles.sessionTime}>{state.openSessions[0].time}</Text>
                    <Text style={styles.sessionSpots}>
                      {state.openSessions[0].spotsLeft} spots left
                    </Text>
                    {state.openSessions[0].coachName && (
                      <Text style={styles.sessionCoach}>
                        with {state.openSessions[0].coachName}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noSessionsText}>No sessions today</Text>
                )}
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(240).duration(400)}>
          <Pressable onPress={handleEventsPress}>
            <NeonEdgeCard color={FunctionColors.social} glowIntensity="low" style={styles.actionCard}>
              <View style={styles.actionContent}>
                <View style={[styles.actionIcon, { borderColor: FunctionColors.social + "40" }]}>
                  <Feather name="award" size={22} color={FunctionColors.social} />
                </View>
                <Text style={styles.actionTitle}>Events</Text>
                <Text style={styles.actionSubtitle}>Tournaments</Text>
                <View style={styles.actionArrow}>
                  <Feather name="arrow-right" size={14} color={FunctionColors.social} />
                </View>
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
    letterSpacing: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GlowColors.primary + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GlowColors.primary,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: GlowColors.primary,
    letterSpacing: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  playersCard: {
    width: 180,
    minHeight: 140,
  },
  playersContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  playersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playersTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  countBadge: {
    backgroundColor: `${ProTennisColors.neonCyan}30`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.neonCyan,
  },
  avatarsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: Spacing.sm,
  },
  avatarWrapper: {
    alignItems: "center",
  },
  distanceLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: ProTennisColors.neonCyan,
    marginTop: 2,
    textAlign: "center",
  },
  moreCount: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ProTennisColors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
    borderWidth: 2,
    borderColor: ProTennisColors.surfaceDark,
  },
  moreCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
  },
  noPlayersText: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    marginVertical: Spacing.md,
  },
  topPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  topPlayerName: {
    fontSize: 12,
    fontWeight: "500",
    color: ProTennisColors.textSecondary,
  },
  levelPill: {
    backgroundColor: `${ProTennisColors.neonCyan}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: BorderRadius.xs,
  },
  levelPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: ProTennisColors.neonCyan,
    textTransform: "capitalize",
  },
  actionCard: {
    width: 120,
    minHeight: 140,
  },
  actionContent: {
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Backgrounds.card + "4D",
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
    textAlign: "center",
  },
  actionSubtitle: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
    textAlign: "center",
  },
  actionArrow: {
    position: "absolute",
    bottom: Spacing.md,
    right: Spacing.md,
  },
  sessionCard: {
    width: 160,
    minHeight: 140,
  },
  sessionContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  nextSession: {
    marginTop: Spacing.sm,
  },
  sessionTime: {
    fontSize: 22,
    fontWeight: "700",
    color: GlowColors.primary,
    fontVariant: ["tabular-nums"],
  },
  sessionSpots: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    marginTop: 2,
  },
  sessionCoach: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
    marginTop: 2,
  },
  noSessionsText: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    marginTop: Spacing.md,
  },
});
