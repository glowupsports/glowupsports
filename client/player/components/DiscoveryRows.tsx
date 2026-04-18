import logger from "@/lib/logger";
import React, { useEffect, useRef, useState } from "react";
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
import { ProTennisColors, Backgrounds, Spacing, BorderRadius, getPlayerLevelColor, getPlayerLevelTextColor, GlowColors, Colors } from "@/constants/theme";
import { usePlayerState } from "@/player/context/PlayerStateContext";
import { useAuth } from "@/coach/context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTabNavigation } from "@/components/TabNavigationContext";
import * as Haptics from "expo-haptics";
import { GlowAvatar } from "./GlowAvatar";
import { NeonEdgeCard } from "./GlassCard";
import { MatchSummaryCard, COMPETE_ACCENT } from "./MatchSummaryCard";
import { getStaticAssetsUrl, buildPhotoUrl, apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { SwipeBlocker } from "@/components/SwipeBlocker";
import { formatSessionDateShort, formatSessionTimeWithRelativeDay } from "@/lib/dateUtils";
import { useTranslation } from "react-i18next";

function PremiumEmptyCard({
  icon,
  accentColor,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  const pulse = useSharedValue(1);
  const glow = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1400 }),
        withTiming(1.0, { duration: 1400 })
      ),
      -1,
      false
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1400 }),
        withTiming(0.25, { duration: 1400 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(glow);
    };
  }, []);

  const iconAnim = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const glowAnim = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={[styles.premiumEmptyWrap, { borderColor: accentColor + "33" }]}>
      <LinearGradient
        colors={[accentColor + "1A", accentColor + "08", "#13131F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.premiumEmptyGradient}
      >
        <View style={styles.premiumEmptyIconCol}>
          <Animated.View
            style={[
              styles.premiumEmptyGlow,
              { backgroundColor: accentColor },
              glowAnim,
            ]}
            pointerEvents="none"
          />
          <Animated.View
            style={[
              styles.premiumEmptyIconCircle,
              { backgroundColor: accentColor + "22", borderColor: accentColor + "55" },
              iconAnim,
            ]}
          >
            <Ionicons name={icon} size={22} color={accentColor} />
          </Animated.View>
        </View>
        <View style={styles.premiumEmptyTextCol}>
          <Text style={styles.premiumEmptyTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.premiumEmptySubtitle} numberOfLines={2}>{subtitle}</Text>
        </View>
        <Pressable
          onPress={onCta}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={({ pressed }) => [
            styles.premiumEmptyCta,
            { backgroundColor: accentColor, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.premiumEmptyCtaText} numberOfLines={1}>{ctaLabel}</Text>
          <Feather name="arrow-right" size={13} color="#0B0D10" />
        </Pressable>
      </LinearGradient>
    </View>
  );
}

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

function SectionHeader({ title, count, actionLabel, onAction, accentColor = "#FFFFFF" }: SectionHeaderProps) {
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
        <Text style={styles.sectionTitle}>{title}</Text>
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
  const { t } = useTranslation();
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();

  // Get player's ball level
  const playerBallLevel = state.player?.ballLevel?.toLowerCase() || "glow";

  const nearbyPlayers = state.nearbyPlayers ?? [];
  const availablePlayers = nearbyPlayers.filter(p => {
    const playerLevel = (p.ballLevel || p.level || "").toLowerCase();
    return playerLevel === playerBallLevel;
  });

  const handlePlayerPress = (playerId: string) => {
    logger.log("[DiscoveryRows] handlePlayerPress called for playerId:", playerId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("PublicProfile", { playerId });
  };

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Players" } });
  };

  const getAvatarSource = (player: typeof state.nearbyPlayers[0]) => {
    return buildPhotoUrl(player.profilePhotoUrl) || null;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "available": return t("player.home.available");
      case "playing": return t("player.home.onCourt");
      case "online": return t("common.online");
      default: return "";
    }
  };

  if (availablePlayers.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t("player.home.playersNearYou")}
        count={availablePlayers.length}
        actionLabel={t("player.home.findMore")}
        onAction={handleSeeAll}
        accentColor={GlowColors.primary}
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
                    size="md"
                    ballLevel={player.level}
                    showGlow={true}
                    glowIntensity="low"
                    status={player.status as any}
                    pulsing={false}
                  />
                  <Text style={styles.playerName} numberOfLines={1}>{player.name.split(" ")[0]}</Text>
                  <View style={[styles.levelBadge, { backgroundColor: `${levelColor}30` }]}>
                    <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
                    <Text style={[styles.levelText, { color: getPlayerLevelTextColor(player.level) }]}>
                      {(player.ballLevel || player.level || "").toUpperCase()}{player.skillLevel ? ` ${player.skillLevel}` : ""}
                    </Text>
                  </View>
                  {player.distanceKm != null ? (
                    <View style={styles.distanceChip}>
                      <Feather name="map-pin" size={9} color={ProTennisColors.textSecondary} />
                      <Text style={styles.distanceText}>{player.distanceKm} km</Text>
                    </View>
                  ) : player.status === "available" ? (
                    <View style={styles.statusChip}>
                      <View style={[styles.statusDot, { backgroundColor: ProTennisColors.success }]} />
                      <Text style={styles.statusText}>{getStatusLabel(player.status)}</Text>
                    </View>
                  ) : null}
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
                <Text style={styles.moreLabel}>{t("common.seeAll")}</Text>
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
  const { t } = useTranslation();
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const queryClient = useQueryClient();
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null);
  const [travelTimeMap, setTravelTimeMap] = useState<Map<string, number>>(new Map());

  // Get player's ball level from state
  const playerBallLevel = state.player?.ballLevel?.toLowerCase() || "glow";

  const allGroupLessons = (state.openSessions ?? []).filter(s => s.type === "group");
  const groupLessons = allGroupLessons.filter(s => {
    const sessionLevel = s.ballLevel?.toLowerCase() || "";
    if (!sessionLevel) return false;
    return sessionLevel === playerBallLevel;
  });

  const { data: playerProfileData } = useQuery<{ player: { lastLatitude?: number | null; lastLongitude?: number | null } }>({
    queryKey: ["/api/player/me"],
  });
  const playerLat = playerProfileData?.player?.lastLatitude ?? null;
  const playerLng = playerProfileData?.player?.lastLongitude ?? null;

  useEffect(() => {
    if (playerLat == null || playerLng == null || groupLessons.length === 0) return;
    const dests: Array<{ id: string; lat: number; lng: number }> = [];
    const seen = new Set<string>();
    for (const s of groupLessons) {
      const lat = (s as any).locationLat;
      const lng = (s as any).locationLng;
      if (lat != null && lng != null) {
        const key = `${lat},${lng}`;
        if (!seen.has(key)) {
          seen.add(key);
          dests.push({ id: key, lat, lng });
        }
      }
    }
    if (dests.length === 0) return;
    const controller = new AbortController();
    const fetchTimes = async () => {
      try {
        const destsJson = encodeURIComponent(JSON.stringify(dests));
        const url = new URL(`/api/maps/distance-matrix?originLat=${playerLat}&originLng=${playerLng}&destinations=${destsJson}`, getApiUrl()).toString();
        const res = await fetch(url, { credentials: "include", headers: getAuthHeaders(), signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const newMap = new Map<string, number>();
        for (const r of data.results || []) {
          if (r.durationMinutes != null) newMap.set(r.id, r.durationMinutes);
        }
        setTravelTimeMap(newMap);
      } catch { }
    };
    fetchTimes();
    return () => controller.abort();
  }, [playerLat, playerLng, groupLessons.map((s: any) => s.id).join(",")]);

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest("POST", `/api/play/sessions/${sessionId}/join`);
      return await response.json();
    },
    onSuccess: (data: { success?: boolean; message?: string }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("player.home.joined"), data.message || t("player.home.joinedMsg"));
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/play/sessions"] });
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message || t("player.home.couldNotJoin"));
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
      Alert.alert(t("player.home.leftSession"), data.message || t("player.home.leftSessionMsg"));
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/social"] });
      queryClient.invalidateQueries({ queryKey: ["/api/play/sessions"] });
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message || t("player.home.couldNotLeave"));
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
    navigation.navigate("ClassesDiscovery");
  };

  const ballLevelLabel = playerBallLevel.charAt(0).toUpperCase() + playerBallLevel.slice(1);
  const ballLevelColor = getBallLevelColor(playerBallLevel);

  if (groupLessons.length === 0) {
    return (
      <View style={styles.section}>
        <SectionHeader
          title={`${ballLevelLabel} Lessons`}
          actionLabel={t("common.viewAll")}
          onAction={handleSeeAll}
          accentColor={ballLevelColor}
        />
        <PremiumEmptyCard
          icon="school-outline"
          accentColor={ballLevelColor}
          title={`No ${ballLevelLabel} lessons yet`}
          subtitle="Your coach hasn't dropped a lesson at your level — explore what's available"
          ctaLabel={t("player.home.browseAllLessons")}
          onCta={handleSeeAll}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title={`${ballLevelLabel} Lessons`}
        count={groupLessons.length}
        actionLabel={t("common.viewAll")}
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
            if (spotsLeft === 0) return { text: t("common.full"), color: "#EF4444", bgColor: "#EF444440" };
            if (spotsLeft === 1) return { text: t("player.home.almostFull"), color: "#F97316", bgColor: "#F9731640" };
            return { text: `${spotsLeft} ${t("player.home.open")}`, color: Colors.dark.primary, bgColor: Colors.dark.primary + "40" };
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
                      {session.coachName 
                        ? t("player.home.groupClassWithCoach", { name: session.coachName.split(' ')[0] }) 
                        : t("player.home.groupTraining")}
                    </Text>
                    <Text style={[styles.playCardBallLevel, { color: getPlayerLevelTextColor(session.ballLevel) }]}>
                      {(session.ballLevel || "ALL").toUpperCase()}
                    </Text>
                    <View style={styles.playCardLocationRow}>
                      <Ionicons name="location" size={12} color={Colors.dark.primary} />
                      <Text style={styles.playCardLocationText} numberOfLines={1}>{(session as any).location || (session as any).locationName || t("common.tba")}</Text>
                      {(() => {
                        const lat = (session as any).locationLat;
                        const lng = (session as any).locationLng;
                        if (lat == null || lng == null) return null;
                        const mins = travelTimeMap.get(`${lat},${lng}`);
                        if (mins == null) return null;
                        return (
                          <View style={styles.travelTimePill}>
                            <Ionicons name="car-outline" size={9} color="#00CED1" />
                            <Text style={styles.travelTimePillText}>~{mins} min</Text>
                          </View>
                        );
                      })()}
                    </View>
                    <View style={styles.playCardMetaRow}>
                      <Ionicons name="time-outline" size={12} color={Colors.dark.textMuted} />
                      <Text style={styles.playCardMetaText}>{formatSessionTime((session as any).date || (session as any).startTime)}</Text>
                      <Text style={styles.playCardMetaDot}>·</Text>
                      <View style={[styles.ballLevelDot, { backgroundColor: levelColor }]} />
                      <Text style={[styles.playCardMetaText, { color: getPlayerLevelTextColor(session.ballLevel) }]}>
                        {session.ballLevel ? session.ballLevel.charAt(0).toUpperCase() + session.ballLevel.slice(1) : t("player.play.allLevels")}
                      </Text>
                      <Text style={styles.playCardMetaDot}>·</Text>
                      <Text style={styles.playCardMetaText}>{(session as any).skillLevel || t("player.home.competitive")}</Text>
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
                            <Text style={styles.playCardCancelText}>{t("common.cancel")}</Text>
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
                            <Text style={styles.playCardJoinText}>{t("common.join")}</Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable style={styles.playCardWaitlistButton}>
                        <Text style={styles.playCardWaitlistText}>{t("player.play.joinWaitlist")}</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Credit cost */}
                  <View style={styles.playCardCreditRow}>
                    <Ionicons name="ticket-outline" size={12} color={Colors.dark.textMuted} />
                    <Text style={styles.playCardCreditText}>{t("player.home.groupCredit")}</Text>
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
                                  source={{ uri: buildPhotoUrl(p.profilePhotoUrl)! }} 
                                  style={styles.playCardAvatarImage}
                                  resizeMode="cover"
                                />
                              ) : (
                                <ExpoImage 
                                  source={{ uri: buildPhotoUrl(p.profilePhotoUrl)! }} 
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
// Reads directly from /api/open-matches (same source as the Open Matches feed
// page) so the Home block and the feed always show the same matches, including
// matches the viewer hosted themselves. Single cache key means one invalidate
// after create/cancel refreshes both screens.
export function OpenMatchesRow() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();
  const { user } = useAuth();

  const { data: rawMatches } = useQuery<any[]>({
    queryKey: ["/api/open-matches"],
    enabled: !!user?.playerId,
  });

  // Pass the raw /api/open-matches payload through with a future-only filter.
  // We no longer remap to a different shape — MatchSummaryCard reads the
  // canonical fields (host, scheduledTime, levelMatch, etc.) directly so the
  // home row, the COMPETE hero, and the OpenMatches feed all share one
  // serialization contract.
  const openMatches = React.useMemo(() => {
    if (!Array.isArray(rawMatches)) return [];
    const nowMs = Date.now();
    return rawMatches
      .filter((m: any) => {
        if (!m.scheduledTime) return true;
        const t = new Date(m.scheduledTime).getTime();
        return !Number.isFinite(t) || t > nowMs;
      })
      .sort((a: any, b: any) => {
        const ta = a.scheduledTime ? new Date(a.scheduledTime).getTime() : Infinity;
        const tb = b.scheduledTime ? new Date(b.scheduledTime).getTime() : Infinity;
        return ta - tb;
      });
  }, [rawMatches]);

  const queryClient = useQueryClient();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const joinMutation = useMutation({
    mutationFn: async (matchId: string) => {
      setJoiningId(matchId);
      return apiRequest("POST", `/api/open-matches/${matchId}/join`, { playerId: user?.playerId });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-matches", { includeMine: true }] });
      Alert.alert("You're In!", "Successfully joined the match. Get ready to play!");
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't Join", err?.message || "Something went wrong. Try again.");
    },
    onSettled: () => setJoiningId(null),
  });

  const handleMatchPress = (matchId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      navigation.navigate("ManageMatch", { matchId });
    } catch {
      navigateToTab("PlayStack");
    }
  };

  const handleSeeAll = () => {
    logger.log("[DiscoveryRows] handleSeeAll called");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to Play tab with Players sub-tab
    navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Players" } });
  };

  const handleCreateMatch = () => {
    logger.log("[DiscoveryRows] handleCreateMatch called");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate directly to CreateMatch screen
    navigateToTab("PlayStack", { screen: "CreateMatch" });
  };

  const getMatchTypeGradient = (maxPlayers: number): readonly [string, string, ...string[]] => {
    const isDoubles = maxPlayers === 4;
    if (isDoubles) return ["#9333EA", "#7C3AED", "#6366F1"] as const;
    return [Colors.dark.xpCyan, "#22D3EE", "#06B6D4"] as const;
  };

  const getSkillLabel = (skillLevel?: number) => {
    if (!skillLevel) return "";
    if (skillLevel <= 2) return "PRO";
    if (skillLevel <= 4) return "ADV";
    if (skillLevel <= 6) return "INT";
    return "BEG";
  };

  if (openMatches.length === 0) {
    return (
      <View style={styles.section}>
        <SectionHeader
          title={t("player.home.openMatches")}
          actionLabel={t("player.home.findPlayers")}
          onAction={handleSeeAll}
          accentColor="#A855F7"
        />
        <PremiumEmptyCard
          icon="flash-outline"
          accentColor="#A855F7"
          title="Be the first to challenge"
          subtitle="No open matches at your level — start one and call out players nearby"
          ctaLabel={t("player.home.createMatch")}
          onCta={handleCreateMatch}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t("player.home.openMatches")}
        count={openMatches.length}
        actionLabel={t("common.seeAll")}
        onAction={handleSeeAll}
        accentColor={GlowColors.primary}
      />

      <View style={styles.matchesFullWidthContainer}>
        {openMatches.slice(0, 3).map((match: any, index: number) => {
          const isHost =
            String(match.host?.id || match.hostPlayerId) === String(user?.playerId);
          return (
            <Animated.View
              key={match.id}
              entering={FadeInRight.delay(index * 80).duration(350)}
              style={{ marginBottom: Spacing.md }}
            >
              <MatchSummaryCard
                matchId={match.id}
                matchType={match.matchType}
                sport={match.sport}
                scheduledTime={match.scheduledTime}
                courtName={match.courtName}
                locationName={match.locationName}
                host={match.host}
                ballLevel={match.ballLevel}
                currentPlayers={match.currentPlayers ?? (match.players?.length ?? 1)}
                maxPlayers={match.maxPlayers || (match.matchType === "doubles" ? 4 : 2)}
                costPerPlayer={match.costPerPlayer}
                currency={match.currency}
                xpBonus={match.xpBonus}
                levelMatch={match.levelMatch}
                levelDirection={match.levelDirection}
                isHost={isHost}
                joining={joiningId === match.id}
                onJoin={() => joinMutation.mutate(match.id)}
                onManage={() => handleMatchPress(match.id)}
                onPress={isHost ? () => handleMatchPress(match.id) : undefined}
                accent={COMPETE_ACCENT}
              />
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

interface TournamentMini {
  id: string;
  name: string;
  sport: string;
  startDate: string;
  spotsTotal: number;
  spotsTaken: number;
  xpReward?: number | null;
  status: string;
}

function getSportColorLocal(sport: string): string {
  switch (sport?.toLowerCase()) {
    case "padel": return "#1A6FC4";
    case "pickleball": return "#E07B20";
    default: return "#1A8C4C";
  }
}

function getSportEmojiLocal(sport: string): string {
  switch (sport?.toLowerCase()) {
    case "padel": return "Padel";
    case "pickleball": return "Pickleball";
    default: return "Tennis";
  }
}

function formatTournamentDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function TournamentsDiscoveryRow() {
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();

  const { data, isLoading } = useQuery<{ upcoming: TournamentMini[] }>({
    queryKey: ["/api/player/tournaments", "registration_open"],
    queryFn: async () => {
      const url = new URL("/api/player/tournaments", getApiUrl());
      url.searchParams.set("status", "registration_open");
      const res = await fetch(url.toString(), { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to load tournaments");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const openTournaments = (data?.upcoming ?? [])
    .filter(t => t.status === "registration_open")
    .slice(0, 3);

  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateToTab("PlayStack", { screen: "Play", params: { initialTab: "Tournaments" } });
  };

  const handleCardPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("TournamentDetail", { tournamentId: id });
  };

  if (isLoading) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Tournaments & Events"
        count={openTournaments.length}
        actionLabel="See All"
        onAction={handleSeeAll}
        accentColor="#FFD700"
      />

      {openTournaments.length === 0 ? (
        <PremiumEmptyCard
          icon="trophy-outline"
          accentColor="#FFD700"
          title="No tournaments nearby"
          subtitle="New events drop weekly — explore tournaments across all academies"
          ctaLabel="Explore"
          onCta={handleSeeAll}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rowScrollContent}
        >
          {openTournaments.map((t, index) => {
            const spotsLeft = t.spotsTotal - t.spotsTaken;
            const sportColor = getSportColorLocal(t.sport);
            return (
              <Animated.View key={t.id} entering={FadeInRight.delay(index * 60).duration(300)}>
                <Pressable
                  style={styles.tournamentMiniCard}
                  onPress={() => handleCardPress(t.id)}
                >
                  <View style={[styles.tournamentMiniSportBanner, { backgroundColor: sportColor }]} />
                  <View style={styles.tournamentMiniCardInner}>
                    <Text style={styles.tournamentMiniName} numberOfLines={2}>{t.name}</Text>
                    <Text style={styles.tournamentMiniDate}>{getSportEmojiLocal(t.sport)}  ·  {formatTournamentDate(t.startDate)}</Text>
                    <View style={styles.tournamentMiniFooter}>
                      <Text style={styles.tournamentMiniSpots}>
                        {spotsLeft > 0 ? `${spotsLeft} spots left` : "Full"}
                      </Text>
                      {t.xpReward ? (
                        <View style={styles.tournamentXpBadge}>
                          <Ionicons name="flash" size={10} color="#FFD700" />
                          <Text style={styles.tournamentXpText}>Win {t.xpReward} XP</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
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
  const { t } = useTranslation();
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();

  const availability = state.availability ?? { groupSessions: 0, privateLessons: 0, courtsAvailable: 0 };

  const handleBookPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateToTab("Growth", { screen: "ScheduleMain" });
  };

  const handleCourtPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateToTab("Growth", { screen: "ScheduleMain" });
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t("player.home.bookAndTrain")}
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
                colors={["rgba(255, 193, 7, 0.06)", "rgba(0, 0, 0, 0)"]}
                style={styles.trainingGradient}
              />
              <View style={styles.trainingContent}>
                <View style={styles.trainingIconWrap}>
                  <Feather name="calendar" size={18} color={ProTennisColors.warning} />
                </View>
                <Text style={styles.trainingTitle}>{t("player.home.groupTraining")}</Text>
                <Text style={styles.trainingSubtitle}>
                  {availability.groupSessions} {t("player.home.available")}
                </Text>
                <View style={styles.trainingChips}>
                  <View style={styles.trainingChip}>
                    <Text style={styles.trainingChipText}>{t("player.home.thisWeek")}</Text>
                  </View>
                </View>
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(60).duration(300)}>
          <Pressable onPress={handleBookPress}>
            <NeonEdgeCard color={GlowColors.primary} glowIntensity="low" style={styles.trainingCard}>
              <LinearGradient
                colors={[`${GlowColors.primary}08`, "rgba(0, 0, 0, 0)"]}
                style={styles.trainingGradient}
              />
              <View style={styles.trainingContent}>
                <View style={styles.trainingIconWrap}>
                  <Feather name="user" size={18} color={GlowColors.primary} />
                </View>
                <Text style={styles.trainingTitle}>{t("common.private")}</Text>
                <Text style={styles.trainingSubtitle}>
                  {availability.privateLessons} {t("player.home.available")}
                </Text>
                <View style={styles.trainingChips}>
                  <View style={[styles.trainingChip, { backgroundColor: `${GlowColors.primary}20` }]}>
                    <Text style={[styles.trainingChipText, { color: GlowColors.primary }]}>{t("player.home.bookNow")}</Text>
                  </View>
                </View>
              </View>
            </NeonEdgeCard>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInRight.delay(120).duration(300)}>
          <Pressable onPress={handleCourtPress}>
            <NeonEdgeCard color={GlowColors.primary} glowIntensity="low" style={styles.trainingCard}>
              <LinearGradient
                colors={["rgba(200, 255, 61, 0.06)", "rgba(0, 0, 0, 0)"]}
                style={styles.trainingGradient}
              />
              <View style={styles.trainingContent}>
                <View style={styles.trainingIconWrap}>
                  <Feather name="grid" size={18} color={GlowColors.primary} />
                </View>
                <Text style={styles.trainingTitle}>{t("player.home.courts")}</Text>
                <Text style={styles.trainingSubtitle}>
                  {t("player.home.freeTonight", { count: availability.courtsAvailable })}
                </Text>
                <View style={styles.trainingChips}>
                  <View style={[styles.trainingChip, { backgroundColor: "rgba(200, 255, 61, 0.2)" }]}>
                    <Text style={[styles.trainingChipText, { color: GlowColors.primary }]}>{t("player.home.reserve")}</Text>
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
  const { t } = useTranslation();
  const { state } = usePlayerState();
  const navigation = useNavigation<any>();
  const { navigateToTab } = useTabNavigation();

  const communityEvents = state.communityEvents ?? [];

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigateToTab("Community");
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
      case "new_member": return ProTennisColors.electricGreen;
      case "new_group": return ProTennisColors.electricGreen;
      case "tournament": return ProTennisColors.warning;
      case "challenge": return "#FF6B6B";
      default: return ProTennisColors.textMuted;
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t("player.home.community")}
        actionLabel={t("player.home.openFeed")}
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
            {t("player.home.moreUpdates", { count: communityEvents.length - 3 })}
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
    backgroundColor: Backgrounds.card,
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
  distanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  distanceText: {
    fontSize: 9,
    fontWeight: "600",
    color: ProTennisColors.textSecondary,
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
    borderColor: GlowColors.primary + "40",
  },
  moreNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: GlowColors.primary,
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
  matchesFullWidthContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  matchCardFullWidth: {
    width: "100%",
  },
  matchCardFullWidthContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  matchHostAvatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ProTennisColors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    overflow: "hidden",
  },
  matchHostImageLarge: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  matchHostInitialsLarge: {
    fontSize: 22,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  matchInfoCenter: {
    flex: 1,
    gap: 4,
  },
  matchTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  matchHostNameLarge: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.white,
    flex: 1,
  },
  matchTypeBadgeLarge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  matchTypeTextLarge: {
    fontSize: 11,
    fontWeight: "700",
  },
  matchLevelBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.xs,
  },
  matchLevelDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  matchLevelTextLarge: {
    fontSize: 12,
    fontWeight: "600",
  },
  matchMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  matchTimeLarge: {
    fontSize: 12,
    color: ProTennisColors.textSecondary,
    fontWeight: "500",
  },
  matchMetaDot: {
    fontSize: 12,
    color: ProTennisColors.textMuted,
    marginHorizontal: 2,
  },
  matchJoinButtonLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  matchJoinTextLarge: {
    fontSize: 14,
    fontWeight: "700",
    color: ProTennisColors.midnightBlue,
  },
  premiumMatchCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    overflow: "hidden",
  },
  premiumMatchGlowBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    pointerEvents: "none",
  },
  premiumMatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  matchTypePillGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  matchTypePillTextWhite: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,229,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  countdownBadgeUrgent: {
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  countdownBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  premiumMatchHostSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  premiumMatchHostAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    overflow: "hidden",
  },
  premiumMatchHostImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  premiumMatchHostPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumMatchHostInitial: {
    fontSize: 18,
    fontWeight: "700",
  },
  premiumMatchHostInfo: {
    flex: 1,
    gap: 4,
  },
  premiumMatchHostName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  premiumMatchLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  premiumMatchLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  premiumMatchLevelText: {
    fontSize: 11,
    fontWeight: "600",
  },
  xpBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,229,255,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  xpBadgeSmallText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
  },
  premiumMatchDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.xs,
  },
  premiumMatchDateText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  premiumMatchDateDot: {
    color: Colors.dark.textMuted,
    marginHorizontal: 2,
  },
  premiumMatchLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  premiumMatchLocationText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  premiumMatchDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: Spacing.sm,
  },
  premiumMatchFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  premiumMatchPlayerSlots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  premiumMatchSlot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  premiumMatchSlotFilled: {
    backgroundColor: "rgba(0,229,255,0.2)",
    borderWidth: 1,
    borderColor: Colors.dark.primary + "60",
  },
  premiumMatchSlotEmpty: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderStyle: "dashed",
  },
  premiumMatchSlotImage: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  premiumMatchSlotsText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginLeft: 6,
  },
  premiumMatchJoinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
  },
  premiumMatchJoinText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0A0A12",
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
  matchHostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ProTennisColors.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    overflow: "hidden",
  },
  matchHostImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  matchHostInitials: {
    fontSize: 16,
    fontWeight: "700",
    color: ProTennisColors.white,
  },
  matchHostName: {
    fontSize: 14,
    fontWeight: "600",
    color: ProTennisColors.white,
    marginTop: Spacing.xs,
  },
  matchLevelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  matchLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.xs,
  },
  matchLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  matchLevelText: {
    fontSize: 10,
    fontWeight: "600",
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
    color: "#FFFFFF",
  },
  matchTime: {
    fontSize: 18,
    fontWeight: "800",
    color: ProTennisColors.white,
    fontVariant: ["tabular-nums"],
    marginTop: Spacing.xs,
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
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: "auto",
  },
  matchJoinText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
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
    alignItems: "center",
  },
  playCardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  playCardBallLevel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  playCardLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
  },
  playCardLocationText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: "600",
    flex: 1,
  },
  travelTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0, 206, 209, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    flexShrink: 0,
  },
  travelTimePillText: {
    fontSize: 10,
    color: "#00CED1",
    fontWeight: "600",
  },
  playCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 2,
  },
  playCardMetaText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  playCardMetaDot: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  ballLevelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 2,
  },
  playCardBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
    justifyContent: "center",
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
    color: Colors.dark.buttonText,
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
    justifyContent: "center",
    gap: 6,
  },
  playCardCreditText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  playCardParticipantsRow: {
    marginTop: Spacing.xs,
    gap: 4,
    alignItems: "center",
  },
  playCardAvatarStack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
  tournamentMiniCard: {
    width: 180,
    backgroundColor: "#1A1D24",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tournamentMiniCardInner: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  tournamentMiniSportBanner: {
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.xs,
  },
  tournamentMiniName: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    lineHeight: 18,
  },
  tournamentMiniDate: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  tournamentMiniFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  tournamentMiniSpots: {
    fontSize: 11,
    color: Colors.dark.textSubtle,
  },
  tournamentXpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tournamentXpText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFD700",
  },
  tournamentEmptyState: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  tournamentEmptyText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  premiumEmptyWrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  premiumEmptyGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 96,
  },
  premiumEmptyIconCol: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumEmptyGlow: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    opacity: 0.35,
  },
  premiumEmptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  premiumEmptyTextCol: {
    flex: 1,
    minWidth: 0,
  },
  premiumEmptyTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 3,
  },
  premiumEmptySubtitle: {
    color: "#FFFFFF80",
    fontSize: 12,
    lineHeight: 16,
  },
  premiumEmptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  premiumEmptyCtaText: {
    color: "#0B0D10",
    fontSize: 12,
    fontWeight: "700",
  },
});
