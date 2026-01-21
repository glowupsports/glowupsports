import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Platform, Image as RNImage } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Feather } from "@expo/vector-icons";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { GlowAvatar } from "./GlowAvatar";
import { NeonEdgeCard } from "./GlassCard";
import { getStaticAssetsUrl, apiRequest } from "@/lib/query-client";
import { formatSessionDateShort, formatSessionTimeWithRelativeDay } from "@/lib/dateUtils";

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

  // Get player's ball level
  const playerBallLevel = state.player?.ballLevel?.toLowerCase() || "glow";

  const nearbyPlayers = state.nearbyPlayers ?? [];
  // Filter by availability AND same ball level
  const availablePlayers = nearbyPlayers.filter(p => {
    const isAvailable = p.status === "available" || p.status === "online";
    const playerLevel = p.level?.toLowerCase() || "";
    const matchesBallLevel = playerLevel.includes(playerBallLevel) || playerBallLevel.includes(playerLevel) || playerLevel === playerBallLevel;
    return isAvailable && matchesBallLevel;
  });

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

// Helper to format time with Dubai timezone
function formatSessionTime(dateStr?: string): string {
  if (!dateStr) return "Today";
  return formatSessionTimeWithRelativeDay(dateStr, "Asia/Dubai");
}

// Helper to get countdown text
function getCountdownText(startTime: string): { text: string; urgent: boolean } {
  const sessionDate = new Date(startTime);
  const now = new Date();
  const diff = sessionDate.getTime() - now.getTime();
  
  if (diff <= 0) return { text: "Starting Now", urgent: true };
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { text: `${days}d ${hours % 24}h left`, urgent: false };
  }
  if (hours > 0) {
    return { text: `${hours}h ${minutes}m left`, urgent: hours < 2 };
  }
  if (minutes > 0) {
    return { text: `${minutes}m left`, urgent: minutes < 30 };
  }
  return { text: "Soon", urgent: true };
}

