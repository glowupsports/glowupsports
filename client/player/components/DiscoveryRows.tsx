import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { 
  FadeInRight, 
  FadeIn, 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withSequence, 
  withTiming,
  withSpring,
  cancelAnimation 
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ProTennisColors, Spacing, BorderRadius, getPlayerLevelColor, Backgrounds, GlowColors, Colors } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { GlowAvatar } from "./GlowAvatar";
import { NeonEdgeCard } from "./GlassCard";
import { getStaticAssetsUrl } from "@/lib/query-client";
import { formatSessionDateShort } from "@/lib/dateUtils";

// Helper to get color for ball level
function getBallLevelColor(level: string): string {
  const levelLower = level.toLowerCase();
  if (levelLower.includes("blue")) return "#3B82F6";
  if (levelLower.includes("red")) return "#EF4444";
  if (levelLower.includes("orange")) return "#F97316";
  if (levelLower.includes("green")) return "#22C55E";
  if (levelLower.includes("yellow")) return "#EAB308";
  if (levelLower.includes("glow")) return "#E040FB";
  return ProTennisColors.electricGreen;
}

interface SectionHeaderProps {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  accentColor?: string;
}

function SectionHeader({ title, count, actionLabel, onAction, accentColor = ProTennisColors.neonCyan }: SectionHeaderProps) {
  const glowValue = useSharedValue(0.4);
  
  useEffect(() => {
    glowValue.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1500 }),
        withTiming(0.4, { duration: 1500 })
      ),
      -1,
      true
    );
    return () => cancelAnimation(glowValue);
  }, [glowValue]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowValue.value,
  }));

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.sectionTitle, { textShadowColor: accentColor, textShadowRadius: 4 }]}>{title}</Text>
        {count !== undefined && count > 0 && (
          <Animated.View style={[
            styles.countChipGaming, 
            { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40`, shadowColor: accentColor }, 
            glowStyle
          ]}>
            <Text style={[styles.countChipTextGaming, { color: accentColor }]}>{count}</Text>
          </Animated.View>
        )}
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={styles.seeAllButtonGaming}>
          <Text style={[styles.seeAllTextGaming, { color: accentColor }]}>{actionLabel}</Text>
          <Feather name="chevron-right" size={14} color={accentColor} />
        </Pressable>
      )}
    </View>
  );
}

export function PlayersNearYouRow() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const nearbyPlayers = state.nearbyPlayers ?? [];
  const availablePlayers = nearbyPlayers.filter(p => p.status === "available" || p.status === "online");

  const handlePlayerPress = (playerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerProfile", { playerId });
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerFinder");
  };

  const getAvatarSource = (player: typeof state.nearbyPlayers[0]) => {
    if (player.profilePhotoUrl) {
      return `${getStaticAssetsUrl()}${player.profilePhotoUrl}`;
    }
    return null;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "available": return "Available";
      case "playing": return "On Court";
      case "online": return "Online";
      default: return "";
    }
  };

  if (availablePlayers.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Players Near You"
        count={availablePlayers.length}
        actionLabel="Find More"
        onAction={handleSeeAll}
        accentColor={ProTennisColors.neonCyan}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowScrollContent}
      >
        {availablePlayers.slice(0, 8).map((player, index) => {
          const levelColor = getPlayerLevelColor(player.level);
          return (
            <Animated.View 
              key={player.id}
              entering={FadeInRight.delay(index * 60).duration(300)}
            >
              <Pressable onPress={() => handlePlayerPress(player.id)}>
                <View style={styles.playerCard}>
                  <GlowAvatar
                    source={getAvatarSource(player)}
                    name={player.name}
                    size="lg"
                    ballLevel={player.level}
                    showGlow={true}
                    glowIntensity="medium"
                    status={player.status as any}
                    pulsing={false}
                  />
                  <Text style={styles.playerName} numberOfLines={1}>{player.name.split(" ")[0]}</Text>
                  <View style={[styles.levelBadge, { backgroundColor: `${levelColor}30` }]}>
                    <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                    <Text style={[styles.levelText, { color: levelColor }]}>{player.level}</Text>
                  </View>
                  {player.status === "available" && (
                    <View style={styles.statusChip}>
                      <View style={[styles.statusDot, { backgroundColor: ProTennisColors.success }]} />
                      <Text style={styles.statusText}>{getStatusLabel(player.status)}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

        {availablePlayers.length > 8 && (
          <Animated.View entering={FadeInRight.delay(8 * 60).duration(300)}>
            <Pressable onPress={handleSeeAll}>
              <View style={[styles.playerCard, styles.moreCard]}>
                <View style={styles.moreCircle}>
                  <Text style={styles.moreNumber}>+{availablePlayers.length - 8}</Text>
                </View>
                <Text style={styles.moreLabel}>See All</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// Helper to format date nicely
function formatSessionDate(dateStr?: string): string {
  if (!dateStr) return "Today";
  // Use Dubai timezone for consistent display
  return formatSessionDateShort(dateStr, "Asia/Dubai");
}

// Group Lessons Row - Liga-style bigger cards for coaching sessions
export function GroupLessonsRow() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  // Get player's ball level from state
  const playerBallLevel = state.player?.ballLevel?.toLowerCase() || "glow";

  // Filter for group sessions that match player's ball level
  const allGroupLessons = (state.openSessions ?? []).filter(s => s.type === "group");
  const groupLessons = allGroupLessons.filter(s => {
    const sessionLevel = s.ballLevel?.toLowerCase() || "";
    return sessionLevel.includes(playerBallLevel) || playerBallLevel.includes(sessionLevel);
  });

  const handleLessonPress = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerTabs", { screen: "Play" });
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PlayerTabs", { screen: "Play" });
  };

  const ballLevelLabel = playerBallLevel.charAt(0).toUpperCase() + playerBallLevel.slice(1);
  const ballLevelColor = getBallLevelColor(playerBallLevel);

  if (groupLessons.length === 0) {
    return (
      <View style={styles.section}>
        <SectionHeader
          title={`${ballLevelLabel} Lessons`}
          actionLabel="View All"
          onAction={handleSeeAll}
          accentColor={ballLevelColor}
        />
        <View style={styles.emptyRow}>
          <Feather name="users" size={24} color={ProTennisColors.textMuted} />
          <Text style={styles.emptyText}>No {ballLevelLabel} lessons available</Text>
          <Pressable style={styles.emptyButton} onPress={handleSeeAll}>
            <Text style={styles.emptyButtonText}>Browse All Lessons</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title={`${ballLevelLabel} Lessons`}
        count={groupLessons.length}
        actionLabel="View All"
        onAction={handleSeeAll}
        accentColor={ballLevelColor}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowScrollContent}
      >
        {groupLessons.slice(0, 6).map((session, index) => {
          const levelColor = session.ballLevel ? getBallLevelColor(session.ballLevel) : ProTennisColors.electricGreen;
          const currentPlayers = (session.maxPlayers || 6) - session.spotsLeft;
          
          return (
            <Animated.View 
              key={session.id}
              entering={FadeInRight.delay(index * 80).duration(350)}
            >
              <Pressable onPress={() => handleLessonPress(session.id)}>
                <View style={styles.ligaCard}>
                  {/* Top section with ball level accent */}
                  <View style={[styles.ligaCardHeader, { borderLeftColor: levelColor }]}>
                    <Text style={[styles.ligaTitle, { color: levelColor }]} numberOfLines={2}>
                      {session.coachName ? `${session.coachName}'s Session` : "Group Session"}
                    </Text>
                    <Text style={styles.ligaSubtitle}>
                      {session.ballLevel || "All Levels"} • Tennis
                    </Text>
                  </View>

                  {/* Date and Time */}
                  <View style={styles.ligaDateTimeRow}>
                    <Text style={[styles.ligaDateTime, { color: levelColor }]}>
                      {formatSessionDate((session as any).date)}
                    </Text>
                    <Text style={[styles.ligaDateTime, { color: levelColor }]}>
                      {session.time || "TBD"}
                    </Text>
                  </View>

                  {/* Participant count with avatars */}
                  <View style={styles.ligaParticipantsRow}>
                    <Feather name="users" size={14} color={levelColor} />
                    <Text style={styles.ligaParticipantText}>
                      {currentPlayers} going • {session.maxPlayers || 6} limit
                    </Text>
                  </View>

                  {/* Avatar stack */}
                  {session.participants && session.participants.length > 0 && (
                    <View style={styles.ligaAvatarRow}>
                      {session.participants.slice(0, 4).map((p, i) => (
                        <View key={p.id} style={[styles.ligaAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i }]}>
                          <GlowAvatar
                            source={p.profilePhotoUrl ? `${getStaticAssetsUrl()}${p.profilePhotoUrl}` : null}
                            name={p.name}
                            size="sm"
                            showGlow={false}
                          />
                        </View>
                      ))}
                      {session.participants.length > 4 && (
                        <View style={[styles.ligaAvatarMore, { marginLeft: -10 }]}>
                          <Text style={styles.ligaAvatarMoreText}>+{session.participants.length - 4}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Sign Up Button */}
                  <Pressable 
                    style={[styles.ligaSignUpButton, { borderColor: levelColor }]}
                    onPress={() => handleLessonPress(session.id)}
                  >
                    <Feather name="edit-2" size={14} color={levelColor} />
                    <Text style={[styles.ligaSignUpText, { color: levelColor }]}>Sign up</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Open Matches Row - for finding players to play with (not coaching)
export function OpenMatchesRow() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  // Filter for open matches only (player vs player)
  const openMatches = (state.openSessions ?? []).filter(s => s.type === "open_match");

  const handleMatchPress = (matchId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("OpenMatches", { selectedMatch: matchId });
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("OpenMatches");
  };

  if (openMatches.length === 0) {
    return (
      <View style={styles.section}>
        <SectionHeader
          title="Open Matches"
          actionLabel="Find Players"
          onAction={handleSeeAll}
          accentColor={ProTennisColors.neonCyan}
        />
        <View style={styles.emptyRow}>
          <Feather name="target" size={24} color={ProTennisColors.textMuted} />
          <Text style={styles.emptyText}>No open matches right now</Text>
          <Pressable style={styles.emptyButton} onPress={handleSeeAll}>
            <Text style={styles.emptyButtonText}>Create a Match</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Open Matches"
        count={openMatches.length}
        actionLabel="See All"
        onAction={handleSeeAll}
        accentColor={ProTennisColors.neonCyan}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowScrollContent}
      >
        {openMatches.slice(0, 6).map((match, index) => {
          const currentPlayers = (match.maxPlayers || 4) - match.spotsLeft;
          
          return (
            <Animated.View 
              key={match.id}
              entering={FadeInRight.delay(index * 60).duration(300)}
            >
              <Pressable onPress={() => handleMatchPress(match.id)}>
                <NeonEdgeCard 
                  color={ProTennisColors.neonCyan} 
                  glowIntensity="medium" 
                  style={styles.matchCard}
                >
                  <View style={styles.matchCardContent}>
                    <View style={styles.matchHeader}>
                      <View style={styles.matchTypeIcon}>
                        <Feather name="target" size={20} color={ProTennisColors.neonCyan} />
                      </View>
                      <View style={styles.matchTypeBadge}>
                        <Text style={styles.matchTypeText}>
                          {(match.maxPlayers || 4) === 2 ? "Singles" : "Doubles"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.matchTime}>{match.time}</Text>
                    <Text style={styles.matchLabel}>Looking for players</Text>

                    {/* Players joined */}
                    <View style={styles.matchPlayersRow}>
                      {match.participants && match.participants.length > 0 ? (
                        <View style={styles.avatarStack}>
                          {match.participants.slice(0, 3).map((p, i) => (
                            <View key={p.id} style={[styles.miniAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]}>
                              <GlowAvatar
                                source={p.profilePhotoUrl ? `${getStaticAssetsUrl()}${p.profilePhotoUrl}` : null}
                                name={p.name}
                                size="xs"
                                showGlow={false}
                              />
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <Text style={styles.matchSpotsText}>
                        {currentPlayers}/{match.maxPlayers || 4} players
                      </Text>
                    </View>

                    <Pressable 
                      style={styles.matchJoinButton}
                      onPress={() => handleMatchPress(match.id)}
                    >
                      <Text style={styles.matchJoinText}>Join Match</Text>
                      <Feather name="arrow-right" size={14} color={ProTennisColors.midnightBlue} />
                    </Pressable>
                  </View>
                </NeonEdgeCard>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Keep OpenSessionsRow as alias for backward compatibility - now combines both
export function OpenSessionsRow() {
  return (
    <>
      <GroupLessonsRow />
      <OpenMatchesRow />
    </>
  );
}

export function TrainingSessionsRow() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const availability = state.availability ?? { groupSessions: 0, privateLessons: 0, courtsAvailable: 0 };

  const handleBookPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("LessonBooking");
  };

  const handleCourtPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CourtBooking");
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Book & Train"
        accentColor={ProTennisColors.warning}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowScrollContent}
      >
        <Animated.View entering={FadeInRight.delay(0).duration(300)}>
          <Pressable onPress={handleBookPress}>
            <NeonEdgeCard color={ProTennisColors.warning} glowIntensity="low" style={styles.trainingCard}>
              <LinearGradient
                colors={["rgba(255, 193, 7, 0.15)", "rgba(0, 0, 0, 0)"]}
                style={styles.trainingGradient}
              />
              <View style={styles.trainingContent}>
                <View style={styles.trainingIconWrap}>
                  <Feather name="calendar" size={24} color={ProTennisColors.warning} />
                </View>
                <Text style={styles.trainingTitle}>Group Lessons</Text>
                <Text style={styles.trainingSubtitle}>
                  {availability.groupSessions} available
                </Text>
                <View style={styles.trainingChips}>
                  <View style={styles.trainingChip}>
                    <Text style={styles.trainingChipText}>This week</Text>
                  </View>
                </View>
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(60).duration(300)}>
          <Pressable onPress={handleBookPress}>
            <NeonEdgeCard color="#9C27B0" glowIntensity="low" style={styles.trainingCard}>
              <LinearGradient
                colors={["rgba(156, 39, 176, 0.15)", "rgba(0, 0, 0, 0)"]}
                style={styles.trainingGradient}
              />
              <View style={styles.trainingContent}>
                <View style={styles.trainingIconWrap}>
                  <Feather name="user" size={24} color="#9C27B0" />
                </View>
                <Text style={styles.trainingTitle}>Private Lessons</Text>
                <Text style={styles.trainingSubtitle}>
                  {availability.privateLessons} available
                </Text>
                <View style={styles.trainingChips}>
                  <View style={[styles.trainingChip, { backgroundColor: "rgba(156, 39, 176, 0.2)" }]}>
                    <Text style={[styles.trainingChipText, { color: "#9C27B0" }]}>Book now</Text>
                  </View>
                </View>
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(120).duration(300)}>
          <Pressable onPress={handleCourtPress}>
            <NeonEdgeCard color={ProTennisColors.neonCyan} glowIntensity="low" style={styles.trainingCard}>
              <LinearGradient
                colors={["rgba(0, 255, 255, 0.15)", "rgba(0, 0, 0, 0)"]}
                style={styles.trainingGradient}
              />
              <View style={styles.trainingContent}>
                <View style={styles.trainingIconWrap}>
                  <Feather name="grid" size={24} color={ProTennisColors.neonCyan} />
                </View>
                <Text style={styles.trainingTitle}>Courts</Text>
                <Text style={styles.trainingSubtitle}>
                  {availability.courtsAvailable} free tonight
                </Text>
                <View style={styles.trainingChips}>
                  <View style={[styles.trainingChip, { backgroundColor: "rgba(0, 255, 255, 0.2)" }]}>
                    <Text style={[styles.trainingChipText, { color: ProTennisColors.neonCyan }]}>Reserve</Text>
                  </View>
                </View>
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export function CommunityFeedPreview() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();

  const communityEvents = state.communityEvents ?? [];

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Community");
  };

  const visibleEvents = communityEvents.slice(0, 3);

  if (visibleEvents.length === 0) {
    return null;
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case "new_member": return "user-plus";
      case "new_group": return "users";
      case "tournament": return "award";
      case "challenge": return "zap";
      default: return "message-circle";
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "new_member": return ProTennisColors.neonCyan;
      case "new_group": return ProTennisColors.electricGreen;
      case "tournament": return ProTennisColors.warning;
      case "challenge": return "#FF6B6B";
      default: return ProTennisColors.textMuted;
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Community"
        actionLabel="Open Feed"
        onAction={handlePress}
        accentColor={ProTennisColors.electricGreen}
      />

      <View style={styles.communityCard}>
        {visibleEvents.map((event, index) => (
          <React.Fragment key={event.id}>
            <Pressable onPress={handlePress} style={styles.communityEventItem}>
              <View style={[styles.communityIcon, { backgroundColor: `${getEventColor(event.type)}20` }]}>
                <Feather name={getEventIcon(event.type) as any} size={16} color={getEventColor(event.type)} />
              </View>
              <View style={styles.communityContent}>
                <Text style={styles.communityTitle} numberOfLines={1}>{event.title}</Text>
                <Text style={styles.communityTime}>{event.time}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={ProTennisColors.textMuted} />
            </Pressable>
            {index < visibleEvents.length - 1 && <View style={styles.communityDivider} />}
          </React.Fragment>
        ))}
      </View>

      {communityEvents.length > 3 && (
        <Pressable onPress={handlePress} style={styles.moreEventsButton}>
          <Text style={styles.moreEventsText}>
            +{communityEvents.length - 3} more updates
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.white,
    letterSpacing: 0.5,
  },
  countChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  countChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  countChipGaming: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 4,
  },
  countChipTextGaming: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllButtonGaming: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
  },
  seeAllTextGaming: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rowScrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  playerCard: {
    alignItems: "center",
    gap: Spacing.xs,
    width: 90,
  },
  playerName: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.white,
    textAlign: "center",
    marginTop: 4,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  levelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "600",
    color: ProTennisColors.success,
  },
  moreCard: {
    justifyContent: "center",
    backgroundColor: ProTennisColors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    minHeight: 120,
  },
  moreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ProTennisColors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: ProTennisColors.neonCyan + "40",
  },
  moreNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: ProTennisColors.neonCyan,
  },
  moreLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: ProTennisColors.textMuted,
  },
  sessionCard: {
    width: 160,
    minHeight: 180,
  },
  sessionCardContent: {
    padding: Spacing.md,
    gap: Spacing.xs,
    flex: 1,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(204, 255, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  spotsChip: {
    backgroundColor: "rgba(204, 255, 0, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  spotsText: {
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.electricGreen,
  },
  sessionTime: {
    fontSize: 26,
    fontWeight: "800",
    color: ProTennisColors.white,
    fontVariant: ["tabular-nums"],
    marginTop: Spacing.sm,
  },
  sessionType: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
  },
  sessionCoach: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
  },
  levelChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  levelChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.dark.buttonText,
    letterSpacing: 0.5,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: ProTennisColors.midnightBlue,
    overflow: "hidden",
  },
  spotsCountText: {
    fontSize: 10,
    color: ProTennisColors.textMuted,
    fontWeight: "500",
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: ProTennisColors.electricGreen,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: "auto",
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
  },
  emptyRow: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: ProTennisColors.surfaceCard,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 14,
    color: ProTennisColors.textMuted,
  },
  emptyButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: ProTennisColors.electricGreen + "20",
    borderRadius: BorderRadius.md,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: ProTennisColors.electricGreen,
  },
  // Liga-style Group Lesson Cards
  ligaCard: {
    width: 200,
    minHeight: 220,
    backgroundColor: ProTennisColors.surfaceCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  ligaCardHeader: {
    borderLeftWidth: 4,
    paddingLeft: Spacing.sm,
    gap: 4,
  },
  ligaTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  ligaSubtitle: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
  },
  ligaDateTimeRow: {
    gap: 2,
    marginTop: Spacing.xs,
  },
  ligaDateTime: {
    fontSize: 13,
    fontWeight: "600",
  },
  ligaParticipantsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.xs,
  },
  ligaParticipantText: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    fontWeight: "500",
  },
  ligaAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  ligaAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: ProTennisColors.surfaceCard,
    overflow: "hidden",
  },
  ligaAvatarMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ProTennisColors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: ProTennisColors.surfaceCard,
  },
  ligaAvatarMoreText: {
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.textMuted,
  },
  ligaSignUpButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: "auto",
  },
  ligaSignUpText: {
    fontSize: 13,
    fontWeight: "700",
  },
  // Open Match Cards (cyan theme)
  matchCard: {
    width: 160,
    minHeight: 180,
  },
  matchCardContent: {
    padding: Spacing.md,
    gap: Spacing.xs,
    flex: 1,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matchTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 229, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  matchTypeBadge: {
    backgroundColor: "rgba(0, 229, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  matchTypeText: {
    fontSize: 10,
    fontWeight: "700",
    color: ProTennisColors.neonCyan,
  },
  matchTime: {
    fontSize: 24,
    fontWeight: "800",
    color: ProTennisColors.white,
    fontVariant: ["tabular-nums"],
    marginTop: Spacing.sm,
  },
  matchLabel: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    fontWeight: "500",
  },
  matchPlayersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.xs,
  },
  matchSpotsText: {
    fontSize: 11,
    color: ProTennisColors.textMuted,
    fontWeight: "500",
  },
  matchJoinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: ProTennisColors.neonCyan,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: "auto",
  },
  matchJoinText: {
    fontSize: 12,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
  },
  trainingCard: {
    width: 150,
    minHeight: 160,
    overflow: "hidden",
  },
  trainingGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  trainingContent: {
    padding: Spacing.md,
    gap: Spacing.xs,
    flex: 1,
  },
  trainingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  trainingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  trainingSubtitle: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
  },
  trainingChips: {
    flexDirection: "row",
    marginTop: "auto",
  },
  trainingChip: {
    backgroundColor: "rgba(255, 193, 7, 0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
  },
  trainingChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: ProTennisColors.warning,
  },
  communityCard: {
    backgroundColor: ProTennisColors.surfaceCard,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: ProTennisColors.border,
    overflow: "hidden",
  },
  communityEventItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  communityDivider: {
    height: 1,
    backgroundColor: ProTennisColors.border,
    marginHorizontal: Spacing.md,
  },
  communityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  communityContent: {
    flex: 1,
  },
  communityTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
  },
  communityTime: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    marginTop: 2,
  },
  moreEventsButton: {
    alignSelf: "center",
    marginTop: Spacing.xs,
  },
  moreEventsText: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
  },
});