// Group Lessons Row - Play screen style cards for coaching sessions
export function GroupLessonsRow() {
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null);

  // Get player's ball level from state
  const playerBallLevel = state.player?.ballLevel?.toLowerCase() || "glow";

  // Filter for group sessions that match player's ball level
  const allGroupLessons = (state.openSessions ?? []).filter(s => s.type === "group");
  const groupLessons = allGroupLessons.filter(s => {
    const sessionLevel = s.ballLevel?.toLowerCase() || "";
    return sessionLevel.includes(playerBallLevel) || playerBallLevel.includes(sessionLevel);
  });

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/join`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Joined!", data.message || "You're in the session!");
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/play/sessions"] });
    },
    onError: (error: Error) => {
      Alert.alert("Oops", error.message || "Could not join session");
    },
    onSettled: () => setJoiningSessionId(null),
  });

  const leaveSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/leave`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Left Session", data.message || "You've left the session");
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/play/sessions"] });
    },
    onError: (error: Error) => {
      Alert.alert("Oops", error.message || "Could not leave session");
    },
    onSettled: () => setJoiningSessionId(null),
  });

  const handleJoinSession = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningSessionId(sessionId);
    joinSessionMutation.mutate(sessionId);
  };

  const handleLeaveSession = (sessionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoiningSessionId(sessionId);
    leaveSessionMutation.mutate(sessionId);
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

      <View style={styles.fullWidthLessonsContainer}>
        {groupLessons.slice(0, 3).map((session, index) => {
          const levelColor = session.ballLevel ? getBallLevelColor(session.ballLevel) : ProTennisColors.electricGreen;
          const currentPlayers = (session.maxPlayers || 6) - session.spotsLeft;
          const isFull = session.spotsLeft === 0;
          const isJoining = joiningSessionId === session.id;
          const countdown = getCountdownText((session as any).date || (session as any).startTime || new Date().toISOString());
          const spotsLeft = session.spotsLeft;
          const isEnrolled = (session as any).isEnrolled || false;
          
          const getStatusBadge = () => {
            if (spotsLeft === 0) return { text: "Full", color: "#EF4444", bgColor: "#EF444440" };
            if (spotsLeft === 1) return { text: "1 Almost Full", color: "#F97316", bgColor: "#F9731640" };
            return { text: `${spotsLeft} Open`, color: Colors.dark.primary, bgColor: Colors.dark.primary + "40" };
          };
          const statusBadge = getStatusBadge();
          
          return (
            <Animated.View 
              key={session.id}
              entering={FadeInRight.delay(index * 80).duration(350)}
            >
              <View style={[styles.playStyleCard, { borderColor: levelColor + "60", shadowColor: levelColor }]}>
                <LinearGradient
                  colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0.85)"]}
                  style={styles.playStyleCardGradient}
                >
                  {/* Header with title and ball level */}
                  <View style={styles.playCardHeader}>
                    <Text style={styles.playCardTitle} numberOfLines={1}>
                      {session.coachName ? `${session.coachName}'s Session` : "Group Training"}
                    </Text>
                    <Text style={[styles.playCardBallLevel, { color: levelColor }]}>
                      {(session.ballLevel || "ALL").toUpperCase()}
                    </Text>
                    <View style={styles.playCardLocationRow}>
                      <Ionicons name="location" size={12} color={Colors.dark.primary} />
                      <Text style={styles.playCardLocationText}>Location TBD</Text>
                    </View>
                    <View style={styles.playCardMetaRow}>
                      <Ionicons name="time-outline" size={12} color={Colors.dark.textMuted} />
                      <Text style={styles.playCardMetaText}>{formatSessionTime((session as any).date || (session as any).startTime)}</Text>
                      <Text style={styles.playCardMetaDot}>·</Text>
                      <Text style={styles.playCardMetaText}>All Levels</Text>
                      <Text style={styles.playCardMetaDot}>·</Text>
                      <Text style={styles.playCardMetaText}>Competitive</Text>
                    </View>
                  </View>

                  {/* XP and Countdown badges */}
                  <View style={styles.playCardBadgesRow}>
                    <View style={styles.playCardXpBadge}>
                      <Ionicons name="flame" size={14} color="#F97316" />
                      <Text style={styles.playCardXpText}>+{(session as any).xpReward || 25} XP</Text>
                    </View>
                    <View style={[styles.playCardCountdownBadge, countdown.urgent && styles.playCardCountdownUrgent]}>
                      <Ionicons 
                        name="timer-outline" 
                        size={12} 
                        color={countdown.urgent ? "#EF4444" : "#00CED1"} 
                      />
                      <Text style={[styles.playCardCountdownText, countdown.urgent && { color: "#EF4444" }]}>
                        {countdown.text}
                      </Text>
                    </View>
                  </View>

                  {/* Status badge and Join/Cancel button */}
                  <View style={styles.playCardActionsRow}>
                    <View style={[styles.playCardStatusBadge, { backgroundColor: statusBadge.bgColor }]}>
                      <Text style={[styles.playCardStatusText, { color: statusBadge.color }]}>{statusBadge.text}</Text>
                    </View>
                    {isEnrolled ? (
                      <Pressable 
                        style={[styles.playCardCancelButton, isJoining && styles.buttonDisabled]}
                        onPress={() => !isJoining && handleLeaveSession(session.id)}
                      >
                        {isJoining ? (
                          <ActivityIndicator size="small" color="#FF6B6B" />
                        ) : (
                          <>
                            <Ionicons name="close-circle-outline" size={16} color="#FF6B6B" />
                            <Text style={styles.playCardCancelText}>Cancel</Text>
                          </>
                        )}
                      </Pressable>
                    ) : !isFull ? (
                      <Pressable 
                        style={[styles.playCardJoinButton, isJoining && styles.buttonDisabled]}
                        onPress={() => !isJoining && handleJoinSession(session.id)}
                      >
                        {isJoining ? (
                          <ActivityIndicator size="small" color="#0B0D10" />
                        ) : (
                          <>
                            <Ionicons name="enter-outline" size={16} color="#0B0D10" />
                            <Text style={styles.playCardJoinText}>Join Session</Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable style={styles.playCardWaitlistButton}>
                        <Text style={styles.playCardWaitlistText}>Join Waitlist</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Credit cost */}
                  <View style={styles.playCardCreditRow}>
                    <Ionicons name="ticket-outline" size={12} color={Colors.dark.textMuted} />
                    <Text style={styles.playCardCreditText}>1 Group Credit</Text>
                  </View>

                  {/* Participants avatars */}
                  {session.participants && session.participants.length > 0 && (
                    <View style={styles.playCardParticipantsRow}>
                      <View style={styles.playCardAvatarStack}>
                        {session.participants.slice(0, 6).map((p, i) => (
                          <View key={p.id} style={[styles.playCardAvatar, { marginLeft: i > 0 ? -12 : 0, zIndex: 6 - i }]}>
                            {p.profilePhotoUrl ? (
                              Platform.OS === 'web' ? (
                                <RNImage 
                                  source={{ uri: `${getStaticAssetsUrl()}${p.profilePhotoUrl}` }} 
                                  style={styles.playCardAvatarImage}
                                  resizeMode="cover"
                                />
                              ) : (
                                <ExpoImage 
                                  source={{ uri: `${getStaticAssetsUrl()}${p.profilePhotoUrl}` }} 
                                  style={styles.playCardAvatarImage}
                                  contentFit="cover"
                                />
                              )
                            ) : (
                              <View style={styles.playCardAvatarPlaceholder}>
                                <Text style={styles.playCardAvatarInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                        ))}
                        {session.participants.length > 6 && (
                          <View style={[styles.playCardAvatarMore, { marginLeft: -12 }]}>
                            <Text style={styles.playCardAvatarMoreText}>+{session.participants.length - 6}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.playCardParticipantNames}>
                        {session.participants.slice(0, 2).map(p => p.name.split(" ")[0]).join(", ")}
                        {session.participants.length > 2 ? ` +${session.participants.length - 2}` : ""}
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              </View>
            </Animated.View>
          );
        })}
      </View>
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
                  <Feather name="calendar" size={18} color={ProTennisColors.warning} />
                </View>
                <Text style={styles.trainingTitle}>Group</Text>
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
                  <Feather name="user" size={18} color="#9C27B0" />
                </View>
                <Text style={styles.trainingTitle}>Private</Text>
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
                  <Feather name="grid" size={18} color={ProTennisColors.neonCyan} />
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
    width: 110,
    minHeight: 130,
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
    padding: Spacing.sm,
    gap: 2,
    flex: 1,
  },
  trainingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  trainingTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  trainingSubtitle: {
    fontSize: 10,
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
  // Full width lessons container
  fullWidthLessonsContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  // Play-style card styles (matching PlayScreen) - FULL WIDTH
  playStyleCard: {
    width: "100%",
    minHeight: 200,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#1A1D24",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  playStyleCardGradient: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  playCardHeader: {
    gap: 4,
  },
  playCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  playCardBallLevel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  playCardLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  playCardLocationText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  playCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  playCardMetaText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  playCardMetaDot: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  playCardBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  playCardXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(249, 115, 22, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  playCardXpText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#F97316",
  },
  playCardCountdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 206, 209, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  playCardCountdownUrgent: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  playCardCountdownText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#00CED1",
  },
  playCardActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  playCardStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
  },
  playCardStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  playCardJoinButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  playCardJoinText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B0D10",
  },
  playCardCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 107, 107, 0.2)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.4)",
  },
  playCardCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FF6B6B",
  },
  playCardWaitlistButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  playCardWaitlistText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playCardCreditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playCardCreditText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  playCardParticipantsRow: {
    marginTop: Spacing.xs,
    gap: 4,
  },
  playCardAvatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  playCardAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#1A1D24",
    overflow: "hidden",
  },
  playCardAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
  },
  playCardAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2A2D34",
    alignItems: "center",
    justifyContent: "center",
  },
  playCardAvatarInitial: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  playCardAvatarMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2A2D34",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1A1D24",
  },
  playCardAvatarMoreText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  playCardParticipantNames: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
